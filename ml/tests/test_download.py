"""Task 5: download.py fetches only licence-allowed sources by default, verifies checksums, unpacks
safely and keeps per-file licence/author for Commons. No real network: the fetcher is faked."""
from __future__ import annotations

import hashlib
import io
import tarfile
import zipfile
from pathlib import Path

import pytest

from conftest import make_jpeg
from gymfood import download as dl


class FakeNet:
    def __init__(self, files: dict[str, bytes] | None = None, json_pages: list[dict] | None = None):
        self.files = files or {}
        self.json_pages = list(json_pages or [])
        self.calls: list[str] = []

    def fetch(self, url: str, dest: Path) -> None:
        self.calls.append(url)
        dest.write_bytes(self.files[url])

    def get_json(self, url: str) -> dict:
        self.calls.append(url)
        return self.json_pages.pop(0)


def test_registry_marks_only_licence_allowed_sources_as_allowed():
    s = dl.SOURCES
    assert s["thfood50"].allowed is False
    assert s["thfood100"].allowed is False
    assert s["efficientnet_lite0"].allowed is True
    assert s["commons"].allowed is True
    for src in s.values():
        assert src.licence and src.licence_url.startswith("https://")
    # Every fixed file has a pinned sha256.
    for f in s["thfood50"].files + s["efficientnet_lite0"].files:
        assert len(f.sha256) == 64


def test_a_non_allowed_set_needs_accept_licence_and_touches_no_network(tmp_path: Path):
    net = FakeNet()
    with pytest.raises(dl.LicenceNotAccepted) as e:
        dl.download("thfood50", data_dir=tmp_path, accepted=set(), net=net)
    assert "--accept-licence thfood50" in str(e.value)
    assert "non-commercial" in str(e.value)
    assert net.calls == []
    # Accepting a different set doesn't count.
    with pytest.raises(dl.LicenceNotAccepted):
        dl.download("thfood50", data_dir=tmp_path, accepted={"thfood100"}, net=net)
    assert net.calls == []


def test_unknown_source_is_an_error(tmp_path: Path):
    with pytest.raises(KeyError):
        dl.download("food101", data_dir=tmp_path, accepted=set(), net=FakeNet())


def _tar(members: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        for name, data in members.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            t.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def _with_files(monkeypatch, name: str, payloads: dict[str, bytes]):
    src = dl.SOURCES[name]
    files = [dl.RemoteFile(url=u, sha256=hashlib.sha256(b).hexdigest(), name=Path(u).name or "f")
             for u, b in payloads.items()]
    monkeypatch.setitem(dl.SOURCES, name, dl.Source(**{**src.__dict__, "files": files}))


def test_checksum_mismatch_fails_and_leaves_no_file(tmp_path: Path, monkeypatch):
    _with_files(monkeypatch, "efficientnet_lite0", {"https://x.test/lite0.tar.gz": b"good"})
    net = FakeNet({"https://x.test/lite0.tar.gz": b"evil"})
    with pytest.raises(dl.ChecksumError):
        dl.download("efficientnet_lite0", data_dir=tmp_path, accepted=set(), net=net)
    assert [p for p in tmp_path.rglob("*") if p.is_file()] == []


def test_backbone_downloads_verifies_and_unpacks(tmp_path: Path, monkeypatch):
    payload = _tar({"saved_model.pb": b"pb", "variables/variables.index": b"i"})
    _with_files(monkeypatch, "efficientnet_lite0", {"https://x.test/lite0.tar.gz": payload})
    net = FakeNet({"https://x.test/lite0.tar.gz": payload})
    out = dl.download("efficientnet_lite0", data_dir=tmp_path, accepted=set(), net=net)
    assert (out / "saved_model.pb").read_bytes() == b"pb"
    # Second run: already verified, no network.
    dl.download("efficientnet_lite0", data_dir=tmp_path, accepted=set(), net=net)
    assert len(net.calls) == 1


@pytest.mark.parametrize("evil", ["../escape.txt", "/abs.txt", "a/../../escape.txt"])
def test_unpack_rejects_paths_outside_the_target(tmp_path: Path, evil: str):
    arc = tmp_path / "a.tar.gz"
    arc.write_bytes(_tar({evil: b"x", "ok.txt": b"y"}))
    with pytest.raises(dl.UnsafeArchive):
        dl.safe_unpack(arc, tmp_path / "out")
    assert not (tmp_path / "escape.txt").exists()
    zp = tmp_path / "a.zip"
    with zipfile.ZipFile(zp, "w") as z:
        z.writestr(evil, b"x")
    with pytest.raises(dl.UnsafeArchive):
        dl.safe_unpack(zp, tmp_path / "out2")


def test_thfood100_is_manual_from_a_file_after_accepting(tmp_path: Path):
    zp = tmp_path / "THFOOD-100.zip"
    with zipfile.ZipFile(zp, "w") as z:
        z.writestr("THFOOD-100/PadThai/1.jpg", make_jpeg((1, 2, 3)))
    with pytest.raises(dl.LicenceNotAccepted):
        dl.download("thfood100", data_dir=tmp_path, accepted=set(), net=FakeNet(), from_file=zp)
    out = dl.download("thfood100", data_dir=tmp_path, accepted={"thfood100"}, net=FakeNet(), from_file=zp)
    assert any(out.rglob("1.jpg"))
    with pytest.raises(ValueError, match="from-file"):
        dl.download("thfood100", data_dir=tmp_path, accepted={"thfood100"}, net=FakeNet())


def test_thfood50_parquet_rows_become_class_folders(tmp_path: Path):
    pa = pytest.importorskip("pyarrow")
    import json

    import pyarrow.parquet as pq

    names = ["BitterMelonSoup", "PadThai"]
    meta = {"info": {"features": {"image": {"_type": "Image"},
                                  "label": {"_type": "ClassLabel", "names": names}}}}
    table = pa.table({
        "image": [{"bytes": make_jpeg((9, 9, 9), mark=i), "path": None} for i in range(3)],
        "label": [1, 0, 1],
    }).replace_schema_metadata({"huggingface": json.dumps(meta)})
    p = tmp_path / "train-00000-of-00001.parquet"
    pq.write_table(table, p)
    out = tmp_path / "raw"
    n = dl.parquet_to_folders(p, out, prefix="train")
    assert n == 3
    assert len(list((out / "PadThai").glob("*.jpg"))) == 2
    assert len(list((out / "BitterMelonSoup").glob("*.jpg"))) == 1


COMMONS_LIST = {
    "query": {"pages": {
        "1": {"pageid": 1, "title": "File:Pad thai cc0.jpg", "imageinfo": [{
            "url": "https://upload.test/1.jpg", "sha1": hashlib.sha1(b"one").hexdigest(), "size": 3,
            "mime": "image/jpeg",
            "extmetadata": {"LicenseShortName": {"value": "CC0"}, "Artist": {"value": "<a>Ann</a>"},
                            "LicenseUrl": {"value": "https://creativecommons.org/publicdomain/zero/1.0/"}}}]},
        "2": {"pageid": 2, "title": "File:Pad thai sa.jpg", "imageinfo": [{
            "url": "https://upload.test/2.jpg", "sha1": "0" * 40, "size": 3, "mime": "image/jpeg",
            "extmetadata": {"LicenseShortName": {"value": "CC BY-SA 4.0"}, "Artist": {"value": "Bo"}}}]},
        "3": {"pageid": 3, "title": "File:Pad thai by.jpg", "imageinfo": [{
            "url": "https://upload.test/3.jpg", "sha1": hashlib.sha1(b"three").hexdigest(), "size": 5,
            "mime": "image/jpeg",
            "extmetadata": {"LicenseShortName": {"value": "CC BY 2.0"}, "Artist": {"value": "Cy"},
                            "LicenseUrl": {"value": "https://creativecommons.org/licenses/by/2.0"}}}]},
        "4": {"pageid": 4, "title": "File:Pad thai.svg", "imageinfo": [{
            "url": "https://upload.test/4.svg", "sha1": "1" * 40, "size": 3, "mime": "image/svg+xml",
            "extmetadata": {"LicenseShortName": {"value": "CC0"}}}]},
    }},
}


def test_commons_keeps_only_cc0_pd_cc_by_with_author_and_licence(tmp_path: Path):
    net = FakeNet(files={"https://upload.test/1.jpg": b"one", "https://upload.test/3.jpg": b"three"},
                  json_pages=[COMMONS_LIST])
    out = dl.download("commons", data_dir=tmp_path, accepted=set(), net=net,
                      commons_categories={"pad_thai": ["Pad Thai"]})
    files = sorted(p.name for p in (out / "pad_thai").iterdir())
    assert files == ["commons_1.jpg", "commons_3.jpg"]
    attribution = (out / "ATTRIBUTION.csv").read_text()
    assert "Ann" in attribution and "<a>" not in attribution
    assert "CC BY 2.0" in attribution and "CC BY-SA" not in attribution
    assert "https://upload.test/2.jpg" not in net.calls  # BY-SA never fetched


def test_commons_sha1_mismatch_skips_the_file(tmp_path: Path):
    net = FakeNet(files={"https://upload.test/1.jpg": b"tampered", "https://upload.test/3.jpg": b"three"},
                  json_pages=[COMMONS_LIST])
    out = dl.download("commons", data_dir=tmp_path, accepted=set(), net=net,
                      commons_categories={"pad_thai": ["Pad Thai"]})
    assert sorted(p.name for p in (out / "pad_thai").iterdir()) == ["commons_3.jpg"]

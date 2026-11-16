"""Dataset and backbone downloads into gitignored ml/data/.

Only sources whose licence allows our use are fetched by default (ml/DATASETS.md). THFOOD-50 and
THFOOD-100 are non-commercial research/education only: they need `--accept-licence <name>` and
are for Wongsaton's own private run (Mac, or Colab for public data). Every fixed file has a pinned
sha256; Commons files are checked against the sha1 the Commons API gives, and each file's author
and licence go to ATTRIBUTION.csv. Archives are unpacked with a path check."""
from __future__ import annotations

import hashlib
import html
import json
import re
import shutil
import tarfile
import time
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

USER_AGENT = "gymfood-ml/0.1 (personal research script; python-urllib)"


class LicenceNotAccepted(PermissionError):
    pass


class ChecksumError(ValueError):
    pass


class UnsafeArchive(ValueError):
    pass


@dataclass(frozen=True)
class RemoteFile:
    url: str
    sha256: str
    name: str


@dataclass(frozen=True)
class Source:
    name: str
    title: str
    allowed: bool              # licence allows training here without asking (DATASETS.md)
    licence: str               # short summary shown before download
    licence_url: str
    kind: str                  # "backbone" | "parquet" | "manual" | "commons"
    files: list[RemoteFile] = field(default_factory=list)


_HF = "https://huggingface.co/datasets/thean/THFOOD-50/resolve/f9663dc24a70b15fb8997991288b11694618bfa5/data/"

SOURCES: dict[str, Source] = {
    "efficientnet_lite0": Source(
        name="efficientnet_lite0",
        title="EfficientNet-Lite0 feature vector v2 (TF Hub / Kaggle Models)",
        allowed=True,
        licence="Apache License 2.0.",
        licence_url="https://www.kaggle.com/models/tensorflow/efficientnet",
        kind="backbone",
        files=[RemoteFile(
            url="https://tfhub.dev/tensorflow/efficientnet/lite0/feature-vector/2?tf-hub-format=compressed",
            sha256="41c6d030fb996b1bb27f6fcaa5bcccef75560a46e1602c1af4a616e0ac586c41",
            name="efficientnet_lite0_fv2.tar.gz",
        )],
    ),
    "thfood50": Source(
        name="thfood50",
        title="THFOOD-50 (50 Thai dishes, 15,770 images, ~3.1 GB)",
        allowed=False,
        licence=(
            "THFOOD-50 is provided for non-commercial research/educational use only. The images were "
            "collected from Google, Bing and Flickr and belong to their owners. You may train a model "
            "for your own private, non-commercial use; do not publish the images or the trained model."
        ),
        licence_url="https://github.com/chakkritte/THFOOD-50",
        kind="parquet",
        files=[
            RemoteFile(_HF + "train-00000-of-00004-23c16aa1ab00b30b.parquet",
                       "817198ad61315a98af8ddd9791784ecce6bd12c695a09798a2e84f09789ba398", "train-0.parquet"),
            RemoteFile(_HF + "train-00001-of-00004-d08e1d1df1c70fcd.parquet",
                       "d15007ce6cb5852ac54fc82e225ae05b5ff5627fbfa51963b132036ae150cf5b", "train-1.parquet"),
            RemoteFile(_HF + "train-00002-of-00004-913bb8650d018827.parquet",
                       "f3f03f32918190c099a1070bcbc110b29f386983dea72f17f08613c165a01138", "train-2.parquet"),
            RemoteFile(_HF + "train-00003-of-00004-85a05982403a4770.parquet",
                       "5ccbc84854b2792898d1a7ecaca98da1d14022da1690bd9caf09b9631b16e932", "train-3.parquet"),
            RemoteFile(_HF + "val-00000-of-00001-53e00a412e320f47.parquet",
                       "5724e6ff9d318e283cddabda4eb01863cdf2e48d9549c9e252da5eaff5fbd206", "val-0.parquet"),
            RemoteFile(_HF + "test-00000-of-00001-6d373025c86f0bd2.parquet",
                       "cb5b7aca2eba7787d50073970b2853a0ceb185331a3c75d17f3a4e6af57fd0c2", "test-0.parquet"),
        ],
    ),
    "thfood100": Source(
        name="thfood100",
        title="THFOOD-100 (100 Thai dishes, 53,459 images, ~15.7 GB)",
        allowed=False,
        licence=(
            "THFOOD-100 is provided for non-commercial research and educational use only. The images "
            "are Wongnai user uploads and belong to those users. Private, non-commercial training only; "
            "do not publish the images or the trained model."
        ),
        licence_url="https://github.com/NawanolT/THFOOD-100",
        kind="manual",   # download the zip from the official page yourself, then --from-file
    ),
    "commons": Source(
        name="commons",
        title="Wikimedia Commons Thai food categories (CC0 / PD / CC BY files only)",
        allowed=True,
        licence="Per file: only CC0, public domain and CC BY files are kept; author + licence go to ATTRIBUTION.csv.",
        licence_url="https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia",
        kind="commons",
    ),
}

# Our label -> Commons categories (names checked against the Commons API on 2026-11-16).
COMMONS_CATEGORIES: dict[str, list[str]] = {
    "pad_thai": ["Pad Thai"],
    "tom_yum_goong": ["Tom yam"],
    "som_tum": ["Som tam"],
    "kaeng_khiao_wan": ["Green curry"],
    "massaman": ["Massaman curry"],
    "khao_man_gai": ["Khao man kai"],
    "pad_kra_pao": ["Phat kaphrao"],
    "tom_kha_gai": ["Tom kha kai"],
    "gai_yang": ["Kai yang"],
    "khao_niao_mamuang": ["Mango sticky rice"],
    "moo_satay": ["Satay"],
    "larb_moo": ["Larb"],
    "khao_moo_daeng": ["Khao mu daeng", "Mu krop"],
    "khao_kha_moo": ["Khao kha mu"],
    "yum_woon_sen": ["Yam wun sen"],
    "nam_tok_moo": ["Nam tok (food)"],
    "khao_kai_jeow": ["Khai chiao"],
}

_FREE = re.compile(r"^(cc0|cc-zero|public domain|pd\b.*|cc by \d(\.\d)?( [a-z]+)?|cc-by-\d(\.\d)?)$", re.I)


class Net(Protocol):
    def fetch(self, url: str, dest: Path) -> None: ...
    def get_json(self, url: str) -> dict: ...


class UrllibNet:
    """Real network. Streams to disk; polite delay for the Commons API."""

    def fetch(self, url: str, dest: Path) -> None:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as r, dest.open("wb") as f:
            shutil.copyfileobj(r, f, length=1 << 20)

    def get_json(self, url: str) -> dict:
        time.sleep(0.5)
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))


def _digest(path: Path, algo: str) -> str:
    h = hashlib.new(algo)
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _fetch_verified(net: Net, f: RemoteFile, dest_dir: Path) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f.name
    if dest.exists() and _digest(dest, "sha256") == f.sha256:
        return dest
    tmp = dest.with_suffix(dest.suffix + ".part")
    try:
        net.fetch(f.url, tmp)
        got = _digest(tmp, "sha256")
        if got != f.sha256:
            raise ChecksumError(f"{f.name}: sha256 {got} != expected {f.sha256}")
        tmp.replace(dest)
    finally:
        tmp.unlink(missing_ok=True)
    return dest


def _check_member(name: str, target: Path) -> Path:
    if name.startswith(("/", "\\")) or "\\" in name or re.match(r"^[A-Za-z]:", name):
        raise UnsafeArchive(f"unsafe path in archive: {name!r}")
    out = (target / name).resolve()
    if out != target.resolve() and target.resolve() not in out.parents:
        raise UnsafeArchive(f"unsafe path in archive: {name!r}")
    return out


def safe_unpack(archive: Path, target: Path) -> Path:
    """Unpacks .tar.gz / .zip into target after checking every member stays inside it."""
    target.mkdir(parents=True, exist_ok=True)
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as z:
            for n in z.namelist():
                _check_member(n, target)
            z.extractall(target)
    else:
        with tarfile.open(archive) as t:
            for m in t.getmembers():
                _check_member(m.name, target)
                if m.issym() or m.islnk() or m.isdev():
                    raise UnsafeArchive(f"links/devices not allowed in archive: {m.name!r}")
            t.extractall(target, filter="data")
    return target


def _ext_for(data: bytes) -> str:
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return ".img"


def parquet_to_folders(parquet: Path, out_dir: Path, *, prefix: str) -> int:
    """HF image-classification parquet (image{bytes}, label) -> out_dir/<ClassName>/<prefix>_<i>.<ext>."""
    import pyarrow.parquet as pq

    pf = pq.ParquetFile(parquet)
    meta = json.loads((pf.schema_arrow.metadata or {}).get(b"huggingface", b"{}"))
    names = meta.get("info", {}).get("features", {}).get("label", {}).get("names")
    if not names:
        raise ValueError(f"{parquet}: no class names in the parquet metadata")
    n = 0
    for batch in pf.iter_batches(batch_size=256, columns=["image", "label"]):
        for img, label in zip(batch.column("image").to_pylist(), batch.column("label").to_pylist()):
            data = img["bytes"] if isinstance(img, dict) else img
            cls = names[int(label)]
            if not re.fullmatch(r"[A-Za-z0-9_.-]+", cls):
                raise ValueError(f"unexpected class name {cls!r}")
            d = out_dir / cls
            d.mkdir(parents=True, exist_ok=True)
            (d / f"{prefix}_{n:06d}{_ext_for(data)}").write_bytes(data)
            n += 1
    return n


def _commons_list(net: Net, category: str) -> list[dict]:
    base = "https://commons.wikimedia.org/w/api.php?"
    params = {
        "action": "query", "format": "json", "generator": "categorymembers",
        "gcmtitle": f"Category:{category}", "gcmtype": "file", "gcmlimit": "50",
        "prop": "imageinfo", "iiprop": "url|sha1|size|mime|extmetadata",
        "iiextmetadatafilter": "LicenseShortName|Artist|LicenseUrl",
    }
    pages: list[dict] = []
    cont: dict = {}
    while True:
        data = net.get_json(base + urllib.parse.urlencode({**params, **cont}))
        pages += list((data.get("query") or {}).get("pages", {}).values())
        if "continue" not in data:
            return pages
        cont = data["continue"]


def _plain(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def _download_commons(net: Net, out: Path, categories: dict[str, list[str]], max_bytes: int = 15 << 20) -> Path:
    import csv

    out.mkdir(parents=True, exist_ok=True)
    rows = []
    for label, cats in categories.items():
        for cat in cats:
            for page in _commons_list(net, cat):
                info = (page.get("imageinfo") or [{}])[0]
                meta = info.get("extmetadata") or {}
                lic = _plain((meta.get("LicenseShortName") or {}).get("value", ""))
                if not _FREE.match(lic) or {"sa", "nc", "nd"} & set(re.split(r"[\s-]+", lic.lower())):
                    continue
                if info.get("mime") not in ("image/jpeg", "image/png") or info.get("size", 0) > max_bytes:
                    continue
                dest_dir = out / label
                dest_dir.mkdir(parents=True, exist_ok=True)
                dest = dest_dir / f"commons_{page['pageid']}{'.png' if info['mime'] == 'image/png' else '.jpg'}"
                if not dest.exists():
                    tmp = dest.with_suffix(".part")
                    net.fetch(info["url"], tmp)
                    if _digest(tmp, "sha1") != info.get("sha1"):
                        tmp.unlink(missing_ok=True)
                        continue
                    tmp.replace(dest)
                rows.append({
                    "file": f"{label}/{dest.name}", "label": label, "title": page.get("title", ""),
                    "author": _plain((meta.get("Artist") or {}).get("value", "")) or "unknown",
                    "licence": lic, "licence_url": (meta.get("LicenseUrl") or {}).get("value", ""),
                    "source_url": info["url"], "sha256": _digest(dest, "sha256"),
                })
    with (out / "ATTRIBUTION.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["file", "label", "title", "author", "licence", "licence_url",
                                          "source_url", "sha256"])
        w.writeheader()
        w.writerows(rows)
    return out


def download(
    name: str,
    *,
    data_dir: Path,
    accepted: set[str],
    net: Net | None = None,
    from_file: Path | None = None,
    commons_categories: dict[str, list[str]] | None = None,
) -> Path:
    """Fetches one source; returns the folder with its usable content."""
    src = SOURCES[name]
    if not src.allowed and name not in accepted:
        raise LicenceNotAccepted(
            f"{src.title}\nLicence: {src.licence}\nRead the terms: {src.licence_url}\n"
            f"If you accept them for your own private, non-commercial use, re-run with "
            f"--accept-licence {name}"
        )
    net = net or UrllibNet()
    downloads = data_dir / "downloads" / name
    if src.kind == "backbone":
        target = data_dir / "backbones" / name
        if (target / "saved_model.pb").exists():
            return target
        arc = _fetch_verified(net, src.files[0], downloads)
        return safe_unpack(arc, target)
    if src.kind == "parquet":
        target = data_dir / "raw" / name
        done = target / ".complete"
        if done.exists():
            return target
        if target.exists():
            shutil.rmtree(target)
        for f in src.files:
            p = _fetch_verified(net, f, downloads)
            parquet_to_folders(p, target, prefix=Path(f.name).stem.replace("-", "_"))
        done.write_text("ok\n")
        shutil.rmtree(downloads, ignore_errors=True)  # images are extracted; save the disk (Drive)
        return target
    if src.kind == "manual":
        if from_file is None:
            raise ValueError(f"{name}: download it from {src.licence_url} yourself, then pass --from-file <zip>")
        return safe_unpack(Path(from_file), data_dir / "raw" / name)
    if src.kind == "commons":
        return _download_commons(net, data_dir / "raw" / name, commons_categories or COMMONS_CATEGORIES)
    raise ValueError(f"unknown kind {src.kind}")

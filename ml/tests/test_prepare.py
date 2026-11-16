"""Task 5: class mapping, unmapped classes dropped, deterministic hash split, the personal holdout
never leaking into training, and reading the app's photo export zip (labels.csv is the label source)."""
from __future__ import annotations

import csv
import hashlib
import zipfile
from pathlib import Path

import pytest

from conftest import make_jpeg
from gymfood.classmap import ClassMap
from gymfood.config import ML_DIR, load_config
from gymfood.personal import PhotoZipError, read_photo_zip
from gymfood.prepare import prepare_dataset, read_manifest, scan_raw
from gymfood.split import bucket, public_split

FIXTURE_ZIP = ML_DIR / "tests" / "fixtures" / "gym-clean-food-photos-fixture.zip"

CM = ClassMap.from_dict(
    {
        "version": 1,
        "classes": {
            "pad_thai": {"dishes": ["thai:pad-thai-goong", "thai:pad-thai-gai"],
                         "datasets": {"thfood50": ["PadThai"]}},
            "tom_yum_goong": {"dishes": ["thai:tom-yum-goong"],
                              "datasets": {"thfood50": ["TomYumGoong"]}},
        },
    }
)


def write_raw(root: Path, dataset: str, cls: str, n: int, rgb=(200, 100, 50), start=0) -> None:
    d = root / dataset / cls
    d.mkdir(parents=True, exist_ok=True)
    for i in range(start, start + n):
        (d / f"img_{i}.jpg").write_bytes(make_jpeg(rgb, mark=i))


def make_zip(path: Path, photos: list[tuple[str, str, int, bytes]], extra: dict[str, bytes] | None = None,
             labels: str | None = None) -> Path:
    """photos: (folder, dishId, createdAt, jpeg) in the app's export layout."""
    root = "gym-clean-food-photos"
    rows = ["file,dishId,createdAt"]
    with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as z:
        for folder, dish, ts, data in photos:
            z.writestr(f"{root}/{folder}/{ts}.jpg", data)
            rows.append(f"{folder}/{ts}.jpg,{dish},{ts}")
        for name, data in (extra or {}).items():
            z.writestr(name, data)
        z.writestr(f"{root}/labels.csv", labels if labels is not None else "\n".join(rows) + "\n")
    return path


def personal_zip(tmp_path: Path, n_pad: int, n_tom: int, name="p.zip") -> Path:
    photos = []
    for i in range(n_pad):
        photos.append(("thai_pad-thai-gai", "thai:pad-thai-gai", 1_700_000_000_000 + i,
                       make_jpeg((240, 180, 60), mark=1000 + i)))
    for i in range(n_tom):
        photos.append(("thai_tom-yum-goong", "thai:tom-yum-goong", 1_700_000_100_000 + i,
                       make_jpeg((180, 40, 30), mark=3000 + i)))
    return make_zip(tmp_path / name, photos)


@pytest.fixture
def cfg(tmp_path: Path):
    return load_config(data_dir=tmp_path / "data")


# --- split -------------------------------------------------------------------------------------

def test_bucket_is_deterministic_and_salted():
    h = "ab" * 32
    assert bucket(h, "s1") == bucket(h, "s1")
    assert 0 <= bucket(h, "s1") < 100
    assert any(bucket(f"{i:064x}", "s1") != bucket(f"{i:064x}", "s2") for i in range(20))


def test_public_split_roughly_follows_the_percentages(cfg):
    counts = {"train": 0, "val": 0, "test": 0}
    for i in range(4000):
        counts[public_split(f"{i * 7919:064x}", cfg.split)] += 1
    assert 0.75 < counts["train"] / 4000 < 0.85
    assert 0.07 < counts["val"] / 4000 < 0.13
    assert 0.07 < counts["test"] / 4000 < 0.13


# --- raw scan + mapping ------------------------------------------------------------------------

def test_maps_dataset_classes_and_drops_unmapped_ones(tmp_path: Path, cfg):
    raw = tmp_path / "raw"
    write_raw(raw, "thfood50", "PadThai", 6)
    write_raw(raw, "thfood50", "TomYumGoong", 5, rgb=(10, 200, 10))
    write_raw(raw, "thfood50", "Suki", 4, rgb=(10, 10, 200))
    res = prepare_dataset(cfg, CM, raw_dir=raw, zips=[])
    labels = {r.label for r in res.rows}
    assert labels == {"pad_thai", "tom_yum_goong"}
    assert len(res.rows) == 11
    assert res.report["unmapped_classes"] == {"thfood50": {"Suki": 4}}
    assert all(r.source == "thfood50" for r in res.rows)


def test_scan_ignores_non_images_and_hidden_files(tmp_path: Path):
    raw = tmp_path / "raw"
    write_raw(raw, "thfood50", "PadThai", 2)
    (raw / "thfood50" / "PadThai" / "notes.txt").write_text("x")
    (raw / "thfood50" / "PadThai" / ".DS_Store").write_bytes(b"x")
    (raw / "thfood50" / "PadThai" / "._img_0.jpg").write_bytes(b"x")
    items = scan_raw(raw)
    assert len(items) == 2


def test_split_is_the_same_on_every_run(tmp_path: Path, cfg):
    raw = tmp_path / "raw"
    write_raw(raw, "thfood50", "PadThai", 30)
    write_raw(raw, "thfood50", "TomYumGoong", 30, rgb=(10, 200, 10))
    a = prepare_dataset(cfg, CM, raw_dir=raw, zips=[])
    b = prepare_dataset(cfg, CM, raw_dir=raw, zips=[])
    assert [(r.sha256, r.split) for r in a.rows] == [(r.sha256, r.split) for r in b.rows]
    assert {r.split for r in a.rows} <= {"train", "val", "test"}


def test_exact_duplicate_files_are_kept_once(tmp_path: Path, cfg):
    raw = tmp_path / "raw"
    write_raw(raw, "thfood50", "PadThai", 3)
    dup = (raw / "thfood50" / "PadThai" / "img_0.jpg").read_bytes()
    (raw / "thfood50" / "PadThai" / "copy.jpg").write_bytes(dup)
    res = prepare_dataset(cfg, CM, raw_dir=raw, zips=[])
    assert len(res.rows) == 3
    assert res.report["duplicates_dropped"] == 1


# --- personal photos ---------------------------------------------------------------------------

def test_reads_the_checked_in_zip_written_by_the_app_format():
    pz = read_photo_zip(FIXTURE_ZIP)
    assert len(pz.photos) >= 4
    assert {p.dish_id for p in pz.photos} >= {"thai:pad-thai-goong", "thai:tom-yum-goong"}
    for p in pz.photos:
        assert p.data[:2] == b"\xff\xd8"  # JPEG
        assert p.created_at > 0
        assert p.file.endswith(".jpg") and "/" in p.file
    assert pz.problems == []


def test_labels_come_from_labels_csv_not_the_folder_name(tmp_path: Path):
    # The folder says pad thai, labels.csv says tom yum: labels.csv wins (Decision).
    z = make_zip(tmp_path / "z.zip", [("thai_pad-thai-gai", "thai:tom-yum-goong", 5, make_jpeg((1, 2, 3)))])
    pz = read_photo_zip(z)
    assert [p.dish_id for p in pz.photos] == ["thai:tom-yum-goong"]


def test_zip_problems_are_reported_not_fatal(tmp_path: Path):
    root = "gym-clean-food-photos"
    labels = "file,dishId,createdAt\nmissing/1.jpg,thai:x,1\nok/2.jpg,thai:pad-thai-gai,2\nok/3.jpg,,3\n"
    z = make_zip(tmp_path / "z.zip", [], extra={f"{root}/ok/2.jpg": make_jpeg((9, 9, 9)),
                                                 f"{root}/ok/3.jpg": make_jpeg((8, 8, 8))}, labels=labels)
    pz = read_photo_zip(z)
    assert [p.dish_id for p in pz.photos] == ["thai:pad-thai-gai"]
    assert len(pz.problems) == 2


@pytest.mark.parametrize("bad_file", ["../evil.jpg", "/etc/evil.jpg", "a/../../evil.jpg", "a\\..\\evil.jpg"])
def test_zip_rejects_paths_outside_the_root(tmp_path: Path, bad_file: str):
    labels = f"file,dishId,createdAt\n{bad_file},thai:pad-thai-gai,1\n"
    z = make_zip(tmp_path / "z.zip", [], labels=labels)
    pz = read_photo_zip(z)
    assert pz.photos == []
    assert pz.problems


def test_zip_without_labels_csv_fails(tmp_path: Path):
    p = tmp_path / "z.zip"
    with zipfile.ZipFile(p, "w") as z:
        z.writestr("gym-clean-food-photos/a/1.jpg", make_jpeg((1, 1, 1)))
    with pytest.raises(PhotoZipError):
        read_photo_zip(p)


def test_personal_holdout_is_at_least_100_and_never_trained_on(tmp_path: Path, cfg):
    raw = tmp_path / "raw"
    write_raw(raw, "thfood50", "PadThai", 10)
    z = personal_zip(tmp_path, 120, 100)
    res = prepare_dataset(cfg, CM, raw_dir=raw, zips=[z])
    personal = [r for r in res.rows if r.source == "personal"]
    held = [r for r in personal if r.split == "personal_test"]
    assert len(personal) == 220
    assert len(held) >= 100
    assert len(held) >= round(0.3 * 220)
    held_sha = {r.sha256 for r in held}
    trainable = [r for r in res.rows if r.split in ("train", "val", "personal_train", "personal_val")]
    assert not held_sha & {r.sha256 for r in trainable}
    # Personal images are copied out of the zip under data/personal and labelled through classMap.
    assert all(Path(r.path).is_file() for r in personal)
    assert {r.label for r in personal} == {"pad_thai", "tom_yum_goong"}
    assert res.report["personal"]["held_out"] == len(held)


def test_with_fewer_than_100_personal_photos_all_are_held_out(tmp_path: Path, cfg):
    raw = tmp_path / "raw"
    write_raw(raw, "thfood50", "PadThai", 4)
    z = personal_zip(tmp_path, 30, 20)
    res = prepare_dataset(cfg, CM, raw_dir=raw, zips=[z])
    personal = [r for r in res.rows if r.source == "personal"]
    assert {r.split for r in personal} == {"personal_test"}
    assert any("fewer than" in w for w in res.report["warnings"])


def test_holdout_is_stable_across_runs_and_zip_order(tmp_path: Path, cfg):
    raw = tmp_path / "raw"
    write_raw(raw, "thfood50", "PadThai", 4)
    z1 = personal_zip(tmp_path, 90, 80, name="a.zip")
    a = prepare_dataset(cfg, CM, raw_dir=raw, zips=[z1])
    b = prepare_dataset(cfg, CM, raw_dir=raw, zips=[z1])
    pick = lambda res: sorted(r.sha256 for r in res.rows if r.split == "personal_test")  # noqa: E731
    assert pick(a) == pick(b)


def test_a_held_out_photo_that_is_also_in_a_public_set_is_removed_from_training(tmp_path: Path, cfg):
    raw = tmp_path / "raw"
    z = personal_zip(tmp_path, 10, 0)
    shared = read_photo_zip(z).photos[0].data
    (raw / "thfood50" / "PadThai").mkdir(parents=True)
    (raw / "thfood50" / "PadThai" / "same.jpg").write_bytes(shared)
    res = prepare_dataset(cfg, CM, raw_dir=raw, zips=[z])
    rows = [r for r in res.rows if r.sha256 == hashlib.sha256(shared).hexdigest()]
    assert [r.split for r in rows] == ["personal_test"]


def test_unknown_dishes_in_the_zip_are_dropped_and_reported(tmp_path: Path, cfg):
    z = make_zip(tmp_path / "z.zip", [("thai_khao-suay", "thai:khao-suay", 1, make_jpeg((5, 5, 5))),
                                      ("thai_pad-thai-gai", "thai:pad-thai-gai", 2, make_jpeg((6, 6, 6)))])
    res = prepare_dataset(cfg, CM, raw_dir=tmp_path / "none", zips=[z])
    assert [r.label for r in res.rows] == ["pad_thai"]
    assert res.report["unmapped_dishes"] == {"thai:khao-suay": 1}


def test_manifest_round_trips(tmp_path: Path, cfg):
    raw = tmp_path / "raw"
    write_raw(raw, "thfood50", "PadThai", 5)
    res = prepare_dataset(cfg, CM, raw_dir=raw, zips=[])
    out = res.write(cfg.paths.data / "prepared")
    back = read_manifest(out)
    assert back == res.rows
    with out.open() as f:
        assert next(csv.reader(f)) == ["path", "label", "split", "source", "sha256"]
    assert (cfg.paths.data / "prepared" / "prepare_report.json").is_file()

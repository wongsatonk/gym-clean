"""Reads the app's food-photo export zip (Settings → Food photos → Export; src/core/nutrition/photoExport.ts).

Layout: gym-clean-food-photos/<dishFolder>/<createdAt>.jpg plus gym-clean-food-photos/labels.csv
(`file,dishId,createdAt`, `file` relative to the root). labels.csv is the only label source
(Decision "M7b photo export folder names"); folder names are ignored. Nothing is extracted to disk
here: entries are read into memory by the names labels.csv gives, after a path check."""
from __future__ import annotations

import csv
import io
import posixpath
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

ROOT = "gym-clean-food-photos"
MAX_PHOTO_BYTES = 20 * 1024 * 1024


class PhotoZipError(ValueError):
    pass


@dataclass(frozen=True)
class PersonalPhoto:
    file: str          # relative to the root, as in labels.csv
    dish_id: str
    created_at: int
    data: bytes


@dataclass
class PhotoZip:
    photos: list[PersonalPhoto] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)


def _safe_rel(name: str) -> str | None:
    if not name or "\\" in name or name.startswith("/") or "\x00" in name:
        return None
    norm = posixpath.normpath(name)
    if norm.startswith("..") or norm != name or not norm.lower().endswith(".jpg"):
        return None
    return norm


def read_photo_zip(path: str | Path) -> PhotoZip:
    out = PhotoZip()
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        labels_name = f"{ROOT}/labels.csv"
        if labels_name not in names:
            raise PhotoZipError(f"{path}: no {labels_name} (is this a Gym Clean photo export?)")
        text = z.read(labels_name).decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        if reader.fieldnames is None or not {"file", "dishId", "createdAt"} <= set(reader.fieldnames):
            raise PhotoZipError(f"{path}: labels.csv needs file,dishId,createdAt")
        for line, row in enumerate(reader, start=2):
            rel = _safe_rel((row.get("file") or "").strip())
            dish = (row.get("dishId") or "").strip()
            if rel is None:
                out.problems.append(f"labels.csv line {line}: bad file path {row.get('file')!r}")
                continue
            if not dish:
                out.problems.append(f"labels.csv line {line}: no dishId")
                continue
            try:
                ts = int((row.get("createdAt") or "").strip())
            except ValueError:
                out.problems.append(f"labels.csv line {line}: bad createdAt")
                continue
            member = f"{ROOT}/{rel}"
            if member not in names:
                out.problems.append(f"labels.csv line {line}: {rel} is not in the zip")
                continue
            info = z.getinfo(member)
            if info.file_size > MAX_PHOTO_BYTES:
                out.problems.append(f"labels.csv line {line}: {rel} is too big")
                continue
            out.photos.append(PersonalPhoto(file=rel, dish_id=dish, created_at=ts, data=z.read(member)))
    return out

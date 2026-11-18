"""Reads src/food-vision/classMap.json, the label source of truth shared with the app.

Mirrors the checks in src/food-vision/classMap.ts so a bad map fails here too."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

LABEL_PATTERN = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
DISH_PATTERN = re.compile(r"^thai:[a-z0-9-]+$")


@dataclass(frozen=True)
class ClassMap:
    classes: dict[str, list[str]]           # label -> dish ids (first = default)
    sources: dict[str, dict[str, str]]      # dataset -> source class name -> label

    @property
    def labels(self) -> list[str]:
        """Model output labels, in classMap order."""
        return list(self.classes)

    def dishes(self, label: str) -> list[str]:
        return list(self.classes.get(label, []))

    def default_dish(self, label: str) -> str | None:
        d = self.classes.get(label)
        return d[0] if d else None

    def label_for_dish(self, dish_id: str) -> str | None:
        for label, dishes in self.classes.items():
            if dish_id in dishes:
                return label
        return None

    def label_for_source(self, dataset: str, name: str) -> str | None:
        """Dataset class → our label. A folder already named by one of our labels maps to itself."""
        hit = self.sources.get(dataset, {}).get(name)
        if hit is not None:
            return hit
        return name if name in self.classes else None

    @classmethod
    def from_dict(cls, raw: Any) -> "ClassMap":
        if not isinstance(raw, dict) or not isinstance(raw.get("classes"), dict):
            raise ValueError("classMap: missing classes")
        classes: dict[str, list[str]] = {}
        sources: dict[str, dict[str, str]] = {}
        owner: dict[str, str] = {}
        for label, entry in raw["classes"].items():
            if not LABEL_PATTERN.match(label):
                raise ValueError(f'classMap: bad label "{label}"')
            dishes = entry.get("dishes") if isinstance(entry, dict) else None
            if not isinstance(dishes, list) or not dishes or not all(isinstance(d, str) for d in dishes):
                raise ValueError(f"classMap: {label} needs at least one dish")
            for d in dishes:
                if not DISH_PATTERN.match(d):
                    raise ValueError(f'classMap: {label} has bad dish id "{d}"')
                if d in owner:
                    raise ValueError(f"classMap: {d} is in {owner[d]} and {label}")
                owner[d] = label
            classes[label] = list(dishes)
            for dataset, names in (entry.get("datasets") or {}).items():
                if not isinstance(names, list) or not all(isinstance(n, str) for n in names):
                    raise ValueError(f"classMap: {label} has bad datasets")
                by_name = sources.setdefault(dataset, {})
                for n in names:
                    if n in by_name:
                        raise ValueError(f"classMap: {dataset}/{n} maps to {by_name[n]} and {label}")
                    by_name[n] = label
        if len(classes) < 2:
            raise ValueError("classMap: needs at least 2 classes")
        return cls(classes=classes, sources=sources)


def load_class_map(path: str | Path) -> ClassMap:
    return ClassMap.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))


def load_dish_names(path: str | Path) -> dict[str, str]:
    """dish id -> English name (reports only)."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return {f["id"]: f.get("name", f["id"]) for f in data.get("foods", [])}

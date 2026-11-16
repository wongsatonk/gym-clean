"""Task 4: the config loads and the label list is exactly the app's classMap keys."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from gymfood.classmap import ClassMap, load_class_map
from gymfood.config import ML_DIR, load_config

REPO = ML_DIR.parent
APP_CLASS_MAP = REPO / "src" / "food-vision" / "classMap.json"


def test_config_loads_with_absolute_paths():
    cfg = load_config()
    assert cfg.paths.class_map == APP_CLASS_MAP.resolve()
    assert cfg.paths.data == (ML_DIR / "data").resolve()
    assert cfg.backbone.image_size == 224
    assert cfg.export.max_mb == 25
    assert cfg.split.personal_holdout_min >= 100


def test_config_override_paths(tmp_path: Path):
    src = (ML_DIR / "config.yaml").read_text()
    p = tmp_path / "c.yaml"
    p.write_text(src)
    cfg = load_config(p, data_dir=tmp_path / "d")
    assert cfg.paths.data == (tmp_path / "d").resolve()
    # Relative paths in a copied config resolve against ml/, not the copy's folder.
    assert cfg.paths.class_map == APP_CLASS_MAP.resolve()


def test_labels_equal_the_app_class_map_keys_in_order():
    cm = load_class_map(load_config().paths.class_map)
    raw = json.loads(APP_CLASS_MAP.read_text())
    assert cm.labels == list(raw["classes"].keys())
    assert len(cm.labels) >= 2


def test_every_class_map_dish_exists_in_the_dish_table():
    cfg = load_config()
    cm = load_class_map(cfg.paths.class_map)
    ids = {f["id"] for f in json.loads(cfg.paths.dishes.read_text())["foods"]}
    for label in cm.labels:
        for dish in cm.dishes(label):
            assert dish in ids, (label, dish)


SMALL = {
    "version": 1,
    "classes": {
        "pad_thai": {"dishes": ["thai:pad-thai-goong", "thai:pad-thai-gai"],
                     "datasets": {"thfood50": ["PadThai"]}},
        "tom_yum_goong": {"dishes": ["thai:tom-yum-goong"],
                          "datasets": {"thfood50": ["TomYumGoong"], "thfood100": ["tom_yum"]}},
    },
}


def test_maps_dataset_classes_and_dishes():
    cm = ClassMap.from_dict(SMALL)
    assert cm.label_for_source("thfood50", "PadThai") == "pad_thai"
    assert cm.label_for_source("thfood100", "tom_yum") == "tom_yum_goong"
    assert cm.label_for_source("thfood50", "Suki") is None
    # A folder already named by our label maps to itself (Commons, smoke data).
    assert cm.label_for_source("commons", "pad_thai") == "pad_thai"
    assert cm.label_for_dish("thai:pad-thai-gai") == "pad_thai"
    assert cm.label_for_dish("thai:khao-suay") is None
    assert cm.default_dish("pad_thai") == "thai:pad-thai-goong"


@pytest.mark.parametrize(
    "bad",
    [
        {"classes": {"Bad-Label": {"dishes": ["thai:x"]}}},
        {"classes": {"a": {"dishes": []}}},
        {"classes": {"a": {"dishes": ["thai:x"]}, "b": {"dishes": ["thai:x"]}}},
        {"classes": {"a": {"dishes": ["thai:x"], "datasets": {"d": ["S"]}},
                     "b": {"dishes": ["thai:y"], "datasets": {"d": ["S"]}}}},
        {"nope": 1},
    ],
)
def test_rejects_bad_class_maps(bad):
    with pytest.raises(ValueError):
        ClassMap.from_dict(bad)

"""Guards for files people run by hand: the Colab notebook and the pinned requirements."""
from __future__ import annotations

import json
import re

from gymfood.config import ML_DIR


def _pins(name: str) -> dict[str, str]:
    out = {}
    for line in (ML_DIR / name).read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            m = re.fullmatch(r"([A-Za-z0-9_.-]+)==([0-9][A-Za-z0-9.]*)", line)
            assert m, f"{name}: not pinned: {line!r}"
            out[m[1].lower()] = m[2]
    return out


def test_requirements_are_pinned_and_colab_matches():
    mac = _pins("requirements.txt")
    colab = _pins("requirements-colab.txt")
    assert {"tensorflow", "mediapipe"} <= mac.keys()
    assert "tensorflow" not in colab  # Colab keeps its GPU TensorFlow
    for k, v in colab.items():
        assert mac[k] == v, k


def test_colab_notebook_is_public_data_only_licence_gated_and_has_no_outputs():
    nb = json.loads((ML_DIR / "train_colab.ipynb").read_text())
    code = "\n".join("".join(c["source"]) for c in nb["cells"] if c["cell_type"] == "code")
    for c in nb["cells"]:
        if c["cell_type"] == "code":
            assert c["outputs"] == [] and c["execution_count"] is None
    assert "ACCEPT_THFOOD50_LICENCE = False" in code
    assert "--no-personal" in code
    assert "--zip" not in code and "personal_zips" not in code
    assert "files.download" in code
    assert "last output" in code  # run() shows the failing command's output tail
    assert '"--epochs", str(EPOCHS)' in code
    assert "config.yaml" not in code  # never rewrite the config (e.g. to lower a threshold)

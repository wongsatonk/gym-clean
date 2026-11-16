"""Shared pytest setup: import path, the opt-in `slow` marker and tiny made-up images."""
from __future__ import annotations

import io
import os
import sys
from pathlib import Path

import pytest

ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption("--runslow", action="store_true", help="run the slow export smoke test")


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if config.getoption("--runslow") or os.environ.get("GYMFOOD_SLOW") == "1":
        return
    skip = pytest.mark.skip(reason="slow: pass --runslow or set GYMFOOD_SLOW=1")
    for item in items:
        if "slow" in item.keywords:
            item.add_marker(skip)


def make_jpeg(rgb: tuple[int, int, int], size: tuple[int, int] = (24, 16), mark: int = 0) -> bytes:
    """A made-up solid-colour JPEG; `mark` changes one pixel so the bytes (and hash) differ."""
    from PIL import Image

    img = Image.new("RGB", size, rgb)
    img.putpixel((mark % size[0], (mark // size[0]) % size[1]), (255 - rgb[0], 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


@pytest.fixture
def jpeg():
    return make_jpeg

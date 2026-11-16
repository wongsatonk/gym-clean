"""Shared CLI bits: import path and the --config / --*-dir options."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

from gymfood.config import Config, load_config  # noqa: E402


def parser(description: str) -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=description)
    p.add_argument("--config", type=Path, default=None, help="config YAML (default ml/config.yaml)")
    p.add_argument("--data-dir", type=Path, default=None, help="override paths.data")
    p.add_argument("--runs-dir", type=Path, default=None, help="override paths.runs")
    p.add_argument("--models-dir", type=Path, default=None, help="override paths.models")
    return p


def config_from(args: argparse.Namespace) -> Config:
    return load_config(args.config, data_dir=args.data_dir, runs_dir=args.runs_dir, models_dir=args.models_dir)

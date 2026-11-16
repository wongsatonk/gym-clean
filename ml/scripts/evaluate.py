"""Top-1 / top-3 / per-class accuracy and the most-confused pairs for a run -> runs/<id>/report.md.

  python scripts/evaluate.py --run-id 2026-12-01"""
from __future__ import annotations

from _common import config_from, parser

from gymfood.pipeline import run_evaluate


def main() -> int:
    p = parser(__doc__)
    p.add_argument("--run-id", required=True)
    args = p.parse_args()
    run_evaluate(config_from(args), args.run_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Embed images with the frozen backbone (cached, resumable) and train the classifier head.

  python scripts/train.py --run-id 2026-12-01
Re-running with the same --run-id resumes (embedding chunks and the head checkpoint are kept)."""
from __future__ import annotations

import time

from _common import config_from, parser

from gymfood.pipeline import run_train


def main() -> int:
    p = parser(__doc__)
    p.add_argument("--run-id", default=time.strftime("%Y%m%d-%H%M%S"))
    p.add_argument("--epochs", type=int, default=None, help="override head.epochs")
    args = p.parse_args()
    run_train(config_from(args), args.run_id, max_epochs=args.epochs)
    print(f"run id: {args.run_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Download a dataset or the backbone into ml/data/ (gitignored).

  python scripts/download.py efficientnet_lite0                       # Apache 2.0, always allowed
  python scripts/download.py commons                                  # CC0 / PD / CC BY files + ATTRIBUTION.csv
  python scripts/download.py thfood50 --accept-licence thfood50       # non-commercial: your private run only
  python scripts/download.py thfood100 --accept-licence thfood100 --from-file ~/Downloads/THFOOD-100.zip
"""
from __future__ import annotations

import sys

from _common import config_from, parser

from gymfood.download import SOURCES, LicenceNotAccepted, download


def main() -> int:
    p = parser(__doc__)
    p.add_argument("source", choices=sorted(SOURCES))
    p.add_argument("--accept-licence", action="append", default=[], metavar="NAME",
                   help="you have read and accept this dataset's terms (non-commercial sets)")
    p.add_argument("--from-file", default=None, help="a zip you downloaded yourself (manual sources)")
    args = p.parse_args()
    cfg = config_from(args)
    src = SOURCES[args.source]
    print(f"{src.title}\nLicence: {src.licence}\nTerms: {src.licence_url}\n")
    try:
        out = download(args.source, data_dir=cfg.paths.data, accepted=set(args.accept_licence),
                       from_file=args.from_file)
    except LicenceNotAccepted as e:
        print(f"Not downloaded.\n{e}", file=sys.stderr)
        return 2
    print(f"done: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

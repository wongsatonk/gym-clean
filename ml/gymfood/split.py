"""Deterministic splits by file content hash (the same file always lands in the same split)."""
from __future__ import annotations

import hashlib

from .config import Split


def file_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def bucket(sha256_hex: str, seed: str) -> int:
    """0..99 from the file hash and a salt."""
    h = hashlib.sha256(f"{seed}:{sha256_hex}".encode()).digest()
    return int.from_bytes(h[:8], "big") % 100


def public_split(sha256_hex: str, s: Split) -> str:
    b = bucket(sha256_hex, s.seed)
    if b < s.test_pct:
        return "test"
    if b < s.test_pct + s.val_pct:
        return "val"
    return "train"


def personal_splits(hashes: list[str], s: Split) -> tuple[dict[str, str], list[str]]:
    """His own photos: the first max(min, frac·n) by salted hash order are held out
    (`personal_test`, never trained on); the rest go to personal_train / personal_val.
    Fewer photos than the minimum → all held out. Returns (sha -> split, warnings)."""
    uniq = sorted(set(hashes), key=lambda h: (hashlib.sha256(f"{s.seed}:holdout:{h}".encode()).hexdigest(), h))
    n = len(uniq)
    warnings: list[str] = []
    want = max(s.personal_holdout_min, round(s.personal_holdout_frac * n))
    if n <= want:
        if n:
            warnings.append(
                f"{n} personal photos is fewer than the {s.personal_holdout_min} held-out minimum "
                f"plus training photos: all {n} are held out for testing, none are trained on."
            )
        want = n
    out: dict[str, str] = {}
    for i, h in enumerate(uniq):
        if i < want:
            out[h] = "personal_test"
        else:
            out[h] = "personal_val" if bucket(h, s.seed) < s.personal_val_pct else "personal_train"
    return out, warnings

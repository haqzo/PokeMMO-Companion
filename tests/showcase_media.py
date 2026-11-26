"""Exact paths and contents of the approved public 0.8.0 showcase."""
import hashlib
import json
from pathlib import Path


def approved_showcase_media(root: Path) -> set[str]:
    manifest = Path(__file__).with_name("fixtures") / "showcase-media.json"
    approved = json.loads(manifest.read_text(encoding="utf-8"))
    for name, digest in approved.items():
        asset = root / name
        assert asset.is_file() and not asset.is_symlink(), name
        assert hashlib.sha256(asset.read_bytes()).hexdigest() == digest, f"Unapproved showcase content: {name}"
    return set(approved)

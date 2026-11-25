"""Validate separate walkthrough localization entries against canonical steps."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_walkthrough_locales_preserve_ids_hashes_and_numbers():
    canonical = {}
    for path in (ROOT / "companion/data/walkthroughs").glob("*.json"):
        for step in json.loads(path.read_text(encoding="utf-8"))["steps"]:
            canonical[step["id"]] = step
    seen = set()
    for filename in ("walkthrough-locales.js", "walkthrough-generated.js"):
        source = (ROOT / "ui/js" / filename).read_text(encoding="utf-8")
        entries = re.findall(r'^\s*"([^"]+)": (\[.*\]),$', source, flags=re.M)
        assert entries, filename
        for step_id, raw in entries:
            assert step_id not in seen
            seen.add(step_id)
            digest, es, zh = json.loads(raw)
            step = canonical[step_id]
            assert digest == step["text_hash"]
            assert es.strip() and zh.strip()
            if filename == "walkthrough-generated.js" or step_id.startswith("kanto:imp:") and step_id not in {
                "kanto:imp:001:00", "kanto:imp:001:01", "kanto:imp:002:00", "kanto:imp:003:00",
                "kanto:imp:004:00", "kanto:imp:004:01", "kanto:imp:004:02", "kanto:imp:005:00",
                "kanto:imp:006:00", "kanto:imp:006:01",
            }:
                assert re.findall(r"\d+", es) == re.findall(r"\d+", step["text"])
                assert re.findall(r"\d+", zh) == re.findall(r"\d+", step["text"])
    assert len(seen) >= 981
    assert {step_id for step_id in canonical if step_id.startswith("kanto:")} <= seen

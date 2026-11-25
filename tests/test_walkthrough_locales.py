"""Validate the bundled catalogs against their canonical walkthrough steps."""

import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COUNTS = {
    "kanto": (454, 454),
    "johto": (617, 355),
    "hoenn": (526, 149),
    "sinnoh": (750, 194),
    "unova": (498, 185),
}


def _catalog(filename, name):
    source = (ROOT / "ui/js" / filename).read_text(encoding="utf-8")
    body = source.split(f"export const {name} = {{\n", 1)[1].split("\n};", 1)[0]
    entries = {}
    for line in body.splitlines():
        if not line.strip():
            continue
        match = re.fullmatch(r'\s*"([^"]+)": (\[.*\]),', line)
        assert match, (filename, line)
        step_id, raw = match.groups()
        assert step_id not in entries, (filename, step_id)
        entries[step_id] = json.loads(raw)
    assert entries, filename
    return entries


def _numbers(text):
    return re.findall(r"\d+", unicodedata.normalize("NFKC", text))


def test_walkthrough_locales_preserve_ids_hashes_and_numbers():
    canonical = {}
    totals = Counter()
    for path in (ROOT / "companion/data/walkthroughs").glob("*.json"):
        guide = json.loads(path.read_text(encoding="utf-8"))
        for step in guide["steps"]:
            step_id = step["id"]
            assert step_id not in canonical, step_id
            canonical[step_id] = step
            totals[guide["region"]] += 1

    manual = _catalog("walkthrough-locales.js", "WALKTHROUGH_TEXT")
    generated = _catalog("walkthrough-generated.js", "GENERATED_WALKTHROUGH_TEXT")
    assert not manual.keys() & generated.keys()
    translated = Counter()
    for step_id, (digest, es, zh) in (manual | generated).items():
        step = canonical[step_id]
        assert digest == step["text_hash"], step_id
        assert re.search(r"[a-záéíóúüñ]", es, re.I) and es.casefold() != step["text"].casefold(), step_id
        assert re.search(r"[\u3400-\u9fff]", zh), step_id
        assert "\ufffd" not in es + zh, step_id
        assert _numbers(es) == _numbers(step["text"]), step_id
        assert _numbers(zh) == _numbers(step["text"]), step_id
        translated[step["region"]] += 1

    assert totals == {region: total for region, (total, _) in COUNTS.items()}
    assert translated == {region: count for region, (_, count) in COUNTS.items()}


def test_johto_ice_puzzle_preserves_direction_and_step_order():
    manual = _catalog("walkthrough-locales.js", "WALKTHROUGH_TEXT")
    _, es, zh = manual["johto:imp:050:01"]
    assert re.findall(r"\b(?:norte|sur|este|oeste)\b", es) == [
        "oeste", "oeste", "norte", "este", "este",
    ]
    assert re.findall(r"向([北南东西])", zh) == ["西", "西", "北", "东", "东"]
    assert re.findall(r"(\d+) pasos? al (oeste|norte|este)", es) == [
        ("4", "oeste"), ("1", "oeste"), ("5", "norte"), ("1", "este"),
    ]
    assert re.findall(r"向([北东西])走 (\d+) 步", zh) == [
        ("西", "4"), ("西", "1"), ("北", "5"), ("东", "1"),
    ]

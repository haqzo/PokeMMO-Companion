"""Guides, breeding, live, news, backup and importer logic (no real dump needed)."""
import io
import json
import zipfile
from datetime import datetime, timezone

import pytest

from companion.services import backup, breeding
from companion.services.guides import GuideError
from companion.services.importer import classify_rate, parse_walkthrough_odt


# ------------------------------------------------------------------ guides
def test_two_runs_have_independent_progress(ctx):
    g = ctx.guides
    a = g.create_run("Haqzo", "Main", "kanto")
    b = g.create_run("Haqzo", "Alt", "unova")
    g.set_steps(a["id"], ["kanto:m:starter", "kanto:m:parcel"], True)
    g.set_steps(b["id"], ["unova:m:starter"], True)
    assert g.state(a["id"], "kanto")["done"] == ["kanto:m:parcel", "kanto:m:starter"]
    assert g.state(b["id"], "kanto")["done"] == []
    assert g.state(b["id"], "unova")["done"] == ["unova:m:starter"]


def test_duplicate_name_and_label_rejected_but_label_allows_second_run(ctx):
    ctx.guides.create_run("Ash", "")
    with pytest.raises(GuideError):
        ctx.guides.create_run("ash", "")
    ctx.guides.create_run("Ash", "Nuzlocke")


@pytest.mark.parametrize("bad", ["", " ", "x" * 25, "<script>"])
def test_run_name_validation(ctx, bad):
    with pytest.raises(GuideError):
        ctx.guides.create_run(bad)


def test_rename_keeps_progress_and_duplicate_is_independent(ctx):
    g = ctx.guides
    r = g.create_run("Misty")
    g.set_steps(r["id"], ["kanto:m:gym1"], True)
    g.rename_run(r["id"], "Misty2", "Main")
    assert "kanto:m:gym1" in g.state(r["id"], "kanto")["done"]
    d = g.duplicate_run(r["id"], "Copy")
    g.set_steps(d["id"], ["kanto:m:gym2"], True)
    assert "kanto:m:gym2" not in g.state(r["id"], "kanto")["done"]
    assert "kanto:m:gym1" in g.state(d["id"], "kanto")["done"]


def test_undo_reverts_the_last_batch_only(ctx):
    g = ctx.guides
    r = g.create_run("Brock")
    g.set_steps(r["id"], ["kanto:m:starter"], True)
    g.mark_through(r["id"], "kanto", "kanto:m:gym1")
    assert len(g.state(r["id"], "kanto")["done"]) == 4
    assert g.undo(r["id"])["undone"] == 3
    assert g.state(r["id"], "kanto")["done"] == ["kanto:m:starter"]


def test_mark_through_preview_changes_nothing(ctx):
    g = ctx.guides
    r = g.create_run("Prev")
    assert g.mark_through(r["id"], "kanto", "kanto:m:gym2", preview=True)["would_mark"] == 6
    assert g.state(r["id"], "kanto")["done"] == []


def test_progress_counts_mandatory_only(ctx):
    g = ctx.guides
    r = g.create_run("Count")
    g.set_steps(r["id"], ["kanto:m:defog"], True)  # optional Defog pickup
    st = g.state(r["id"], "kanto")
    assert st["counts"]["mandatory"]["done"] == 0 and st["counts"]["optional"]["done"] == 1


def test_delete_is_soft_and_restorable(ctx):
    g = ctx.guides
    r = g.create_run("Gone")
    g.set_steps(r["id"], ["kanto:m:starter"], True)
    g.delete_run(r["id"])
    assert not g.list_runs()
    g.restore_run(r["id"])
    assert g.state(r["id"], "kanto")["done"] == ["kanto:m:starter"]


def test_milestones_have_stable_unique_ids():
    from companion.data.guide_milestones import milestone_steps
    ids = [s["id"] for r in ("kanto", "johto", "hoenn", "sinnoh", "unova") for s in milestone_steps(r)]
    assert len(ids) == len(set(ids))
    assert "kanto:m:defog" in ids and "unova:m:defog" in ids and "hoenn:m:defog" in ids and "johto:m:defog" in ids


def _odt(paragraphs: list[str]) -> bytes:
    ns = ('xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
          'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"')
    body = "".join(f"<text:p>{p}</text:p>" for p in paragraphs)
    xml = f'<?xml version="1.0"?><office:document-content {ns}><office:body><office:text>{body}</office:text></office:body></office:document-content>'
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("content.xml", xml)
    return buf.getvalue()


def test_odt_parser_splits_headings_lines_and_detects_changes(ctx, tmp_path):
    f = tmp_path / "KANTO COMPLETE WALKTHROUGH.odt"
    f.write_bytes(_odt(["KANTO COMPLETE WALKTHROUGH", "PALLET TOWN<text:line-break/>Go north.Pick your starter.",
                        "ROUTE 1", "Talk to the man to get a potion.<text:line-break/>Beat the gym leader."]))
    parsed = parse_walkthrough_odt(f, "kanto")
    assert [s["chapter"] for s in parsed["steps"]] == ["Pallet Town", "Route 1", "Route 1"]
    assert parsed["steps"][0]["lines"] == ["Go north.", "Pick your starter."]
    assert parsed["steps"][2]["kind"] == "battle" or "gym" in parsed["steps"][2]["tags"]
    # re-import with changed wording keeps the checkmark but flags it
    (ctx.paths.guides_dir / "kanto.json").write_text(json.dumps(parsed))
    r = ctx.guides.create_run("Odt")
    ctx.guides.set_region_prefs(r["id"], "kanto", source="imported")
    sid = parsed["steps"][1]["id"]
    ctx.guides.set_steps(r["id"], [sid], True)
    f.write_bytes(_odt(["KANTO COMPLETE WALKTHROUGH", "PALLET TOWN<text:line-break/>Go north.Pick your starter.",
                        "ROUTE 1", "Talk to the OLD man to get a potion.<text:line-break/>Beat the gym leader."]))
    import os
    import time
    p2 = parse_walkthrough_odt(f, "kanto")
    target = ctx.paths.guides_dir / "kanto.json"
    target.write_text(json.dumps(p2))
    os.utime(target, (time.time() + 5, time.time() + 5))
    st = ctx.guides.state(r["id"], "kanto")
    assert sid in st["done"] and st["changed"] == [sid]
    ctx.guides.acknowledge_changes(r["id"], [sid])
    assert ctx.guides.state(r["id"], "kanto")["changed"] == []


@pytest.mark.parametrize("raw,kind", [("20%", "percent"), ("Lure", "lure"), ("???", "unknown"), ("--", "none"),
                                      ("Special", "special"), (None, "missing"), ("0.5%", "percent")])
def test_rate_strings_are_never_coerced(raw, kind):
    r = classify_rate(raw)
    assert r["kind"] == kind
    if kind != "percent":
        assert "value" not in r


# --------------------------------------------------------------- breeding
class FakeDex:
    imported = True

    def __init__(self):
        def sp(i, name, groups, gender=127, base=None, evo=None):
            return {"id": i, "name": name, "types": ["normal"], "egg_groups": groups, "gender_code": gender,
                    "base_species": base or i, "evolutions": evo or [], "moves": []}
        self.species = {1: sp(1, "Alpha", ["field"]), 2: sp(2, "Beta", ["field", "fairy"]),
                        3: sp(3, "Gamma", ["water a"]), 132: sp(132, "Ditto", ["ditto"], 255),
                        81: sp(81, "Magnemite", ["mineral"], 255), 150: sp(150, "Legend", ["cannot breed"], 255),
                        172: sp(172, "Pichu", ["cannot breed"], evo=[{"to": 25}]), 25: sp(25, "Pika", ["field"], base=172)}

    def name(self, i):
        return self.species.get(i, {}).get("name", "?")

    def sprite_url(self, i):
        return None


def P(species, gender=None, item="none", ivs=None, nature=None):
    return {"species": species, "gender": gender, "item": item, "ivs": ivs or {}, "nature": nature}


@pytest.mark.parametrize("a,b,status,frag", [
    (P(132), P(132), "incompatible", "Two Ditto"),
    (P(150), P(132), "incompatible", "cannot breed"),
    (P(81), P(1, "male"), "incompatible", "genderless"),
    (P(1, "male"), P(2, "male"), "incompatible", "one male and one female"),
    (P(1, "male"), P(3, "female"), "incompatible", "No shared egg group"),
    (P(81), P(132), "compatible", "Compatible"),
    (P(1, "male"), P(2, "female"), "compatible", "Compatible"),
])
def test_breeding_compatibility(a, b, status, frag):
    r = breeding.check_pair(FakeDex(), a, b)
    assert r["status"] == status and frag in r["reason"]


def test_offspring_is_mothers_base_species_and_baby_flagged():
    r = breeding.check_pair(FakeDex(), P(1, "male"), P(25, "female"))
    assert r["offspring"]["id"] == 172 and r["status"] == "needs_verification" and "incense" in r["flags"][0]


def test_braces_and_everstone_follow_official_rules_and_nothing_else_is_guaranteed():
    a = P(1, "male", "Everstone", {"hp": 31, "speed": 20}, "Jolly")
    b = P(2, "female", "Power Anklet", {"speed": 31, "hp": 10}, "Adamant")
    p = breeding.preview(FakeDex(), a, b)
    rows = {r["stat"]: r for r in p["ivs"]}
    assert rows["speed"]["state"] == "guaranteed" and rows["speed"]["value"] == 31
    assert rows["hp"]["state"] == "possible" and rows["hp"]["values"] == [10, 31]
    assert p["nature"] == {"state": "guaranteed", "value": "Jolly", "text": "Parent A's nature (Everstone — official rule)"}
    assert all("probab" not in r["text"].lower() or "not" in r["text"].lower() for r in p["ivs"])


def test_same_stat_braced_by_both_is_a_range_not_a_guarantee():
    p = breeding.preview(FakeDex(), P(1, "male", "Power Weight", {"hp": 31}), P(2, "female", "Power Weight", {"hp": 5}))
    assert p["ivs"][0]["state"] == "range"


@pytest.mark.parametrize("ivs,nature,leaves,breeds", [(["hp", "attack"], None, 2, 1), (["hp", "attack", "defense", "sp_defense", "speed"], None, 16, 15),
                                                       (["hp", "attack", "defense", "sp_defense", "speed"], "Adamant", 32, 31)])
def test_plan_tree_shape(ivs, nature, leaves, breeds):
    s = breeding.plan_summary({"ivs": ivs, "nature": nature})
    assert s["leaves"] == leaves and s["breeds"] == breeds
    assert sum(s["items"].values()) == 2 * breeds  # one item per parent per breed
    if nature:
        assert s["items"]["Everstone"] >= 1


def test_plan_cost_requires_all_prices():
    s = breeding.plan_summary({"ivs": ["hp", "attack", "speed"], "prices": {"Power Weight": 10000}})
    assert s["cost"]["total"] is None and "Power Bracer" in s["cost"]["missing_prices"]
    s2 = breeding.plan_summary({"ivs": ["hp", "attack"], "prices": {"Power Weight": 10000, "Power Bracer": 9000}})
    assert s2["cost"]["total"] == 19000


# ------------------------------------------------------------------- live
class FakeNotifier:
    def __init__(self):
        self.sent = []

    def notify(self, t, b):
        self.sent.append((t, b))
        return {"delivered": True, "backend": "fake"}

    def describe(self):
        return {"backend": "fake", "available": True}


def test_ingest_dedupes_and_replay_never_alerts(ctx):
    fake = FakeNotifier()
    ctx.live.notifier = fake
    msg = {"id": "abc123", "time": 1763800000, "event": "message", "topic": "alphapings",
           "title": "Alpha Pikachu spotted", "message": "Route 1 \x07 Kanto", "tags": ["alpha"], "expires": 1763900000}
    first = ctx.live.ingest(msg, replay=False)
    assert first and first["kind"] == "alpha" and first["kind_basis"] == "text-keyword" and first["species_id"] == 25
    assert "\x07" not in first["body"]
    assert ctx.live.ingest(msg) is None  # duplicate
    ctx.live.ingest({**msg, "id": "old1"}, replay=True)
    assert len(fake.sent) == 1  # only the live one notified
    assert "expires" not in json.dumps(ctx.live.get(first["id"]))  # cache expiry never surfaced


def test_messages_without_content_or_non_message_events_are_ignored(ctx):
    assert ctx.live.ingest({"id": "k1", "event": "keepalive"}) is None
    assert ctx.live.ingest({"id": "e1", "event": "message", "title": "", "message": ""}) is None


def test_test_notification_is_labelled_and_routed(ctx):
    fake = FakeNotifier()
    ctx.live.notifier = fake
    ctx.settings.update({"notify.test": "os"})
    r = ctx.live.create_test("swarm")
    assert r["is_test"] == 1 and r["title"].startswith("TEST") and "NOT a real" in r["body"]
    assert r["delivery"]["os"]["delivered"] and fake.sent[0][0].startswith("TEST notification")


def test_quiet_mode_saves_without_alerting(ctx):
    fake = FakeNotifier()
    ctx.live.notifier = fake
    ctx.settings.update({"notify.quiet": True, "notify.alpha": "both"})
    r = ctx.live.ingest({"id": "q1", "event": "message", "title": "alpha", "message": "x", "time": 1})
    assert not fake.sent and "suppressed" in ctx.live.get(r["id"])["delivery"]


@pytest.mark.parametrize("month,kanto,johto", [(11, 146, 245), (1, 145, 244), (3, 144, 243), (12, 144, 243)])
def test_legendary_cycle(ctx, month, kanto, johto):
    L = ctx.live.legendaries(None, today=datetime(2026, month, 15))
    assert L["current"]["kanto"]["id"] == kanto and L["current"]["johto"]["id"] == johto
    assert L["status"] == "COMMUNITY-CYCLE"


def test_altering_cave_is_never_claimed_current(ctx):
    ctx.live.add_observation({"observed_at": "2020-01-01T00:00:00Z", "crystal": "Blue", "species": "Something"})
    c = ctx.live.cave()
    assert c["current"]["status"] == "unknown" and c["observations"][0]["freshness"] == "historical"


def test_ntfy_feed_off_by_default(ctx):
    assert ctx.live.source_status()["enabled"] is False and ctx.live.source_status()["payload_validated"] is False


# ------------------------------------------------------------------- news
def test_event_status_never_claims_live_from_dates_alone(ctx):
    ns = ctx.news
    now = datetime(2026, 11, 22, tzinfo=timezone.utc)
    assert ns.event_status({"starts": "2026-12-01", "ends": "2026-12-05"}, now)["code"] == "upcoming"
    assert ns.event_status({"starts": "2026-11-20", "ends": "2026-11-30"}, now)["code"] == "window_open"
    assert ns.event_status({"starts": "2026-11-01", "ends": "2026-11-10"}, now)["code"] == "window_passed"
    assert ns.event_status({"starts": "2026-11-01", "ends": "2026-11-13T23:59:00Z", "confirmed_status": "concluded"}, now)["code"] == "concluded"


def test_snapshot_keeps_pts_out_of_latest_and_halloween_concluded(ctx):
    L = ctx.news.listing()
    assert L["latest"]["channel"] == "live"
    assert any(a["channel"] == "pts" for a in L["articles"])
    hw = ctx.news.event("event-halloween-2026")
    assert hw["status"]["code"] == "concluded"
    for a in ctx.news.snapshot["articles"]:
        assert a["source_url"].startswith("https://forums.pokemmo.com/") and a["provenance"]


def test_feed_parser_only_accepts_official_links():
    rss = b"""<rss><channel>
      <item><title>Changelog 01/12/2026</title><link>https://forums.pokemmo.com/index.php?/topic/209999-x/</link><pubDate>Tue, 01 Dec 2026 10:00:00 +0000</pubDate></item>
      <item><title>phish</title><link>https://evil.example/x</link></item></channel></rss>"""
    from companion.services.news import NewsService
    items = NewsService.parse_feed(rss)
    assert [i["title"] for i in items] == ["Changelog 01/12/2026"]


# ----------------------------------------------------------------- backup
def test_backup_roundtrip_merge_never_overwrites(ctx, tmp_path):
    g = ctx.guides
    r = g.create_run("Red", "Main")
    g.set_steps(r["id"], ["kanto:m:starter"], True)
    ctx.storage.execute("INSERT INTO favourites(species_id, added_at) VALUES(25, 'x')")
    data = backup.export_all(ctx.storage)
    assert data["format"] == "pokemmo-companion-backup" and "private" not in json.dumps(data)
    res = backup.import_all(ctx.storage, json.loads(json.dumps(data)), "merge")
    assert res["runs_renamed"] == 1
    labels = sorted(x["run_label"] for x in g.list_runs())
    assert labels == ["Main", "Main (imported)"]
    res2 = backup.import_all(ctx.storage, data, "replace")
    assert len(g.list_runs()) == 1 and res2["safety_backup"]
    assert g.state(g.list_runs()[0]["id"], "kanto")["done"] == ["kanto:m:starter"]


def test_backup_rejects_foreign_files(ctx):
    with pytest.raises(ValueError):
        backup.import_all(ctx.storage, {"hello": 1})

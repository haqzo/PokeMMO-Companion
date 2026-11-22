"""Golden cases from docs/research/phase-3/03-DUMP-GOLDEN-TESTS.csv and docs/design/06.

Run with your own dump:  POKEMMO_DUMPS_DIR=~/Documents/PokeMMO-Companion/Pokemmo-Dumps ./scripts/test.sh
"""
import json

import pytest

from companion.services import breeding

pytestmark = pytest.mark.dump


def test_import_counts(dump_paths):
    m = json.loads((dump_paths.dex_dir / "manifest.json").read_text())
    assert m["counts"]["species"] == 649 and m["counts"]["monster_records"] == 720
    assert m["counts"]["location_rows"] > 30000
    assert m["counts"]["species_with_icon"] == 649 and m["counts"]["species_with_front"] == 649  # DUMP-007


def test_dump_001_lickitung_catch_rate_matches_oct30(dex):
    assert dex.species[108]["catch_rate"] == 75


def test_dump_002_snowscape_kept_but_flagged(dex):
    refs = [m for sp in dex.species.values() for m in sp["moves"] if m["name"] == "Snowscape"]
    assert refs and all(not m["verified_meta"] for m in refs)
    assert any(s["name"] == "Hail" for s in dex.skills())


def test_dump_003_zorua_unknown_rate(dex):
    rows = [l for l in dex.species[570]["locations"] if "Lostlorn" in (l["area"] or "")]
    assert rows and all(l["day"]["kind"] == "unknown" and l["day"]["label"] == "Unknown rate" for l in rows)
    assert any(l["horde3"] for l in rows)


def test_dump_004_altering_cave_not_a_rotation(dex):
    cave = [(sid, l) for sid, sp in dex.species.items() for l in sp["locations"] if "Altering Cave" in (l["area"] or "")]
    assert {sid for sid, _ in cave} == {201}


def test_dump_005_obtainable_flag_is_not_wild(dex):
    for sid, cls in ((644, "story_temporary"), (146, "roaming")):
        sp = dex.species[sid]
        assert sp["obtainable_flag"] is True and sp["locations"] == []
        assert dex.detail(sid, set(), None)["availability"]["classes"] == [cls]
    # Virizion/Keldeo: dump says obtainable=true, but they are reported absent from PokeMMO's Pokédex
    for sid in (640, 647):
        assert dex.species[sid]["obtainable_flag"] is True and dex.availability(sid)["in_game_dex"] == "no"


def test_dump_derived_families_are_labelled(dex):
    assert dex.availability(1)["basis"] == "dump-wild"
    fam = [sid for sid in range(1, 650) if dex.availability(sid)["basis"] == "dump-family"]
    assert fam and all(dex.species[s]["locations"] == [] for s in fam)
    assert dex.availability(138)["classes"][0] == "fossil"  # registry wins over dump


def test_dump_006_mono_type_shown_once(dex):
    d = dex.detail(25, set(), None)
    assert d["types"] == ["electric"] and d["types_raw_duplicated"] is True


def test_dump_008_gendered_sprites_resolved(dex):
    for sid in (521, 592, 593):
        s = dex.sprites[sid]
        assert s["icon"] == f"{sid}-0-m.png" and s["icon_f"] == f"{sid}-0-f.png"
    assert dex.sprites[25]["front"] in ("25-front-n-m.png", "25-front-n.png")


def test_bulbasaur_viridian_forest_is_lure_only(dex):
    rows = [l for l in dex.species[1]["locations"] if "Viridian Forest" in l["area"]]
    assert rows and {l["morning"]["kind"] for l in rows} == {"lure"}


def test_pikachu_power_plant_rates_are_source_values(dex):
    rows = [l for l in dex.species[25]["locations"] if l["area"] == "Power Plant" and l["season"] == "Spring"]
    assert rows[0]["morning"] == {"kind": "percent", "value": 20.0, "label": "20%"}


def test_abilities_slots(dex):
    pika = {a["slot"]: a["name"] for a in dex.species[25]["abilities"]}
    assert pika == {"slot1": "Static", "hidden": "Lightningrod"}
    zorua = dex.species[570]["abilities"]
    assert [a["name"] for a in zorua] == ["Illusion"]


def test_real_breeding_pairs(dex):
    ok = breeding.check_pair(dex, {"species": 26, "gender": "male"}, {"species": 25, "gender": "female"})
    assert ok["status"] == "needs_verification" and ok["offspring"]["id"] == 172  # Pichu baby flagged
    ditto = breeding.check_pair(dex, {"species": 132}, {"species": 81})
    assert ditto["status"] == "compatible" and ditto["offspring"]["id"] == 81
    nope = breeding.check_pair(dex, {"species": 144}, {"species": 132})
    assert nope["status"] == "incompatible"


def test_egg_move_candidates_flag_unconfirmed_tm(dex):
    r = breeding.egg_move_candidates(dex, 1)
    assert r["moves"] and all("fathers" in m for m in r["moves"])

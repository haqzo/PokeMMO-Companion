"""Golden tests for the calculators (owner will not hand-check every number)."""
import math

import pytest

from companion.data import reference as ref
from companion.services import calcs
from companion.services.breeding import plan_summary


# ------------------------------------------------------------------- capture
def test_capture_formula_known_values():
    r = calcs.capture_chance(45, 100, 100, 2.0)  # Ultra Ball, full HP, catch rate 45
    assert r["a"] == 30 and r["shake"] == 38835 and math.isclose(r["p"], (38835 / 65536) ** 4)
    assert round(r["p"] * 100, 1) == 12.3
    low = calcs.capture_chance(45, 100, 1, 2.0, 2.0)  # 1 HP + sleep
    assert low["p"] > r["p"] and not low["guaranteed"]
    assert calcs.capture_chance(255, 100, 1, 1.5, 2.0)["guaranteed"]  # a ≥ 255 → certain
    assert calcs.capture_chance(3, 100, 100, 255)["p"] == 1.0  # Master Ball


def test_capture_never_rounds_to_guaranteed_without_a_255():
    r = calcs.capture_chance(255, 100, 100, 1.0)  # a = 85
    assert r["p"] < 1 and not r["guaranteed"]


@pytest.mark.parametrize("bad", [(0, 100, 100, 1), (45, 100, 101, 1), (45, 0, 0, 1)])
def test_capture_rejects_invalid(bad):
    with pytest.raises(ValueError):
        calcs.capture_chance(*bad)


def test_ball_conditions_are_evaluated_not_assumed():
    rows = lambda c: {r["ball"]: r for r in calcs.catch_table(45, {"max_hp": 100, "hp_percent": 100, **c})["rows"]}
    day = rows({"time": "day", "turn": 3, "level": 50, "types": ["normal"]})
    night = rows({"time": "night", "turn": 1, "level": 10, "types": ["water"]})
    assert day["dusk"]["multiplier"] == 1 and night["dusk"]["multiplier"] == 3.5
    assert day["quick"]["multiplier"] == 1 and night["quick"]["multiplier"] == 5
    assert day["nest"]["multiplier"] == 1 and night["nest"]["multiplier"] == 3.1
    assert day["net"]["multiplier"] == 1 and night["net"]["multiplier"] == 3
    assert rows({"turn": 11})["timer"]["multiplier"] == 4.0 and rows({"turn": 1})["timer"]["multiplier"] == 1.0
    assert rows({"caught_before": True})["repeat"]["multiplier"] == 3
    assert not day["dusk"]["confirmed"] and day["ultra"]["confirmed"]


def test_lickitung_catch_rate_patch_regression(client, ctx):
    assert calcs.CATCH_RATE_OVERRIDES[108]["rate"] == 75
    ctx.dex.species[108] = {"catch_rate": 45, "stats": {}}  # an old dump still says 45
    code, r = client.call("POST", "/api/tools/catch", {"species": 108, "hp_percent": 100})
    assert code == 200 and r["catch_rate"] == 75 and "30 Oct 2026" in r["rate_source"]


def test_balls_needed():
    assert calcs.balls_needed(1.0) == 1 and calcs.balls_needed(0.5, 0.9) == 4 and calcs.balls_needed(0) is None


# --------------------------------------------------------------------- stats
def test_stat_formula_golden_cases():
    # Garchomp base 108/130/95/80/85/102, Jolly, 31 IVs, 252 Atk / 4 HP / 252 Spe, level 100 (well-known spread)
    base = {"hp": 108, "attack": 130, "defense": 95, "sp_attack": 80, "sp_defense": 85, "speed": 102}
    s = calcs.stat_block(base, {}, {"hp": 4, "attack": 252, "speed": 252}, 100, "Jolly")
    assert s == {"hp": 358, "attack": 359, "defense": 226, "sp_attack": 176, "sp_defense": 206, "speed": 333}
    s50 = calcs.stat_block(base, {}, {"hp": 4, "attack": 252, "speed": 252}, 50, "Jolly")
    assert s50 == {"hp": 184, "attack": 182, "defense": 115, "sp_attack": 90, "sp_defense": 105, "speed": 169}
    neutral = calcs.stat_value("attack", 130, 31, 252, 100, "Hardy")
    boosted = calcs.stat_value("attack", 130, 31, 252, 100, "Adamant")
    reduced = calcs.stat_value("attack", 130, 31, 252, 100, "Modest")
    assert (neutral, boosted, reduced) == (359, 394, 323)


def test_stat_extremes_and_shedinja():
    assert calcs.stat_value("hp", 1, 31, 252, 100, None) == 1
    assert calcs.stat_value("speed", 5, 0, 0, 1, None) == 5
    assert calcs.stat_value("hp", 255, 31, 252, 100, None) == 714
    for bad in ((31, 253, 50), (32, 0, 50), (31, 0, 0)):
        with pytest.raises(ValueError):
            calcs.stat_value("attack", 100, bad[0], bad[1], bad[2], None)
    with pytest.raises(ValueError):
        calcs.stat_block({k: 50 for k in ref.STATS}, {}, {"hp": 252, "attack": 252, "speed": 8}, 50, None)


def test_stats_api_forms_and_levels(client):
    code, r = client.call("POST", "/api/tools/stats", {"species": 386, "level": 50, "evs": {"hp": 300}})
    assert code == 400  # EV > 252 is refused
    # the built-in PokeMMO data provides base stats on a clean install (no import)
    code, r = client.call("POST", "/api/tools/stats", {"species": 25})
    assert code == 200


# ------------------------------------------------------------------ EV / horde
def test_ev_horde_arithmetic():
    p = calcs.ev_plan(1, 0, 252, 5)
    assert (p["per_battle"], p["battles"], p["overshoot"]) == (5, 51, 3) and p["final"] == 252
    p = calcs.ev_plan(2, 100, 252, 5, macho_brace=True)
    assert (p["per_mon"], p["per_battle"], p["battles"]) == (4, 20, 8)
    assert calcs.ev_plan(1, 252, 252, 3)["battles"] == 0
    with pytest.raises(ValueError):
        calcs.ev_plan(1, 0, 255, 5)
    with pytest.raises(ValueError):
        calcs.ev_plan(1, 0, 252, 4)


# ------------------------------------------------------------------ breeding
@pytest.mark.parametrize("n,starters,yen", [(2, 2, 20_000), (3, 4, 65_000), (4, 8, 155_000), (5, 16, 340_000)])
def test_breeding_tree_matches_reference(n, starters, yen):
    ivs = ["hp", "attack", "defense", "speed", "sp_defense"][:n]
    r = plan_summary({"ivs": ivs})
    assert r["starting_parents"] == starters and r["breeds"] == starters - 1
    assert r["reference"]["reference_yen"] == yen and r["reference"]["starting_parents"] == starters


def test_five_iv_nature_is_32_parents_31_breeds_with_fixed_prices():
    r = plan_summary({"ivs": ["hp", "attack", "defense", "speed", "sp_defense"], "nature": "Adamant"})
    assert r["starting_parents"] == 32 and r["breeds"] == 31 and r["reference"]["breeds"] == 31
    assert r["items"]["Everstone"] == 16 and sum(v for k, v in r["items"].items() if k.startswith("Power")) == 46
    assert r["cost"]["total"] == 62 * 10_000 and r["cost"]["missing_prices"] == []
    over = plan_summary({"ivs": ["hp", "attack"], "prices": {"Power Weight": 12_000}})
    assert over["cost"]["total"] == 22_000 and over["cost"]["overrides"] == ["Power Weight"]

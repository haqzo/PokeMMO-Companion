"""Calculators shared by the Tools pages (formulas only; species data comes from DexService).

* Capture: Gen III/IV capture formula with four shake checks — the model used by public PokeMMO
  catch calculators. Ball conditions are evaluated from the inputs you give (turn, time, location
  type, level…) instead of always assuming the best case. Ball values that are not confirmed for
  PokeMMO are flagged per ball, not tool-wide.
* Stats: Gen III+ formula with integer floors, nature ×1.1/×0.9, IV 0–31, EV 0–252 (510 total),
  Shedinja HP 1.
* EV / horde: yield × encounter size (× 2 with Macho Brace), remaining battles to target.
* Breeding: fixed baseline price estimates (no live GTL prices).
No formula is read from external data and nothing is evaluated from strings.
"""
from __future__ import annotations

import math

from ..data import reference as ref

# ------------------------------------------------------------------ capture
# Patch overrides applied on top of any installed dump (newer official changes win).
CATCH_RATE_OVERRIDES = {
    108: {"rate": 75, "source": "Official changelog 30 Oct 2026: Lickitung base catch rate 45 → 75", "date": "2026-10-30"},
}
STATUS = {"none": 1.0, "sleep": 2.0, "freeze": 2.0, "paralysis": 1.5, "poison": 1.5, "burn": 1.5}

# ball id -> (label, function(ctx) -> (multiplier, explanation), confirmed_for_pokemmo)
def _net(c):
    hit = bool({"water", "bug"} & set(c.get("types") or []))
    return (3.0 if hit else 1.0), ("Water/Bug target ×3" if hit else "Not Water/Bug ×1")
def _nest(c):
    lv = c.get("level") or 1
    m = max(1.0, (41 - lv) / 10)
    return m, f"(41 − level {lv}) ÷ 10, minimum ×1"
def _dusk(c):
    ok = c.get("time") == "night" or c.get("cave")
    return (3.5 if ok else 1.0), ("Night or cave ×3.5" if ok else "Daytime outside caves ×1")
def _quick(c):
    t = c.get("turn") or 1
    return (5.0 if t == 1 else 1.0), ("First turn ×5" if t == 1 else "After turn 1 ×1")
def _timer(c):
    t = max(1, c.get("turn") or 1)
    m = min(4.0, 1 + (t - 1) * 1229 / 4096)
    return m, f"1 + turns passed × 0.3, max ×4 (turn {t})"
def _repeat(c):
    return (3.0 if c.get("caught_before") else 1.0), ("Already registered as caught ×3" if c.get("caught_before") else "Not caught before ×1")
def _dive(c):
    return (3.5 if c.get("water") else 1.0), ("Surfing/fishing ×3.5" if c.get("water") else "On land ×1")
def _dream(c):
    return (4.0 if c.get("status") == "sleep" else 1.0), ("Sleeping target ×4" if c.get("status") == "sleep" else "Target awake ×1")
def _flat(m, text):
    return lambda c: (m, text)

BALLS = {
    "poke": ("Poké Ball", _flat(1.0, "×1"), True),
    "great": ("Great Ball", _flat(1.5, "×1.5"), True),
    "ultra": ("Ultra Ball", _flat(2.0, "×2"), True),
    "master": ("Master Ball", _flat(255.0, "Always catches"), True),
    "net": ("Net Ball", _net, True),
    "nest": ("Nest Ball", _nest, False),
    "dusk": ("Dusk Ball", _dusk, False),
    "quick": ("Quick Ball", _quick, False),
    "timer": ("Timer Ball", _timer, False),
    "repeat": ("Repeat Ball", _repeat, True),
    "dive": ("Dive Ball", _dive, False),
    "dream": ("Dream Ball", _dream, False),
    "premier": ("Premier Ball", _flat(1.0, "×1"), True),
    "luxury": ("Luxury Ball", _flat(1.0, "×1 (raises friendship only)"), True),
    "heal": ("Heal Ball", _flat(1.0, "×1"), True),
}


def capture_chance(catch_rate: int, max_hp: int, cur_hp: int, ball_mult: float, status_mult: float = 1.0) -> dict:
    """Gen III/IV capture with integer floors and 4 shake checks. Returns probability 0..1."""
    if not (1 <= catch_rate <= 255):
        raise ValueError("catch rate must be 1–255")
    if not (1 <= max_hp <= 999) or not (1 <= cur_hp <= max_hp):
        raise ValueError("HP must be 1 ≤ current ≤ max")
    if ball_mult >= 255:
        return {"p": 1.0, "a": 255, "shake": 65535, "guaranteed": True}
    a = math.floor(math.floor((3 * max_hp - 2 * cur_hp) * catch_rate * ball_mult) / (3 * max_hp) * status_mult)
    a = max(1, a)
    if a >= 255:
        return {"p": 1.0, "a": a, "shake": 65535, "guaranteed": True}
    b = math.floor(1048560 / math.floor(math.sqrt(math.floor(math.sqrt(math.floor(16711680 / a))))))
    p = (b / 65536) ** 4
    return {"p": min(1.0, p), "a": a, "shake": b, "guaranteed": False}


def balls_needed(p: float, confidence: float = 0.9) -> int | None:
    if p >= 1:
        return 1
    if p <= 0:
        return None
    return math.ceil(math.log(1 - confidence) / math.log(1 - p))


def catch_table(catch_rate: int, ctx: dict) -> dict:
    """All balls for one situation. ctx: max_hp, cur_hp or hp_percent, status, turn, time, cave, water, level, types, caught_before."""
    max_hp = int(ctx.get("max_hp") or 100)
    cur = ctx.get("cur_hp")
    if cur is None:
        pct = max(1, min(100, int(ctx.get("hp_percent", 100))))
        cur = max(1, round(max_hp * pct / 100))
    status = ctx.get("status") or "none"
    if status not in STATUS:
        raise ValueError("Unknown status")
    rows = []
    for bid, (label, fn, confirmed) in BALLS.items():
        mult, why = fn({**ctx, "status": status})
        r = capture_chance(catch_rate, max_hp, int(cur), mult, STATUS[status])
        rows.append({"ball": bid, "label": label, "multiplier": mult, "condition": why, "confirmed": confirmed,
                     "percent": round(r["p"] * 100, 2), "guaranteed": r["guaranteed"],
                     "balls_for_90": balls_needed(r["p"], 0.9), "balls_for_99": balls_needed(r["p"], 0.99)})
    rows.sort(key=lambda x: (-x["percent"], x["label"]))
    return {"catch_rate": catch_rate, "max_hp": max_hp, "cur_hp": int(cur), "status": status, "rows": rows}


# -------------------------------------------------------------------- stats
def stat_value(stat: str, base: int, iv: int, ev: int, level: int, nature: str | None) -> int:
    if not (0 <= iv <= 31):
        raise ValueError("IV must be 0–31")
    if not (0 <= ev <= 252):
        raise ValueError("EV must be 0–252")
    if not (1 <= level <= 100):
        raise ValueError("Level must be 1–100")
    return ref.calc_stat(stat, base, iv, ev, level, nature)


def stat_block(base: dict, ivs: dict, evs: dict, level: int, nature: str | None) -> dict:
    total = sum(int(evs.get(s, 0) or 0) for s in ref.STATS)
    if total > 510:
        raise ValueError(f"EV total {total} is over 510")
    return {s: stat_value(s, int(base[s]), int(ivs.get(s, 31) if ivs.get(s) is not None else 31), int(evs.get(s, 0) or 0), level, nature)
            for s in ref.STATS}


# ---------------------------------------------------------------- EV / horde
def ev_plan(yield_per_mon: int, current: int, target: int, horde: int = 5, macho_brace: bool = False) -> dict:
    if horde not in (1, 3, 5):
        raise ValueError("Encounter size must be 1, 3 or 5")
    if not (0 <= current <= 252 and 0 <= target <= 252):
        raise ValueError("EVs must be 0–252")
    per_mon = yield_per_mon * (2 if macho_brace else 1)
    per_battle = per_mon * horde
    remaining = max(0, target - current)
    battles = math.ceil(remaining / per_battle) if per_battle and remaining else 0
    overshoot = current + battles * per_battle - target if battles else 0
    return {"per_mon": per_mon, "per_battle": per_battle, "remaining": remaining, "battles": battles,
            "overshoot": max(0, overshoot), "final": min(252, current + battles * per_battle)}


# ------------------------------------------------------------------ breeding
# Owner-approved fixed baseline (docs/build/08 §9): reference estimates for standard from-scratch trees.
BREEDING_REFERENCE = {2: {"starters": 2, "yen": 20_000}, 3: {"starters": 4, "yen": 65_000},
                      4: {"starters": 8, "yen": 155_000}, 5: {"starters": 16, "yen": 340_000}}
BASELINE_PRICES = {"Power Weight": 10_000, "Power Bracer": 10_000, "Power Belt": 10_000, "Power Lens": 10_000,
                   "Power Band": 10_000, "Power Anklet": 10_000, "Everstone": 10_000}


def breeding_reference(n_ivs: int, nature: bool) -> dict | None:
    ref_ = BREEDING_REFERENCE.get(n_ivs)
    if not ref_:
        return None
    starters = ref_["starters"] * (2 if nature else 1)
    return {"ivs": n_ivs, "nature": nature, "starting_parents": starters, "breeds": starters - 1,
            "reference_yen": ref_["yen"] if not nature else None,
            "note": "Community reference estimate for a from-scratch tree; both parents are consumed in every breed."}

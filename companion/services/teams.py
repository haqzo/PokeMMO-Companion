"""Saved teams (documents kind "team"). Version 2 adds optional per-slot details and team purpose/notes.

Version 1 (until 2026-11-23): {"slots": [species id | null] * 6}
Version 2: {"version": 2, "purpose": "gym_rerun" | "pvp" | "storyline" | "elite_four" | "custom" | "",
            "notes": str, "slots": [slot | null] * 6}
  slot = {"species": int, "form": str?, "level": int?, "nature": str?, "ability": str?, "item": str?,
          "moves": [str] * ≤4, "ivs": {stat: 0..31}?, "evs": {stat: 0..252}?, "notes": str?}
Everything except the species is optional. Old documents are read as-is (the UI and this function understand both);
they are rewritten as version 2 only when the player saves the team again. Guides link teams by id, never copy them.
"""
from __future__ import annotations

PURPOSES = {"": "—", "gym_rerun": "Gym reruns", "elite_four": "Elite Four", "pvp": "PvP", "storyline": "Storyline", "custom": "Custom"}
STATS = ("hp", "atk", "def", "spa", "spd", "spe")


class TeamError(Exception):
    pass


def _s(v, n) -> str:
    return str(v or "").strip()[:n]


def normalize_slot(x) -> dict | None:
    if x is None or x == "":
        return None
    if isinstance(x, (int, float)) and not isinstance(x, bool):
        x = {"species": int(x)}
    if not isinstance(x, dict):
        raise TeamError("Invalid team slot")
    try:
        sid = int(x.get("species"))
    except (TypeError, ValueError):
        return None
    if not 1 <= sid <= 1025:
        raise TeamError("Invalid Pokémon")
    out: dict = {"species": sid}
    for k, n in (("form", 40), ("nature", 20), ("ability", 40), ("item", 60), ("notes", 1000)):
        v = _s(x.get(k), n)
        if v:
            out[k] = v
    if x.get("level") not in (None, ""):
        try:
            lv = int(x["level"])
        except (TypeError, ValueError):
            raise TeamError("Level must be a number")
        if not 1 <= lv <= 100:
            raise TeamError("Level must be 1–100")
        out["level"] = lv
    moves = [_s(m, 40) for m in (x.get("moves") or []) if _s(m, 40)][:4]
    if moves:
        out["moves"] = moves
    for key, hi, total in (("ivs", 31, None), ("evs", 252, 510)):
        src = x.get(key) or {}
        if not isinstance(src, dict):
            raise TeamError(f"Invalid {key.upper()}")
        vals = {}
        for st in STATS:
            if src.get(st) in (None, ""):
                continue
            try:
                v = int(src[st])
            except (TypeError, ValueError):
                raise TeamError(f"{key.upper()} must be numbers")
            if not 0 <= v <= hi:
                raise TeamError(f"{key.upper()} must be 0–{hi}")
            vals[st] = v
        if total and sum(vals.values()) > total:
            raise TeamError(f"EVs add up to more than {total}")
        if vals:
            out[key] = vals
    return out


def normalize_team(data) -> dict:
    if not isinstance(data, dict):
        raise TeamError("Invalid team")
    slots = list(data.get("slots") or [])[:6]
    slots += [None] * (6 - len(slots))
    purpose = data.get("purpose") or ""
    if purpose not in PURPOSES:
        raise TeamError("Unknown team purpose")
    return {"version": 2, "purpose": purpose, "notes": _s(data.get("notes"), 4000), "slots": [normalize_slot(s) for s in slots]}

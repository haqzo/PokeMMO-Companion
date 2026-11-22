"""Low-risk game reference data (docs/research/phase-3/05: P0 safe tools).

Type chart: 17 types, Generation II–V effectiveness rules (no Fairy type, Steel
resists Ghost and Dark). This matches PokeMMO's dump (17 types, no FAIRY) and
spot-checks against the in-game Better Default 1.8.0 type chart screenshot
(e.g. Ghost→Steel ½, Ghost→Normal 0, Steel row). Status: CORROBORATED.

Natures: the 25 standard natures (+10% / −10%). Status: CORROBORATED
(standard Gen III+ mechanic; PokeMMO uses the same 25 natures in-game).
"""
from __future__ import annotations

TYPES = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
         "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel"]

# attacker -> {defender: multiplier}; omitted pairs are 1×.
_CHART: dict[str, dict[str, float]] = {
    "normal": {"rock": .5, "ghost": 0, "steel": .5},
    "fire": {"fire": .5, "water": .5, "grass": 2, "ice": 2, "bug": 2, "rock": .5, "dragon": .5, "steel": 2},
    "water": {"fire": 2, "water": .5, "grass": .5, "ground": 2, "rock": 2, "dragon": .5},
    "electric": {"water": 2, "electric": .5, "grass": .5, "ground": 0, "flying": 2, "dragon": .5},
    "grass": {"fire": .5, "water": 2, "grass": .5, "poison": .5, "ground": 2, "flying": .5, "bug": .5,
              "rock": 2, "dragon": .5, "steel": .5},
    "ice": {"fire": .5, "water": .5, "grass": 2, "ice": .5, "ground": 2, "flying": 2, "dragon": 2, "steel": .5},
    "fighting": {"normal": 2, "ice": 2, "poison": .5, "flying": .5, "psychic": .5, "bug": .5, "rock": 2,
                 "ghost": 0, "dark": 2, "steel": 2},
    "poison": {"grass": 2, "poison": .5, "ground": .5, "rock": .5, "ghost": .5, "steel": 0},
    "ground": {"fire": 2, "electric": 2, "grass": .5, "poison": 2, "flying": 0, "bug": .5, "rock": 2, "steel": 2},
    "flying": {"electric": .5, "grass": 2, "fighting": 2, "bug": 2, "rock": .5, "steel": .5},
    "psychic": {"fighting": 2, "poison": 2, "psychic": .5, "dark": 0, "steel": .5},
    "bug": {"fire": .5, "grass": 2, "fighting": .5, "poison": .5, "flying": .5, "psychic": 2, "ghost": .5,
            "dark": 2, "steel": .5},
    "rock": {"fire": 2, "ice": 2, "fighting": .5, "ground": .5, "flying": 2, "bug": 2, "steel": .5},
    "ghost": {"normal": 0, "psychic": 2, "ghost": 2, "dark": .5, "steel": .5},
    "dragon": {"dragon": 2, "steel": .5},
    "dark": {"fighting": .5, "psychic": 2, "ghost": 2, "dark": .5, "steel": .5},
    "steel": {"fire": .5, "water": .5, "electric": .5, "ice": 2, "rock": 2, "steel": .5},
}


def effectiveness(attacker: str, defender: str) -> float:
    return _CHART[attacker].get(defender, 1.0)


def matchup(attacker: str, defenders: list[str]) -> float:
    m = 1.0
    for d in dict.fromkeys(defenders):  # de-duplicate repeated mono-types
        m *= effectiveness(attacker, d)
    return m


def chart_matrix() -> list[list[float]]:
    return [[effectiveness(a, d) for d in TYPES] for a in TYPES]


def defensive_profile(types: list[str]) -> dict[str, float]:
    return {a: matchup(a, types) for a in TYPES}


STATS = ["hp", "attack", "defense", "sp_attack", "sp_defense", "speed"]
STAT_LABELS = {"hp": "HP", "attack": "Attack", "defense": "Defense", "sp_attack": "Sp. Atk",
               "sp_defense": "Sp. Def", "speed": "Speed"}

# name: (raised, lowered); neutral natures raise and lower the same stat.
NATURES: dict[str, tuple[str, str]] = {
    "Hardy": ("attack", "attack"), "Lonely": ("attack", "defense"), "Brave": ("attack", "speed"),
    "Adamant": ("attack", "sp_attack"), "Naughty": ("attack", "sp_defense"),
    "Bold": ("defense", "attack"), "Docile": ("defense", "defense"), "Relaxed": ("defense", "speed"),
    "Impish": ("defense", "sp_attack"), "Lax": ("defense", "sp_defense"),
    "Timid": ("speed", "attack"), "Hasty": ("speed", "defense"), "Serious": ("speed", "speed"),
    "Jolly": ("speed", "sp_attack"), "Naive": ("speed", "sp_defense"),
    "Modest": ("sp_attack", "attack"), "Mild": ("sp_attack", "defense"), "Quiet": ("sp_attack", "speed"),
    "Bashful": ("sp_attack", "sp_attack"), "Rash": ("sp_attack", "sp_defense"),
    "Calm": ("sp_defense", "attack"), "Gentle": ("sp_defense", "defense"), "Sassy": ("sp_defense", "speed"),
    "Careful": ("sp_defense", "sp_attack"), "Quirky": ("sp_defense", "sp_defense"),
}


def nature_multiplier(nature: str | None, stat: str) -> float:
    if not nature or nature not in NATURES or stat == "hp":
        return 1.0
    up, down = NATURES[nature]
    if up == down:
        return 1.0
    return 1.1 if stat == up else 0.9 if stat == down else 1.0


def natures_table() -> list[dict]:
    return [{"name": n, "up": u if u != d else None, "down": d if u != d else None} for n, (u, d) in NATURES.items()]


def calc_stat(stat: str, base: int, iv: int, ev: int, level: int, nature: str | None) -> int:
    """Standard Gen III–V stat formula. PokeMMO match: CORROBORATED by community
    calculators, not yet checked against an in-game summary in this project."""
    core = (2 * base + iv + ev // 4) * level // 100
    if stat == "hp":
        return 1 if base == 1 else core + level + 10  # Shedinja special case
    return int((core + 5) * nature_multiplier(nature, stat))


REGIONS = ["kanto", "johto", "hoenn", "sinnoh", "unova"]
REGION_LABELS = {r: r.capitalize() for r in REGIONS}

# Gender-threshold codes as stored in the dump (standard Gen III–V encoding).
# Mapping to percentages is the standard one; PokeMMO usage is CORROBORATED, not verified.
GENDER_CODES = {0: "100% male", 31: "87.5% male · 12.5% female", 63: "75% male · 25% female",
                127: "50% male · 50% female", 191: "25% male · 75% female", 254: "100% female",
                255: "Genderless"}

EV_KEYS = {"ev_hp": "hp", "ev_attack": "attack", "ev_defense": "defense", "ev_sp_attack": "sp_attack",
           "ev_sp_defense": "sp_defense", "ev_speed": "speed"}

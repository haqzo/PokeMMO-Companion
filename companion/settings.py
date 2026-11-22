"""Settings schema: defaults + validation. Stored flat ("group.key") in SQLite.

Window/popout preferences live under ``window.<tool>.*`` so a reset of
appearance never touches character runs (docs/design/16).
"""
from __future__ import annotations

from typing import Any

from .storage import Storage

TOOLS = ("pokedex", "storyline", "reports", "typechart", "breeding", "legendaries", "cave", "natures")
MODES = ("compact", "standard", "expanded")
ROUTES = ("off", "toast", "os", "both")

DEFAULTS: dict[str, Any] = {
    # Appearance
    "appearance.nav": "vertical",            # vertical | horizontal
    "appearance.text_scale": 100,            # percent, 80..160
    "appearance.high_contrast": False,
    "appearance.reduced_motion": False,
    "appearance.stat_bars": "soft",          # soft | accent (Better Default "Stat bars" setting)
    "appearance.density": "comfortable",     # comfortable | compact
    # Behaviour
    "app.restore_last_page": True,
    "app.last_route": "#/home",
    "app.close_behavior": "quit",            # quit | tray  (tray must be explicitly chosen)
    "app.onboarded": False,
    "app.window_backend": "auto",            # auto | wayland | xwayland (applies at next launch)
    "home.sections": ["update", "events", "live", "shortcuts"],
    "home.shortcuts": ["guide", "pokedex_last", "breeding"],
    # Pokédex
    "pokedex.last_species": None,
    "pokedex.filters": {},
    # Guides
    "guides.active_run": None,
    # Live / notifications
    "live.ntfy.enabled": False,              # opt-in only
    "live.ntfy.consented": False,
    "live.ntfy.server": "https://ntfy.pokemmotools.org",
    "live.ntfy.topic": "alphapings",
    "notify.alpha": "both",
    "notify.swarm": "both",
    "notify.other": "toast",
    "notify.test": "both",
    "notify.toast_corner": "bottom-right",   # top-left | top-right | bottom-left | bottom-right
    "notify.toast_screen": "primary",        # primary | main-window | <index>
    "notify.toast_duration": 8,              # seconds
    "notify.toast_opacity": 94,              # percent
    "notify.quiet": False,                   # manual "do not disturb while playing"
    "notify.retention_days": 30,
    "window.main.geometry": None,
}

for _tool in TOOLS:
    DEFAULTS[f"window.{_tool}.mode"] = "standard"
    DEFAULTS[f"window.{_tool}.pinned"] = False
    DEFAULTS[f"window.{_tool}.bg_opacity"] = 92 if _tool != "storyline" else 78
    DEFAULTS[f"window.{_tool}.window_opacity"] = 100
    DEFAULTS[f"window.{_tool}.text_scale"] = 100
    DEFAULTS[f"window.{_tool}.locked"] = False
    DEFAULTS[f"window.{_tool}.geometry"] = None

_ENUMS = {
    "appearance.nav": ("vertical", "horizontal"),
    "appearance.stat_bars": ("soft", "accent"),
    "appearance.density": ("comfortable", "compact"),
    "app.close_behavior": ("quit", "tray"),
    "app.window_backend": ("auto", "wayland", "xwayland"),
    "notify.alpha": ROUTES, "notify.swarm": ROUTES, "notify.other": ROUTES, "notify.test": ROUTES,
    "notify.toast_corner": ("top-left", "top-right", "bottom-left", "bottom-right"),
}
_RANGES = {
    "appearance.text_scale": (80, 160),
    "notify.toast_duration": (3, 60),
    "notify.toast_opacity": (60, 100),
    "notify.retention_days": (1, 365),
}
for _tool in TOOLS:
    _ENUMS[f"window.{_tool}.mode"] = MODES
    _RANGES[f"window.{_tool}.bg_opacity"] = (35, 100)      # legibility floor
    _RANGES[f"window.{_tool}.window_opacity"] = (40, 100)
    _RANGES[f"window.{_tool}.text_scale"] = (70, 180)


class SettingsError(ValueError):
    pass


def validate(key: str, value: Any) -> Any:
    if key not in DEFAULTS:
        raise SettingsError(f"Unknown setting: {key}")
    default = DEFAULTS[key]
    if key in _ENUMS:
        if value not in _ENUMS[key]:
            raise SettingsError(f"{key} must be one of {_ENUMS[key]}")
        return value
    if key in _RANGES:
        lo, hi = _RANGES[key]
        try:
            v = int(value)
        except (TypeError, ValueError) as exc:
            raise SettingsError(f"{key} must be a number") from exc
        return max(lo, min(hi, v))
    if isinstance(default, bool):
        if not isinstance(value, bool):
            raise SettingsError(f"{key} must be true/false")
        return value
    if isinstance(default, list) and not isinstance(value, list):
        raise SettingsError(f"{key} must be a list")
    if key.endswith(".geometry") and value is not None:
        if not (isinstance(value, dict) and all(k in value for k in ("w", "h"))):
            raise SettingsError("geometry must be {x?, y?, w, h}")
    if key == "app.last_route" and not (isinstance(value, str) and value.startswith("#/") and len(value) < 300):
        raise SettingsError("invalid route")
    return value


class Settings:
    def __init__(self, storage: Storage):
        self.storage = storage

    def all(self) -> dict[str, Any]:
        merged = dict(DEFAULTS)
        stored = self.storage.all_settings()
        for k, v in stored.items():
            if k in DEFAULTS:
                merged[k] = v
        return merged

    def get(self, key: str) -> Any:
        return self.storage.get_setting(key, DEFAULTS.get(key))

    def update(self, patch: dict[str, Any]) -> dict[str, Any]:
        clean = {k: validate(k, v) for k, v in patch.items()}
        self.storage.set_settings(clean)
        return clean

    def reset(self, prefix: str) -> int:
        allowed = ("appearance.", "window.", "notify.", "home.")
        if not prefix.startswith(allowed):
            raise SettingsError("Only appearance, window, notify or home settings can be reset here")
        return self.storage.delete_settings(prefix)

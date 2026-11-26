"""Settings schema: defaults + validation. Stored flat ("group.key") in SQLite.

Window/popout preferences live under ``window.<tool>.*`` so a reset of
appearance never touches character runs (docs/design/16).
"""
from __future__ import annotations

import re

from typing import Any

from . import __version__
from .release import release_channel
from .storage import Storage

TOOLS = ("pokedex", "storyline", "reports", "phenomena", "typechart", "breeding", "legendaries", "cave", "natures",
         "notes", "items", "showcase", "customguide", "locations", "box", "calculator", "timers")
LANGUAGES = ("en", "es", "zh")
MODES = ("compact", "standard", "expanded")
ROUTES = ("off", "toast", "os", "both")

DEFAULTS: dict[str, Any] = {
    # Appearance
    "appearance.nav": "vertical",            # vertical | horizontal
    "appearance.sidebar": "auto",            # auto | icons | full — sidebar labels (auto: icons in narrow windows)
    "appearance.text_scale": 100,            # percent, 60..200 (text only)
    "appearance.ui_scale": 100,              # percent, 75..150 (whole interface: zoom; separate from text size and OS scaling)
    "home.community_link": True,             # show the optional community Discord link on Home
    "appearance.theme": None,                # active theme (validated, see services/themes.py); None = Companion Default
    "appearance.theme_id": "companion",      # preset id or personal theme id the active theme came from
    "appearance.high_contrast": False,
    "appearance.reduced_motion": False,
    "appearance.stat_bars": "soft",          # soft | accent (Better Default "Stat bars" setting)
    "appearance.density": "comfortable",     # comfortable | compact
    # Behaviour
    "app.restore_last_page": True,
    "app.last_route": "#/home",
    "app.close_behavior": "quit",            # quit | tray  (tray must be explicitly chosen)
    "app.onboarded": False,
    "app.start_minimized": False,            # start hidden in the tray (needs a tray)
    "app.restore_popouts": False,            # reopen the floating tools that were open when Companion quit
    "window.open_popouts": [],               # remembered for app.restore_popouts
    "game.launcher_path": "",                # a PokeMMO launcher you chose (empty = use the detected one)
    "game.on_exit": "keep",                  # keep | minimize | quit — what Companion does when PokeMMO closes
    "game.watch": False,                     # notice PokeMMO starting/closing while Companion runs
    "app.window_backend": "auto",            # auto | wayland | xwayland (applies at next launch)
    # Home (2026-11-23): storyline run and favourites are opt-in; lists saved by older builds are translated in the UI.
    "home.sections": ["roamers", "live", "update", "news", "events", "quick"],
    "home.shortcuts": ["guide", "pokedex_last", "breeding"],
    # Pokédex
    "pokedex.last_species": None,
    "pokedex.filters": {},
    # Guides
    "guides.active_run": None,
    "guides.extras_open": True,              # storyline: "Timers & team for this region" panel expanded
    # Live / notifications
    "live.community.enabled": False,         # local structured observations
    "live.community.receive": False,         # optional loopback test feed
    "live.community.share": False,           # permission to explicitly share to the test feed
    "live.phenomena.enabled": None,  # Legacy profiles used a non-empty override as opt-in.
    "live.phenomena.endpoint": "",
    "notify.phenomena": "off",
    "live.ntfy.enabled": False,              # opt-in only
    "live.swarm_estimate_minutes": 20,       # provisional swarm duration estimate (community reports disagree: ~15/20/30)
    "live.current_include_catchup": True,    # reports caught up after (re)connecting count in "Current" by their own time
    "live.ntfy.consented": False,
    "live.ntfy.server": "https://ntfy.pokemmotools.org",
    "live.ntfy.topic": "alphapings,swarmpings",   # Alphapedia publishes Alphas and Swarms on separate topics
    "notify.alpha": "toast",
    "notify.swarm": "toast",
    "notify.other": "toast",
    "notify.timer": "toast",                 # Tools › Timers completions
    "notify.test": "toast",
    "notify.toast_corner": "top-right",      # owner default (video review); all four corners remain selectable
    "notify.toast_screen": "primary",        # primary | main-window | <index>
    "notify.toast_duration": 8,              # seconds
    "notify.toast_opacity": 94,              # percent
    "notify.quiet": False,                   # manual "do not disturb while playing"
    "notify.retention_days": 30,
    "window.main.geometry": None,
    # Official news: automatic background check of the official Updates feed (titles/dates/links only)
    "updates.auto_check": True,
    "updates.check_hours": 3,
    "backup.auto_hours": 24,
    "reference.auto_update": True,           # install approved, signed reference-data packages automatically
    "app_updates.auto_check": True,          # look for new Companion releases (never installs by itself)
    "app_updates.channel": "stable" if release_channel(__version__) == "stable" else "prerelease",
    # Sidebar Quick Access (ordered list of {kind, id}); horizontal nav shows the same items as a strip
    # (Type matchups, Notes and Collection are in the main navigation since 2026-11-23, so not repeated here.)
    "nav.quick_access": [{"kind": "tool", "id": "breeding"}, {"kind": "guide", "id": "current"}],
    # Pokédex
    "pokedex.scope": "reference",            # reference (all 649, default) | pokemmo (hide species YOU marked "Not listed")
    "pokedex.density": "standard",           # compact | standard | large
    "pokedex.progress_run": None,            # run id whose manual registration is shown, or None (= not tracked)
    "performance.profile": "balanced",       # lightweight | balanced | quality | custom
    "performance.item_batch": "normal",       # custom profile only
    "performance.default_motion": "standard", # custom profile only
    "sprites.motion": "system",              # system (follow reduced motion) | on | off — overrides every context
    "sprites.animation": {},                 # per context: static | animated (missing = default, see ui/js/sprites.js)
    "sprites.size": {},                      # per context: percent 50..200
    "pokedex.shiny": False,                  # Pokédex grid shows shiny artwork (display only, never ownership)
    "pokedex.animate": None,                 # animated Summary sprites: None = follow the system's reduced-motion setting
    # Language (UI strings; game item names from your own client strings when available). English fallback.
    "pokedex.catalog": "forms",              # forms (649 species + alternate forms, default) | species
    "app.language": "en",
    "app.toolbar": ["language"],             # optional toolbar actions: language, notes (quick new note)
    # Connected tools
    "notes.popout_note": None,               # note shown by the Notes popout in Compact / Standard mode
    "notes.sort": "updated",                 # updated | created | title
    "items.filters": {},
    "showcase.active": None,                 # showcase id shown by the Showcase popout
    "customguide.active": None,              # custom guide shown by the Guide steps popout
    "box.view": "grid",                      # grid | list
    "locations.region": "kanto",             # Location explorer: last region tab
    "locations.maps": {},                    # Location explorer: last sub-map per region {region: map id}
    "locations.style": "game",               # game = in-game Town Map artwork where available | companion = original maps
    # Keyboard shortcuts (docs/design/20 §B): stable action id -> combo; focused Companion windows only.
    "shortcuts.bindings": None,              # None = registered defaults
    "shortcuts.enabled": True,
    "shortcuts.global": False,               # system-wide hotkeys are NOT implemented; kept off
}

for _tool in TOOLS:
    DEFAULTS[f"window.{_tool}.mode"] = "standard"
    DEFAULTS[f"window.{_tool}.pinned"] = False
    DEFAULTS[f"window.{_tool}.bg_opacity"] = 92 if _tool != "storyline" else 78
    DEFAULTS[f"window.{_tool}.window_opacity"] = 100
    DEFAULTS[f"window.{_tool}.text_scale"] = 100
    DEFAULTS[f"window.{_tool}.locked"] = False
    DEFAULTS[f"window.{_tool}.geometry"] = None          # last position (+ size) of the window
    DEFAULTS[f"window.{_tool}.sizes"] = {}               # your custom size per mode: {"compact": {"w","h"}, ...}
    DEFAULTS[f"window.{_tool}.keep_size"] = False        # True = switching mode never resizes the window
    DEFAULTS[f"window.{_tool}.text_outline"] = False     # dark outline behind text for low-opacity backgrounds
    DEFAULTS[f"window.{_tool}.sprite_scale"] = 100       # this popout's Pokémon sprite size, percent
    DEFAULTS[f"window.{_tool}.sprite_motion"] = "inherit"  # inherit (Pokémon & sprites settings) / static / animated

_ENUMS = {
    "locations.style": ("game", "companion"),
    "locations.region": ("kanto", "johto", "hoenn", "sinnoh", "unova"),
    "appearance.nav": ("vertical", "horizontal"),
    "appearance.sidebar": ("auto", "icons", "full"),
    "app_updates.channel": ("stable", "prerelease"),
    "appearance.stat_bars": ("soft", "accent"),
    "appearance.density": ("comfortable", "compact"),
    "app.close_behavior": ("quit", "tray"),
    "performance.profile": ("lightweight", "balanced", "quality", "custom"),
    "performance.item_batch": ("small", "normal", "large"),
    "performance.default_motion": ("conservative", "standard", "enhanced"),
    "sprites.motion": ("system", "on", "off"),
    "game.on_exit": ("keep", "minimize", "quit"),
    "app.window_backend": ("auto", "wayland", "xwayland"),
    "notify.phenomena": ROUTES, "notify.alpha": ROUTES, "notify.swarm": ROUTES, "notify.other": ROUTES, "notify.timer": ROUTES, "notify.test": ROUTES,
    "notify.toast_corner": ("top-left", "top-right", "bottom-left", "bottom-right"),
    "pokedex.scope": ("pokemmo", "reference"),
    "pokedex.density": ("compact", "standard", "large"),
    "app.language": LANGUAGES,
    "pokedex.catalog": ("forms", "species"),
    "notes.sort": ("updated", "created", "title"),
    "box.view": ("grid", "list"),
}
_RANGES = {
    "live.swarm_estimate_minutes": (5, 120),
    "appearance.text_scale": (60, 200),
    "appearance.ui_scale": (75, 150),
    "notify.toast_duration": (3, 60),
    "notify.toast_opacity": (60, 100),
    "notify.retention_days": (1, 365),
    "updates.check_hours": (1, 24),
    "backup.auto_hours": (0, 168),
}
for _tool in TOOLS:
    _ENUMS[f"window.{_tool}.mode"] = MODES
    _ENUMS[f"window.{_tool}.sprite_motion"] = ("inherit", "static", "animated")
    _RANGES[f"window.{_tool}.bg_opacity"] = (20, 100)      # below ~45 % the text outline is suggested
    _RANGES[f"window.{_tool}.window_opacity"] = (40, 100)
    _RANGES[f"window.{_tool}.text_scale"] = (60, 200)     # text-size popover: 60–200 %
    _RANGES[f"window.{_tool}.sprite_scale"] = (50, 200)


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
    if key == "shortcuts.global" and value:
        raise SettingsError("Shortcuts work only while a Companion window is focused.")
    if isinstance(default, bool):
        if not isinstance(value, bool):
            raise SettingsError(f"{key} must be true/false")
        return value
    if isinstance(default, list) and not isinstance(value, list):
        raise SettingsError(f"{key} must be a list")
    if key.endswith(".geometry") and value is not None:
        if not (isinstance(value, dict) and all(k in value for k in ("w", "h"))):
            raise SettingsError("geometry must be {x?, y?, w, h}")
    if key == "nav.quick_access":
        if not isinstance(value, list) or len(value) > 24:
            raise SettingsError("quick access must be a list of up to 24 items")
        clean = []
        for item in value:
            if not (isinstance(item, dict) and item.get("kind") in ("tool", "pokemon", "guide", "page")
                    and isinstance(item.get("id"), (str, int)) and len(str(item.get("id"))) < 40):
                raise SettingsError("invalid quick access item")
            if item not in clean:
                clean.append({"kind": item["kind"], "id": item["id"]})
        return clean
    if key.endswith(".sizes"):
        if not isinstance(value, dict):
            raise SettingsError("sizes must be an object")
        out = {}
        for mode, g in value.items():
            if mode in MODES and isinstance(g, dict):
                out[mode] = {"w": max(220, min(4000, int(g.get("w", 400)))), "h": max(160, min(3000, int(g.get("h", 400))))}
        return out
    if key == "shortcuts.bindings":
        if value is None:
            return None
        from .data.shortcuts import validate_bindings
        try:
            return validate_bindings(value)
        except ValueError as exc:
            raise SettingsError(str(exc))
    if key == "shortcuts.global" and value:
        raise SettingsError("Shortcuts work only while a Companion window is focused.")
    if key == "app.toolbar":
        allowed = ("language", "notes")
        if not isinstance(value, list) or any(v not in allowed for v in value):
            raise SettingsError(f"toolbar items must be among {allowed}")
        return list(dict.fromkeys(value))
    if key in ("notes.popout_note", "showcase.active", "customguide.active") and value is not None and not (
            isinstance(value, str) and len(value) <= 24):
        raise SettingsError(f"{key} must be an id or null")
    if key == "locations.maps":
        if not isinstance(value, dict) or len(value) > 10 or any(not isinstance(k, str) or not isinstance(v, str) or len(v) > 40 for k, v in value.items()):
            raise SettingsError("locations.maps must map region names to sub-map ids")
        return value
    if key == "items.filters" and not isinstance(value, dict):
        raise SettingsError("items.filters must be an object")
    if key == "live.phenomena.enabled" and value is not None and type(value) is not bool:
        raise SettingsError("Phenomenon online source must be true, false or null")
    if key == "live.phenomena.endpoint":
        from .phenomenon_protocol import endpoint_url
        try:
            return endpoint_url(value)
        except ValueError as exc:
            raise SettingsError(str(exc)) from exc
    if key == "live.current_include_catchup" and not isinstance(value, bool):
        raise SettingsError("live.current_include_catchup must be true or false")
    if key == "pokedex.animate" and value is not None and not isinstance(value, bool):
        raise SettingsError("pokedex.animate must be true, false or null (follow the system)")
    if key == "pokedex.progress_run" and value is not None and not isinstance(value, str):
        raise SettingsError("progress run must be a run id or null")
    if key == "appearance.theme":
        if value is None:
            return None
        from .services.themes import ThemeError, validate
        try:
            return validate(value)[0]
        except ThemeError as exc:
            raise SettingsError(str(exc))
    if key == "appearance.theme_id":
        if not (isinstance(value, str) and re.fullmatch(r"[a-z0-9-]{1,40}", value)):
            raise SettingsError("invalid theme id")
        return value
    if key == "sprites.animation":
        ok = ("dex_grid", "summary", "roamers", "report_active", "report_expired", "live_history", "locations", "team", "compare")
        if not isinstance(value, dict) or any(k not in ok or v not in ("static", "animated") for k, v in value.items()):
            raise SettingsError("sprite animation preferences must map known places to static or animated")
        return value
    if key == "sprites.size":
        if not isinstance(value, dict) or any(not isinstance(v, (int, float)) or not 50 <= v <= 200 for v in value.values()) or len(value) > 20:
            raise SettingsError("sprite sizes must be percentages between 50 and 200")
        return {str(k): int(v) for k, v in value.items()}
    if key == "pokedex.shiny" and not isinstance(value, bool):
        raise SettingsError("pokedex.shiny must be true or false")
    if key == "game.launcher_path":
        if not isinstance(value, str) or len(value) > 1000:
            raise SettingsError("launcher path must be a file path")
        return value
    if key == "window.open_popouts":
        if not isinstance(value, list) or len(value) > 30 or any(not isinstance(v, str) or len(v) > 40 for v in value):
            raise SettingsError("open popouts must be a list of tool ids")
        return value
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

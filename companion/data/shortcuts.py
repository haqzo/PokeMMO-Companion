"""Registered Companion keyboard actions (docs/design/20 §B).

Bindings are stored by stable action ID in settings (``shortcuts.bindings``) and only fire while a
Companion window is focused. Nothing here registers system-wide hotkeys or sends input to PokeMMO.
"""
from __future__ import annotations

import re

ACTIONS = {
    # id: (group, label, default binding or None, scope)
    "guide.next": ("Guides", "Storyline: go to next objective", "Ctrl+Shift+ArrowRight", "guides"),
    "guide.prev": ("Guides", "Storyline: go to previous objective", "Ctrl+Shift+ArrowLeft", "guides"),
    "guide.toggle": ("Guides", "Storyline: tick / untick current objective", "Ctrl+Shift+Enter", "guides"),
    "guide.popout": ("Guides", "Show / hide the Storyline popout", None, "app"),
    "notes.new": ("Notes", "New note (opens a note window)", "Ctrl+Alt+N", "app"),
    "notes.search": ("Notes", "Focus notes search", None, "notes"),
    "pokedex.search": ("Pokédex", "Focus Pokédex search", "Ctrl+F", "pokedex"),
    "pokedex.next": ("Pokédex", "Next entry in the open detail", None, "pokedex"),
    "pokedex.prev": ("Pokédex", "Previous entry in the open detail", None, "pokedex"),
    "items.search": ("Items", "Focus Item Library search", None, "items"),
    "links.search": ("Websites", "Focus Websites search", None, "links"),
    "app.home": ("General", "Go to Home", None, "app"),
    "app.quick_notes": ("General", "Show / hide the Notes popout", None, "app"),
}
MODIFIERS = ("Ctrl", "Alt", "Shift", "Meta")
# Combinations the OS, the browser engine or the Companion itself already use.
RESERVED = {"Ctrl+W", "Ctrl+Q", "Ctrl+R", "Ctrl+Shift+R", "Ctrl+T", "Ctrl+N", "Ctrl+Shift+N", "Ctrl+Tab", "Ctrl+Shift+Tab", "Alt+F4",
            "Alt+Tab", "Meta+Tab", "Ctrl+Alt+Delete", "Ctrl+Alt+Backspace", "Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+Z", "Ctrl+Y", "Ctrl+A",
            "Ctrl+S", "Ctrl+P", "Ctrl+L", "Ctrl+Shift+I", "Ctrl+Shift+J", "F5", "F11", "F12", "Meta+L", "Meta+D", "Escape", "Tab",
            "Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5", "Alt+ArrowUp", "Alt+ArrowDown", "Alt+ArrowLeft", "Alt+ArrowRight"}
KEY_RX = re.compile(r"^(F([1-9]|1[0-2])|[A-Z0-9]|Arrow(Up|Down|Left|Right)|Enter|Space|Home|End|PageUp|PageDown|Insert|Delete|Backspace|"
                    r"Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Minus|Equal|Backquote|Backslash)$")


def normalize(combo: str | None) -> str | None:
    if combo in (None, ""):
        return None
    parts = [p.strip() for p in str(combo).split("+") if p.strip()]
    if not parts:
        return None
    key = parts[-1]
    mods = []
    for m in parts[:-1]:
        m = m.capitalize()
        m = {"Control": "Ctrl", "Cmd": "Meta", "Super": "Meta", "Win": "Meta", "Option": "Alt"}.get(m, m)
        if m not in MODIFIERS:
            raise ValueError(f"Unknown modifier {m!r}")
        if m not in mods:
            mods.append(m)
    key = key.upper() if len(key) == 1 else next((k for k in ("ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Space", "Home", "End",
                                                              "PageUp", "PageDown", "Insert", "Delete", "Backspace") if k.lower() == key.lower()), key)
    if re.fullmatch(r"f([1-9]|1[0-2])", key):
        key = key.upper()
    if not KEY_RX.match(key):
        raise ValueError(f"Unsupported key {key!r}")
    mods.sort(key=MODIFIERS.index)
    if not mods and not re.match(r"^F([1-9]|1[0-2])$", key):
        raise ValueError("Use at least one modifier (Ctrl, Alt, Shift or Meta) so typing never triggers it")
    if mods == ["Shift"] and len(key) == 1:
        raise ValueError("Shift + a letter types a capital letter; add Ctrl or Alt")
    return "+".join(mods + [key])


def defaults() -> dict:
    return {aid: d[2] for aid, d in ACTIONS.items()}


def validate_bindings(value) -> dict:
    if not isinstance(value, dict):
        raise ValueError("bindings must be an object")
    out = {}
    seen: dict[str, str] = {}
    for aid, combo in value.items():
        if aid not in ACTIONS:
            continue  # unknown/removed actions are dropped, never an error
        c = normalize(combo)
        if c and c in RESERVED:
            raise ValueError(f"{c} is reserved by the system or the Companion")
        if c and c in seen:
            raise ValueError(f"{c} is already used by “{ACTIONS[seen[c]][1]}”")
        if c:
            seen[c] = aid
        out[aid] = c
    return out

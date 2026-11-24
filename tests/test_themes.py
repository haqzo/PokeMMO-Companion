"""Themes: exactly six presets + Custom, canonical palettes, safe validation, personal themes, backups."""
import re

import pytest

from companion.config import BUNDLED_DATA_DIR, UI_DIR
from companion.services import themes as th


def test_exactly_six_presets_with_companion_default():
    cat = th.catalog()
    assert cat["order"] == ["catppuccin-mocha", "tokyo-night", "companion", "graphite", "arctic", "emerald"]
    assert set(cat["presets"]) == set(cat["order"]) and cat["default"] == "companion"
    for p in cat["presets"].values():
        assert set(p["colors"]) == set(cat["color_keys"])
        assert all(re.fullmatch(r"#[0-9a-f]{6}", v) for v in p["colors"].values())


def test_catppuccin_mocha_and_tokyo_night_use_canonical_palettes():
    # catppuccin/catppuccin README (Mocha) and enkia/tokyo-night-vscode-theme / folke tokyonight "night"
    mocha = {"#1e1e2e", "#181825", "#11111b", "#313244", "#45475a", "#585b70", "#cdd6f4", "#bac2de", "#9399b2",
             "#cba6f7", "#89b4fa", "#b4befe", "#a6e3a1", "#f9e2af", "#f38ba8"}
    tokyo = {"#1a1b26", "#16161e", "#24283b", "#292e42", "#33467c", "#3b4261", "#414868", "#c0caf5", "#a9b1d6",
             "#737aa2", "#7aa2f7", "#7dcfff", "#9ece6a", "#e0af68", "#f7768e"}
    cat = th.catalog()
    m, t = cat["presets"]["catppuccin-mocha"]["colors"], cat["presets"]["tokyo-night"]["colors"]
    assert set(m.values()) <= mocha, set(m.values()) - mocha
    assert set(t.values()) <= tokyo, set(t.values()) - tokyo
    assert (m["panel"], m["text"], m["accent"]) == ("#1e1e2e", "#cdd6f4", "#cba6f7")
    assert (t["panel"], t["text"], t["accent"]) == ("#1a1b26", "#c0caf5", "#7aa2f7")


def test_companion_default_matches_the_approved_tokens():
    css = (UI_DIR / "css" / "tokens.css").read_text()
    tok = dict(re.findall(r"(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})", css.split(":root.high-contrast")[0]))
    c = th.catalog()["presets"]["companion"]["colors"]
    for key, var in {"bg_app": "--bg-app", "panel": "--bg-window", "header": "--bg-header", "card": "--bg-card", "inset": "--bg-inset",
                     "input": "--bg-control", "text": "--text-primary", "text2": "--text-secondary", "muted": "--text-muted",
                     "accent": "--accent", "link": "--link", "button": "--bg-button", "hover": "--bg-hover", "selected": "--bg-selected",
                     "border": "--border-subtle", "border_strong": "--border-strong", "warning": "--warn", "error": "--danger",
                     "success": "--good", "sidebar": "--bg-sidebar", "button_hover": "--btn-hover", "focus": "--focus"}.items():
        assert c[key] == tok[var].lower(), (key, var)


@pytest.mark.parametrize("bad", [
    {"colors": {"text": "red; background:url(http://x)"}},
    {"colors": {"text": "url(file:///etc/passwd)"}},
    {"colors": {"text": "expression(alert(1))"}},
    {"colors": {"text": "#12345"}},
])
def test_unsafe_or_malformed_colours_never_survive(bad):
    clean, dropped = th.validate({"name": "x", **bad})
    assert clean["colors"] == {} and "colors.text" in dropped
    with pytest.raises(th.ThemeError):
        th.validate({"name": "x", **bad}, strict=True)


def test_validation_rejects_non_themes_and_drops_unknown_keys():
    for raw in ([], "x", {"format": "something-else"}, {"version": 99}, {"name": "<script>"}, {"colors": []}):
        with pytest.raises(th.ThemeError):
            th.validate(raw)
    clean, dropped = th.validate({"name": "Mine", "base": "tokyo-night", "css": "body{}", "script": "x", "colors": {"accent": "#AABBCC", "nope": "#000000"},
                                  "shape": {"radius": 99, "border_visible": 0}, "layout": {"density": "huge", "grid_gap": 2, "font": "Comic"}})
    assert clean["base"] == "tokyo-night" and clean["colors"] == {"accent": "#aabbcc"}
    assert clean["shape"] == {"radius": 20, "border_visible": False} and clean["layout"] == {"grid_gap": 4}
    assert {"css", "script", "colors.nope", "layout.density", "layout.font"} <= set(dropped)
    assert th.validate({"base": "not-a-preset"})[0]["base"] == "companion"


def test_personal_themes_api_and_active_theme_setting(client):
    code, d = client.call("GET", "/api/themes")
    assert code == 200 and d["personal"] == [] and len(d["catalog"]["presets"]) == 6
    code, t = client.call("POST", "/api/themes", {"name": "Night shift", "base": "catppuccin-mocha", "colors": {"accent": "#f5c2e7"}})
    assert code == 200 and re.fullmatch(r"[0-9a-f]{12}", t["id"])
    code, t2 = client.call("PUT", f"/api/themes/{t['id']}", {**t, "name": "Night shift 2"})
    assert code == 200 and t2["name"] == "Night shift 2"
    code, d = client.call("GET", "/api/themes")
    assert [p["name"] for p in d["personal"]] == ["Night shift 2"]
    code, e = client.call("POST", "/api/themes", {"name": "bad{name}"})
    assert code == 400
    code, v = client.call("POST", "/api/themes/validate", {"name": "Imp", "colors": {"text": "#fff; x"}, "extra": 1})
    assert code == 200 and v["theme"]["colors"] == {} and "extra" in v["dropped"]
    # active theme is validated like any setting
    code, s = client.call("PATCH", "/api/settings", {"appearance.theme": {"name": "x", "base": "tokyo-night", "colors": {"text": "javascript:1"}}, "appearance.theme_id": "tokyo-night"})
    assert code == 200 and s["applied"]["appearance.theme"]["colors"] == {}
    code, s = client.call("PATCH", "/api/settings", {"appearance.theme_id": "../../etc"})
    assert code == 400
    code, boot = client.call("GET", "/api/bootstrap")
    assert boot["themes"]["default"] == "companion"
    code, _ = client.call("DELETE", f"/api/themes/{t['id']}")
    assert client.call("GET", "/api/themes")[1]["personal"] == []


def test_text_and_ui_scale_ranges_are_separate(client):
    code, s = client.call("PATCH", "/api/settings", {"appearance.text_scale": 250, "appearance.ui_scale": 40})
    assert s["applied"] == {"appearance.text_scale": 200, "appearance.ui_scale": 75}
    code, s = client.call("PATCH", "/api/settings", {"appearance.text_scale": 50})
    assert s["applied"]["appearance.text_scale"] == 60


def test_backups_include_themes_and_sprite_preferences(client):
    client.call("POST", "/api/themes", {"name": "Backed up", "base": "emerald"})
    client.call("PATCH", "/api/settings", {"appearance.theme": {"name": "Backed up", "base": "emerald"}, "sprites.animation": {"dex_grid": "animated"}, "pokedex.shiny": True})
    code, b = client.call("GET", "/api/backup/export")
    docs = [r for r in b["tables"]["documents"] if r["kind"] == "theme"]
    assert len(docs) == 1 and "Backed up" in docs[0]["data"]
    assert b["settings"]["appearance.theme"]["base"] == "emerald"
    assert b["settings"]["sprites.animation"] == {"dex_grid": "animated"} and b["settings"]["pokedex.shiny"] is True

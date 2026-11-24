"""UI: themes apply live to the main window and open popouts, Companion Default sets nothing, Home ordering and
equal-height rows, Pokédex Normal/Shiny keeps filters and scroll, sprite preferences (2026-11-24)."""
import pytest

from tests.ui.test_ui_flows import DUMPS, app, browser, data_dir, go, page  # noqa: F401  (fixtures)

pytestmark = pytest.mark.ui

VAR = "n => getComputedStyle(document.documentElement).getPropertyValue(n).trim()"


def _reset(app):
    app.ctx.settings.update({"appearance.theme": None, "appearance.theme_id": "companion", "home.sections": ["roamers", "live", "update", "news", "events", "quick"],
                             "pokedex.shiny": False, "sprites.animation": {}, "sprites.motion": "system"})


def test_theme_applies_live_to_main_window_and_popout(app, browser):  # noqa: F811
    _reset(app)
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    main, pop = ctx.new_page(), ctx.new_page()
    errors = []
    for p in (main, pop):
        p.on("pageerror", lambda e: errors.append(str(e)))
    pop.goto(app.srv.url("", popout="timers"))
    pop.wait_for_selector(".popout-root")
    main.goto(app.url("#/settings/appearance"))
    main.wait_for_selector(".theme-card")
    assert main.locator(".theme-card").count() == 7            # six presets + Custom (no personal themes yet)
    # Companion Default writes no inline variables: tokens.css stays in charge
    assert main.evaluate("[...document.documentElement.style].filter(n => n !== '--scale').length") == 0 and not main.evaluate("document.documentElement.classList.contains('themed')")
    assert main.evaluate(VAR, "--bg-window") == "#161924"
    main.locator('.theme-card[data-theme="tokyo-night"]').click()
    main.wait_for_timeout(300)
    assert main.evaluate(VAR, "--bg-window") == "#1a1b26" and main.evaluate(VAR, "--text-primary") == "#c0caf5"
    for _ in range(50):                                        # the popout follows through the settings event
        if pop.evaluate(VAR, "--bg-popout-rgb") == "26, 27, 38":
            break
        pop.wait_for_timeout(100)
    assert pop.evaluate(VAR, "--bg-popout-rgb") == "26, 27, 38"
    # a single colour edit: live here and in the popout, with readability feedback
    main.locator("details.color-group").nth(1).locator("summary").click()
    main.locator('.color-row[data-key="text"] .hex-in').fill("#20222c")
    main.wait_for_timeout(500)
    assert main.evaluate(VAR, "--text-primary") == "#20222c"
    assert "Readability" in main.locator("#theme-editor").inner_text()
    main.locator('.color-row[data-key="text"] .hex-in').fill("nope")
    assert main.locator('.color-row[data-key="text"] .bad-text').inner_text() == "Use #rrggbb"
    assert main.evaluate(VAR, "--text-primary") == "#20222c"    # an invalid value is never applied
    for _ in range(50):
        if pop.evaluate(VAR, "--text-primary") == "#20222c":
            break
        pop.wait_for_timeout(100)
    assert pop.evaluate(VAR, "--text-primary") == "#20222c"
    # restore Companion Default: inline variables gone everywhere
    main.goto(app.url("#/settings/appearance"))
    main.get_by_role("button", name="Restore Companion Default").click()
    main.locator(".modal .btn.primary").click()
    main.wait_for_timeout(600)
    assert main.evaluate("[...document.documentElement.style].filter(n => n !== '--scale').length") == 0 and not main.evaluate("document.documentElement.classList.contains('themed')")
    for _ in range(50):
        if pop.evaluate("document.documentElement.style.getPropertyValue('--bg-window')") == "":
            break
        pop.wait_for_timeout(100)
    assert pop.evaluate("document.documentElement.style.getPropertyValue('--bg-window')") == ""
    assert app.ctx.settings.get("appearance.theme") is None
    assert not errors, errors
    ctx.close()


def test_layout_settings_and_scales_are_separate(app, page):  # noqa: F811
    _reset(app)
    go(page, app, "#/settings/layout")
    page.get_by_role("radio", name="Compact").first.click()
    page.wait_for_timeout(400)
    assert page.evaluate(VAR, "--card-pad") == "10px" and page.evaluate(VAR, "--sp-4") == "12px"
    page.locator('input[aria-label="Corner radius"]').fill("0")
    page.wait_for_timeout(400)
    assert page.evaluate(VAR, "--radius") == "0px"
    # text size changes the root font size only; the interface scale is a separate setting
    app.ctx.settings.update({"appearance.text_scale": 150})
    page.reload(); page.wait_for_selector(".main .page")
    assert page.evaluate("getComputedStyle(document.documentElement).fontSize") == "21px"
    assert page.evaluate("document.body.style.zoom") in ("1", "")
    app.ctx.settings.update({"appearance.text_scale": 100, "appearance.ui_scale": 125})
    page.reload(); page.wait_for_selector(".main .page")
    assert page.evaluate("getComputedStyle(document.documentElement).fontSize") == "14px"
    assert page.evaluate("document.body.style.zoom") == "1.25"
    app.ctx.settings.update({"appearance.ui_scale": 100})
    _reset(app)


def test_home_order_and_equal_height_rows(app, page):  # noqa: F811
    _reset(app)
    app.ctx.settings.update({"app.onboarded": True})
    page.set_viewport_size({"width": 1400, "height": 1000})
    go(page, app, "#/home")
    page.wait_for_selector(".home-roamers")
    r = page.locator(".home-roamers").bounding_box()
    lv = page.locator(".home-live").bounding_box()
    assert abs(r["y"] - lv["y"]) < 1 and abs(r["height"] - lv["height"]) < 1      # same row, same height
    # rows never end in an empty gap: the last card of a row reaches the right edge
    grid = page.locator(".home-v3").bounding_box()
    rights = page.locator(".home-v3 > *").evaluate_all("els => els.map(e => e.getBoundingClientRect().right)")
    assert all(abs(x - (grid["x"] + grid["width"])) < 2 or x < grid["x"] + grid["width"] - 100 for x in rights)
    assert any(abs(x - (grid["x"] + grid["width"])) < 2 for x in rights)
    go(page, app, "#/settings/home")
    page.get_by_role("button", name="Move Alpha & Swarm up").click()
    page.wait_for_timeout(300)
    assert app.ctx.settings.get("home.sections")[:2] == ["live", "roamers"]
    go(page, app, "#/home")
    page.wait_for_selector(".home-live")
    order = page.locator(".home-v3 > *").evaluate_all("els => els.map(e => e.dataset.section)")
    assert order[:2] == ["live", "roamers"]
    # narrow window: everything stacks
    page.set_viewport_size({"width": 900, "height": 1000})
    page.wait_for_timeout(200)
    w = page.locator(".home-v3").bounding_box()["width"]
    assert abs(page.locator(".home-live").bounding_box()["width"] - w) < 2
    go(page, app, "#/settings/home")
    page.get_by_role("button", name="Reset Home layout").click()
    page.wait_for_timeout(300)
    assert app.ctx.settings.get("home.sections")[:2] == ["roamers", "live"]
    _reset(app)


def test_pokedex_shiny_mode_keeps_filters_and_scroll(app, page):  # noqa: F811
    _reset(app)
    go(page, app, "#/pokedex")
    page.wait_for_selector(".dex-card")
    page.locator("#dex-search").fill("a")
    page.wait_for_timeout(500)
    shown = page.locator(".dex-card").count()
    page.locator(".dex-scroll").evaluate("e => e.scrollTop = 900")
    page.wait_for_timeout(300)
    page.get_by_role("radio", name="Shiny").first.click()
    page.wait_for_timeout(800)
    assert app.ctx.settings.get("pokedex.shiny") is True
    assert page.locator("#dex-search").input_value() == "a" and page.locator(".dex-card").count() == shown
    assert page.locator(".dex-scroll").evaluate("e => e.scrollTop") >= 850
    srcs = page.locator(".dex-card .sprite img").evaluate_all("els => els.map(e => e.getAttribute('src'))")
    assert srcs and all("shiny" in s for s in srcs if s), srcs[:3]
    _reset(app)


def test_sprite_preferences_are_independent_and_motion_override_wins(app, page):  # noqa: F811
    _reset(app)
    app.ctx.settings.update({"sprites.animation": {"dex_grid": "animated", "summary": "static"}})
    go(page, app, "#/pokedex")
    page.wait_for_selector(".dex-card .sprite img")
    page.wait_for_timeout(500)
    srcs = page.locator(".dex-card .sprite img").evaluate_all("els => els.map(e => e.getAttribute('src'))")
    assert any("/library/ani/" in s for s in srcs if s), srcs[:3]
    app.ctx.settings.update({"sprites.motion": "off"})
    page.reload(); page.wait_for_selector(".dex-card .sprite img"); page.wait_for_timeout(500)
    srcs = page.locator(".dex-card .sprite img").evaluate_all("els => els.map(e => e.getAttribute('src'))")
    assert srcs and not any("/library/ani" in s for s in srcs if s)
    _reset(app)

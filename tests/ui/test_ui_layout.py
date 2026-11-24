"""Responsive layout and scrolling on a clean profile (2026-11-24 release-preparation pass).

These are real layout assertions: every visible control is scrolled into view the way keyboard focus would and must
then be the topmost element at its own centre; the window must never scroll sideways as a whole. Browser viewports
only — native Qt, OS scaling and multi-monitor behaviour are not covered here.
"""
import sys
from pathlib import Path

import pytest

from tests.ui.test_ui_builtin_maps import clean, pg, _until  # noqa: F401  (fixtures)
from tests.ui.test_ui_flows import browser  # noqa: F401

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
from layout_audit import PROBE, ROUTES  # noqa: E402

pytestmark = pytest.mark.ui
SIZES = [(1600, 900), (1280, 720), (1024, 768), (800, 600), (600, 900), (420, 640)]


@pytest.mark.parametrize("w,h", SIZES, ids=[f"{w}x{h}" for w, h in SIZES])
def test_every_page_reachable_without_sideways_scroll(clean, pg, w, h):  # noqa: F811
    pg.set_viewport_size({"width": w, "height": h})
    problems = []
    for r in ROUTES:
        pg.goto(clean.url(r))
        pg.wait_for_timeout(500)
        res = pg.evaluate(PROBE, 140)
        bad = res["bad"]
        if bad or res["hOverflow"] or res["pageHOverflow"]:
            problems.append((r, res["hOverflow"], res["pageHOverflow"], bad[:3]))
    assert not problems, problems
    assert not pg.errors


def test_sidebar_collapses_by_width_and_preference_without_reload(clean, pg):  # noqa: F811
    pg.goto(clean.url("#/home"))
    pg.wait_for_selector(".app.nav-vertical")
    assert pg.locator(".app.nav-collapsed").count() == 0
    pg.set_viewport_size({"width": 820, "height": 700})
    _until(pg, "document.querySelector('.app').classList.contains('nav-collapsed')")
    assert pg.locator(".nav-item[data-nav=guides] .label").is_hidden()
    assert pg.locator(".nav-item[data-nav=guides]").get_attribute("title").startswith("Guides")
    pg.set_viewport_size({"width": 1500, "height": 950})
    _until(pg, "!document.querySelector('.app').classList.contains('nav-collapsed')")
    clean.ctx.settings.update({"appearance.sidebar": "icons"})
    pg.reload()
    pg.wait_for_selector(".app.nav-collapsed")
    clean.ctx.settings.update({"appearance.sidebar": "auto"})


def test_short_window_sidebar_scrolls_to_settings(clean, pg):  # noqa: F811
    pg.set_viewport_size({"width": 1200, "height": 360})
    pg.goto(clean.url("#/home"))
    pg.wait_for_selector(".sidebar")
    pg.locator(".sidebar .nav-item[data-nav=settings]").focus()
    box = pg.locator(".sidebar .nav-item[data-nav=settings]").bounding_box()
    assert box and box["y"] + box["height"] <= 360
    pg.locator(".sidebar .nav-item[data-nav=settings]").click()
    _until(pg, "location.hash.startsWith('#/settings')")


def test_dialog_buttons_reachable_in_short_window(clean, pg):  # noqa: F811
    pg.set_viewport_size({"width": 700, "height": 380})
    pg.goto(clean.url("#/guides/mine?new=1"))
    pg.wait_for_selector(".modal .m-foot .btn")
    for b in pg.locator(".modal .m-foot .btn").all():
        bb = b.bounding_box()
        assert bb and bb["y"] >= 0 and bb["y"] + bb["height"] <= 380
    body = pg.locator(".modal .m-body")
    assert body.evaluate("e => getComputedStyle(e).overflowY") == "auto"
    pg.keyboard.press("Escape")


def test_tables_scroll_inside_their_box(clean, pg):  # noqa: F811
    pg.set_viewport_size({"width": 480, "height": 700})
    pg.goto(clean.url("#/tools/ev"))
    pg.wait_for_selector("table")
    assert pg.evaluate("[...document.querySelectorAll('.page table')].every((t) => t.closest('.table-scroll') || ['auto','scroll'].includes(getComputedStyle(t.parentElement).overflowX))")
    assert pg.evaluate("document.querySelector('.page').scrollWidth <= document.querySelector('.page').clientWidth + 1")


def test_location_explorer_panes_and_state_survive_resize(clean, pg):  # noqa: F811
    pg.set_viewport_size({"width": 1600, "height": 900})
    pg.goto(clean.url("#/tools/locations?region=kanto"))
    pg.wait_for_selector(".loc-card")
    assert pg.locator(".loc-dir").get_attribute("data-mode") == "wide"
    # the list scrolls in its own pane; opening a place does not move the list
    lp = pg.locator(".loc-listpane")
    assert lp.evaluate("e => getComputedStyle(e).overflowY") == "auto"
    lp.evaluate("e => e.scrollTop = 200")
    assert lp.evaluate("e => e.scrollTop") > 0
    first_visible = """e => { const top = e.getBoundingClientRect().top;
      return [...e.querySelectorAll('.loc-card')].find((c) => c.getBoundingClientRect().top >= top).dataset.key; }"""
    before = lp.evaluate(first_visible)
    pg.locator(".loc-card", has_text="Route 24").first.evaluate("e => e.click()")   # a click without auto-scrolling
    pg.wait_for_selector(".loc-detail h2")
    assert pg.locator(".loc-detail-pane").evaluate("e => getComputedStyle(e).overflowY") == "auto"
    key = before
    assert lp.evaluate("(e, k) => { const c = e.querySelector(`.loc-card[data-key='${k}']`).getBoundingClientRect(), r = e.getBoundingClientRect(); return c.bottom > r.top && c.top < r.bottom; }", key)  # same place in the list
    pg.get_by_label("Search locations").fill("Route")
    _until(pg, "document.querySelectorAll('.loc-card').length < 60")
    # medium: filters fold, search stays visible, the selection stays
    pg.set_viewport_size({"width": 1350, "height": 800})
    _until(pg, "document.querySelector('.loc-dir').dataset.mode === 'medium'")
    assert pg.get_by_label("Search locations").is_visible() and pg.get_by_label("Search locations").input_value() == "Route"
    assert pg.locator(".loc-filters").is_hidden() and pg.locator(".loc-filter-toggle").is_visible()
    assert pg.locator(".loc-detail h2").inner_text() == "Route 24"
    # narrow: the detail replaces the list; Back returns to the same spot in the directory
    pg.set_viewport_size({"width": 760, "height": 640})
    _until(pg, "document.querySelector('.loc-dir').dataset.mode === 'narrow'")
    assert pg.locator(".loc-listpane").is_hidden() and pg.locator(".loc-detail h2").inner_text() == "Route 24"
    pg.locator(".loc-back").click()
    pg.wait_for_selector(".loc-card")
    assert pg.get_by_label("Search locations").input_value() == "Route"
    focused = pg.evaluate("document.activeElement && document.activeElement.dataset.key")
    assert focused and "r24" in focused
    box = pg.locator(".loc-card.selected, .loc-card:focus").first.bounding_box()
    assert box and 0 <= box["y"] <= 640
    # encounter tables scroll sideways inside their own box
    pg.locator(".loc-card", has_text="Route 24").first.click()
    pg.wait_for_selector(".loc-detail .loc-enc")
    assert pg.evaluate("document.querySelector('.loc-enc').closest('.table-scroll') !== null")
    assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    assert not pg.errors


def test_large_text_keeps_controls_reachable(clean, pg):  # noqa: F811
    clean.ctx.settings.update({"appearance.text_scale": 140})
    try:
        pg.set_viewport_size({"width": 1024, "height": 700})
        problems = []
        for r in ["#/home", "#/tools/locations", "#/guides/mine", "#/tools/team", "#/settings/appearance", "#/tools/timers"]:
            pg.goto(clean.url(r))
            pg.wait_for_timeout(600)
            res = pg.evaluate(PROBE, 140)
            if res["bad"] or res["hOverflow"] or res["pageHOverflow"]:
                problems.append((r, res["bad"][:3], res["hOverflow"], res["pageHOverflow"]))
        assert not problems, problems
        assert pg.evaluate("document.querySelector('.app').classList.contains('nav-collapsed')")  # 1024 < 900 × 1.4
    finally:
        clean.ctx.settings.update({"appearance.text_scale": 100})

"""UI: Tools › Timers and the Home news/alignment fixes. (Built-in maps: tests/ui/test_ui_builtin_maps.py.)"""
import json
import sys
import time
from pathlib import Path

import pytest

from tests.ui.test_ui_flows import DUMPS, app, browser, data_dir, go, page  # noqa: F401  (fixtures)


pytestmark = pytest.mark.ui
needs_dumps = pytest.mark.skipif(not DUMPS, reason="needs POKEMMO_DUMPS_DIR")


def _until(page, js, timeout=8.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(js):
            return True
        page.wait_for_timeout(100)
    raise AssertionError("condition not met: " + js)


# ---------------------------------------------------------------- timers
def test_timers_page_start_pause_and_completion_sound_once(app, browser):  # noqa: F811
    ctx1 = browser.new_context(viewport={"width": 1280, "height": 800})
    a = ctx1.new_page()
    a.goto(app.url("#/tools/timers"))
    a.wait_for_selector(".tm-presets button")
    b = ctx1.new_page()                      # a second window (e.g. the Timers popout)
    b.goto(app.srv.base_url + f"?token={app.ctx.token}&popout=timers&mode=compact&shell=browser#/")
    b.wait_for_selector(".tm-wrap")
    for pg in (a, b):
        pg.mouse.click(5, 5)                 # browsers allow audio only after a click in the window
    a.locator("input[aria-label='New timer name']").fill("Test egg")
    a.locator("input[aria-label=Minutes]").fill("0")
    a.locator("input[aria-label=Seconds]").fill("2")
    a.get_by_role("button", name="Add & start").click()
    card = a.locator(".tm-card", has_text="Test egg")
    card.wait_for()
    assert card.get_attribute("data-state") == "running"
    b.locator(".tm-card", has_text="Test egg").wait_for()        # the popout follows
    # completion is detected by the backend (no page needs to stay open); tick it like the background thread does
    t0 = time.time()
    while time.time() - t0 < 6 and not any(t["state"] == "done" for t in app.ctx.timers.list()["timers"]):
        app.ctx.timers.tick()
        time.sleep(0.1)
    _until(a, "document.querySelector('.tm-card[data-state=done]') !== null")
    a.wait_for_selector(".toast", timeout=5000)
    assert "Timer finished: Test egg" in a.locator(".toast").first.inner_text()
    a.wait_for_timeout(600)
    chimes = a.evaluate("window.__timerChimes || 0") + b.evaluate("window.__timerChimes || 0")
    assert chimes == 1                                        # one window plays, never both
    # keyboard: Space toggles, R resets
    c = a.locator(".tm-card", has_text="Test egg")
    c.focus()
    a.keyboard.press("r")
    _until(a, "document.querySelector('.tm-card[data-state=idle]') !== null")
    a.locator(".tm-card[data-state=idle]").focus()
    a.keyboard.press(" ")
    _until(a, "document.querySelector('.tm-card[data-state=running]') !== null")
    a.locator(".tm-card[data-state=running]").get_by_role("button", name="Pause").click()
    _until(a, "document.querySelector('.tm-card[data-state=paused]') !== null")
    # leaving the page and coming back keeps the state (it lives in the backend)
    a.goto(app.url("#/home")); a.goto(app.url("#/tools/timers"))
    a.wait_for_selector(".tm-card[data-state=paused]")
    for t in app.ctx.timers.list()["timers"]:
        app.ctx.timers.delete(t["id"])
    ctx1.close()


def test_timers_in_tools_and_quick_access(app, page):
    go(page, app, "#/tools")
    page.get_by_text("Timers", exact=True).first.click()
    page.wait_for_selector(".tm-wrap")
    page.get_by_role("button", name="Pin to sidebar").click()
    _until(page, "[...document.querySelectorAll('.quick a, .quick button, nav *')].some(e => e.textContent.trim() === 'Timers')")
    assert any(q.get("id") == "timers" for q in app.ctx.settings.get("nav.quick_access"))


# ---------------------------------------------------------------- Home
def test_home_news_window_and_aligned_columns(app, page):
    page.set_viewport_size({"width": 1500, "height": 1000})
    go(page, app, "#/home")
    page.wait_for_selector(".home-update")
    assert "published in the last 90 days" in page.locator(".home-news").inner_text()
    assert "Black 2 / White 2 expansion" not in page.locator(".home-news").inner_text()   # Aug 19: older than 90 days
    ev = page.locator(".home-events").inner_text()
    assert "Halloween 2026" not in ev and "Concluded" not in ev
    a = page.locator(".home-update").bounding_box()
    s = page.locator(".home-side").bounding_box()
    assert abs((a["y"] + a["height"]) - (s["y"] + s["height"])) <= 2 and abs(a["y"] - s["y"]) <= 2
    foot = page.locator(".home-update .update-foot").bounding_box()
    assert (a["y"] + a["height"]) - (foot["y"] + foot["height"]) < 30                     # footer stays at the bottom
    page.set_viewport_size({"width": 900, "height": 1000})                                # stacked on narrow windows
    page.wait_for_timeout(200)
    a2, s2 = page.locator(".home-update").bounding_box(), page.locator(".home-side").bounding_box()
    assert s2["y"] >= a2["y"] + a2["height"] - 1
    assert not page.errors

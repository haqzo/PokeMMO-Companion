"""UI: Location explorer with region maps + Edit map, Tools › Timers, and the Home news/alignment fixes.

Map artwork here is a SYNTHETIC test image installed through the real import/accept path (the recipe is
replaced); it shows that the viewer and editor work, not that any real ROM decodes — see tests/test_region_maps.py.
"""
import json
import sys
import time
from pathlib import Path

import pytest

from tests.ui.test_ui_flows import DUMPS, app, browser, data_dir, go, page  # noqa: F401  (fixtures)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_region_maps import fake_maps, gba_header  # noqa: E402

from companion.services import region_maps as rm  # noqa: E402

pytestmark = pytest.mark.ui
needs_dumps = pytest.mark.skipif(not DUMPS, reason="needs POKEMMO_DUMPS_DIR")


def _until(page, js, timeout=8.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(js):
            return True
        page.wait_for_timeout(100)
    raise AssertionError("condition not met: " + js)


@pytest.fixture
def kanto_art(app, tmp_path, monkeypatch):
    rom = tmp_path / "firered.gba"
    rom.write_bytes(bytes(gba_header()))
    monkeypatch.setitem(rm.RECIPES, "frlg", lambda d: fake_maps() + [{**fake_maps()[0], "id": "sevii-123", "label": "Sevii Islands 1–3"}])
    app.ctx.region_maps.import_rom(rom)
    app.ctx.region_maps.accept("kanto")
    app.ctx.settings.update({"locations.region": "kanto", "locations.maps": {}})   # earlier tests may switch tab / sub-map
    yield
    app.ctx.region_maps.remove("kanto")
    app.ctx.storage.delete_document("map_layout", "kanto")
    app.ctx.storage.delete_document("map_draft", "kanto")


# ---------------------------------------------------------------- explorer
@needs_dumps
def test_unavailable_state_keeps_full_encounter_explorer(app, page):
    go(page, app, "#/tools/locations?region=johto")
    page.wait_for_selector(".map-unavailable")
    assert "No Johto map artwork yet" in page.locator(".map-unavailable").inner_text()
    assert page.locator(".loc-map img").count() == 0                     # never a fake map
    assert page.locator(".loc-side .loc-row").count() > 50
    page.locator('.loc-tabs [data-region="unova"]').click()
    _until(page, "(document.querySelector('.map-unavailable') || {}).textContent?.includes('not been located')")
    assert not page.errors


@needs_dumps
def test_map_viewer_zoom_pan_submaps_and_regions(app, page, kanto_art):
    go(page, app, "#/tools/locations?region=kanto")
    page.wait_for_selector(".map-box img.map-img")
    _until(page, "document.querySelector('.map-img').complete && +document.querySelector('.map-box').dataset.scale > 0")
    img = page.locator(".map-img")
    assert page.evaluate("getComputedStyle(document.querySelector('.map-img')).imageRendering") in ("pixelated", "crisp-edges")
    assert (img.get_attribute("width"), img.get_attribute("height")) == ("96", "64")   # aspect ratio kept
    s0 = float(page.locator(".map-box").get_attribute("data-scale"))
    page.get_by_role("button", name="Zoom in").click()
    assert float(page.locator(".map-box").get_attribute("data-scale")) == pytest.approx(s0 * 1.25, rel=0.01)
    page.locator(".map-box").focus()
    page.keyboard.press("-")
    page.keyboard.press("0")
    assert float(page.locator(".map-box").get_attribute("data-scale")) == pytest.approx(s0, rel=0.01)
    box = page.locator(".map-box").bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.mouse.wheel(0, -200)
    assert float(page.locator(".map-box").get_attribute("data-scale")) > s0
    before = page.evaluate("document.querySelector('.map-stage').style.transform")
    page.mouse.down(); page.mouse.move(box["x"] + box["width"] / 2 + 60, box["y"] + box["height"] / 2 + 30, steps=4); page.mouse.up()
    assert page.evaluate("document.querySelector('.map-stage').style.transform") != before
    page.locator(".loc-submaps").get_by_role("tab", name="Sevii Islands 1–3").click()
    assert page.locator('.loc-submaps [aria-selected="true"]').inner_text().startswith("Sevii")
    page.locator('.loc-tabs [data-region="hoenn"]').click()
    page.wait_for_selector(".map-unavailable")
    assert not page.errors


@needs_dumps
def test_edit_map_add_move_undo_save_export(app, page, kanto_art):
    go(page, app, "#/tools/locations?region=kanto")
    page.wait_for_selector(".map-box img.map-img")
    page.get_by_role("button", name="Edit map").click()
    page.get_by_role("button", name="+ Marker").click()
    box = page.locator(".map-box").bounding_box()
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.wait_for_selector(".modal")
    page.locator(".modal input[type=search]").fill("Route 1")
    page.locator(".modal select[aria-label=Location]").select_option(label="Route 1")
    page.locator(".modal .btn.primary").click()
    _until(page, "document.querySelectorAll('.map-svg g.mk').length === 1")
    page.get_by_role("button", name="+ Rectangle").click()
    page.mouse.move(box["x"] + box["width"] * 0.3, box["y"] + box["height"] * 0.3); page.mouse.down()
    page.mouse.move(box["x"] + box["width"] * 0.4, box["y"] + box["height"] * 0.4, steps=4); page.mouse.up()
    page.wait_for_selector(".modal")
    page.locator(".modal select[aria-label='Kind of place']").select_option("cave")
    page.locator(".modal input[type=search]").fill("Mt. Moon (1F)")
    page.locator(".modal select[aria-label=Location]").select_option(label="Mt. Moon (1F)")
    page.locator(".modal .btn.primary").click()
    _until(page, "document.querySelectorAll('.map-svg g.mk').length === 2")
    page.keyboard.press("Control+z")
    _until(page, "document.querySelectorAll('.map-svg g.mk').length === 1")
    page.keyboard.press("Control+y")
    _until(page, "document.querySelectorAll('.map-svg g.mk').length === 2")
    # drag the marker: its normalised position changes
    page.get_by_role("button", name="Select / move").click()
    dot = page.locator(".map-svg g.point circle").bounding_box()
    page.mouse.move(dot["x"] + dot["width"] / 2, dot["y"] + dot["height"] / 2); page.mouse.down()
    page.mouse.move(dot["x"] + 40, dot["y"] + 10, steps=5); page.mouse.up()
    # unfinished work is kept as a draft
    _until(page, "true")
    page.wait_for_timeout(900)
    assert app.ctx.region_maps.draft("kanto")["marks"]
    page.get_by_role("button", name="Save", exact=True).click()
    _until(page, "document.querySelector('.toast') !== null")
    lay = app.ctx.region_maps.layout("kanto")
    pt = next(m for m in lay["marks"] if m["kind"] == "point")
    assert pt["location_id"].startswith("kanto:") and pt["x"] > 0.5 and 0 <= pt["y"] <= 1
    assert {m["tag"] for m in lay["marks"]} == {"route", "cave"} and app.ctx.region_maps.draft("kanto") is None
    with page.expect_download() as dl:
        page.get_by_role("button", name="Export").click()
    data = json.loads(Path(dl.value.path()).read_text())
    assert data["region"] == "kanto" and len(data["marks"]) == 2 and "png" not in json.dumps(data).lower()
    unmapped = page.locator(".loc-edit-panel summary").inner_text()
    assert "Not on the map yet" in unmapped and "of 124" in unmapped
    assert not page.errors


@needs_dumps
def test_pokemon_to_locations_highlight_and_location_to_encounters(app, page, kanto_art):
    app.ctx.region_maps.save_layout("kanto", {"marks": [
        {"kind": "point", "map": "kanto", "x": 0.3, "y": 0.6, "tag": "route", "location_id": "kanto:4867"},
        {"kind": "point", "map": "kanto", "x": 0.7, "y": 0.2, "tag": "town", "location_id": "kanto:31233"}]}, set())
    go(page, app, "#/tools/locations?region=kanto&species=19")
    page.wait_for_selector(".map-box img.map-img")
    page.wait_for_selector(".map-svg g.mk", state="attached")
    assert page.locator('.map-svg g.mk.hit[data-loc="kanto:4867"]').count() == 1      # Route 1 has Rattata
    assert page.locator('.map-svg g.mk.dim[data-loc="kanto:31233"]').count() == 1     # Altering Cave does not
    counts = {r: page.locator(f'.loc-tabs [data-region="{r}"] .count').inner_text() for r in ("kanto", "johto")}
    assert int(counts["kanto"]) > 0 and int(counts["johto"]) > 0
    assert "Rattata" in page.locator(".loc-poke").inner_text()
    page.locator('.loc-side .loc-row[data-loc="kanto:4867"]').click()
    page.wait_for_selector(".loc-enc tbody tr")
    assert page.locator(".loc-enc tbody tr").count() >= 1 and "rows match your filters" in page.locator(".loc-detail").inner_text()
    assert page.locator('.map-svg g.mk.sel[data-loc="kanto:4867"]').count() == 1
    assert page.locator(".loc-enc .type-chip").count() >= 1
    page.locator(".loc-enc a", has_text="Rattata").click()
    page.wait_for_url("**#/pokedex/19*")
    assert not page.errors


@needs_dumps
def test_filters_time_method_horde(app, page):
    go(page, app, "#/tools/locations?region=kanto")
    page.wait_for_selector(".loc-side .loc-row")
    total = page.locator(".loc-side .loc-row").count()
    page.locator("select[aria-label='Encounter type']").select_option("Cave")
    caves = page.locator(".loc-side .loc-row").count()
    assert 0 < caves < total
    page.locator("select[aria-label='Time of day']").select_option("night")
    page.locator(".loc-filters").get_by_role("button", name="Hordes").click()
    assert page.locator(".loc-side .loc-row").count() <= caves
    page.get_by_role("button", name="Clear filters").click()
    _until(page, f"document.querySelectorAll('.loc-side .loc-row').length === {total}")


def test_locations_popout_modes(app, browser, kanto_art):  # noqa: F811
    for mode, w, h_ in (("standard", 480, 620), ("compact", 330, 440), ("expanded", 820, 700)):
        pop = browser.new_context(viewport={"width": w, "height": h_}).new_page()
        errs = []
        pop.on("pageerror", lambda e: errs.append(str(e)))
        pop.goto(app.srv.base_url + f"?token={app.ctx.token}&popout=locations&mode={mode}&shell=browser#/")
        pop.wait_for_selector(".loc-tabs")
        if mode == "compact":
            assert pop.locator(".map-box").count() == 0
        else:
            pop.wait_for_selector(".map-box img")
            assert pop.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
        assert not errs
        pop.context.close()


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

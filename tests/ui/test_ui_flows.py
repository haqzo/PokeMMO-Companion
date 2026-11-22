"""End-to-end UI flows in headless Chromium (browser mode).

Needs: pip install playwright && python -m playwright install chromium
(or CHROME_PATH=/path/to/chrome). Set POKEMMO_DUMPS_DIR to include imported-data flows.
"""
import os
import re
import shutil

import pytest

pw = pytest.importorskip("playwright.sync_api")
pytestmark = pytest.mark.ui

from companion.app import AppContext  # noqa: E402
from companion.server import CompanionServer  # noqa: E402

DUMPS = os.environ.get("POKEMMO_DUMPS_DIR")
CHROME = os.environ.get("CHROME_PATH") or (shutil.which("google-chrome") or shutil.which("chromium"))


class Running:
    def __init__(self, data_dir):
        self.ctx = AppContext(str(data_dir))
        self.srv = CompanionServer(self.ctx, 0).start()

    def url(self, route="#/home"):
        return self.srv.url(route)

    def stop(self):
        self.srv.stop()
        self.ctx.shutdown()


@pytest.fixture(scope="module")
def browser():
    with pw.sync_playwright() as p:
        kw = {"args": ["--no-sandbox"]}
        if CHROME:
            kw["executable_path"] = CHROME
        b = p.chromium.launch(**kw)
        yield b
        b.close()


@pytest.fixture(scope="module")
def data_dir(tmp_path_factory):
    d = tmp_path_factory.mktemp("uidata")
    if DUMPS:
        from companion.config import make_paths
        from companion.services import importer
        importer.import_dumps(make_paths(d), folder=DUMPS)
    ctx = AppContext(str(d))
    ctx.settings.update({"app.onboarded": True})
    ctx.shutdown()
    return d


@pytest.fixture
def app(data_dir):
    r = Running(data_dir)
    yield r
    r.stop()


@pytest.fixture
def page(browser):
    ctx = browser.new_context(viewport={"width": 1280, "height": 820})
    pg = ctx.new_page()
    pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" else None)
    yield pg
    ctx.close()


def go(page, app, route):
    page.goto(app.url(route))
    page.wait_for_selector(".main .page", timeout=8000)


def test_every_route_renders_without_errors(app, page):
    routes = ["#/home", "#/news", "#/news/changelog-2026-11-19", "#/events/event-shiny-wars-2026", "#/pokedex", "#/pokedex/25",
              "#/tools", "#/tools/typechart", "#/tools/natures", "#/tools/stats", "#/tools/damage", "#/tools/breeding",
              "#/tools/team", "#/tools/ev", "#/tools/catch", "#/live", "#/live/legendaries", "#/live/cave", "#/guides",
              "#/settings", "#/settings/windows", "#/settings/notifications", "#/settings/sources", "#/settings/guides",
              "#/settings/data", "#/settings/about"]
    go(page, app, "#/home")
    for r in routes:
        page.evaluate(f"location.hash = '{r}'")
        page.wait_for_timeout(450)
        assert page.locator(".main").inner_text().strip(), r
    assert page.errors == []


def test_nav_orientation_switch_keeps_current_page(app, page):
    go(page, app, "#/settings/appearance")
    page.get_by_role("radio", name="Horizontal").click()
    page.wait_for_selector(".app.nav-horizontal")
    assert page.url.endswith("#/settings/appearance")
    page.get_by_role("radio", name="Vertical").click()
    page.wait_for_selector(".app.nav-vertical")


def test_home_reads_official_update_in_app(app, page):
    go(page, app, "#/home")
    page.get_by_role("button", name="Read details").click()
    page.wait_for_selector("article")
    text = page.locator("article").inner_text()
    assert "Defog" in text and "Original post" in text
    page.get_by_role("button", name="Back").click()
    page.wait_for_selector(".headline")
    assert "No upcoming official events confirmed" in page.locator(".main").inner_text()


def test_pokedex_search_detail_and_favourite(app, page):
    go(page, app, "#/pokedex")
    page.fill("#dex-search", "pikachu")
    page.wait_for_timeout(300)
    assert page.locator(".dex-card").count() == 1
    page.locator(".dex-card").first.click()
    page.wait_for_selector(".detail-head h2")
    assert page.locator(".detail-head h2").inner_text() == "Pikachu"
    page.locator(".detail-head .fav-btn").click()
    page.wait_for_timeout(300)
    assert app.ctx.storage.query_one("SELECT 1 AS x FROM favourites WHERE species_id=25")


def test_pokedex_filters_show_and_clear(app, page):
    go(page, app, "#/pokedex")
    page.get_by_role("radio", name="V", exact=True).click()
    page.wait_for_timeout(200)
    assert "156 of 649" in page.locator(".dex-toolbar").inner_text()
    page.locator(".active-filters button", has_text="Clear all").click()
    page.wait_for_timeout(300)
    assert "649 of 649" in page.locator(".dex-toolbar").inner_text()


def _create_run(page, name, label):
    page.locator("input[aria-label='Character name']").fill(name)
    page.locator("input[aria-label='Run label']").fill(label)
    page.locator(".modal .m-foot .btn.primary").click()
    page.wait_for_selector(".run-pill")


def test_guides_two_runs_progress_independent_and_survive_restart(data_dir, browser):
    a = Running(data_dir)
    ctxb = browser.new_context(viewport={"width": 1280, "height": 820})
    page = ctxb.new_page()
    try:
        go(page, a, "#/guides")
        if page.get_by_role("button", name="Create run").count():
            page.get_by_role("button", name="Create run").click()
        else:
            page.locator(".run-pill").click()
            page.get_by_role("button", name="New run…", exact=True).click()
        _create_run(page, "Haqzo", "Main")
        page.locator(".step input.check").nth(0).check()
        page.wait_for_timeout(500)
        page.locator(".run-pill").click()
        page.get_by_role("button", name="New run…", exact=True).click()
        _create_run(page, "Haqzo", "Alt")
        page.wait_for_timeout(300)
        assert page.locator(".step input.check:checked").count() == 0  # new run starts empty
        page.locator(".step input.check").nth(2).check()
        page.wait_for_timeout(500)
        page.evaluate("location.hash = '#/guides'")
    finally:
        a.stop()
    # full restart: new backend process state, same data folder
    b = Running(data_dir)
    try:
        page.goto(b.url("#/guides"))
        page.wait_for_selector(".run-pill")
        assert "Alt" in page.locator(".run-pill").inner_text()
        assert page.locator(".step input.check:checked").count() == 1
        page.locator(".run-pill").click()
        page.locator(".menu button", has_text="Haqzo · Main").click()
        page.wait_for_timeout(600)
        assert page.locator(".step input.check:checked").count() == 1
        assert page.locator(".step").nth(0).locator("input.check").is_checked()
    finally:
        b.stop()
        ctxb.close()


def test_live_test_notification_shows_labelled_toast_and_history(app, page):
    app.ctx.settings.update({"notify.test": "toast"})
    go(page, app, "#/live/reports")
    page.get_by_role("button", name="Send TEST notification").first.click()
    page.get_by_role("button", name="Test as Alpha").click()
    page.wait_for_selector(".toast.test", timeout=5000)
    assert "TEST" in page.locator(".toast.test").inner_text()
    page.wait_for_selector(".report-row")
    assert "TEST" in page.locator(".report-row").first.inner_text()
    assert "Report feed is off" in page.locator(".source-bar").inner_text()


def test_storyline_popout_shares_state_with_main(app, page, browser):
    go(page, app, "#/guides")
    run_id = app.ctx.settings.get("guides.active_run")
    if not run_id:
        pytest.skip("no run")
    pop = browser.new_context(viewport={"width": 380, "height": 460}).new_page()
    pop.goto(app.srv.base_url + f"?token={app.ctx.token}&popout=storyline&mode=compact&shell=browser")
    pop.wait_for_selector(".objective")
    before = pop.locator(".objective").inner_text()
    pop.locator(".step input.check").first.check()
    pop.wait_for_timeout(700)
    after = pop.locator(".objective").inner_text()
    assert before != after  # advanced to the next step
    page.wait_for_timeout(800)  # main window re-renders via SSE
    assert page.locator(".step.current .s-text").inner_text() == after
    pop.context.close()


@pytest.mark.skipif(not DUMPS, reason="needs POKEMMO_DUMPS_DIR")
def test_breeding_preview_brace_and_everstone(app, page):
    go(page, app, "#/tools/breeding")
    pickers = page.locator(".parent-card input[list]")
    pickers.nth(0).fill("Raichu")
    pickers.nth(0).dispatch_event("change")
    pickers.nth(1).fill("Pikachu")
    pickers.nth(1).dispatch_event("change")
    page.wait_for_timeout(400)
    page.locator("select[aria-label='Parent A gender']").select_option("male")
    page.locator("select[aria-label='Parent B gender']").select_option("female")
    page.locator("select[aria-label='Parent B held item']").select_option("Power Anklet")
    page.locator("input[aria-label='Parent B Spe IV']").fill("31")
    page.wait_for_timeout(700)
    cells = page.locator(".offspring-card .iv-cell")
    assert "guaranteed" in cells.nth(5).get_attribute("class") and cells.nth(5).inner_text() == "31"
    assert re.search(r"Compatible", page.locator(".compat").inner_text())
    assert "consumed" in page.locator(".main").inner_text()

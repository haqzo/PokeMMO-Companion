"""End-to-end UI flows in headless Chromium (browser mode).

Needs: pip install playwright && python -m playwright install chromium
(or CHROME_PATH=/path/to/chrome). Set POKEMMO_DUMPS_DIR to include imported-data flows.
"""
import os
import re
import shutil
import time

import pytest

pw = pytest.importorskip("playwright.sync_api")
pytestmark = pytest.mark.ui

from companion.app import AppContext  # noqa: E402
from companion.server import CompanionServer  # noqa: E402

DUMPS = os.environ.get("POKEMMO_DUMPS_DIR")
CHROME = os.environ.get("CHROME_PATH") or (shutil.which("google-chrome") or shutil.which("chromium"))


class Running:
    def __init__(self, data_dir, *, internal_reporting=False):
        self.ctx = AppContext(str(data_dir), internal_reporting=internal_reporting)
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
    pg.set_default_timeout(15000)
    pg.set_default_navigation_timeout(15000)
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
              "#/tools/team", "#/tools/ev", "#/tools/catch", "#/live", "#/live/legendaries", "#/live/cave", "#/guides", "#/guides/storyline", "#/guides/mine",
              "#/settings", "#/settings/windows", "#/settings/notifications", "#/settings/sources", "#/settings/guides",
              "#/settings/data", "#/settings/about"]
    go(page, app, "#/home")
    for r in routes:
        page.evaluate(f"location.hash = '{r}'")
        page.wait_for_timeout(450)
        assert page.locator(".main").inner_text().strip(), r
    assert page.errors == []


def test_nav_orientation_switch_keeps_current_page(app, page):
    go(page, app, "#/settings/layout")
    page.get_by_role("radio", name="Horizontal").click()
    page.wait_for_selector(".app.nav-horizontal")
    assert page.url.endswith("#/settings/layout")
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
    assert "No ongoing or upcoming official events" in page.locator(".main").inner_text()


def test_pokedex_search_detail_and_favourite(app, page):
    go(page, app, "#/pokedex")
    page.fill("#dex-search", "pikachu")
    page.wait_for_timeout(400)
    assert page.locator(".dex-grid .dex-card").count() == 1
    page.locator(".dex-grid .dex-card").first.click()
    page.wait_for_selector(".detail-head h2")
    assert page.locator(".detail-head h2").inner_text() == "Pikachu"
    page.locator(".detail-head .fav-btn").click()
    page.wait_for_timeout(300)
    assert app.ctx.storage.query_one("SELECT 1 AS x FROM favourites WHERE species_id=25")


def test_pokedex_filters_show_and_clear(app, page):
    go(page, app, "#/pokedex")
    page.get_by_role("radio", name="V", exact=True).click()
    page.wait_for_timeout(400)
    assert "156 of 649 Pokémon shown" in page.locator(".dex-info").inner_text()  # one tile per Gen V species
    page.locator(".active-filters button", has_text="Clear all").click()
    page.wait_for_timeout(400)
    assert "649 of 649 Pokémon shown" in page.locator(".dex-info").inner_text()


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
        go(page, a, "#/guides/storyline")
        if page.get_by_role("button", name="Create run").count():
            page.get_by_role("button", name="Create run").click()
        else:
            page.locator(".run-pill").click()
            page.get_by_role("button", name="New run…", exact=True).click()
        _create_run(page, "Haqzo", "Main")
        with page.expect_response(lambda r: r.request.method == "POST" and r.url.split("?", 1)[0].endswith("/steps")) as saved:
            page.locator(".step input.check").nth(0).check()
        assert saved.value.ok
        page.locator(".run-pill").click()
        page.get_by_role("button", name="New run…", exact=True).click()
        _create_run(page, "Haqzo", "Alt")
        pw.expect(page.locator(".run-pill")).to_contain_text("Alt")
        page.locator(".step input.check").first.wait_for()
        pw.expect(page.locator(".step input.check:checked")).to_have_count(0)
        with page.expect_response(lambda r: r.request.method == "POST" and r.url.split("?", 1)[0].endswith("/steps")) as saved:
            page.locator(".step input.check").nth(2).check()
        assert saved.value.ok
        page.evaluate("location.hash = '#/guides/storyline'")
    finally:
        a.stop()
    # full restart: new backend process state, same data folder
    b = Running(data_dir)
    try:
        page.goto(b.url("#/guides/storyline"))
        pw.expect(page.locator(".run-pill")).to_contain_text("Alt")
        pw.expect(page.locator(".step input.check").nth(2)).to_be_checked()
        pw.expect(page.locator(".step input.check:checked")).to_have_count(1)
        page.locator(".run-pill").click()
        page.locator(".menu button", has_text="Haqzo · Main").click()
        pw.expect(page.locator(".run-pill")).to_contain_text("Main")
        pw.expect(page.locator(".step input.check").nth(0)).to_be_checked()
        pw.expect(page.locator(".step input.check:checked")).to_have_count(1)
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
    go(page, app, "#/guides/storyline")
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


# ------------------------------------------------ video correction pass (2026-11-22)
def test_hide_species_you_marked_not_listed(app, page):
    import json
    import urllib.request

    def mark(value):
        request = urllib.request.Request(app.srv.base_url + "api/dex/roster/640",
            data=json.dumps({"in_dex": value}).encode(), method="PUT",
            headers={"X-Companion-Token": app.ctx.token, "Content-Type": "application/json"})
        with urllib.request.urlopen(request) as response:
            assert response.status == 200

    app.ctx.dex.user_checks = {}
    mark("no")
    try:
        go(page, app, "#/pokedex")
        tile = page.locator('.dex-card[data-entry="640"]')
        pw.expect(tile).to_have_class(re.compile("absent"))
        page.get_by_role("button", name="Filters").click()
        page.get_by_role("button", name="Hide species I marked “Not listed”").click()
        pw.expect(tile).to_have_count(0)
    finally:
        app.ctx.settings.update({"pokedex.scope": "reference"})
        mark("clear")


@pytest.mark.parametrize("mode", ["compact", "standard", "expanded"])
def test_pokedex_popout_has_no_cap_in_any_mode(app, browser, mode):
    pop = browser.new_context(viewport={"width": 460, "height": 600}).new_page()
    pop.goto(app.srv.base_url + f"?token={app.ctx.token}&popout=pokedex&mode={mode}&shell=browser")
    cards = pop.locator(".popout-body .dex-card")
    pw.expect(cards).to_have_count(649)
    pw.expect(pop.locator(".popout-body")).to_contain_text("649 of 649")
    last = cards.last
    last.scroll_into_view_if_needed()
    assert last.get_attribute("data-entry") == "649" and last.is_visible()
    pop.fill("input[aria-label='Search Pokémon']", "pi")
    pop.wait_for_timeout(400)
    shown = pop.locator(".popout-body .dex-card").count()
    assert 0 < shown < 649 and f"{shown} of 649" in pop.locator(".popout-body").inner_text()
    pop.context.close()


def test_type_chart_crosshair_row_and_column(app, page):
    go(page, app, "#/tools/typechart")
    page.wait_for_selector("table.typechart")
    types = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel"]
    r, c = types.index("flying"), types.index("grass")
    cell = page.locator(f'td[data-r="{r}"][data-c="{c}"]')
    cell.hover()
    assert "Flying attack → Grass defender: 2×" in page.locator(".tc-readout").inner_text()
    assert "hl-row" in page.locator(f'th[data-r="{r}"]').get_attribute("class")
    assert "hl-col" in page.locator(f'th[data-c="{c}"]').get_attribute("class")
    assert "hl-x" in cell.get_attribute("class")
    assert page.locator("td.hl-row").count() == 17 and page.locator("td.hl-col").count() == 17
    cell.click()  # lock
    page.locator(f'td[data-r="{types.index("electric")}"][data-c="{types.index("water")}"]').hover()
    assert "Flying attack → Grass defender" in page.locator(".tc-readout").inner_text()  # still locked
    page.keyboard.press("ArrowDown")  # moves locked focus to Psychic → Grass
    assert "Psychic attack → Grass defender: 1×" in page.locator(".tc-readout").inner_text()
    page.keyboard.press("Escape")
    assert page.locator("td.hl-x").count() == 0
    for a, d, txt in [("ice", "flying", "2×"), ("electric", "ground", "0×"), ("normal", "ghost", "0×"), ("grass", "water", "2×")]:
        page.locator(f'td[data-r="{types.index(a)}"][data-c="{types.index(d)}"]').hover()
        assert f"{a.capitalize()} attack → {d.capitalize()} defender: {txt}" in page.locator(".tc-readout").inner_text()
    assert "fairy" not in page.locator("table.typechart").inner_text().lower()


@pytest.mark.parametrize(("lang", "fire", "full", "unlock", "defensive", "offensive"), [
    ("en", "Fire", "Full chart", "Unlock (Esc)", "Defensive check", "Offensive check"),
    ("es", "Fuego", "Tabla completa", "Desbloquear (Esc)", "Análisis defensivo", "Análisis ofensivo"),
    ("zh", "火", "完整相克表", "解锁（Esc）", "防守分析", "进攻分析"),
])
def test_type_chart_badges_and_optional_unlock_in_each_language(app, page, lang, fire, full, unlock, defensive, offensive):
    app.ctx.settings.update({"app.language": lang})
    try:
        go(page, app, "#/tools/typechart")
        page.locator(".compare-panel").wait_for()
        chip = page.locator('th.colhead .type-chip.t-fire')
        assert chip.text_content().casefold() == fire.casefold()
        assert chip.evaluate("""el => {
          const s = getComputedStyle(el.parentElement);
          return [s.writingMode, s.textOrientation, s.transform];
        }""") == ["vertical-rl", "mixed", "none"]
        readout = page.locator(".tc-readout")
        cell = page.locator('td[data-r="9"][data-c="4"]')
        cell.hover()
        assert "2×" in readout.inner_text() and "null" not in readout.text_content()
        assert readout.get_by_role("button").count() == 0
        cell.focus()
        cell.press("Enter")
        readout.get_by_role("button", name=unlock).click()
        assert page.locator("td.hl-x").count() == 0 and "null" not in readout.text_content()
        group = page.get_by_role("radiogroup", name={"en": "Column header orientation", "es": "Orientación de las columnas", "zh": "列标题方向"}[lang])
        assert page.locator(".typechart").get_attribute("data-header-orientation") == "vertical"
        for index, orientation in enumerate(("vertical", "horizontal")):
            if index:
                group.get_by_role("radio").nth(index).click()
            assert chip.evaluate("el => getComputedStyle(el.parentElement).writingMode") == (
                "vertical-rl" if orientation == "vertical" else "horizontal-tb")
            for row, column, value in [(1, 4, "2×"), (4, 1, "½×")]:
                target = page.locator(f'td[data-r="{row}"][data-c="{column}"]')
                target.hover()
                pw.expect(readout).to_contain_text(value)
                pw.expect(target).to_have_class(re.compile("hl-x"))
                assert page.locator("td.hl-row").count() == 17 and page.locator("td.hl-col").count() == 17
        pw.expect(group.get_by_role("radio").nth(1)).to_have_attribute("aria-checked", "true")
        for _ in range(30):
            if app.ctx.settings.get("typechart.header_orientation") == "horizontal":
                break
            time.sleep(.03)
        assert app.ctx.settings.get("typechart.header_orientation") == "horizontal"
        app.ctx.settings.update({"appearance.text_scale": 120, "appearance.high_contrast": lang == "zh",
                                 "appearance.theme": {"base": "arctic"} if lang == "es" else None})
        page.set_viewport_size({"width": 410, "height": 580})
        for mode in ("compact", "standard", "expanded"):
            page.goto(app.srv.url("", popout="typechart", mode=mode))
            body = page.locator(f".mode-{mode} .popout-body")
            body.get_by_role("heading", name=offensive, exact=True).wait_for()
            if mode != "expanded":
                assert body.locator(".typechart").count() == 0
                body.get_by_role("radio", name=full, exact=True).click()
            assert body.locator("th.colhead").count() == 17 and body.locator("td").count() == 289
            assert body.locator("table.typechart").get_attribute("data-header-orientation") == "horizontal"
            assert body.locator(".tc-scroll").evaluate("el => el.scrollWidth <= el.clientWidth + 1")
            assert body.locator("thead th.colhead").first.evaluate("el => getComputedStyle(el).position") == "sticky"
            assert body.locator("tbody th.rowhead").first.evaluate("el => getComputedStyle(el).position") == "sticky"
            assert body.locator(".compare-panel").count() == 0
            for name in (defensive, offensive):
                checker = body.locator(".card").filter(has=page.get_by_role("heading", name=name, exact=True))
                checker.locator("button:has(.t-fire)").click()
                assert checker.locator(".mult.m2").inner_text() == "2×"
        assert page.errors == []
    finally:
        app.ctx.settings.update({"typechart.header_orientation": "vertical", "appearance.text_scale": 100, "appearance.high_contrast": False, "appearance.theme": None})
        app.ctx.settings.update({"app.language": "en"})


def test_type_chart_popout_keeps_the_selected_view_and_sizes_the_same_grid(app, page):
    page.set_viewport_size({"width": 360, "height": 440})
    page.goto(app.srv.url("", popout="typechart", mode="compact"))
    page.get_by_role("radio", name="Full chart").click()
    grid = page.locator("table.typechart")
    scroll = page.locator(".tc-scroll")
    cell = grid.locator('td[data-r="1"][data-c="4"]')
    cell.evaluate("el => { el.dataset.gridMarker = 'retained'; }")
    compact = cell.bounding_box()
    assert scroll.evaluate("el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1")
    for mode, width, height in [("Standard", 600, 600), ("Expanded", 780, 740)]:
        page.get_by_title(mode + " view", exact=True).click()
        page.set_viewport_size({"width": width, "height": height})
        pw.expect(page.locator(".popout-root")).to_have_class(re.compile("mode-" + mode.lower()))
        pw.expect(page.get_by_role("radio", name="Full chart")).to_have_attribute("aria-checked", "true")
        assert scroll.evaluate("el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1")
        assert cell.get_attribute("data-grid-marker") == "retained"
        assert cell.bounding_box()["width"] > compact["width"] and cell.bounding_box()["height"] > compact["height"]
    page.set_viewport_size({"width": 260, "height": 180})
    assert scroll.evaluate("el => el.scrollWidth > el.clientWidth && el.scrollHeight > el.clientHeight")
    assert cell.evaluate("el => parseFloat(getComputedStyle(el).fontSize)") >= 9
    page.get_by_role("radio", name="Focus one type").click()
    for mode in ("Compact", "Standard", "Expanded"):
        page.get_by_title(mode + " view", exact=True).click()
        pw.expect(page.get_by_role("radio", name="Focus one type")).to_have_attribute("aria-checked", "true")
        assert grid.count() == 0


def test_live_and_home_show_partial_coverage_and_keep_cached_reports(app, page):
    live = app.ctx.live
    app.ctx.settings.update({"live.ntfy.enabled": True, "live.ntfy.consented": True})
    try:
        live._health("connected", success=True)
        go(page, app, "#/live/reports")
        page.get_by_text("Community reports cover only some encounters.", exact=False).wait_for()
        page.get_by_text("No Alpha or Swarm reported recently.", exact=False).wait_for()
        report = live.ingest({"id": "browser-fixture", "topic": "alphapings", "time": int(time.time()),
                              "title": "Ditto", "message": "Kanto, Cerulean Cave"}, replay=True)
        go(page, app, "#/home")
        page.get_by_text("Reports may be missing", exact=False).wait_for()
        card = page.locator(f'.cur-card[data-report="{report["id"]}"]')
        assert "Ambiguous location" in card.inner_text()
        live._health("offline")
        go(page, app, f'#/live/reports/{report["id"]}')
        page.get_by_text("recent reports may be missing", exact=False).wait_for()
        page.locator("p").get_by_text("Ambiguous location", exact=True).wait_for()
        card.wait_for()
        assert page.errors == []
    finally:
        app.ctx.settings.update({"live.ntfy.enabled": False, "live.ntfy.consented": False})
        live.clear()


def test_quick_access_pin_reorder_unpin_and_persist(app, page):
    app.ctx.settings.update({"nav.quick_access": [], "appearance.nav": "vertical"})
    go(page, app, "#/tools/natures")
    page.get_by_role("button", name="Pin to sidebar").click()
    page.wait_for_selector(".quick .qa-item")
    go(page, app, "#/tools/typechart")
    page.get_by_role("button", name="Pin to sidebar").click()
    page.wait_for_timeout(400)
    labels = page.locator(".quick .qa-item .label").all_inner_texts()
    assert labels == ["Natures", "Type matchups"]
    page.locator(".quick .qa-item").nth(1).focus()
    page.keyboard.press("Alt+ArrowUp")  # keyboard reorder
    page.wait_for_timeout(500)
    assert page.locator(".quick .qa-item .label").all_inner_texts() == ["Type matchups", "Natures"]
    # drag a tool card from the hub into the sidebar
    go(page, app, "#/tools")
    page.locator(".tool-card", has_text="Team builder").drag_to(page.locator(".quick"), timeout=8000)
    page.wait_for_timeout(600)
    assert "Team builder" in page.locator(".quick").inner_text()
    go(page, app, "#/pokedex/25")
    page.wait_for_selector(".detail-head h2")
    page.locator(".detail-head").get_by_role("button", name="Pin to sidebar").click()  # dragging a card is covered by the manual tour
    page.wait_for_timeout(600)
    assert "Pikachu" in page.locator(".quick").inner_text()
    page.reload()
    page.wait_for_selector(".dex-summary .detail-head h2")  # the reloaded route reopens the Summary (it takes focus)
    page.keyboard.press("Escape")
    page.wait_for_selector(".quick .qa-item")
    assert page.locator(".quick .qa-item .label").all_inner_texts()[:2] == ["Type matchups", "Natures"]
    page.locator(".quick .qa-item").first.focus()
    page.keyboard.press("Delete")
    page.wait_for_timeout(500)
    assert "Type matchups" not in page.locator(".quick").inner_text()
    page.locator(".quick .qa-item", has_text="Natures").click()
    page.wait_for_timeout(400)
    assert page.url.endswith("#/tools/natures")
    app.ctx.settings.update({"appearance.nav": "horizontal"})
    page.reload()
    page.wait_for_selector(".quick-strip .qa-item")
    assert page.locator(".quick-strip .qa-item").count() >= 1
    app.ctx.settings.update({"appearance.nav": "vertical"})


def test_home_has_no_blocking_modal_and_keeps_news_details(app, page):
    go(page, app, "#/home")
    page.wait_for_selector(".home-update")
    page.wait_for_selector(".home-news")
    assert page.locator(".modal-back").count() == 0
    txt = page.locator(".main").inner_text()
    for part in ("Latest official update", "Official events", "Quick access", "Alpha & Swarm", "Roaming Legendaries", "More official updates"):
        assert part.lower() in txt.lower(), part
    # the news-source status now lives in the latest-update card's footer (check now, provenance, feed state)
    foot = page.locator(".home-update .update-foot")
    assert foot.get_by_role("button", name="Check now").count() == 1 and "Summaries written" in foot.get_attribute("title")
    page.get_by_role("button", name="Read details").click()
    page.wait_for_selector("article")


@pytest.mark.skipif(not DUMPS, reason="needs POKEMMO_DUMPS_DIR")
def test_manual_registration_tracking_shows_silhouettes_and_counts(app, page):
    run = app.ctx.guides.create_run("Tracker")
    go(page, app, "#/pokedex")
    page.select_option("select[aria-label='Registration tracking']", run["id"])
    for _ in range(60):                     # the grid redraws with 649 artwork tiles (built-in sprites since 2026-11-24)
        if page.locator(".dex-grid .dex-card.reg-unregistered").count() > 600:
            break
        page.wait_for_timeout(100)
    assert page.locator(".dex-grid .dex-card.reg-unregistered").count() > 600
    assert page.locator(".dex-grid .sprite.unseen").count() > 600
    page.locator('.dex-grid .dex-card[data-id="25"]').click()
    page.wait_for_selector(".detail-head h2")
    page.get_by_role("button", name="My registration").click()
    page.get_by_role("radio", name="Caught OT").click()
    page.wait_for_timeout(500)
    go(page, app, "#/pokedex")
    page.wait_for_timeout(600)
    assert "reg-caught_ot" in page.locator('.dex-grid .dex-card[data-id="25"]').get_attribute("class")
    assert "Caught OT 1" in page.locator(".dex-info").inner_text().replace("\n", " ")
    app.ctx.settings.update({"pokedex.progress_run": None})

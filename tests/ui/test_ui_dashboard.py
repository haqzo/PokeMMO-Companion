"""UI: unified moves table, calculator, navigation, Collection, Home dashboard, roaming Legendaries and the
Live current/history split with estimated timers (2026-11-23 pass)."""
import sys
import time
from pathlib import Path

import pytest

from tests.ui.test_ui_flows import DUMPS, app, browser, data_dir, go, page  # noqa: F401  (fixtures)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gifgen import make_gif, make_png  # noqa: E402

pytestmark = pytest.mark.ui
needs_dumps = pytest.mark.skipif(not DUMPS, reason="needs POKEMMO_DUMPS_DIR")


# ---------------------------------------------------------------- A. moves table
@needs_dumps
def test_one_moves_table_with_methods_sorting_and_filters(app, page):
    go(page, app, "#/pokedex/6?tab=moves")
    page.wait_for_selector(".dex-summary .moves-table")
    assert page.locator(".dex-summary .moves-table").count() == 1  # one continuous table
    heads = page.locator(".moves-table thead th").all_inner_texts()
    assert [x.replace("▾", "").strip() for x in heads] == ["Method", "Level", "Move", "Type", "Category", "Power", "Accuracy", "PP"]
    air = page.locator('.moves-table tr[data-move="Air Slash"] .mv-badge').all_inner_texts()
    assert [x.replace("?", "").strip() for x in air] == ["Start", "Evolve", "TM"]
    flare = page.locator('.moves-table tr[data-move="Flare Blitz"]')
    assert "1, 54" in flare.inner_text()  # every level kept on the grouped row
    tm = page.locator('.moves-table tr[data-move="Air Slash"] a.mv-badge')
    assert tm.get_attribute("href").startswith("#/tools/items/") and "TM??" in tm.get_attribute("title")
    assert "your client lists these as “TM??”" in page.locator(".dex-summary").inner_text()
    total = page.locator(".moves-table tbody tr").count()
    assert total == 122
    page.locator(".moves-tools").get_by_role("button", name="TM/HM").click()
    rows = page.locator(".moves-table tbody tr")
    assert 0 < rows.count() < total and all("TM" in t or "HM" in t for t in rows.locator(".mv-methods").all_inner_texts())
    page.locator(".moves-tools").get_by_role("button", name="All").click()
    page.locator(".moves-table").get_by_role("button", name="Move").click()
    names = page.locator(".moves-table tbody .mv-name").all_inner_texts()
    assert names == sorted(names, key=str.lower) or names == sorted(names)
    page.locator(".moves-table").get_by_role("button", name="Level").click()
    first = page.locator(".moves-table tbody tr").first.locator("td").nth(1).inner_text()
    assert first.startswith("1")
    page.locator(".moves-table").get_by_role("button", name="Type").click()
    types = page.locator(".moves-table tbody tr .type-chip").all_inner_texts()
    assert types == sorted(types, key=str.lower)
    page.keyboard.press("Escape")


@needs_dumps
def test_moves_table_in_the_pokedex_popout(app, browser):  # noqa: F811
    pop = browser.new_context(viewport={"width": 460, "height": 640}).new_page()
    pop.goto(app.srv.base_url + f"?token={app.ctx.token}&popout=pokedex&mode=standard&shell=browser#/species/1")
    pop.wait_for_selector(".detail-tabs")
    pop.locator(".detail-tabs").get_by_role("tab", name="Moves").click()
    pop.wait_for_selector(".moves-table tbody tr")
    assert pop.locator(".moves-table").count() == 1 and pop.locator(".moves-scroll").evaluate("e => getComputedStyle(e).overflow") == "auto"
    pop.context.close()


# ---------------------------------------------------------------- A. calculator
def _calc_out(page):
    return page.locator(".calc-out").inner_text()


def test_calculator_keyboard_and_exact_decimals(app, page):
    go(page, app, "#/tools/calculator")
    page.wait_for_selector(".calc")
    for keys, want in (("0.1+0.2", "0.3"), ("12+7*2", "38"), ("1/3", "0.333333333333"), ("200+10%", "220"), ("9-12", "-3")):
        page.keyboard.press("Escape")
        page.keyboard.type(keys)
        page.keyboard.press("Enter")
        assert _calc_out(page) == want, keys
    page.keyboard.press("Escape")
    page.keyboard.type("5/0")
    page.keyboard.press("Enter")
    assert _calc_out(page) == "Can't divide by zero"
    page.keyboard.type("7")
    assert _calc_out(page) == "7"
    page.keyboard.type("89")
    page.keyboard.press("Backspace")
    assert _calc_out(page) == "78"
    page.keyboard.press("F9")
    assert _calc_out(page) == "-78"
    page.keyboard.press("Escape")
    assert _calc_out(page) == "0"
    # buttons work too, and the pending operator is shown
    for k in ("8", "Multiply", "5", "Equals (Enter)"):
        page.locator(".calc-pad").get_by_role("button", name=k, exact=True).click()
    assert _calc_out(page) == "40"


def test_calculator_engine_table(app, page):
    go(page, app, "#/tools/calculator")
    res = page.evaluate("""async () => { const { createCalc } = await import('/js/calcengine.js');
        const run = (k) => createCalc().run(k);
        return [run(['0','.','1','+','0','.','2','=']), run(['2','*','3','=','=']), run(['5','+','=']), run(['5','0','%']),
                run(['1','2','3','4','5','6','7','*','1','0','0','0','=']), run(['7','+','3','=','*','2','=']), run(['2','/','3','='])]; }""")
    assert res == ["0.3", "18", "10", "0.5", "1 234 567 000", "20", "0.666666666667"]


def test_calculator_ignores_typing_elsewhere_and_has_a_popout(app, page, browser):  # noqa: F811
    go(page, app, "#/tools/calculator")
    page.wait_for_selector(".calc")
    page.evaluate("() => { const i = document.createElement('input'); i.id = 'other'; document.body.append(i); }")
    page.focus("#other")
    page.keyboard.type("42")
    assert _calc_out(page) == "0"
    page.evaluate("document.getElementById('other').remove()")
    pop = browser.new_context(viewport={"width": 300, "height": 420}).new_page()
    pop.goto(app.srv.base_url + f"?token={app.ctx.token}&popout=calculator&mode=standard&shell=browser")
    pop.wait_for_selector(".calc .calc-pad")
    pop.keyboard.type("6*7")
    pop.keyboard.press("Enter")
    assert pop.locator(".calc-out").inner_text() == "42"
    pop.context.close()


# ---------------------------------------------------------------- B. navigation & Collection
def test_main_navigation_entries_and_active_state(app, page):
    app.ctx.settings.update({"appearance.nav": "vertical"})
    go(page, app, "#/home")
    labels = page.locator("aside.sidebar nav .nav-item .label").all_inner_texts()
    assert labels == ["Home", "Pokédex", "Type matchups", "Notes", "Collection", "Tools", "Live", "Guides"]
    page.locator('aside.sidebar .nav-item[data-nav="typechart"]').click()
    page.wait_for_timeout(300)
    assert page.url.endswith("#/tools/typechart")
    assert page.locator('.nav-item[data-nav="typechart"]').get_attribute("aria-current") == "page"
    assert page.locator('.nav-item[data-nav="tools"]').get_attribute("aria-current") != "page"
    page.keyboard.press("Alt+5")
    page.wait_for_timeout(300)
    assert page.url.endswith("#/collection")
    page.keyboard.press("Alt+4")
    page.wait_for_timeout(300)
    assert page.url.endswith("#/tools/notes")


@pytest.mark.parametrize("width", [1600, 1100, 760])
def test_horizontal_navigation_never_overflows(app, browser, width):  # noqa: F811
    app.ctx.settings.update({"appearance.nav": "horizontal"})
    try:
        pg = browser.new_context(viewport={"width": width, "height": 600}).new_page()
        pg.goto(app.url("#/home"))
        pg.wait_for_selector(".topbar nav .nav-item")
        fits = pg.evaluate("""() => { const t = document.querySelector('.topbar'), n = t.querySelector('nav');
            const gear = t.querySelector('.icon-btn[aria-label=Settings]').getBoundingClientRect();
            return [t.scrollWidth <= t.clientWidth + 1, n.scrollWidth <= n.clientWidth + 1, gear.right <= innerWidth + 1]; }""")
        assert fits == [True, True, True], width
        assert pg.locator(".topbar nav .nav-item").count() == 8
        pg.context.close()
    finally:
        app.ctx.settings.update({"appearance.nav": "vertical"})


def test_collection_keeps_box_and_showcase_records_and_old_links(app, page):
    e = app.ctx.box.save({"species_id": 25, "nickname": "Sparky", "shiny": True})
    sc = app.ctx.showcases.create({"name": "Stream"}) if hasattr(app.ctx.showcases, "create") else None
    before = len(app.ctx.box.list())
    go(page, app, "#/tools/box/" + e["id"])  # legacy link
    page.wait_for_selector(".collection-head")
    assert page.url.endswith("#/collection/pokemon/" + e["id"])
    page.wait_for_selector(".box-grid [aria-label^='Sparky']")
    page.wait_for_selector(".dex-detail")  # the entry editor opens next to the list
    go(page, app, "#/tools/showcase")
    page.wait_for_selector(".collection-head")
    assert page.url.endswith("#/collection/showcases")
    assert page.locator(".collection-tabs .tab.active").inner_text() == "Showcases"
    page.locator(".collection-tabs").get_by_role("tab", name="My Pokémon").click()
    page.wait_for_selector(".box-grid")
    assert page.locator(".box-grid .box-card, .box-grid [role=button]").count() == before
    assert len(app.ctx.box.list()) == before  # nothing created or migrated by visiting
    if sc:
        assert app.ctx.showcases.get(sc["id"])["name"] == "Stream"


def test_collection_never_imports_pokedex_entries(app, page):
    for x in app.ctx.box.list():
        app.ctx.box.delete(x["id"])
    run = app.ctx.guides.create_run("Importer check")
    app.ctx.storage.execute("INSERT OR IGNORE INTO favourites(species_id) VALUES (1)") if app.ctx.storage.query("SELECT name FROM sqlite_master WHERE name='favourites'") else None
    go(page, app, "#/collection")
    page.wait_for_selector(".collection-head")
    assert "Your Box is empty" in page.locator(".main").inner_text()
    assert app.ctx.box.list() == []
    del run


# ---------------------------------------------------------------- C. Home
def test_home_default_sections(app, page):
    app.ctx.settings.update({"home.sections": ["roamers", "live", "update", "news", "events", "quick"]})
    go(page, app, "#/home")
    page.wait_for_selector(".home-roamers")
    for sel in (".home-roamers", ".home-live", ".home-update", ".home-news", ".home-events", ".home-quick"):
        assert page.locator(sel).count() == 1, sel
    for sel in (".home-run", ".home-favs"):
        assert page.locator(sel).count() == 0, sel
    txt = page.locator(".main").inner_text()
    assert "Altering Cave" not in txt and "Official news source" not in txt
    assert "Community-documented cycle" in page.locator(".home-roamers .src-info").get_attribute("title")
    assert page.locator(".home-update .update-foot").get_by_role("button", name="Check now").count() == 1


def test_home_sections_can_be_turned_on_and_legacy_lists_are_kept(app, page):
    app.ctx.settings.update({"home.sections": ["update", "events", "live", "shortcuts"]})  # saved by an earlier build
    go(page, app, "#/home")
    page.wait_for_selector(".home-update")
    for sel in (".home-update", ".home-news", ".home-events", ".home-live", ".home-roamers", ".home-quick", ".home-run"):
        assert page.locator(sel).count() == 1, sel
    go(page, app, "#/settings/home")                 # Settings › Home (2026-11-24: own section, with ordering)
    page.wait_for_selector(".home-order")
    fav = page.locator(".home-order-row", has_text="Favourite Pokémon")
    assert not fav.locator("input").is_checked()
    fav.locator("input").check()
    page.wait_for_timeout(500)
    assert "favourites" in app.ctx.settings.get("home.sections") and "run" in app.ctx.settings.get("home.sections")
    go(page, app, "#/home")
    page.wait_for_selector(".home-favs")
    app.ctx.settings.update({"home.sections": ["roamers", "live", "update", "news", "events", "quick"]})


def _library(app, tmp_path, ids):
    bw = tmp_path / "s/sprites/pokemon/versions/generation-v/black-white"
    (bw / "animated").mkdir(parents=True)
    for sid in ids:
        (bw / f"animated/{sid}.gif").write_bytes(make_gif(80, 64, seed=sid))
        (bw / f"{sid}.png").write_bytes(make_png(96, 96, box=(10, 12, 86, 84)))
    app.ctx.sprite_library.import_from(tmp_path / "s")


def test_roamers_animated_with_motion_and_still_with_reduced_motion(app, browser, tmp_path):  # noqa: F811
    leg = app.ctx.live.legendaries(None)["current"]
    _library(app, tmp_path, [leg["kanto"]["id"], leg["johto"]["id"]])
    app.ctx.settings.update({"pokedex.animate": None})
    try:
        pg = browser.new_context(viewport={"width": 1500, "height": 900}).new_page()
        pg.goto(app.url("#/home"))
        pg.wait_for_selector(".home-roamers .roamer img")
        assert pg.locator(".home-roamers img[src*='/ani/']").count() == 2
        assert pg.locator("img[src*='.gif']").count() == 2  # only the two roamers animate on Home
        names = pg.locator(".home-roamers .roamer-name").all_inner_texts()
        assert names == [leg["kanto"]["name"], leg["johto"]["name"]]
        pg.context.close()
        rm = browser.new_context(viewport={"width": 1500, "height": 900}, reduced_motion="reduce").new_page()
        rm.goto(app.url("#/home"))
        rm.wait_for_selector(".home-roamers .roamer img")
        assert rm.locator("img[src*='.gif']").count() == 0 and rm.locator(".home-roamers img[src*='/static/']").count() == 2
        rm.context.close()
    finally:
        app.ctx.sprite_library.remove()


def test_home_is_compact_at_several_widths(app, browser):  # noqa: F811
    for w in (1600, 1100, 820):
        pg = browser.new_context(viewport={"width": w, "height": 900}).new_page()
        pg.goto(app.url("#/home"))
        pg.wait_for_selector(".home-update")
        over = pg.evaluate("() => { const p = document.querySelector('.home-page'); return p.scrollWidth - p.clientWidth; }")
        assert over <= 1, (w, over)
        pg.context.close()


# ---------------------------------------------------------------- D. Live
def _seed(app):
    app.ctx.storage.execute("DELETE FROM reports")
    now = int(time.time())
    ing = lambda mid, topic, t, b, ago, rep=False: app.ctx.live.ingest(  # noqa: E731
        {"id": mid, "event": "message", "time": now - ago * 60, "topic": topic, "title": t, "message": b}, replay=rep)
    ing("s1", "swarmpings", "Houndoom", "Johto\nBurned Tower (1F)", 6)
    ing("s2", "swarmpings", "Houndoom", "Johto\nBurned Tower 1F", 4)
    ing("a1", "alphapings", "Magmortar", "Sinnoh, Stark Mountain", 12)
    ing("o1", "swarmpings", "Slakoth", "Unova\nRoute 2", 300, True)
    app.ctx.live.create_test("alpha")


def test_live_current_section_then_history(app, page):
    _seed(app)
    go(page, app, "#/live/reports")
    page.wait_for_selector(".cur-grid .cur-card")
    cards = page.locator(".cur-grid .cur-card")
    assert cards.count() == 2
    hound = page.locator(".cur-card", has_text="Houndoom")
    assert "reported 2×" in hound.inner_text()
    assert "left · est." in hound.locator(".cur-estimate[data-tone=ok]").inner_text()
    mag = page.locator(".cur-card", has_text="Magmortar")
    assert "1 h" in mag.locator(".cur-estimate[data-tone=ok]").inner_text()  # 75-minute Alpha estimate, 12 min in
    assert page.locator(".cur-grid", has_text="TEST").count() == 0 and page.locator(".cur-grid", has_text="Slakoth").count() == 0
    hist = page.locator("h2", has_text="Report history")
    assert hist.count() == 1
    assert page.locator(".report-row", has_text="Slakoth").count() == 1 and page.locator(".report-row", has_text="TEST").count() >= 1
    assert "Replayed history" in page.locator(".report-row", has_text="Slakoth").inner_text()
    assert "community estimate, not official" in page.locator(".main").inner_text()
    # switching pages and coming back re-renders the timers
    go(page, app, "#/home")
    page.wait_for_selector(".home-live .cur-card")
    assert "left (estimate)" in page.locator(".home-live .cur-card", has_text="Houndoom").inner_text()
    go(page, app, "#/live/reports")
    page.wait_for_selector(".live-cur .cur-estimate[data-tone=ok]")
    page.locator(".cur-card", has_text="Magmortar").click()
    page.wait_for_selector(".card dl.kv")
    assert "Alpha duration 75 min (official changelog)" in page.locator(".card dl.kv").inner_text()
    app.ctx.storage.execute("DELETE FROM reports")


def test_live_timer_counts_down_and_reclassifies(app, page):
    app.ctx.storage.execute("DELETE FROM reports")
    now = int(time.time())
    app.ctx.live.ingest({"id": "q1", "event": "message", "time": now - 20 * 60 + 10, "topic": "swarmpings", "title": "Zubat", "message": "Kanto\nRoute 3"})
    page.clock.install()
    go(page, app, "#/live/reports")
    page.wait_for_selector(".live-cur .cur-estimate[data-tone=ok]")
    page.clock.fast_forward(12_000)
    assert page.locator(".live-cur .cur-estimate[data-tone=ended]").inner_text() == "Estimate ended"
    app.ctx.storage.execute("DELETE FROM reports")

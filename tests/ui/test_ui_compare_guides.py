"""UI: Type Matchups › Compare two Pokémon (main page only) and the All guides landing (2026-11-24)."""
import pytest

from tests.ui.test_ui_flows import DUMPS, app, browser, data_dir, go, page  # noqa: F401  (fixtures)

pytestmark = pytest.mark.ui


def _pick(page, side, query, name):
    page.locator(f'input[aria-label="Pokémon {side}"]').fill(query)
    page.locator(".cmp-hit", has_text=name).first.click()
    page.wait_for_selector(f'.cmp-side[data-side="{side - 1}"]')


def _eff(page, row):
    return page.locator(".cmp-dir").nth(row).inner_text()


def test_compare_two_pokemon_both_directions_and_moves(app, page):  # noqa: F811
    page.set_viewport_size({"width": 1600, "height": 1000})
    go(page, app, "#/tools/typechart")
    page.wait_for_selector(".compare-panel")
    chart = page.locator(".tc-layout > .stack").bounding_box()
    panel = page.locator(".compare-panel").bounding_box()
    assert panel["x"] > chart["x"] + chart["width"] - 1                      # beside the chart on wide windows
    _pick(page, 1, "charizard", "Charizard")
    _pick(page, 2, "74", "Geodude")                                          # by National Dex number
    a_vs_b, b_vs_a = _eff(page, 0), _eff(page, 1)
    assert "FIRE\n½×" in a_vs_b and "FLYING\n½×" in a_vs_b                   # dual type: fire vs rock/ground ½×
    assert "ROCK\n4×" in b_vs_a and "GROUND\n0×" in b_vs_a                   # rock vs fire/flying 4×, ground immune
    # Charizard's moves against Geodude: real learnset, status moves marked, STAB shown
    moves = page.locator('.cmp-moves[data-side="0"]')
    assert moves.locator("tbody tr").count() > 20
    flame = moves.locator("tbody tr", has_text="Flamethrower").first
    assert "½×" in flame.inner_text() and "STAB" in flame.inner_text()
    moves.locator('select[aria-label="Category"]').select_option("Status")
    moves = page.locator('.cmp-moves[data-side="0"]')
    rows = moves.locator("tbody tr")
    assert rows.count() > 0 and all(t.split("\t")[3].strip() == "—" for t in rows.evaluate_all("els => els.map(e => e.innerText)"))
    moves.locator('select[aria-label="Category"]').select_option("")
    # pick at most four moves
    boxes = page.locator('.cmp-moves[data-side="0"] tbody input[type=checkbox]')
    for i in range(4):
        page.locator('.cmp-moves[data-side="0"] tbody input[type=checkbox]').nth(i).check()
    assert page.locator('.cmp-moves[data-side="0"] .cmp-chosen .chip').count() == 4
    assert page.locator('.cmp-moves[data-side="0"] tbody input[type=checkbox]').nth(5).is_disabled()
    # ¼×: Venusaur's Grass against Charizard
    page.get_by_role("button", name="Clear Geodude").click()
    _pick(page, 2, "venusaur", "Venusaur")
    assert "GRASS\n¼×" in _eff(page, 1) and "FIRE\n2×" in _eff(page, 0)
    page.get_by_role("button", name="Clear Venusaur").click()
    _pick(page, 2, "74", "Geodude")
    # swap and clear
    page.get_by_role("button", name="Swap sides").click()
    assert "Geodude" in page.locator('.cmp-side[data-side="0"]').inner_text()
    assert "Geodude" in page.locator(".cmp-dir").nth(0).inner_text().split("attacking")[0]
    page.get_by_role("button", name="Clear Geodude").click()
    assert page.locator('input[aria-label="Pokémon 1"]').count() == 1 and page.locator(".cmp-moves").count() == 0
    assert not page.errors


def test_compare_form_typing_immunity_and_ability_note(app, page):  # noqa: F811
    go(page, app, "#/tools/typechart")
    page.wait_for_selector(".compare-panel")
    for side in (1, 2):                                                      # memory from the previous test cleared
        clear = page.locator(f'.cmp-side[data-side="{side - 1}"] button', has_text="Clear")
        if clear.count():
            clear.click()
    _pick(page, 1, "wash", "Wash Rotom")
    assert "ELECTRIC" in page.locator('.cmp-side[data-side="0"]').inner_text().upper()
    assert "WATER" in page.locator('.cmp-side[data-side="0"]').inner_text().upper()
    assert "Levitate" in page.locator('.cmp-side[data-side="0"]').inner_text()      # named, never applied silently
    _pick(page, 2, "gengar", "Gengar")
    assert "WATER\n1×" in _eff(page, 0) and "ELECTRIC\n1×" in _eff(page, 0)
    assert "GHOST\n1×" in _eff(page, 1)
    assert "not a battle simulator" in page.locator(".compare-panel").inner_text()


def test_compare_is_below_the_chart_when_narrow_and_absent_from_the_popout(app, browser):  # noqa: F811
    ctx = browser.new_context(viewport={"width": 1000, "height": 800})
    pg = ctx.new_page()
    pg.goto(app.url("#/tools/typechart"))
    pg.wait_for_selector(".compare-panel")
    chart = pg.locator(".tc-layout > .stack").bounding_box()
    panel = pg.locator(".compare-panel").bounding_box()
    assert panel["y"] >= chart["y"] + chart["height"] - 1
    assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    pop = ctx.new_page()
    pop.goto(app.srv.url("", popout="typechart"))
    pop.wait_for_selector(".popout-body")
    pop.wait_for_timeout(1500)
    assert pop.locator(".popout-body").inner_text().strip()                  # the chart rendered
    assert pop.locator(".compare-panel").count() == 0 and pop.locator(".cmp-sides").count() == 0
    ctx.close()


def test_all_guides_landing_aligned_and_browsable_without_a_run(app, page):  # noqa: F811
    page.set_viewport_size({"width": 1400, "height": 900})
    go(page, app, "#/guides")
    page.wait_for_selector(".guides-region")
    cards = page.locator(".guides-all > .card")
    a, b = cards.nth(0).bounding_box(), cards.nth(1).bounding_box()
    assert abs(a["y"] - b["y"]) < 1 and abs(a["height"] - b["height"]) < 1
    assert page.locator(".guides-region").count() == 5
    assert page.locator(".guides-cats .chip").count() >= 6                     # category shortcuts, no fake guides
    page.locator('.guides-region[data-region="johto"]').click()
    page.wait_for_selector(".browse-chapter, .step-list, .steps")
    if page.locator(".browse-chapter").count():
        assert "read only" in page.locator(".page-head").inner_text()
        page.locator("input[aria-label='Search steps']").fill("Violet")
        page.wait_for_timeout(200)
        assert page.locator(".browse-chapter").count() >= 1
        assert "original guide author" in page.locator(".main").inner_text()
    page.set_viewport_size({"width": 700, "height": 900})
    go(page, app, "#/guides")
    page.wait_for_selector(".guides-region")
    a, b = cards.nth(0).bounding_box(), cards.nth(1).bounding_box()
    assert b["y"] >= a["y"] + a["height"] - 1                               # stacked on narrow windows


def _clear_sides(page):
    for side in (0, 1):
        clear = page.locator(f'.cmp-side[data-side="{side}"] button', has_text="Clear")
        if clear.count():
            clear.click()


def test_compare_mudkip_vs_treecko_and_moves_without_details(app, page):  # noqa: F811
    """Native failure 2026-11-24: Snowscape has no type/category/power in the PokeMMO data (164 learners, incl.
    Mudkip and Treecko). The old code looked its type up in the chart → `undefined[4]` and nothing rendered.
    The earlier tests only used Pokémon that do not learn it."""
    go(page, app, "#/tools/typechart")
    page.wait_for_selector(".compare-panel")
    _clear_sides(page)
    _pick(page, 1, "mudkip", "Mudkip")
    _pick(page, 2, "treecko", "Treecko")
    assert "WATER\n½×" in _eff(page, 0) and "GRASS\n2×" in _eff(page, 1)
    for side in (0, 1):
        assert page.locator(f'.cmp-moves[data-side="{side}"] tbody tr').count() > 10
    snow = page.locator('.cmp-moves[data-side="0"] tbody tr', has_text="Snowscape")        # Mudkip learns it (TM)
    assert snow.count() == 1 and "awaiting verification" in snow.inner_text()
    assert "STAB" not in snow.inner_text() and "×" not in snow.inner_text()               # nothing invented
    for key in ("Type", "Pow", "Move"):                                                  # every sort copes with it
        page.locator('.cmp-moves[data-side="0"] th', has_text=key).first.click()
    assert page.locator('.cmp-moves[data-side="0"] tbody tr').count() > 10
    assert not page.errors, page.errors


def test_compare_sweep_has_no_errors(app, page):  # noqa: F811
    go(page, app, "#/tools/typechart")
    page.wait_for_selector(".compare-panel")
    pairs = [("bulbasaur", "Bulbasaur", "charmander", "Charmander"), ("pikachu", "Pikachu", "gengar", "Gengar"),
             ("lapras", "Lapras", "snorlax", "Snorlax"), ("swampert", "Swampert", "sceptile", "Sceptile"),
             ("piplup", "Piplup", "turtwig", "Turtwig"), ("frost", "Frost Rotom", "kyogre", "Kyogre"),
             ("oshawott", "Oshawott", "snivy", "Snivy"), ("sandy", "Wormadam (Sandy Cloak)", "abomasnow", "Abomasnow")]
    for q1, n1, q2, n2 in pairs:
        _clear_sides(page)
        _pick(page, 1, q1, n1)
        _pick(page, 2, q2, n2)
        assert page.locator('.cmp-moves[data-side="1"] tbody tr').count() > 0, (n1, n2)
    assert not page.errors, page.errors


def test_compare_never_crashes_on_unknown_or_oddly_cased_types(app, browser):  # noqa: F811
    """Imported or future data may carry other casing, an unknown type or missing fields: shown as unknown,
    never an invented multiplier, never an exception."""
    import json as _json
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000})
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))

    def tamper(route):
        resp = route.fetch()
        d = resp.json()
        d["types"] = ["WATER", "fairy"]
        d["moves"] = (d.get("moves") or [])[:5] + [
            {"id": 9001, "name": "Odd Move", "type": "Fairy", "category": "Special", "power": 80, "accuracy": 100, "pp": 10, "method": "level", "level": 5},
            {"id": 9002, "name": "Caps Move", "type": "GRASS", "category": "Physical", "power": 60, "accuracy": 100, "pp": 20, "method": "TUTOR"},
            {"id": 9003, "name": "Bare Move", "method": "TM??"}]
        route.fulfill(response=resp, body=_json.dumps(d), headers={**resp.headers, "content-type": "application/json"})
    pg.route("**/api/dex/species/258?*", tamper)
    pg.goto(app.url("#/tools/typechart"))
    pg.wait_for_selector(".compare-panel")
    _clear_sides(pg)
    _pick(pg, 1, "mudkip", "Mudkip")
    _pick(pg, 2, "treecko", "Treecko")
    txt = pg.locator(".compare-panel").inner_text()
    assert "unknown" in _eff(pg, 0)                                  # the "fairy" attacking type is not in the 17-type chart
    assert "GRASS\nunknown" in _eff(pg, 1)                         # against an unknown defending type: no number
    assert "Caps Move" in txt and "Odd Move" in txt and "Bare Move" in txt
    odd = pg.locator('.cmp-moves[data-side="0"] tbody tr', has_text="Odd Move")
    assert "×" not in odd.inner_text()
    caps = pg.locator('.cmp-moves[data-side="0"] tbody tr', has_text="Caps Move")
    assert "½×" in caps.inner_text()                                # GRASS → grass vs Treecko: ½×
    assert not errors, errors
    ctx.close()

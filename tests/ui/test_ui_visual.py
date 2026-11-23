"""Visual/rendering regressions checked with real computed styles and measured boxes (2026-11-23 polish):
CSS custom properties, the 17 type badges, stat bars in both Appearance modes, proportion-aware artwork
scaling in the Summary and popouts, Gen V grid stills, and library art in Home/Live."""
import sys
from pathlib import Path

import pytest

from tests.ui.test_ui_flows import DUMPS, app, browser, data_dir, go, page  # noqa: F401  (fixtures)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gifgen import make_gif, make_png  # noqa: E402

pytestmark = pytest.mark.ui
TYPES = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying", "psychic", "bug",
         "rock", "ghost", "dragon", "dark", "steel"]
# Natural sizes of the real PokéAPI Gen V animations (measured 2026-11-23): Charmander line, Lugia, Frost Rotom.
SIZES = {"4": (41, 42), "5": (66, 56), "6": (87, 89), "249": (153, 94), "479-frost": (113, 87), "130": (90, 80),
         "151": (40, 30), "492": (36, 36), "25": (50, 46)}
FILL = {"xs": 0.4, "s": 0.55, "m": 0.74, "l": 0.94}  # mirrors SIZE_TIER_FILL in ui/js/core.js


def expected_scale(w, h, tier, fw, fh, bbox=None):
    """Python mirror of fitSprite(): tier share of the frame, never below native unless needed to fit, max 4×."""
    x0, y0, x1, y1 = bbox or (0, 0, w, h)
    bw, bh = x1 - x0, y1 - y0
    return min(max(FILL[tier] * min(fw, fh) / max(bw, bh), 1), fw / bw, fh / bh, 4)


def _until(page, expr, timeout=15000):
    for _ in range(timeout // 100):
        if page.evaluate(expr):
            return
        page.wait_for_timeout(100)
    raise AssertionError("timed out waiting for " + expr)


def _rgb(s):
    return tuple(int(x) for x in s[s.index("(") + 1:s.index(")")].split(",")[:3])


def _lum(c):
    v = [x / 255 for x in c]
    v = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in v]
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]


def _contrast(a, b):
    la, lb = sorted([_lum(a), _lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


@pytest.fixture
def library(app, tmp_path):
    bw = tmp_path / "s/sprites/pokemon/versions/generation-v/black-white"
    (bw / "animated/shiny").mkdir(parents=True)
    for k, (w, h) in SIZES.items():
        (bw / f"animated/{k}.gif").write_bytes(make_gif(w, h, seed=len(k)))
    (bw / "animated/shiny/4.gif").write_bytes(make_gif(41, 42, colour=(240, 200, 60)))
    (bw / "4.png").write_bytes(make_png(96, 96, box=(30, 29, 68, 71), palette=True))
    (bw / "6.png").write_bytes(make_png(96, 96, box=(9, 8, 83, 88)))
    (bw / "130.png").write_bytes(make_png(96, 96, box=(5, 6, 91, 90)))
    app.ctx.sprite_library.import_from(tmp_path / "s")
    app.ctx.settings.update({"pokedex.animate": None})
    yield app.ctx.sprite_library
    app.ctx.sprite_library.remove()


# ---------------------------------------------------------------- 1. CSS custom properties
def test_h_helper_sets_css_custom_properties(app, page):
    go(page, app, "#/home")
    res = page.evaluate("""async () => {
        const { h } = await import('/js/core.js');
        const el = h('div', { style: { '--probe': 'rgb(1, 2, 3)', background: 'var(--probe)', width: '10px' } });
        document.body.append(el);
        const cs = getComputedStyle(el);
        const out = [cs.getPropertyValue('--probe').trim(), cs.backgroundColor, cs.width];
        el.remove(); return out; }""")
    assert res == ["rgb(1, 2, 3)", "rgb(1, 2, 3)", "10px"]


# ---------------------------------------------------------------- 2. type badges
def test_all_17_type_badges_have_their_colour_and_readable_labels(app, page):
    go(page, app, "#/home")
    res = page.evaluate("""async (types) => {
        const { typeChip, TYPE_LIST } = await import('/js/core.js');
        const host = document.createElement('div'); document.body.append(host);
        const probe = document.createElement('span'); host.append(probe);
        const out = {};
        for (const t of types) {
          const c = typeChip(t); host.append(c);
          probe.style.color = `var(--type-${t})`;
          const cs = getComputedStyle(c);
          out[t] = [cs.backgroundColor, cs.color, getComputedStyle(probe).color, c.textContent];
        }
        host.remove(); return [out, TYPE_LIST]; }""", TYPES)
    badges, listed = res
    assert listed == TYPES and "fairy" not in listed
    for t, (bg, fg, token, text) in badges.items():
        assert bg == token, f"{t}: badge {bg} != token {token}"
        assert bg not in ("rgb(85, 85, 85)", "rgba(0, 0, 0, 0)"), t  # the old grey fallback
        assert text == t
        assert _contrast(_rgb(bg), _rgb(fg)) >= 4.5, f"{t} label contrast too low"


@pytest.mark.skipif(not DUMPS, reason="needs POKEMMO_DUMPS_DIR")
def test_badges_coloured_in_summary_tiles_moves_and_popout(app, page, browser):  # noqa: F811
    go(page, app, "#/pokedex/149")
    page.wait_for_selector(".dex-summary .detail-head .type-chip")
    head = page.locator(".dex-summary .detail-head .type-chip").evaluate_all("els => els.map(e => [e.textContent, getComputedStyle(e).backgroundColor])")
    assert head == [["dragon", "rgb(111, 53, 252)"], ["flying", "rgb(168, 178, 244)"]]
    tile = page.locator('.dex-card[data-id="6"] .type-chip').first.evaluate("e => getComputedStyle(e).backgroundColor")
    assert tile == "rgb(238, 129, 48)"  # Fire
    page.locator(".dex-summary .detail-tabs").get_by_role("tab", name="Type Matchups").click()
    page.wait_for_timeout(300)
    assert all(c != "rgb(85, 85, 85)" for c in page.locator(".dex-summary .type-chip").evaluate_all("els => els.map(e => getComputedStyle(e).backgroundColor)"))
    pop = browser.new_context(viewport={"width": 460, "height": 640}).new_page()
    pop.goto(app.srv.base_url + f"?token={app.ctx.token}&popout=pokedex&mode=standard&shell=browser#/species/479/frost")
    pop.wait_for_selector(".detail-head .type-chip")
    assert pop.locator(".detail-head .type-chip").evaluate_all("els => els.map(e => getComputedStyle(e).backgroundColor)") == ["rgb(247, 208, 44)", "rgb(150, 217, 214)"]
    pop.context.close()


# ---------------------------------------------------------------- 3. stat bars
@pytest.mark.skipif(not DUMPS, reason="needs POKEMMO_DUMPS_DIR")
@pytest.mark.parametrize("mode", ["soft", "accent"])
def test_stat_bars_colours_and_proportions(app, page, mode):
    app.ctx.settings.update({"appearance.stat_bars": mode})
    try:
        for sid, stats in ((149, {"hp": 91, "attack": 134, "speed": 80}), (4, {"hp": 39, "speed": 65}), (242, {"hp": 255, "attack": 10})):
            go(page, app, f"#/pokedex/{sid}?tab=stats")
            page.wait_for_selector(".dex-summary .stat-row .bar > span")
            rows = page.locator(".dex-summary .stat-row[data-stat]").evaluate_all("""els => els.map(e => { const s = e.querySelector('.bar > span');
                return [e.dataset.stat, getComputedStyle(e).getPropertyValue('--bc').trim(), getComputedStyle(s).backgroundImage,
                        s.getBoundingClientRect().width / s.parentElement.getBoundingClientRect().width, +e.querySelector('.val').textContent]; })""")
            tokens = page.evaluate("""() => { const r = getComputedStyle(document.documentElement);
                return Object.fromEntries(['hp','attack','defense','sp_attack','sp_defense','speed','single'].map(k => [k, r.getPropertyValue('--stat-' + k).trim()])); }""")
            seen = set()
            for k, bc, img, frac, val in rows:
                expected = tokens["single"] if mode == "accent" else tokens[k]
                assert bc == expected, (sid, k, bc, expected)
                assert "gradient" in img and "255, 255, 255)" not in img.split("linear-gradient")[1][:30]  # not the old white fallback
                assert abs(frac - val / 255) < 0.02, (sid, k, frac, val)
                seen.add(bc)
                if k in stats:
                    assert val == stats[k]
            assert len(seen) == (1 if mode == "accent" else 6)
            total = page.locator(".dex-summary .stat-row.total")
            assert total.count() == 1 and int(total.locator(".val").inner_text()) == sum(r[4] for r in rows)
    finally:
        app.ctx.settings.update({"appearance.stat_bars": "soft"})


# ---------------------------------------------------------------- 4. artwork scaling
def _art(page, sel=".dex-summary .detail-head .art"):
    page.wait_for_selector(sel + " .art-img")
    _until(page, f"(() => {{ const e = document.querySelector('{sel} .art-img'); return e && e.style.visibility === '' && e.dataset.scale; }})()")
    return page.evaluate(f"""() => {{ const e = document.querySelector('{sel} .art-img'), b = document.querySelector('{sel}');
        const r = e.getBoundingClientRect(), f = b.getBoundingClientRect();
        return {{ w: r.width, h: r.height, nw: e.naturalWidth || e.width, nh: e.naturalHeight || e.height, k: +e.dataset.scale,
                 inside: r.left >= f.left - 0.5 && r.right <= f.right + 0.5 && r.top >= f.top - 0.5 && r.bottom <= f.bottom + 0.5,
                 rendering: getComputedStyle(e).imageRendering, cx: (r.left + r.right) / 2 - (f.left + f.right) / 2 }}; }}""")


def _tier(app, sid):
    return app.ctx.dex.size_tier(int(sid))["tier"]


def test_summary_uses_the_shared_size_rule(app, page, library):
    for sid in ("4", "5", "6", "151", "492", "25", "249"):
        go(page, app, f"#/pokedex/{sid}")
        a = _art(page)
        w, h = SIZES[sid]
        tier = _tier(app, sid)
        assert page.locator(".dex-summary .art .art-img").get_attribute("data-tier") == tier
        assert abs(a["k"] - expected_scale(w, h, tier, 238, 210)) < 0.02, (sid, a["k"])  # frame 240×212 minus border
        assert a["inside"] and abs(a["cx"]) < 1.5 and abs(a["w"] / a["h"] - w / h) < 0.03 and a["k"] <= 4


def test_mythical_gets_the_large_tier_even_when_tiny(app, page, library):
    go(page, app, "#/pokedex/151")   # Mew: 0.4 m, Mythical
    mew = _art(page)
    go(page, app, "#/pokedex/25")    # Pikachu: 0.4 m, ordinary
    pika = _art(page)
    assert _tier(app, 151) == "l" and abs(mew["k"] - expected_scale(40, 30, "l", 238, 210)) < 0.02
    if _tier(app, 25) == "xs":  # with your dump's heights Pikachu (0.4 m) is extra-small, Mew (0.4 m, Mythical) large
        assert mew["w"] > pika["w"] * 1.4
    go(page, app, "#/pokedex/492")   # Shaymin: 36 px sprite → large tier, capped at 4× (no blocky blow-up)
    sh = _art(page)
    assert sh["k"] == 4 and sh["w"] == 144


@pytest.mark.skipif(not DUMPS, reason="needs POKEMMO_DUMPS_DIR (species heights)")
def test_evolution_line_grows_with_real_height(app, page, library):
    got = {}
    for sid in ("4", "5", "6"):
        go(page, app, f"#/pokedex/{sid}")
        got[sid] = _art(page)
    assert [_tier(app, s) for s in ("4", "5", "6")] == ["s", "m", "l"]
    longer = {s: max(a["w"], a["h"]) for s, a in got.items()}
    assert longer["4"] < longer["5"] < longer["6"]


def test_oversized_art_is_shrunk_to_fit_never_clipped(app, page, library):
    for route, key in (("#/pokedex/249", "249"), ("#/pokedex/479/frost", "479-frost")):
        go(page, app, route)
        a = _art(page)
        assert a["inside"] and a["k"] <= 4
        assert abs(a["w"] / a["h"] - SIZES[key][0] / SIZES[key][1]) < 0.03


@pytest.mark.parametrize("mode,size", [("compact", (380, 520)), ("standard", (460, 640)), ("expanded", (760, 820))])
def test_popout_modes_use_the_same_rule(app, browser, library, mode, size):  # noqa: F811
    pop = browser.new_context(viewport={"width": size[0], "height": size[1]}).new_page()
    res = {}
    for sid in ("4", "6", "151", "249"):
        pop.goto(app.srv.base_url + f"?token={app.ctx.token}&popout=pokedex&mode={mode}&shell=browser#/species/{sid}")
        res[sid] = _art(pop, ".detail-head .art")
        fw, fh = pop.locator(".detail-head .art").evaluate("e => [e.clientWidth, e.clientHeight]")
        assert abs(res[sid]["k"] - expected_scale(*SIZES[sid], _tier(app, sid), fw, fh)) < 0.02, (mode, sid)
        assert res[sid]["inside"]
    assert max(res["151"]["w"], res["151"]["h"]) >= max(res["4"]["w"], res["4"]["h"])  # Mythical never smaller than Charmander
    pop.context.close()


def test_art_refits_when_the_window_is_resized(app, browser, library):  # noqa: F811
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    pg = ctx.new_page()
    pg.goto(app.url("#/pokedex/6"))
    big = _art(pg)
    pg.set_viewport_size({"width": 640, "height": 760})
    pg.wait_for_timeout(500)
    small = _art(pg)
    assert small["w"] < big["w"] and small["inside"]
    ctx.close()


def test_shiny_pause_and_reduced_motion_keep_the_same_tier(app, browser, library):  # noqa: F811
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    pg = ctx.new_page()
    pg.goto(app.url("#/pokedex/4"))
    normal = _art(pg)
    pg.locator(".dex-summary .art").get_by_role("button", name="Shiny colours").click()
    pg.wait_for_selector(".dex-summary .art img[src*='ani-shiny/4.gif']")
    shiny = _art(pg)
    assert shiny["w"] == normal["w"] and shiny["k"] == normal["k"]  # same tier, same size
    pg.locator(".dex-summary .art").get_by_role("button", name="Shiny colours").click()
    pg.locator(".dex-summary .art").get_by_role("button", name="Animate sprite").click()
    pg.wait_for_selector(".dex-summary .art img[src*='/static/4.png']")
    still = _art(pg)
    # the still's VISIBLE outline (bbox 38×42 inside a 96 px canvas) is sized like the animation's
    assert abs(still["k"] - expected_scale(96, 96, _tier(app, 4), 238, 210, (30, 29, 68, 71))) < 0.02
    # only transparent canvas may extend past the frame: the visible outline (30,29)-(68,71) stays inside
    inside = pg.evaluate("""() => { const e = document.querySelector('.dex-summary .art .art-img'), f = document.querySelector('.dex-summary .art').getBoundingClientRect();
        const r = e.getBoundingClientRect(), k = r.width / 96;
        return [r.left + 30 * k >= f.left - .5 && r.left + 68 * k <= f.right + .5 && r.top + 29 * k >= f.top - .5 && r.top + 71 * k <= f.bottom + .5,
                [r.left, r.top, r.width], [f.left, f.top, f.right, f.bottom], e.getAttribute('style')]; }""")
    assert inside[0], inside
    assert abs(42 * still["k"] - 42 * normal["k"]) < 8
    app.ctx.settings.update({"pokedex.animate": None})
    ctx.close()
    rm = browser.new_context(viewport={"width": 1400, "height": 900}, reduced_motion="reduce")
    pg = rm.new_page()
    pg.goto(app.url("#/pokedex/5"))
    a = _art(pg)
    el = pg.locator(".dex-summary .art .art-img")
    tag, src = el.evaluate("e => e.tagName"), el.get_attribute("src") or ""
    assert tag == "CANVAS" or ".gif" not in src  # no animation with reduced motion
    assert a["k"] <= 4 and el.get_attribute("data-tier") == _tier(app, 5)
    rm.close()


# ---------------------------------------------------------------- 5. grid stills
def test_grid_uses_trimmed_gen5_stills_with_the_same_size_rule(app, page, library):
    go(page, app, "#/pokedex")
    page.wait_for_selector('.dex-card[data-id="4"] .still-art img')
    info = page.evaluate("""() => Object.fromEntries(['4', '6', '25'].map(id => { const c = document.querySelector(`.dex-card[data-id="${id}"]`);
        const s = c.querySelector('.still-art'); const i = s && s.querySelector('img'); const r = i && i.getBoundingClientRect(), f = s && s.getBoundingClientRect();
        return [id, { tile: c.getBoundingClientRect().width, box: s ? f.width : null, k: s ? +s.dataset.scale : null, tier: s && s.dataset.tier,
                      src: i ? i.getAttribute('src') : null }]; }))""")
    assert info["4"]["src"].startswith("/assets/library/static/4.png") and info["6"]["src"].startswith("/assets/library/static/6.png")
    assert info["4"]["box"] == 72 and info["4"]["tile"] == info["25"]["tile"]  # same tile size with or without a still
    for sid, bbox in (("4", (30, 29, 68, 71)), ("6", (9, 8, 83, 88))):
        assert info[sid]["tier"] == _tier(app, sid)
        assert abs(info[sid]["k"] - expected_scale(96, 96, info[sid]["tier"], 72, 72, bbox)) < 0.01
    assert not page.locator(".dex-grid img[src$='.gif'], .dex-grid img[src*='.gif?']").count()  # no animations in the grid


# ---------------------------------------------------------------- 6. Home / Live
def _reports(app):
    app.ctx.storage.execute("DELETE FROM reports")
    ing = lambda mid, t, b, topic: app.ctx.live.ingest(  # noqa: E731
        {"id": mid, "event": "message", "time": 1_763_000_000, "topic": topic, "title": t, "message": b}, replay=True)
    return ing("g1", "Gyarados", "Kanto, Route 12", "alpha"), ing("x1", "Swarm", "Unova, Route 6 — Deerling and Emolga reported", "swarm")


def test_home_and_live_use_library_art_selectively(app, browser, library):  # noqa: F811
    g, amb = _reports(app)
    t = app.ctx.live.create_test("alpha")
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000})
    pg = ctx.new_page()
    pg.goto(app.url("#/home"))
    pg.wait_for_selector(".area-live .live-row .still-art img")
    rows = pg.locator(".area-live .live-row")
    assert rows.nth(0).locator(".still-art img").get_attribute("src").startswith("/assets/library/static/130.png")
    assert rows.nth(1).locator(".rep-fallback").count() == 1 and rows.nth(1).locator("img").count() == 0
    assert pg.locator(".area-live img[src*='.gif']").count() == 0  # Home rows never animate
    assert "Kanto, Route 12" in rows.nth(0).inner_text()
    pg.goto(app.url("#/live/reports/" + g["id"]))
    pg.wait_for_selector(".rep-detail-head img.rep-ani")
    assert pg.locator(".rep-detail-head img.rep-ani").get_attribute("src").startswith("/assets/library/ani/130.gif")
    assert pg.locator("img[src*='.gif']").count() == 1  # exactly one animation on the page
    assert "TEST · NOT REAL" in pg.locator(".report-row", has_text="TEST — demo").inner_text().upper()
    ctx.close()
    rm = browser.new_context(viewport={"width": 1600, "height": 1000}, reduced_motion="reduce")
    pg = rm.new_page()
    pg.goto(app.url("#/live/reports/" + g["id"]))
    pg.wait_for_selector(".rep-detail-head .still-art img")
    assert pg.locator("img[src*='.gif']").count() == 0
    rm.close()
    app.ctx.storage.execute("DELETE FROM reports")

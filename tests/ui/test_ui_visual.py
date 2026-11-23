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
SIZES = {"4": (41, 42), "5": (66, 56), "6": (87, 89), "249": (153, 94), "479-frost": (113, 87), "130": (90, 80)}


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
    assert head == [["dragon", "rgb(106, 60, 240)"], ["flying", "rgb(168, 144, 240)"]]
    tile = page.locator('.dex-card[data-id="6"] .type-chip').first.evaluate("e => getComputedStyle(e).backgroundColor")
    assert tile == "rgb(204, 137, 87)"  # Fire
    page.locator(".dex-summary .detail-tabs").get_by_role("tab", name="Type Matchups").click()
    page.wait_for_timeout(300)
    assert all(c != "rgb(85, 85, 85)" for c in page.locator(".dex-summary .type-chip").evaluate_all("els => els.map(e => getComputedStyle(e).backgroundColor)"))
    pop = browser.new_context(viewport={"width": 460, "height": 640}).new_page()
    pop.goto(app.srv.base_url + f"?token={app.ctx.token}&popout=pokedex&mode=standard&shell=browser#/species/479/frost")
    pop.wait_for_selector(".detail-head .type-chip")
    assert pop.locator(".detail-head .type-chip").evaluate_all("els => els.map(e => getComputedStyle(e).backgroundColor)") == ["rgb(232, 197, 52)", "rgb(153, 205, 202)"]
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


def test_evolution_line_keeps_relative_sizes_in_summary(app, page, library):
    got = {}
    for sid in ("4", "5", "6"):
        go(page, app, f"#/pokedex/{sid}")
        a = _art(page)
        got[sid] = a
        assert a["k"] == 2 and a["inside"] and a["rendering"] == "pixelated" and abs(a["cx"]) < 1.5
        assert abs(a["w"] / a["h"] - SIZES[sid][0] / SIZES[sid][1]) < 0.02  # aspect kept
    assert got["4"]["h"] < got["5"]["h"] < got["6"]["h"]  # Charmander < Charmeleon < Charizard
    assert got["4"]["w"] == 82 and got["6"]["w"] == 174


def test_oversized_art_is_shrunk_to_fit_never_clipped(app, page, library):
    for route, key in (("#/pokedex/249", "249"), ("#/pokedex/479/frost", "479-frost")):
        go(page, app, route)
        a = _art(page)
        assert a["inside"] and a["k"] <= 2
        assert abs(a["w"] / a["h"] - SIZES[key][0] / SIZES[key][1]) < 0.02


@pytest.mark.parametrize("mode,size,k", [("compact", (380, 520), 1), ("standard", (460, 640), 1), ("expanded", (760, 820), 2)])
def test_popout_modes_use_one_scale_for_all(app, browser, library, mode, size, k):  # noqa: F811
    pop = browser.new_context(viewport={"width": size[0], "height": size[1]}).new_page()
    res = {}
    for sid in ("4", "6", "249"):
        pop.goto(app.srv.base_url + f"?token={app.ctx.token}&popout=pokedex&mode={mode}&shell=browser#/species/{sid}")
        res[sid] = _art(pop, ".detail-head .art")
        assert res[sid]["inside"]
    assert res["4"]["k"] == k and res["6"]["k"] == k and res["249"]["k"] <= k
    assert res["4"]["h"] < res["6"]["h"]
    pop.context.close()


def test_art_refits_when_the_window_is_resized(app, browser, library):  # noqa: F811
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    pg = ctx.new_page()
    pg.goto(app.url("#/pokedex/6"))
    assert _art(pg)["k"] == 2
    pg.set_viewport_size({"width": 640, "height": 760})
    pg.wait_for_timeout(500)
    a = _art(pg)
    assert a["k"] == 1 and a["inside"]
    ctx.close()


def test_shiny_pause_and_reduced_motion_still_work(app, browser, library):  # noqa: F811
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    pg = ctx.new_page()
    pg.goto(app.url("#/pokedex/4"))
    _art(pg)
    pg.locator(".dex-summary .art").get_by_role("button", name="Shiny colours").click()
    pg.wait_for_selector(".dex-summary .art img[src*='ani-shiny/4.gif']")
    assert _art(pg)["w"] == 82
    pg.locator(".dex-summary .art").get_by_role("button", name="Shiny colours").click()
    pg.locator(".dex-summary .art").get_by_role("button", name="Animate sprite").click()
    pg.wait_for_selector(".dex-summary .art img[src*='/static/4.png']")
    still = _art(pg)
    assert still["k"] == 2 and still["w"] == 192  # 96 px still canvas at the same 2× scale
    app.ctx.settings.update({"pokedex.animate": None})
    ctx.close()
    rm = browser.new_context(viewport={"width": 1400, "height": 900}, reduced_motion="reduce")
    pg = rm.new_page()
    pg.goto(app.url("#/pokedex/5"))
    a = _art(pg)
    el = pg.locator(".dex-summary .art .art-img")
    tag, src = el.evaluate("e => e.tagName"), el.get_attribute("src") or ""
    # no animation: either your client's still battle sprite (96 px canvas) or the animation's first frame on a canvas
    assert tag == "CANVAS" or (".gif" not in src and "/battle/5-front" in src)
    assert a["k"] == 2 and a["w"] == (132 if tag == "CANVAS" else 192)
    rm.close()


# ---------------------------------------------------------------- 5. grid stills
def test_grid_uses_trimmed_gen5_stills_and_keeps_tile_size(app, page, library):
    go(page, app, "#/pokedex")
    page.wait_for_selector('.dex-card[data-id="4"] .still-art img')
    info = page.evaluate("""() => Object.fromEntries(['4', '6', '25'].map(id => { const c = document.querySelector(`.dex-card[data-id="${id}"]`);
        const s = c.querySelector('.still-art'); const i = s && s.querySelector('img');
        return [id, { tile: c.getBoundingClientRect().width, box: s ? s.getBoundingClientRect().width : null, k: s ? +s.dataset.scale : null,
                      src: i ? i.getAttribute('src') : c.querySelector('img') && c.querySelector('img').getAttribute('src') }]; }))""")
    assert info["4"]["src"].startswith("/assets/library/static/4.png") and info["6"]["src"].startswith("/assets/library/static/6.png")
    assert info["4"]["box"] == 72 and info["4"]["tile"] == info["25"]["tile"]  # same tile size with or without a still
    assert info["4"]["k"] == 1.5 and info["6"]["k"] < 1  # small: at most 1.5×; big: shrunk to fit
    vis4 = 42 * info["4"]["k"]
    vis6 = 80 * info["6"]["k"]
    assert vis4 < vis6  # Charmander still reads smaller than Charizard
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

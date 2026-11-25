"""UI: Alpha/Swarm report sprites (Home + Live), Pokédex loading regressions, Summary artwork
(animated / shiny / still / missing) and the Listed/Not-listed view (2026-11-23 pass)."""
import sys
from pathlib import Path

import pytest

from tests.ui.test_ui_flows import DUMPS, app, browser, data_dir, go, page  # noqa: F401  (fixtures)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gifgen import make_gif, make_png  # noqa: E402

pytestmark = pytest.mark.ui
needs_dumps = pytest.mark.skipif(not DUMPS, reason="needs POKEMMO_DUMPS_DIR")


def _reports(app):
    """Recent reports (so they count as current) on Alphapedia's real topics; received on reconnect (replay)."""
    import time
    app.ctx.storage.execute("DELETE FROM reports")
    now = int(time.time())
    ing = lambda mid, title, body, topic, ago: app.ctx.live.ingest(  # noqa: E731
        {"id": mid, "event": "message", "time": now - ago * 60, "topic": topic, "title": title, "message": body}, replay=True)
    a = ing("g1", "Gyarados", "Kanto, Route 12", "alphapings", 5)
    b = ing("f1", "Swarm spotted", "Hoenn, Route 119 — Feebas swarm", "swarmpings", 7)
    c = ing("x1", "Swarm", "Unova, Route 6 — Deerling and Emolga reported", "swarmpings", 9)
    t = app.ctx.live.create_test("swarm")
    return a, b, c, t


def _until(page, expr, timeout=15000):
    """Poll a JS expression (page.wait_for_function's string form is blocked by the app's CSP)."""
    for _ in range(timeout // 100):
        if page.evaluate(expr):
            return
        page.wait_for_timeout(100)
    raise AssertionError("timed out waiting for " + expr)


def _width(page, sel):
    return page.locator(sel).first.evaluate("e => e.getBoundingClientRect().width")


@needs_dumps
def test_home_live_card_shows_large_sharp_sprites_with_fallbacks(app, browser):  # noqa: F811
    a, b, c, t = _reports(app)
    pg = browser.new_context(viewport={"width": 1600, "height": 1000}).new_page()
    pg.goto(app.url("#/home"))
    pg.wait_for_selector(".home-live .cur-card")
    cards = pg.locator(".home-live .cur-card")
    assert cards.count() == 3  # TEST entries never appear on Home
    names = cards.evaluate_all("els => els.map(e => e.querySelector('.cur-name').textContent)")
    assert set(names) == {"Gyarados", "Feebas", "Swarm"}
    g = pg.locator(".home-live .cur-card", has_text="Gyarados")
    assert g.locator(".rep-sprite img").count() == 1 and "Kanto · Route 12" in g.inner_text()
    # 2026-11-24: the built-in Gen V library is used everywhere (same style as the Pokédex); still → fitted, crisp
    # when it can be scaled by a whole factor, smoothed otherwise (fitSprite decides, as in the Pokédex)
    assert g.locator(".rep-sprite.library img").count() == 1
    amb = pg.locator(".home-live .cur-card", has_text="Swarm").filter(has_not_text="Feebas")
    assert amb.locator(".rep-fallback").count() == 1 and amb.locator("img").count() == 0  # two species named → no sprite
    assert "caught up on reconnect" in g.inner_text() and "left (estimate)" in g.inner_text()
    assert "feed off" in pg.locator(".home-live").inner_text().lower()
    pg.context.close()


@needs_dumps
def test_live_list_and_detail_sprites_and_test_labels(app, browser):  # noqa: F811
    a, b, c, t = _reports(app)
    pg = browser.new_context(viewport={"width": 1600, "height": 1000}).new_page()
    pg.goto(app.url("#/live/reports/" + a["id"]))
    pg.wait_for_selector(".report-row")
    test_row = pg.locator(".report-row", has_text="TEST — demo")
    assert "TEST · NOT REAL" in test_row.inner_text().upper() and test_row.locator(".rep-fallback").count() == 1
    assert _width(pg, ".report-row .rep-sprite") == 72                        # the sprite box; the library still is fitted inside
    assert "received on reconnect" in pg.locator(".report-row", has_text="Gyarados").inner_text()
    pg.wait_for_selector(".rep-detail-head .rep-sprite.battle img")
    assert _width(pg, ".rep-detail-head .rep-sprite.battle") == 192  # 2× the 96 px battle sprite box
    detail = pg.locator(".card", has=pg.locator(".rep-detail-head")).inner_text()
    assert "ntfy / alpha" in detail
    assert "Community report" in pg.locator(".card", has=pg.locator(".rep-detail-head")).locator(".src-info").first.get_attribute("title")
    pg.goto(app.url("#/live/reports/" + c["id"]))
    pg.wait_for_selector(".rep-detail-head")
    assert pg.locator(".rep-detail-head .rep-fallback").count() == 1
    assert "names several Pokémon" in pg.locator(".rep-detail-head").inner_text()
    pg.goto(app.url("#/live/reports/" + t["id"]))
    pg.wait_for_selector(".rep-detail-head")
    assert "TEST NOTIFICATION" in pg.locator(".card", has=pg.locator(".rep-detail-head")).inner_text().upper()
    pg.context.close()


@needs_dumps
def test_report_sprites_shrink_in_narrow_windows_and_popout(app, browser):  # noqa: F811
    _reports(app)
    pg = browser.new_context(viewport={"width": 460, "height": 800}).new_page()
    pg.goto(app.url("#/live/reports"))
    pg.wait_for_selector(".report-row .rep-sprite img")
    assert _width(pg, ".report-row .rep-sprite") == 36
    pop = browser.new_context(viewport={"width": 360, "height": 520}).new_page()
    pop.goto(app.srv.base_url + f"?token={app.ctx.token}&popout=reports&mode=compact&shell=browser")
    pop.wait_for_selector(".report-row .rep-sprite")
    assert pop.locator(".report-row").count() >= 1
    assert all(w <= 72 for w in pop.locator(".report-row .rep-sprite").evaluate_all("els => els.map(e => e.getBoundingClientRect().width)"))
    pg.context.close()
    pop.context.close()


# ---------------------------------------------------------------- Pokédex loading
def test_returning_to_pokedex_releases_cards_without_refetching_data(app, page):
    go(page, app, "#/pokedex")
    _until(page, "document.querySelectorAll('.dex-grid .dex-card').length === 649")
    page.evaluate("document.querySelector('.dex-card[data-id=\"25\"]').__probe = 1")
    reqs = []
    page.on("request", lambda r: reqs.append(r.url))
    page.evaluate("location.hash = '#/home'")
    page.wait_for_selector(".home-page .card")
    page.wait_for_timeout(400)
    page.evaluate("location.hash = '#/pokedex'")
    _until(page, "document.querySelectorAll('.dex-grid .dex-card').length === 649")
    assert page.evaluate("document.querySelector('.dex-card[data-id=\"25\"]').__probe === undefined")  # detached DOM is released on page exit
    assert not [u for u in reqs if "/api/dex/species" in u]  # Home and the return trip use the cached list
    # A card still included in the filter is reused; excluded cards must not stay cached.
    page.evaluate("document.querySelector('.dex-card[data-id=\"25\"]').__probe = 2")
    page.get_by_role("radio", name="I", exact=True).click()
    _until(page, "document.querySelectorAll('.dex-grid .dex-card').length === 151")
    assert page.evaluate("document.querySelector('.dex-card[data-id=\"25\"]').__probe") == 2
    page.get_by_role("radio", name="II", exact=True).click()
    _until(page, "document.querySelectorAll('.dex-grid .dex-card').length === 100")
    page.get_by_role("radio", name="All", exact=True).click()
    _until(page, "document.querySelectorAll('.dex-grid .dex-card').length === 649")
    assert page.evaluate("document.querySelector('.dex-card[data-id=\"25\"]').__probe === undefined")
    heads = page.locator(".gen-head").all_inner_texts()
    assert [h.split("·")[1].strip() for h in heads] == ["151", "100", "135", "107", "156"]
    page.wait_for_timeout(1200)  # filter save debounce


def test_grid_uses_static_lazy_icons_only(app, page):
    go(page, app, "#/pokedex")
    page.wait_for_selector(".dex-grid .dex-card")
    srcs = page.locator(".dex-grid img").evaluate_all("els => els.map(e => [e.getAttribute('src'), e.loading])")
    assert all(not s.split("?")[0].endswith(".gif") for s, _ in srcs)
    assert all(l == "lazy" for _, l in srcs)


@needs_dumps
def test_favourite_and_registration_still_update_cached_cards(app, page):
    run = app.ctx.guides.create_run("CacheCheck")
    go(page, app, "#/pokedex")
    page.wait_for_selector('.dex-card[data-id="1"]')
    page.locator('.dex-card[data-id="1"] .fav-btn').click()
    page.wait_for_timeout(600)
    assert "on" in page.locator('.dex-card[data-id="1"] .fav-btn').get_attribute("class")
    page.evaluate("location.hash = '#/home'")
    page.wait_for_timeout(600)
    page.evaluate("location.hash = '#/pokedex'")
    page.wait_for_selector('.dex-card[data-id="1"]')
    assert "on" in page.locator('.dex-card[data-id="1"] .fav-btn').get_attribute("class")
    page.locator('.dex-card[data-id="1"] .fav-btn').click()
    page.wait_for_timeout(600)
    page.select_option("select[aria-label='Registration tracking']", run["id"])
    page.wait_for_timeout(700)
    page.locator('.dex-grid .dex-card[data-id="4"]').click()
    page.wait_for_selector(".dex-summary .detail-head h2")
    page.locator(".dex-summary").get_by_role("button", name="My registration").click()
    page.locator(".dex-summary").get_by_role("radio", name="Seen").click()
    page.wait_for_timeout(500)
    page.keyboard.press("Escape")
    page.wait_for_timeout(600)
    assert "reg-seen" in page.locator('.dex-grid .dex-card[data-id="4"]').get_attribute("class")
    page.select_option("select[aria-label='Registration tracking']", "")
    page.wait_for_timeout(500)


# ---------------------------------------------------------------- Summary artwork
@pytest.fixture
def library(app, tmp_path):
    bw = tmp_path / "s/sprites/pokemon/versions/generation-v/black-white"
    (bw / "animated/shiny").mkdir(parents=True)
    base = make_gif(colour=(150, 80, 200))
    for name, data in {"animated/479-wash.gif": make_gif(colour=(60, 120, 230), seed=1),
                       "animated/shiny/479-wash.gif": make_gif(colour=(230, 60, 160), seed=2),
                       "479-wash.png": make_png(48, 48), "animated/479.gif": make_gif(colour=(230, 120, 40)),
                       "animated/649.gif": base, "animated/649-chill.gif": base,
                       "animated/646-black.gif": make_gif(colour=(40, 40, 40), seed=3)}.items():
        (bw / name).write_bytes(data)
    app.ctx.sprite_library.import_from(tmp_path / "s")
    app.ctx.settings.update({"pokedex.animate": None})
    yield app.ctx.sprite_library
    app.ctx.sprite_library.remove()


def _art(page):
    return page.locator(".dex-summary .detail-head .art")


def test_summary_plays_animated_form_sprite_with_shiny_and_still(app, page, library):
    go(page, app, "#/pokedex/479/wash")
    page.wait_for_selector(".dex-summary .art img.art-img")
    img = _art(page).locator("img.art-img")
    assert "/assets/library/ani/479-wash.gif" in img.get_attribute("src")
    _until(page, "document.querySelector('.dex-summary .art img.art-img').style.visibility === ''")
    w = img.evaluate("e => e.getBoundingClientRect().width")
    tier = app.ctx.dex.size_tier(479)["tier"]  # forms use the parent's tier
    fill = {"xs": 0.4, "s": 0.55, "m": 0.74, "l": 0.94}[tier]
    assert abs(w - 40 * min(max(fill * 210 / 40, 1), 4)) < 1.5  # shared size rule, 40 px synthetic art
    ctl = page.locator(".dex-summary .art-controls")       # labelled switches replace the floating buttons (2026-11-24)
    assert ctl.get_by_role("button", name="Animated", exact=True).get_attribute("aria-pressed") == "true"
    assert page.locator(".dex-summary .art-src").count() == 0 and "your sprite library" not in page.locator(".dex-summary").inner_text()
    ctl.get_by_role("button", name="Shiny", exact=True).click()
    page.wait_for_selector(".dex-summary .art img[src*='ani-shiny/479-wash.gif']")
    ctl.get_by_role("button", name="Normal", exact=True).click()
    ctl.get_by_role("button", name="Static", exact=True).click()
    page.wait_for_selector(".dex-summary .art img[src*='/static/479-wash.png']")
    app.ctx.settings.update({"pokedex.animate": None})


def test_summary_reduced_motion_shows_still_and_forms_switch_art(app, browser, library):  # noqa: F811
    ctx = browser.new_context(viewport={"width": 1280, "height": 820}, reduced_motion="reduce")
    pg = ctx.new_page()
    pg.goto(app.url("#/pokedex/646/black"))
    pg.wait_for_selector(".dex-summary .art canvas.art-img, .dex-summary .art img.art-img")
    pg.wait_for_timeout(400)
    assert pg.locator(".dex-summary .art canvas.art-img").count() == 1  # first frame only, no animation
    pg.locator(".dex-summary .form-strip button", has_text="White Kyurem").click()
    pg.wait_for_timeout(500)
    assert pg.locator(".dex-summary .detail-head h2").inner_text() == "White Kyurem"
    assert pg.locator(".dex-summary .art .art-missing").count() == 1
    assert pg.locator(".dex-summary .art .art-missing").get_attribute("aria-label") == "No verified artwork for this form"
    ctx.close()


def test_genesect_drive_never_shows_base_art(app, page, library):
    go(page, app, "#/pokedex/649/chill")
    page.wait_for_selector(".dex-summary .detail-head h2")
    page.wait_for_timeout(300)
    assert page.locator(".dex-summary .art img").count() == 0 and page.locator(".dex-summary .art .art-missing").count() == 1
    page.locator(".dex-summary .form-strip button", has_text="Genesect").first.click()
    page.wait_for_selector(".dex-summary .art img[src*='/ani/649.gif']")


@needs_dumps
def test_form_prefers_builtin_gen5_art_over_client_icons(app, page):
    """2026-11-24: removing your own library falls back to the built-in Gen V library (same style everywhere),
    not to the client's box icon; it never substitutes another form."""
    app.ctx.sprite_library.remove()
    assert app.ctx.sprite_library.source_kind == "built-in"
    go(page, app, "#/pokedex/479/wash")
    page.wait_for_selector(".dex-summary .art img.art-img")
    assert "479-wash" in page.locator(".dex-summary .art img.art-img").get_attribute("src")


# ---------------------------------------------------------------- Listed / Not listed
@needs_dumps
def test_listed_checks_drive_the_pokemmo_view(app, page):
    go(page, app, "#/pokedex/640")
    page.wait_for_selector(".avail-block")
    page.locator(".dex-summary").get_by_role("button", name="Not listed").click()
    page.keyboard.press("Escape")  # immediately: closing must win over the refresh the check triggers
    page.wait_for_timeout(1500)
    assert page.locator(".dex-summary-back").count() == 0 and page.url.endswith("#/pokedex")
    page.wait_for_timeout(400)
    assert "absent" in page.locator('.dex-card[data-entry="640"]').get_attribute("class")
    page.get_by_role("button", name="Filters").click()
    page.get_by_role("button", name="Hide species I marked “Not listed”").click()
    page.wait_for_timeout(600)
    assert page.locator('.dex-card[data-entry="640"]').count() == 0
    assert "648 of 648" in page.locator(".dex-info").inner_text()
    # stored on this computer only
    assert app.ctx.storage.query_one("SELECT in_dex FROM roster_checks WHERE species_id=640")["in_dex"] == "no"
    page.get_by_role("button", name="Hide species I marked “Not listed”").click()
    page.wait_for_timeout(500)
    go(page, app, "#/pokedex/640")
    page.wait_for_selector(".avail-block")
    app.ctx.storage.execute("DELETE FROM roster_checks")
    app.ctx.load_roster_checks()


def test_grid_observers_release_detached_cards(app, page):
    # Init scripts are evaluated as source, not called as page.evaluate functions.
    # Invoke explicitly, and establish a known roster/filter independent of previous tests.
    app.ctx.settings.update({"pokedex.filters": {}, "pokedex.scope": "reference", "app.language": "en"})
    page.add_init_script("""(() => {
        const Native = window.IntersectionObserver;
        const targets = new Set();
        window.__dexObserved = targets;
        window.IntersectionObserver = class extends Native {
            observe(el) { if (el.matches('.dex-card')) targets.add(el); super.observe(el); }
            unobserve(el) { targets.delete(el); super.unobserve(el); }
        };
    })();""")
    go(page, app, "#/pokedex")
    assert page.evaluate("window.__dexObserved instanceof Set"), "Observer instrumentation did not run"
    _until(page, "document.querySelectorAll('.dex-card').length === 649")
    _until(page, "window.__dexObserved.size === 649 && [...window.__dexObserved].every(e => e.isConnected)")
    page.get_by_role("radio", name="II", exact=True).click()
    _until(page, "window.__dexObserved.size === 100 && [...window.__dexObserved].every(e => e.isConnected)")
    page.evaluate("location.hash = '#/home'")
    page.wait_for_selector(".home-page .card")
    _until(page, "window.__dexObserved.size === 0")
    page.evaluate("location.hash = '#/pokedex'")
    _until(page, "window.__dexObserved.size === 100 && [...window.__dexObserved].every(e => e.isConnected)")
    page.get_by_role("radio", name="All", exact=True).click()
    _until(page, "window.__dexObserved.size === 649")
    page.wait_for_timeout(1200)


def test_popout_settings_avoid_unrelated_body_redraws(app, page):
    go(page, app, "#/home")
    result = page.evaluate("""async () => {
        const { popoutSettingsImpact: impact } = await import('/js/popouts.js');
        return [impact('pokedex', ['pokedex.last_species']).body,
            impact('pokedex', ['pokedex.filters']).filters,
            impact('pokedex', ['pokedex.progress_run']).body,
            impact('pokedex', ['sprites.motion']).body,
            impact('timers', ['sprites.motion']).body,
            impact('locations', ['sprites.motion']).body];
    }""")
    assert result == [False, True, True, True, False, True]


def test_current_report_reuses_sprite_without_allocating_an_observer(app, page):
    go(page, app, "#/home")
    result = page.evaluate("""async () => {
        const { currentCard } = await import('/js/pages/live.js');
        const Native = window.ResizeObserver;
        let allocated = 0;
        window.ResizeObserver = class extends Native { constructor(cb) { super(cb); allocated++; } };
        try {
            const sprite = document.createElement('div'); sprite.className = 'rep-sprite';
            const g = { id: 'probe', kind: 'alpha', title: 'Probe', provider: 'ntfy',
                species_still: {url: '/probe.png', w: 16, h: 16},
                status: {state: 'recent', label: 'Recent', start: new Date().toISOString(), notes: []} };
            const card = currentCard(g, {compact: true, sprite});
            return { same: card.querySelector('.rep-sprite') === sprite, allocated };
        } finally { window.ResizeObserver = Native; }
    }""")
    assert result == {"same": True, "allocated": 0}


def test_calculator_popout_does_not_load_unrelated_page_modules(app, browser):
    context = browser.new_context(viewport={"width": 420, "height": 520})
    pop = context.new_page()
    requests = []
    pop.on("request", lambda r: requests.append(r.url))
    try:
        pop.goto(app.srv.base_url + f"?token={app.ctx.token}&popout=calculator&mode=standard&shell=browser")
        pop.wait_for_selector(".popout-body button")
        assert any("/js/pages/calculator.js" in u for u in requests)
        for name in ("home", "settings", "pokedex", "items", "locations", "live", "timers"):
            assert not any(f"/js/pages/{name}.js" in u for u in requests), name
        for name in ("guide-extras", "team-editor"):
            assert not any(f"/js/{name}.js" in u for u in requests), name
    finally:
        context.close()


def test_disposed_home_render_cannot_start_refresh_timer(app, page):
    previous = app.ctx.settings.get("home.sections")
    app.ctx.settings.update({"home.sections": ["live", "quick"]})
    try:
        go(page, app, "#/pokedex")
        page.wait_for_selector(".dex-card")
        result = page.evaluate("""async () => {
            const home = await import('/js/pages/home.js');
            const host = document.createElement('div');
            document.body.append(host);
            const originalFetch = window.fetch, originalInterval = window.setInterval;
            let release, entered, intervals = 0;
            const gate = new Promise(resolve => { release = resolve; });
            const requested = new Promise(resolve => { entered = resolve; });
            window.fetch = async (path, ...args) => {
                if (path === '/api/live/current') { entered(); await gate; }
                return originalFetch(path, ...args);
            };
            window.setInterval = (fn, delay, ...args) => {
                if (delay === 60000 && fn.name === 'refresh') intervals++;
                return originalInterval(fn, delay, ...args);
            };
            try {
                const pending = home.render(host, {page: 'home', parts: []});
                await requested;
                home.dispose();
                host.remove();
                release();
                await pending;
                return {intervals, liveCards: host.querySelectorAll('.home-live').length};
            } finally {
                release();
                home.dispose();
                host.remove();
                window.fetch = originalFetch;
                window.setInterval = originalInterval;
            }
        }""")
        assert result == {"intervals": 0, "liveCards": 0}
    finally:
        app.ctx.settings.update({"home.sections": previous})


def test_default_home_defers_unused_catalog_and_guides(app, page):
    old = {k: app.ctx.settings.get(k) for k in ("home.sections", "app.onboarded")}
    app.ctx.settings.update({"home.sections": ["roamers", "live", "update", "news", "events", "quick"],
                             "app.onboarded": True})
    requests = []
    page.on("request", lambda request: requests.append(request.url))
    try:
        go(page, app, "#/home")
        page.wait_for_selector(".home-page .home-live")
        for path in ("/js/pages/pokedex.js", "/js/pages/guides.js", "/api/guides/runs"):
            assert not any(path in url for url in requests), path
        page.evaluate("location.hash = '#/pokedex'")
        page.wait_for_selector(".dex-card")
        assert any("/js/pages/pokedex.js" in url for url in requests)
    finally:
        app.ctx.settings.update(old)


def test_empty_live_countdowns_do_not_schedule_work(app, page):
    go(page, app, "#/tools/calculator")
    page.wait_for_selector(".calc-key")
    result = page.evaluate("""async () => {
        const {startTimers} = await import('/js/pages/live.js');
        const interval = window.setInterval, frame = window.requestAnimationFrame;
        let calls = 0;
        window.setInterval = (...args) => { calls++; return interval(...args); };
        window.requestAnimationFrame = (...args) => { calls++; return frame(...args); };
        try {
            const stop = startTimers(document.createElement('div'), 0, () => {});
            stop();
            return calls;
        } finally {
            window.setInterval = interval;
            window.requestAnimationFrame = frame;
        }
    }""")
    assert result == 0


def test_live_source_response_cannot_restart_disposed_page(app, page):
    go(page, app, "#/tools/calculator")
    page.wait_for_selector(".calc-key")
    result = page.evaluate("""async () => {
        const live = await import('/js/pages/live.js');
        const host = document.createElement('div');
        document.body.append(host);
        const original = window.fetch;
        let entered, release, calls = 0;
        const requested = new Promise(resolve => { entered = resolve; });
        const gate = new Promise(resolve => { release = resolve; });
        window.fetch = async (path, ...args) => {
            if (path === '/api/live/source') { entered(); await gate; }
            if (path === '/api/live/current' || String(path).startsWith('/api/live/reports?')) calls++;
            return original(path, ...args);
        };
        try {
            const pending = live.render(host, {parts: ['reports']});
            await requested;
            live.dispose();
            host.remove();
            release();
            await pending;
            return calls;
        } finally {
            release();
            window.fetch = original;
            live.dispose();
            host.remove();
        }
    }""")
    assert result == 0

"""Offline interface and terminology checks for Build 27."""
import os
from pathlib import Path

import pytest

from tests.ui.test_ui_builtin_maps import browser, clean, pg  # noqa: F401
from tools.layout_audit import ROUTES

pytestmark = pytest.mark.ui


def select_language(page, name, locale):
    page.locator(".lang-btn").click()
    page.get_by_role("menuitemradio", name=name).click()
    page.wait_for_function("locale => document.documentElement.lang === locale", arg=locale)


def test_live_switch_and_persistence(clean, pg):
    clean.ctx.settings.update({"app.language": "en"})
    pg.goto(clean.url("#/home"))
    select_language(pg, "Español", "es")
    pg.get_by_text("Personalizar inicio", exact=True).wait_for()
    popout = pg.context.new_page()
    popout.goto(clean.srv.url("#/", popout="phenomena", mode="compact"))
    popout.get_by_text("Fenómenos", exact=True).first.wait_for()
    select_language(pg, "简体中文", "zh-Hans")
    popout.get_by_text("现象", exact=True).first.wait_for()
    assert popout.locator(".popout-root").evaluate("(el) => el.classList.contains('mode-compact')")
    pg.reload()
    pg.wait_for_function("document.documentElement.lang === 'zh-Hans'")
    pg.get_by_text("自定义主页", exact=True).wait_for()
    select_language(pg, "English", "en")
    popout.get_by_text("Phenomena", exact=True).first.wait_for()
    assert not pg.errors


def test_chinese_pokedex_matches_chinese_english_and_number(clean, pg):
    clean.ctx.settings.update({"app.language": "zh"})
    pg.goto(clean.url("#/pokedex"))
    search = pg.locator("#dex-search")
    for term in ("皮卡丘", "皮卡", "Pikachu", "25"):
        search.fill(term)
        pg.get_by_text("皮卡丘", exact=True).first.wait_for()
    pg.goto(clean.url("#/pokedex/25"))
    pg.locator(".detail-head h2").get_by_text("皮卡丘").wait_for()
    assert not pg.errors


def test_catalog_placeholders_and_game_names(clean, pg):
    clean.ctx.settings.update({"app.language": "es"})
    pg.goto(clean.url("#/home"))
    pg.wait_for_function("document.documentElement.lang === 'es'")
    result = pg.evaluate(r"""async () => {
      const { catalogEntries, t, plural } = await import('/js/i18n.js');
      const { gameTerm, searchText, speciesLabel } = await import('/js/game-locale.js');
      const markers = (text) => [...text.matchAll(/\{\w+\}/g)].map((match) => match[0]).sort().join();
      return {
        issues: catalogEntries().filter(([, en, es, zh]) =>
          !en || !es || !zh || markers(en) !== markers(es) || markers(en) !== markers(zh)),
        spanish: [speciesLabel(25, 'Pikachu'), gameTerm('move', 'Thunder Shock'),
          gameTerm('location', 'Pallet Town'), searchText('éLéctrico')],
        missing: [t('unknown.test_key'), t('constructor', {})], singular: plural('ui.home_feed_active', 1),
      };
    }""")
    assert not result["issues"]
    assert result["spanish"] == ["Pikachu", "Impactrueno", "Pueblo Paleta", "electrico"]
    assert result["missing"] == ["unknown.test_key", "constructor"]
    assert "1 aviso" in result["singular"]


@pytest.mark.parametrize(("language", "locale"), [("en", "en"), ("es", "es"), ("zh", "zh-Hans")])
@pytest.mark.parametrize(("width", "height"), [(420, 640), (1024, 768), (1500, 950)])
def test_offline_route_inventory(clean, pg, language, locale, width, height):
    pg.set_viewport_size({"width": width, "height": height})
    clean.ctx.settings.update({"app.language": language, "app.onboarded": True})
    routes = dict.fromkeys([*ROUTES, "#/live/reports", "#/news", "#/news/changelog-2026-11-19", "#/events",
                           "#/events/event-shiny-wars-2026", "#/collection/showcases",
                           *(f"#/settings/{section}" for section in ("layout", "sprites", "home", "startup", "updates")),
                           *(f"#/guides/storyline?region={region}" for region in
                             ("kanto", "johto", "hoenn", "sinnoh", "unova"))])
    shots = os.environ.get("COMPANION_LOCALIZATION_SCREENSHOTS")
    screenshot_routes = { "#/home": ".home-v3 > *", "#/pokedex/6": ".detail-head h2", "#/tools/typechart": ".tc-compare-slot", "#/live/phenomena": ".phenomenon-card" }
    for index, route in enumerate(routes):
        base, fragment = clean.url(route).split("#", 1)
        pg.goto(f"{base}&audit={index}#{fragment}")
        pg.locator("#main .page").first.wait_for()
        pg.locator("#main .page > *").first.wait_for(state="attached")
        assert pg.locator("html").get_attribute("lang") == locale, route
        assert not pg.errors, (route, pg.errors)
        if shots and width == 1500 and route in screenshot_routes:
            pg.locator(screenshot_routes[route]).first.wait_for()
            target = Path(shots)
            target.mkdir(parents=True, exist_ok=True)
            pg.evaluate("document.fonts.ready")
            pg.screenshot(path=target / f"{language}-{route[2:].replace('/', '-')}.png",
                          animations="disabled")


def test_storyline_progress_keeps_original_step_identity(clean, pg):
    run = clean.ctx.guides.create_run("Localization QA")["id"]
    clean.ctx.settings.update({"app.language": "en", "guides.active_run": run})
    progress = clean.ctx.guides.state(run, "kanto")
    step = clean.ctx.guides.steps("kanto", progress["source"])[0]
    clean.ctx.guides.set_steps(run, [step["id"]], True)
    pg.goto(clean.url("#/guides/storyline?region=kanto"))
    row = pg.locator(".step").first
    assert row.locator(".s-text").inner_text() == step["text"]
    select_language(pg, "简体中文", "zh-Hans")
    row.get_by_text("下楼出门", exact=False).wait_for()
    assert row.locator("input.check").is_checked()
    localized_progress = clean.ctx.guides.state(run, "kanto")
    assert localized_progress["done"] == [step["id"]]
    assert localized_progress["changed"] == []
    assert clean.ctx.guides.steps("kanto", localized_progress["source"])[0]["text_hash"] == step["text_hash"]
    clean.ctx.guides.delete_run(run)


def test_shared_species_picker_retains_canonical_id(clean, pg):
    clean.ctx.settings.update({"app.language": "zh"})
    for route in ("#/tools/stats", "#/tools/catch", "#/tools/breeding", "#/tools/team"):
        pg.goto(clean.url(route))
        picker = pg.locator('input[list^="species-dl-"]').first
        picker.wait_for()
        picker.fill("Pikachu")
        picker.dispatch_event("change")
        pg.wait_for_function("""() => Array.from(document.querySelectorAll('input[list^="species-dl-"]'))
            .some(input => input.value === '皮卡丘')""")
    assert not pg.errors

    pg.goto(clean.url("#/tools/typechart"))
    pg.locator('.cmp-side input[type="search"]').first.fill("皮卡")
    pg.get_by_role("option", name="皮卡丘").first.click()
    pg.locator(".cmp-name").get_by_text("皮卡丘", exact=True).wait_for()


@pytest.mark.parametrize(("language", "welcome", "calc_keys", "timer_add"), [
    ("es", "Bienvenido", "Teclas de la calculadora", "Añadir e iniciar"),
    ("zh", "欢迎", "计算器按键", "添加并启动"),
])
def test_remaining_home_calculator_timer_labels(clean, pg, language, welcome, calc_keys, timer_add):
    clean.ctx.settings.update({"app.language": language, "app.onboarded": False})
    pg.goto(clean.url("#/home"))
    pg.get_by_role("heading", name=welcome, exact=True).wait_for()
    pg.goto(clean.url("#/tools/calculator"))
    pg.get_by_role("group", name=calc_keys, exact=True).wait_for()
    pg.goto(clean.url("#/tools/timers"))
    pg.get_by_role("button", name=timer_add, exact=True).wait_for()
    assert not pg.errors


@pytest.mark.parametrize(("language", "heading", "timer", "dialog", "duration"), [
    ("es", "Torre Quemada", "Añadir un temporizador a este paso", "Añadir temporizador", "Nombre del temporizador"),
    ("zh", "烧焦塔", "为此步骤添加计时器", "添加计时器", "计时器名称"),
])
def test_localized_walkthrough_chapters_and_timer_dialog(clean, pg, language, heading, timer, dialog, duration):
    run = clean.ctx.guides.create_run("Guide locale QA")["id"]
    try:
        clean.ctx.settings.update({"app.language": language, "guides.active_run": run})
        pg.goto(clean.url("#/guides/storyline?region=johto"))
        pg.locator(".chapter-btn").get_by_text(heading, exact=True).first.wait_for()
        untranslated = pg.evaluate("""async () => {
          const { get } = await import('/js/core.js');
          const { walkthroughChapter } = await import('/js/game-locale.js');
          const regions = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'];
          const chapters = await Promise.all(regions.map(async region => {
            const { steps } = await get('/api/guides/catalog/' + region);
            return steps.map(step => step.chapter);
          }));
          return [...new Set(chapters.flat())].filter(name => walkthroughChapter(name) === name);
        }""")
        # These names are identical in English and Spanish Pokémon releases.
        assert set(untranslated) <= ({"Cueva Diglett"} if language == "es" else set())

        pg.get_by_title(timer, exact=True).first.click()
        pg.get_by_role("heading", name=dialog, exact=True).wait_for()
        pg.get_by_role("textbox", name=duration, exact=True).wait_for()
        assert not pg.errors
    finally:
        clean.ctx.guides.delete_run(run)


@pytest.mark.parametrize(("language", "locale"), [("en", "en"), ("es", "es"), ("zh", "zh-Hans")])
def test_offline_popout_inventory(clean, pg, language, locale):
    run = clean.ctx.guides.create_run("Popout locale QA")["id"]
    try:
        clean.ctx.settings.update({"app.language": language, "app.onboarded": True, "guides.active_run": run})
        pg.goto(clean.url("#/home"))
        pg.locator("#main .page").first.wait_for()
        configs = pg.evaluate("""async () => {
          const { POPOUT_TOOLS, popoutSize } = await import('/js/shell.js');
          return ['compact', 'standard', 'expanded'].flatMap(mode =>
            Object.keys(POPOUT_TOOLS).map(tool => [mode, tool, ...popoutSize(tool, mode)]));
        }""")
        assert configs
        for mode, tool, width, height in configs:
            pg.set_viewport_size({"width": width, "height": height})
            base, fragment = clean.srv.url("#/", popout=tool, mode=mode).split("#", 1)
            pg.goto(f"{base}&audit={language}#{fragment}")
            pg.locator(f".popout-root.mode-{mode} .popout-body > *").first.wait_for(state="attached")
            assert pg.locator("html").get_attribute("lang") == locale, (tool, mode)
            assert not pg.locator(".popout-body > .notice.bad").count(), (tool, mode)
            if tool == "storyline":
                pg.locator(".objective.s-text").wait_for()
                assert pg.locator(".popout-body .step input").first.is_visible()
            assert not pg.errors, (tool, mode, pg.errors)
    finally:
        clean.ctx.settings.update({"guides.active_run": None})
        clean.ctx.guides.delete_run(run)


@pytest.mark.parametrize(("language", "title", "search", "consent", "minutes", "method"), [
    ("es", "En vivo", "Buscar avisos", "¿Conectar la fuente de avisos de Alphapedia?", "12 min", "Individual"),
    ("zh", "实时", "搜索报告", "连接 Alphapedia 报告订阅？", "12 分钟", "单只遭遇"),
])
def test_live_and_cave_localize_offline_without_changing_values(clean, pg, language, title, search, consent, minutes, method):
    clean.ctx.settings.update({"app.language": language, "live.ntfy.enabled": False})
    pg.goto(clean.url("#/live/reports"))
    pg.get_by_role("heading", name=title, exact=True).wait_for()
    pg.get_by_placeholder(search).wait_for()
    pg.locator(".source-bar .primary").click()
    pg.get_by_role("dialog", name=consent).wait_for()
    assert minutes in pg.evaluate("""async () => {
      const { timerText } = await import('/js/pages/live.js');
      return timerText({ state: 'recent', duration_min: 20, ends_at: new Date(12 * 60_000).toISOString() }, 0);
    }""")
    pg.goto(clean.url("#/live/cave"))
    field = pg.locator('select[name="method"]')
    assert field.locator('option[value="Single"]').inner_text() == method
    assert field.input_value() == 'Single'
    assert not pg.errors

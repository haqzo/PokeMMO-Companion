"""Offline interface and terminology checks for Build 27."""
import json
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



# Optional evidence capture during existing route/popout tests, not a second traversal.
def capture_fallbacks(pg, language, scope):
    folder = os.environ.get("COMPANION_LOCALIZATION_FALLBACKS")
    if not folder or language == "en":
        return
    evidence = pg.evaluate(r"""async () => {
      const { catalogEntries } = await import('/js/i18n.js');
      const lang = document.documentElement.lang === 'es' ? 2 : 3;
      const normalize = s => s.replace(/\s+/g, ' ').trim();
      const sources = new Map();
      for (const [key, en, es, zh] of catalogEntries()) {
        const row = [key, en, es, zh];
        if (!en || en === row[lang] || /\{\w+\}/.test(en)) continue;
        const value = normalize(en);
        if (value.length < 3 || !/[A-Za-z]/.test(value)) continue;
        const keys = sources.get(value) || [];
        keys.push(key); sources.set(value, keys);
      }
      const out = new Map();
      const visible = e => e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'
        && !e.closest('[hidden], [aria-hidden="true"], details:not([open]) > :not(summary)');
      const note = (value, context, e) => {
        const normalized = normalize(value || '');
        if (!sources.has(normalized)) return;
        const id = context + ':' + normalized;
        if (!out.has(id)) out.set(id, {text: normalized, context, keys: sources.get(normalized), tag: e.tagName});
      };
      const root = document.body;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode, e = node.parentElement;
        if (visible(e) && !e.closest('script,style,textarea,option')) note(node.nodeValue, 'text', e);
      }
      for (const e of root.querySelectorAll('[title],[placeholder],[aria-label],[alt]')) {
        if (!visible(e)) continue;
        for (const attr of ['title','placeholder','aria-label','alt']) {
          if (e.hasAttribute(attr)) note(e.getAttribute(attr), attr, e);
        }
      }
      return [...out.values()];
    }""")
    target = Path(folder)
    target.mkdir(parents=True, exist_ok=True)
    name = "".join(c if c.isalnum() else "-" for c in scope)
    (target / f"{language}-{name}.json").write_text(
        json.dumps({"locale": language, "scope": scope, "candidates": evidence}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


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
        capture_fallbacks(pg, language, f"route-{width}x{height}-{route}")
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
            capture_fallbacks(pg, language, f"popout-{tool}-{mode}")
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


@pytest.mark.parametrize(("language", "search", "method", "grass", "forest", "summary"), [
    ("es", "Buscar un lugar o Pokémon", "Tipo de encuentro", "Hierba", "Bosque Verde", "registros de encuentro"),
    ("zh", "搜索地点或宝可梦", "遭遇方式", "草丛", "常青森林", "条遭遇记录"),
])
def test_location_filters_and_direct_popout_localize_without_changing_values(clean, pg, language, search, method, grass, forest, summary):
    clean.ctx.settings.update({"app.language": language})
    pg.goto(clean.url("#/tools/locations?region=kanto"))
    pg.get_by_placeholder(search).wait_for()
    picker = pg.get_by_label(method, exact=True)
    assert picker.locator('option[value="Grass"]').inner_text() == grass
    pg.locator(".loc-card-name").get_by_text(forest, exact=True).click()
    pg.locator(".loc-method[data-method=Grass] h3").get_by_text(grass, exact=False).wait_for()
    location_id = next(loc["id"] for loc in clean.ctx.dex.locations() if loc["name"] == "Viridian Forest")
    pg.goto(clean.srv.url(f"#/loc/{location_id}", popout="locations", mode="compact"))
    pg.locator(".popout-body .detail-head").get_by_text(summary, exact=False).wait_for()
    assert not pg.locator(".popout-body > .notice.bad").count()
    assert not pg.errors


@pytest.mark.parametrize(("language", "light", "item", "species", "stat", "reason"), [
    ("en", "Light", "Everstone", "Pikachu", "sp_attack 31", "Pikachu is genderless and can only breed with Ditto."),
    ("es", "Claro", "Piedra Eterna", "Pikachu", "Ataque Especial 31", "Pikachu no tiene género y solo puede criar con Ditto."),
    ("zh", "浅色", "不变之石", "皮卡丘", "特攻 31", "皮卡丘 无性别，只能与百变怪培育。"),
])
def test_context_specific_labels_and_breeding_messages(clean, pg, language, light, item, species, stat, reason):
    clean.ctx.settings.update({"app.language": language, "app.onboarded": True})
    pg.goto(clean.url("#/home"))
    pg.locator("#main .page").first.wait_for()
    result = pg.evaluate("""async () => {
      const { uiLabel } = await import('/js/i18n.js');
      const { gameTerm, speciesNameLabel } = await import('/js/game-locale.js');
      const { breedMessage, nodeName } = await import('/js/pages/breeding.js');
      return [uiLabel('Light'), gameTerm('item', 'Everstone'), speciesNameLabel('Pikachu'),
        nodeName({ traits: ['sp_attack'], label: 'sp_attack 31' }),
        breedMessage('Pikachu is genderless and can only breed with Ditto.')];
    }""")
    assert result == [light, item, species, stat, reason]
    assert not pg.errors


@pytest.mark.parametrize(("language", "expected"), [
    ("en", ["Night or cave ×3.5", "(41 − level 25) ÷ 10, minimum ×1", "1 + turns passed × 0.3, max ×4 (turn 8)", "EV total 511 is over 510"]),
    ("es", ["Noche o cueva ×3,5", "(41 − nivel 25) ÷ 10, mínimo ×1", "1 + turnos transcurridos × 0,3, máximo ×4 (turno 8)", "El total de EV (511) supera 510"]),
    ("zh", ["夜间或洞窟 ×3.5", "（41 − 等级 25）÷ 10，最低 ×1", "1 + 已过回合数 × 0.3，最高 ×4（第 8 回合）", "努力值总计 511，超过 510"]),
])
def test_calculator_service_messages_and_bundled_news(clean, pg, language, expected):
    from companion.services.calcs import catch_table

    clean.ctx.settings.update({"app.language": language, "app.onboarded": True})
    pg.goto(clean.url("#/home"))
    pg.locator("#main .page").first.wait_for()
    snapshot = json.loads((Path(__file__).resolve().parents[2] /
                           "companion/data/news_snapshot.json").read_text(encoding="utf-8"))
    source = [snapshot["about"]]
    for article in snapshot["articles"]:
        source.extend([article["title"], article["summary"]])
        for group in article["groups"]:
            source.extend([group["heading"], *group["points"]])
        source.extend(article["companion_impact"])
    for event in snapshot["events"]:
        source.extend([event["title"], event["timezone_note"], event["summary"]])
        for detail in event["details"]:
            source.extend([detail["label"], detail["value"]])
    source = list(dict.fromkeys(source))

    # Exercise real service output, including both branches of conditional balls.
    conditions = list(dict.fromkeys(row["condition"] for ctx in (
        {"level": 25, "turn": 8, "time": "night", "cave": True, "water": True,
         "caught_before": True, "status": "sleep", "types": ["water"]},
        {"level": 30, "turn": 1, "time": "day", "types": ["normal"]},
    ) for row in catch_table(45, ctx)["rows"]))
    result = pg.evaluate("""async ({source, conditions}) => {
      const { calcMessage } = await import('/js/pages/tools.js');
      const { newsText } = await import('/js/pages/home.js');
      return {
        calculator: [
          calcMessage('Night or cave ×3.5'),
          calcMessage('(41 − level 25) ÷ 10, minimum ×1'),
          calcMessage('1 + turns passed × 0.3, max ×4 (turn 8)'),
          calcMessage('EV total 511 is over 510')
        ],
        untranslatedNews: source.filter(s => newsText(s) === s),
        untranslatedConditions: conditions.filter(s => calcMessage(s) === s),
        external: newsText('External title not in snapshot')
      };
    }""", {"source": source, "conditions": conditions})
    assert result["calculator"] == expected
    assert result["external"] == "External title not in snapshot"
    if language == "en":
        assert result["untranslatedNews"] == source
        assert result["untranslatedConditions"] == conditions
    else:
        unchanged = {"GTL", "Shiny Wars 2026"}
        if language == "es":
            unchanged |= {"Audio", "Halloween 2026"}
        assert set(result["untranslatedNews"]) <= unchanged
        assert set(result["untranslatedConditions"]) <= {"×1", "×1.5", "×2"}
    assert not pg.errors


@pytest.mark.parametrize(("language", "missing", "retry", "test_title"), [
    ("en", "Run not found", "TimeoutError: connection — retrying in 15s", "TEST — demo alpha notification"),
    ("es", "Partida no encontrada", "TimeoutError: connection — reintento en 15 s", "PRUEBA — aviso de alfa simulado"),
    ("zh", "未找到角色流程", "TimeoutError: connection — 15 秒后重试", "测试 — 模拟头目通知"),
])
def test_live_status_and_api_error_translation(clean, pg, language, missing, retry, test_title):
    clean.ctx.settings.update({"app.language": language, "app.onboarded": True})
    pg.goto(clean.url("#/home"))
    pg.locator("#main .page").first.wait_for()
    result = pg.evaluate("""async () => {
      const { ApiError, apiErrorText } = await import('/js/core.js');
      const { liveText } = await import('/js/pages/live.js');
      const err = new ApiError('Run not found');
      return [err.message, err.rawMessage,
        liveText('TimeoutError: connection — retrying in 15s'),
        liveText('TEST — demo alpha notification'),
        apiErrorText('Shortcut already used')];
    }""")
    assert result == [missing, "Run not found", retry, test_title, "Shortcut already used"]
    assert not pg.errors


@pytest.mark.parametrize(("language", "ocarina", "ball", "preset", "description"), [
    ("en", "Cut Ocarina", "Mysterious Dusk Ball (2024)", "15 min", "Official website and downloads."),
    ("es", "Ocarina de Corte", "Ocaso Ball Misteriosa (2024)", "15 min", "Sitio web oficial y descargas."),
    ("zh", "居合劈陶笛", "神秘黑暗球 (2024)", "15 分钟", "官方网站及下载。"),
])
def test_item_references_timer_presets_and_bookmarks(clean, pg, language, ocarina, ball, preset, description):
    clean.ctx.settings.update({"app.language": language, "app.onboarded": True})
    pg.goto(clean.url("#/home"))
    pg.locator("#main .page").first.wait_for()
    result = pg.evaluate("""async () => {
      const { itemLabel } = await import('/js/game-locale.js');
      const { GAME_TERMS } = await import('/js/game-terms.js');
      const { builtinPresetLabel } = await import('/js/pages/timers.js');
      const { bookmarkDescription } = await import('/js/pages/websites.js');
      return [
        itemLabel({name: 'Cut Ocarina', label: '{STRING_110015}'}),
        itemLabel({name: 'Mysterious Dusk Ball (2024)', label: '{STRING_245013}'}),
        builtinPresetLabel({label: '15 min', seconds: 900}),
        bookmarkDescription({seed_key: 'official', description: 'Official website and downloads.'}),
        bookmarkDescription({seed_key: 'official', description: 'My edited description'}),
        Object.values(GAME_TERMS.es.item).concat(Object.values(GAME_TERMS.zh.item))
          .filter(v => /\\{STRING_\\d+\\}/.test(v)).length,
      ];
    }""")
    assert result == [ocarina, ball, preset, description, "My edited description", 0]
    assert not pg.errors


@pytest.mark.parametrize(("language", "quantity_error"), [
    ("en", "Quantity must be between 0 and 999999"),
    ("es", "La cantidad debe estar entre 0 y 999999"),
    ("zh", "数量必须介于 0 和 999999 之间"),
])
def test_imported_item_description_fallbacks(clean, pg, language, quantity_error):
    clean.ctx.settings.update({"app.language": language, "app.onboarded": True})
    pg.goto(clean.url("#/home"))
    pg.locator("#main .page").first.wait_for()
    result = pg.evaluate("""async () => {
      const { itemDescription } = await import('/js/game-locale.js');
      const { apiErrorText, ApiError } = await import('/js/core.js');
      const { applyItemFilters } = await import('/js/pages/items.js');
      const raw = 'Imported {STRING_999999}';
      const row = {desc: 'English source', desc_local: raw};
      const error = new ApiError('Quantity must be between 0 and 999999');
      const items = [{id: 1, name: 'Example', label: 'Imported label', search: 'example', category: 'other'}];
      return [
        itemDescription(row),
        itemDescription({desc: raw, desc_local: raw}),
        itemDescription({}),
        itemDescription({desc: 'English source', desc_local: 'Local source'}, 'es'),
        row.desc_local,
        error.message, error.rawMessage,
        applyItemFilters(items, {q: 'Imported label', cat: 'all', sort: 'id'}).map(i => i.id),
      ];
    }""")
    raw = "Imported {STRING_999999}"
    assert result == [
        {"text": "English source", "english": "", "fallback": language != "en", "raw": [raw]},
        {"text": "", "english": "", "fallback": False, "raw": [raw]},
        {"text": "", "english": "", "fallback": False, "raw": []},
        {"text": "Local source", "english": "English source", "fallback": False, "raw": []},
        raw, quantity_error, "Quantity must be between 0 and 999999", [1],
    ]
    assert not pg.errors


@pytest.mark.parametrize("language", ["en", "es", "zh"])
def test_service_errors_and_shortcut_conflicts(clean, pg, language):
    clean.ctx.settings.update({"app.language": language, "app.onboarded": True})
    pg.goto(clean.url("#/home"))
    pg.locator("#main .page").first.wait_for()
    result = pg.evaluate("""async () => {
      const { apiErrorText, ApiError, isShortcutConflict } = await import('/js/core.js');
      const { t, shortcutLabel } = await import('/js/i18n.js');
      const action = 'Focus Pokédex search';
      const raw = 'Ctrl+F is already used by “' + action + '”. Choose another key or replace it.';
      const e = new ApiError(raw);
      return {
        conflict: isShortcutConflict(e), nonconflict: isShortcutConflict(new ApiError('Shortcut already used')),
        raw: e.rawMessage, text: e.message,
        expected: t('errorui.shortcut_conflict', {combo: 'Ctrl+F', action: shortcutLabel(action)}),
        ev: apiErrorText('EV total cannot exceed 510'),
        expectedEV: t('errorui.ev_total'),
        backup: apiErrorText('Backup archive is damaged (checksum mismatch in backup.json)'),
        expectedBackup: t('errorui.backup_checksum', {file: 'backup.json'}),
        unknown: apiErrorText('Unexpected provider message 123'),
      };
    }""")
    assert result["conflict"] and not result["nonconflict"]
    assert result["raw"] == "Ctrl+F is already used by “Focus Pokédex search”. Choose another key or replace it."
    assert result["text"] == result["expected"]
    assert result["ev"] == result["expectedEV"] and "510" in result["ev"]
    assert result["backup"] == result["expectedBackup"] and "backup.json" in result["backup"]
    assert result["unknown"] == "Unexpected provider message 123"
    assert not pg.errors


@pytest.mark.parametrize(("language", "label", "custom"), [
    ("en", "Focus Pokédex search", "Ticked: Personal objective"),
    ("es", "Enfocar la búsqueda de la Pokédex", "Marcado: Personal objective"),
    ("zh", "聚焦宝可梦图鉴搜索框", "已勾选：Personal objective"),
])
def test_shortcut_labels_and_guide_feedback(clean, pg, language, label, custom):
    clean.ctx.settings.update({"app.language": language, "app.onboarded": True})
    pg.goto(clean.url("#/home"))
    pg.locator("#main .page").first.wait_for()
    result = pg.evaluate("""async () => {
      const { shortcutLabel } = await import('/js/i18n.js');
      const { guideActionMessage } = await import('/js/shortcuts.js');
      return [
        shortcutLabel('Focus Pokédex search'),
        await guideActionMessage({message: 'Ticked: Personal objective', message_kind: 'ticked',
          message_step: {text: 'Personal objective'}, state: {source: 'imported'}}),
      ];
    }""")
    assert result == [label, custom]
    assert not pg.errors


@pytest.mark.parametrize(("language", "field", "expected"), [
    ("en", "IV attack", "IV attack must be between 0 and 31"),
    ("es", "IV de Ataque", "IV de Ataque debe estar entre 0 y 31"),
    ("zh", "攻击个体值", "攻击个体值必须介于 0 和 31 之间"),
])
def test_dynamic_service_field_validation(clean, pg, language, field, expected):
    clean.ctx.settings.update({"app.language": language, "app.onboarded": True})
    pg.goto(clean.url("#/home"))
    pg.locator("#main .page").first.wait_for()
    result = pg.evaluate("""async () => {
      const { apiErrorText, ApiError, validationField } = await import('/js/core.js');
      const raw = 'IV attack must be between 0 and 31';
      const e = new ApiError(raw);
      return [validationField('IV attack'), e.message, e.rawMessage,
        apiErrorText('held item must be between -1 and 99999'),
        apiErrorText('title is too long (max 120 characters)'),
        apiErrorText('Unexpected provider message 123'),
        validationField('unrecognized_field')];
    }""")
    assert result[:3] == [field, expected, "IV attack must be between 0 and 31"]
    assert "-1" in result[3] and "99999" in result[3]
    assert "120" in result[4]
    assert result[5:] == ["Unexpected provider message 123", "unrecognized_field"]
    assert not pg.errors


@pytest.mark.parametrize(("language", "arceus", "castform", "genesect", "artwork"), [
    ("en", "Fighting", "Normal Form", "Genesect", "Animated shiny"),
    ("es", "Lucha", "Forma Normal", "Genesect", "Animado variocolor"),
    ("zh", "格斗", "普通的样子", "盖诺赛克特", "异色动画"),
])
def test_catalog_form_names_and_artwork_report(clean, pg, language, arceus, castform, genesect, artwork):
    clean.ctx.settings.update({"app.language": language, "app.onboarded": True})
    pg.goto(clean.url("#/home"))
    pg.locator("#main .page").first.wait_for()
    result = pg.evaluate("""async () => {
      const { formLabel } = await import('/js/game-locale.js');
      const { artworkReportLabel, artworkVariantLabel } = await import('/js/pages/settings.js');
      return [formLabel(201, '!'), formLabel(201, '?'), formLabel(493, 'Fighting'),
        formLabel(351, 'Normal Form'), formLabel(649, 'Genesect'),
        artworkVariantLabel('ani_shiny'),
        artworkReportLabel({key: '493:fighting', species: 'Arceus', name: 'Fighting'})];
    }""")
    assert result[:6] == ["!", "?", arceus, castform, genesect, artwork]
    assert result[6].endswith(" — " + arceus)
    assert not pg.errors


@pytest.mark.parametrize(("language", "progress", "size"), [
    ("en", "Reading Pokédex data…", "unexpected size 300×400"),
    ("es", "Leyendo datos de la Pokédex…", "Tamaño inesperado: 300×400"),
    ("zh", "正在读取宝可梦图鉴数据…", "尺寸异常：300×400"),
])
def test_import_progress_and_service_fallbacks(clean, pg, language, progress, size):
    clean.ctx.settings.update({"app.language": language, "app.onboarded": True})
    pg.goto(clean.url("#/home"))
    pg.locator("#main .page").first.wait_for()
    result = pg.evaluate("""async () => {
      const { apiErrorText } = await import('/js/core.js');
      return [
        apiErrorText('Reading Pokédex data…'),
        apiErrorText('unexpected size 300×400'),
        apiErrorText('Unknown provider field is required'),
        apiErrorText('Folder not found: /home/example/Private Files'),
      ];
    }""")
    assert result[:3] == [progress, size, "Unknown provider field is required"]
    assert "/home/example/Private Files" in result[3]
    assert not pg.errors


@pytest.mark.parametrize(("language", "category", "method"), [
    ("en", "Hold items", "Trade holding item"),
    ("es", "Objetos equipados", "Intercambiar con el objeto equipado"),
    ("zh", "携带道具", "携带道具交换"),
])
def test_item_link_categories_and_evolution_methods(clean, pg, language, category, method):
    clean.ctx.settings.update({"app.language": language, "app.onboarded": True})
    pg.goto(clean.url("#/home"))
    pg.locator("#main .page").first.wait_for()
    result = pg.evaluate("""async () => {
      const { itemCategory, itemEvolutionMethod, formLabel } = await import('/js/game-locale.js');
      const { GAME_TERMS } = await import('/js/game-terms.js');
      return [itemCategory('hold'), itemEvolutionMethod('TRADE_WITH_ITEM'),
        itemCategory('future-category'), itemEvolutionMethod('FUTURE_METHOD'),
        formLabel(201, '!'), formLabel(201, '?'),
        Object.values(GAME_TERMS).every(d => d.form['201:!'] === '!' && d.form['201:?'] === '?')];
    }""")
    assert result == [category, method, "future-category", "future method", "!", "?", True]
    assert not pg.errors


@pytest.mark.parametrize(("language", "label"), [
    ("en", "Open"),
    ("es", "Abrir"),
    ("zh", "打开"),
])
def test_window_settings_render_all_tool_cards(clean, pg, language, label):
    clean.ctx.settings.update({"app.language": language, "app.onboarded": True})
    pg.goto(clean.url("#/settings/windows"))
    cards = pg.locator(".tool-pref-grid .tool-pref")
    cards.first.wait_for()
    count = pg.evaluate("""async () => {
        const { POPOUT_TOOLS } = await import('/js/shell.js');
        return Object.keys(POPOUT_TOOLS).length;
    }""")
    assert cards.count() == count
    assert cards.get_by_role("button", name=label, exact=True).count() == count
    assert not pg.errors


@pytest.mark.parametrize(("language", "guides", "cave", "none", "stat", "send"), [
    ("en", "Guides", "Altering Cave", "None", "Atk", "Send TEST notification"),
    ("es", "Guías", "Cueva Cambiante", "Ninguno", "Atq", "Enviar notificación de PRUEBA"),
    ("zh", "攻略", "变化洞窟", "无", "攻击", "发送测试通知"),
])
def test_rendered_fallback_corrections(clean, pg, language, guides, cave, none, stat, send):
    clean.ctx.settings.update({"app.language": language, "app.onboarded": True})
    pg.goto(clean.url("#/live/reports"))
    pg.get_by_role("button", name=send, exact=True).wait_for()
    result = pg.evaluate("""async () => {
        const { gameTerm, itemLabel } = await import('/js/game-locale.js');
        const { shortcutLabel } = await import('/js/i18n.js');
        const { breedingStatLabel } = await import('/js/pages/breeding.js');
        return [shortcutLabel('Guides'), gameTerm('location', 'Altering Cave'),
            itemLabel({name: 'None', label: 'None'}), breedingStatLabel('Atk')];
    }""")
    assert result == [guides, cave, none, stat]
    assert not pg.errors


def test_incremental_item_batches_cancel_stale_observers(clean, pg):
    clean.ctx.settings.update({"app.language": "en", "app.onboarded": True})
    pg.goto(clean.url("#/home"))
    pg.locator("#main .page").first.wait_for()
    result = pg.evaluate("""async () => {
        const { renderItemBatches } = await import('/js/pages/items.js');
        const root = document.createElement('div');
        root.style.cssText = 'height:80px;overflow:auto;position:fixed;top:0;left:0;width:300px';
        const grid = document.createElement('div'); root.append(grid); document.body.append(root);
        const tile = id => { const n = document.createElement('div'); n.dataset.testId = id; n.style.height = '24px'; return n; };
        const list = Array.from({length: 300}, (_, i) => i);
        renderItemBatches(grid, list, tile, root, 120);
        const initial = grid.querySelectorAll('[data-test-id]').length;
        root.scrollTop = root.scrollHeight;
        await new Promise(r => setTimeout(r, 200));
        const next = grid.querySelectorAll('[data-test-id]').length;
        renderItemBatches(grid, [299], tile, root, 120);
        await new Promise(r => setTimeout(r, 200));
        const final = [...grid.querySelectorAll('[data-test-id]')].map(n => Number(n.dataset.testId));
        root.remove(); return {initial, next, final};
    }""")
    assert result["initial"] == 120
    assert result["next"] > 120
    assert result["final"] == [299]
    assert not pg.errors


@pytest.mark.parametrize(("language", "name"), [("en", "Performance profile"), ("es", "Perfil de rendimiento"), ("zh", "性能配置")])
def test_performance_settings_and_effective_preferences(clean, pg, language, name):
    clean.ctx.settings.update({"app.language": language, "app.onboarded": True, "performance.profile": "balanced", "sprites.motion": "on", "sprites.animation": {}})
    try:
        pg.goto(clean.url("#/settings/performance"))
        profile = pg.get_by_role("combobox", name=name, exact=True)
        profile.wait_for()
        assert profile.input_value() == "balanced"
        pg.wait_for_function("""async () => { const p = await import('/js/performance.js'); return p.itemBatchSize(true) === 120; }""")
        profile.select_option("lightweight")
        pg.wait_for_function("""async () => { const p = await import('/js/performance.js'); const s = await import('/js/sprites.js'); return p.itemBatchSize(true) === 60 && !s.animatedIn('summary'); }""")
        profile.select_option("quality")
        pg.wait_for_function("""async () => { const p = await import('/js/performance.js'); const s = await import('/js/sprites.js'); return p.itemBatchSize(true) === 240 && s.animatedIn('dex_grid'); }""")
        profile.select_option("custom")
        pg.locator(".settings-layout .card select").last.wait_for()
        pg.wait_for_function("""async () => { const p = await import('/js/performance.js'); return p.itemBatchSize(true) === 120; }""")
        pg.reload()
        assert pg.get_by_role("combobox", name=name, exact=True).input_value() == "custom"
        assert not pg.errors
    finally:
        clean.ctx.settings.update({"performance.profile": "balanced", "performance.item_batch": "normal", "performance.default_motion": "standard", "sprites.motion": "system", "sprites.animation": {}, "app.language": "en"})


def test_walkthrough_tables_loaded_only_when_needed(clean, pg):
    clean.ctx.settings.update({"app.language": "es", "app.onboarded": True})
    requested = []
    pg.on("request", lambda r: requested.append(r.url))
    try:
        pg.goto(clean.url("#/tools/typechart"))
        pg.locator("#main .page").first.wait_for()
        assert not any("/js/walkthrough-locales.js" in u or "/js/walkthrough-generated.js" in u for u in requested)
        pg.evaluate("location.hash = '#/guides/storyline?browse=1&region=kanto'")
        pg.locator(".browse-chapter").first.wait_for()
        assert any("/js/walkthrough-locales.js" in u for u in requested)
        assert any("/js/walkthrough-generated.js" in u for u in requested)
        assert "Baja las escaleras" in pg.locator(".browse-chapter").first.text_content()
        assert not pg.errors
    finally:
        clean.ctx.settings.update({"app.language": "en"})

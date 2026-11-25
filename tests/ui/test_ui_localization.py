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
        missing: t('unknown.test_key'), singular: plural('ui.home_feed_active', 1),
      };
    }""")
    assert not result["issues"]
    assert result["spanish"] == ["Pikachu", "Impactrueno", "Pueblo Paleta", "electrico"]
    assert result["missing"] == "unknown.test_key"
    assert "1 aviso" in result["singular"]


@pytest.mark.parametrize(("language", "locale"), [("en", "en"), ("es", "es"), ("zh", "zh-Hans")])
def test_offline_route_inventory(clean, pg, language, locale):
    clean.ctx.settings.update({"app.language": language, "app.onboarded": True})
    routes = dict.fromkeys([*ROUTES, "#/live/reports", "#/news", "#/events", "#/collection/showcases",
                           *(f"#/guides/storyline?region={region}" for region in
                             ("kanto", "johto", "hoenn", "sinnoh", "unova"))])
    shots = os.environ.get("COMPANION_LOCALIZATION_SCREENSHOTS")
    for route in routes:
        pg.goto(clean.url(route))
        pg.locator("#main .page").first.wait_for()
        assert pg.locator("html").get_attribute("lang") == locale, route
        assert not pg.errors, (route, pg.errors)
        if shots and route in {"#/home", "#/pokedex/6", "#/tools/typechart", "#/live/phenomena"}:
            target = Path(shots)
            target.mkdir(parents=True, exist_ok=True)
            pg.evaluate("document.fonts.ready")
            pg.screenshot(path=target / f"{language}-{route[2:].replace('/', '-')}.png",
                          animations="disabled")

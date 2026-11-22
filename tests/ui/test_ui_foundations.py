"""UI flows for the accuracy + foundations pass: species/forms catalog, Item Library, Notes,
Websites & links, keyboard shortcuts, text-size popover, removed Damage calculator."""
import pytest

from tests.ui.test_ui_flows import DUMPS, app, browser, data_dir, go, page  # noqa: F401  (fixtures)

pytestmark = pytest.mark.ui


def test_pokedex_shows_one_card_per_species_with_forms_inside_details(app, page):
    go(page, app, "#/pokedex")
    page.wait_for_selector(".dex-card")
    info = page.locator(".dex-info").inner_text()
    assert "649 of 649 Pokémon shown" in info
    assert "82 alternate forms available within Pokémon details" in info
    assert page.locator(".dex-grid .gen-head").count() == 5
    assert page.locator(".dex-grid .dex-card").count() == 649
    assert page.locator('.dex-card[data-entry="479"]').count() == 1
    assert page.locator('.dex-card[data-entry="479:wash"]').count() == 0
    assert "unavailable" not in page.locator('.dex-card[data-entry="640"]').get_attribute("aria-label").lower()


def test_form_detail_and_back_keeps_filters(app, page):
    go(page, app, "#/pokedex")
    page.fill("#dex-search", "kyurem")
    page.wait_for_timeout(400)
    assert page.locator(".dex-grid .dex-card").count() == 1
    page.locator('.dex-card[data-entry="646"]').click()
    page.wait_for_selector(".form-strip")
    page.locator(".form-strip button", has_text="Black Kyurem").click()
    page.wait_for_timeout(400)
    assert "Black Kyurem" in page.locator(".detail-head h2").inner_text()
    assert "Form change not verified" in page.locator(".detail-head").inner_text()
    page.locator(".form-strip button", has_text="Kyurem").first.click()
    page.wait_for_timeout(400)
    assert page.locator(".dex-grid .dex-card").count() == 1  # same search filter


@pytest.mark.parametrize("mode", ["compact", "expanded"])
def test_popout_species_and_form_detail(app, browser, mode):  # noqa: F811
    pop = browser.new_context(viewport={"width": 460, "height": 600}).new_page()
    pop.goto(app.srv.base_url + f"?token={app.ctx.token}&popout=pokedex&mode={mode}&shell=browser")
    pop.wait_for_selector(".dex-card")
    pop.wait_for_timeout(500)
    cards = pop.locator(".popout-body .dex-card")
    assert cards.count() == 649
    last = cards.last
    last.scroll_into_view_if_needed()
    assert last.get_attribute("data-entry") == "649" and last.is_visible()
    last.click()
    pop.wait_for_selector(".form-strip")
    pop.locator(".form-strip button", has_text="Chill Drive").click()
    pop.wait_for_timeout(400)
    assert "Chill Drive" in pop.locator(".detail-head h2").inner_text()
    pop.context.close()


def test_virizion_detail_is_permanent_raid(app, page):
    go(page, app, "#/pokedex/640")
    page.wait_for_selector(".avail-block")
    t = page.locator(".avail-block").inner_text()
    assert "Permanent raid" in t and "Pinwheel Forest" in t and "Lunar New Year 2026" in t


def test_damage_calculator_removed(app, page):
    app.ctx.settings.update({"nav.quick_access": [{"kind": "tool", "id": "typechart"}]})
    go(page, app, "#/tools")
    page.wait_for_selector(".tool-card")
    assert "damage" not in page.locator(".main").inner_text().lower().replace("no damage calculator", "")
    go(page, app, "#/tools/damage")
    page.wait_for_selector(".tool-card")
    assert page.url.endswith("#/tools")
    assert "Damage" not in page.locator(".quick").inner_text()


@pytest.mark.skipif(not DUMPS, reason="needs POKEMMO_DUMPS_DIR")
def test_item_library_search_detail_quantity(app, page):
    go(page, app, "#/tools/items")
    page.wait_for_selector(".item-tile")
    page.fill("#item-search", "thunderstone")
    page.wait_for_timeout(400)
    assert page.locator(".item-tile").count() == 1
    page.locator(".item-tile").first.click()
    page.wait_for_selector(".item-desc")
    assert "Raichu" in page.locator(".dex-detail").inner_text()
    page.fill("input[aria-label='How many I have (manual)']", "4")
    page.keyboard.press("Tab")
    page.wait_for_timeout(500)
    assert app.ctx.storage.query_one("SELECT owned_qty FROM item_user WHERE item_id=5083")["owned_qty"] == 4
    assert page.locator(".item-tile img").first.get_attribute("src").startswith("/assets/private/items/")


def test_notes_create_edit_tag_link_trash_restore(app, page):
    go(page, app, "#/tools/notes")
    page.get_by_role("button", name="New note").first.click()
    page.wait_for_selector(".note-editor")
    page.fill(".note-title", "Shiny hunt plan")
    page.fill(".note-body", "Route 119 at night")
    page.fill("input[aria-label='Tags']", "hunt, hoenn")
    page.keyboard.press("Tab")
    page.wait_for_timeout(900)
    n = app.ctx.storage.query_one("SELECT * FROM lib_notes WHERE title='Shiny hunt plan'")
    assert n and n["body"] == "Route 119 at night" and "hoenn" in n["tags"]
    page.get_by_role("button", name="Link to…").click()
    page.fill("input[aria-label='Search what to link']", "Feebas")
    page.wait_for_timeout(300)
    page.locator(".pick-list .list-row").first.click()
    page.wait_for_timeout(500)
    assert app.ctx.storage.query_one("SELECT ref FROM note_links WHERE note_id=?", (n["id"],))["ref"] == "349"
    page.fill("#notes-search", "night")
    page.wait_for_timeout(600)
    assert page.locator(".note-row").count() == 1
    page.get_by_role("button", name="Delete", exact=True).click()
    page.wait_for_timeout(500)
    assert app.ctx.storage.query_one("SELECT deleted_at FROM lib_notes WHERE id=?", (n["id"],))["deleted_at"]
    page.locator(".toast button", has_text="Restore").click()
    page.wait_for_timeout(400)
    assert app.ctx.storage.query_one("SELECT deleted_at FROM lib_notes WHERE id=?", (n["id"],))["deleted_at"] is None


def test_notes_popout_edits_one_note(app, browser):  # noqa: F811
    n = app.ctx.notes.create({"title": "Popout note", "body": "x"})
    pop = browser.new_context(viewport={"width": 420, "height": 520}).new_page()
    pop.goto(app.srv.base_url + f"?token={app.ctx.token}&popout=notes&mode=standard&shell=browser#/note/{n['id']}")
    pop.wait_for_selector(".note-editor")
    pop.fill(".note-body", "edited from the popout")
    pop.wait_for_timeout(900)
    assert app.ctx.notes.get(n["id"])["body"] == "edited from the popout"
    pop.context.close()


def test_websites_add_validate_edit_delete(app, page):
    go(page, app, "#/tools/links")
    page.wait_for_selector(".bm-card")
    assert page.locator(".bm-card").count() >= 5 and "PokeMMO Hub" in page.locator(".main").inner_text()
    page.get_by_role("button", name="Add website").click()
    page.fill("#bm-url", "javascript:alert(1)")
    page.fill("#bm-title", "bad")
    page.get_by_role("button", name="Save").click()
    page.wait_for_timeout(300)
    assert "https" in page.locator(".modal [role=alert]").inner_text()
    page.fill("#bm-url", "pikammo.fr/Pokemmo/en/guide/raids")
    page.fill("#bm-title", "PikaMMO raids")
    page.get_by_role("button", name="Save").click()
    page.wait_for_timeout(500)
    assert "PikaMMO raids" in page.locator(".main").inner_text()
    card = page.locator(".bm-card", has_text="PikaMMO raids")
    card.get_by_role("button", name="Delete").click()
    page.locator(".modal .btn.danger").click()
    page.wait_for_timeout(500)
    assert "PikaMMO raids" not in page.locator(".main").inner_text()


def _guide_state(app, run):
    return app.ctx.guides.state(run["id"], "kanto")


def test_guide_shortcuts_next_toggle_and_typing_suppression(app, page):
    app.ctx.settings.update({"shortcuts.bindings": None, "shortcuts.enabled": True})
    run = app.ctx.guides.create_run("Keys")
    app.ctx.settings.update({"guides.active_run": run["id"]})
    go(page, app, "#/guides?region=kanto")
    page.wait_for_selector(".step")
    first = _guide_state(app, run)["active_step_id"]
    page.locator("body").click(position={"x": 600, "y": 10})
    page.keyboard.press("Control+Shift+ArrowRight")
    page.wait_for_timeout(700)
    second = _guide_state(app, run)["active_step_id"]
    assert second != first
    page.keyboard.press("Control+Shift+Enter")
    page.wait_for_timeout(700)
    st = _guide_state(app, run)
    assert st["done"] == [second] and st["active_step_id"] == second
    page.keyboard.press("Control+Shift+ArrowLeft")
    page.wait_for_timeout(700)
    assert _guide_state(app, run)["active_step_id"] == first
    # typing in a text field never triggers it
    page.evaluate("document.body.append(Object.assign(document.createElement('input'), {id: 'typing'}))")
    page.focus("#typing")
    page.keyboard.press("Control+Shift+Enter")
    page.wait_for_timeout(600)
    assert _guide_state(app, run)["done"] == [second]


def test_shortcut_rebind_in_settings(app, page):
    app.ctx.settings.update({"shortcuts.bindings": None})
    go(page, app, "#/settings/shortcuts")
    row = page.locator(".kb-row", has_text="Show / hide the Storyline popout")
    row.locator(".kb-rec").click()
    page.keyboard.press("Control+Alt+G")
    page.wait_for_timeout(600)
    assert app.ctx.settings.get("shortcuts.bindings")["guide.popout"] == "Ctrl+Alt+G"
    assert "Ctrl + Alt + G" in row.inner_text()


def test_popout_text_size_popover(app, browser):  # noqa: F811
    pop = browser.new_context(viewport={"width": 420, "height": 520}).new_page()
    pop.goto(app.srv.base_url + f"?token={app.ctx.token}&popout=natures&mode=standard&shell=browser")
    pop.wait_for_selector(".ts-btn")
    assert pop.locator("text=A−").count() == 0
    pop.locator(".ts-btn").click()
    pop.wait_for_selector(".ts-pop")
    pop.locator(".ts-pop button", has_text="150%").click()
    pop.wait_for_timeout(500)
    assert app.ctx.settings.get("window.natures.text_scale") == 150
    pop.locator(".ts-pop button", has_text="Reset").click()
    pop.wait_for_timeout(500)
    assert app.ctx.settings.get("window.natures.text_scale") == 100
    pop.context.close()


def test_language_switch_translates_navigation_with_fallback(app, page):
    go(page, app, "#/home")
    page.locator(".lang-btn").first.click()
    page.locator(".lang-menu button", has_text="Español").click()
    page.wait_for_timeout(700)
    nav = page.locator(".sidebar, .topbar").first.inner_text()
    assert "Inicio" in nav and "Herramientas" in nav
    assert page.evaluate("document.documentElement.lang") == "es"
    app.ctx.settings.update({"app.language": "en"})

"""Offline reporting and local actions in the Live workspace and floating windows."""
import os
import re
from pathlib import Path

import pytest

from tests.ui.test_ui_flows import Running, browser, go, page, pw  # noqa: F401

pytestmark = pytest.mark.ui


@pytest.fixture
def reporter(tmp_path):
    app = Running(tmp_path)
    app.ctx.settings.update({"app.onboarded": True, "notify.alpha": "off", "notify.swarm": "off"})
    yield app
    app.stop()


def capture(page, name):
    if folder := os.environ.get("POKEMMO_COMMUNITY_SCREENSHOTS"):
        page.screenshot(path=Path(folder) / (name + ".png"), animations="disabled")


def test_reporting_and_own_report_actions_on_live(reporter, page):
    go(page, reporter, "#/live/reports")
    page.get_by_role("button", name="Enable local reporting").click()
    page.get_by_role("button", name="Report an encounter").click()
    dialog = page.get_by_role("dialog", name="Report an encounter")
    save = dialog.get_by_role("button", name="Save report")
    save.click()
    pw.expect(dialog.get_by_role("alert")).to_have_text("Choose a region.")
    dialog.locator("select").nth(1).select_option("kanto")
    dialog.get_by_role("searchbox", name="Search locations").fill("Cerulean Cave")
    places = dialog.get_by_role("combobox", name="Choose a location")
    assert places.locator("option").count() >= 3 and places.input_value() == ""
    save.click()
    pw.expect(dialog.get_by_role("alert")).to_have_text("Choose a location")
    places.select_option(label="Cerulean Cave (1F)")
    species = dialog.locator("input[role=combobox]")
    species.fill("Pikachu")
    dialog.get_by_role("option", name=re.compile(r"#025")).click()
    pw.expect(dialog.get_by_role("listbox")).to_be_hidden()
    dialog.get_by_role("combobox", name="When observed").select_option("just_appeared")
    dialog.get_by_role("combobox", name="Source of observation").select_option("firsthand")
    dialog.get_by_role("textbox", name="Short details (optional)").fill("Synthetic first-floor sighting")
    capture(page, "community-live-en")
    save.click()
    pw.expect(dialog).to_have_count(0)
    inspector = page.locator(".rep-detail-head").locator("..")
    pw.expect(inspector).to_contain_text("Synthetic first-floor sighting")
    pw.expect(inspector).to_contain_text("Firsthand observation")
    card = page.locator(".cur-card.kind-alpha")
    before = card.locator("[data-ends]").get_attribute("data-ends")

    card_actions = page.locator(".community-encounter .community-actions-wrap").first
    card_actions.get_by_text("Local actions", exact=True).click()
    card_actions.get_by_role("button", name="Still here").click()
    pw.expect(card).to_contain_text("Your check · Still here")
    inspector.get_by_role("button", name="Not found").click()
    pw.expect(card).to_contain_text("Your check · Not found")
    inspector.get_by_role("button", name="Mark personally completed").click()
    pw.expect(card).to_contain_text("Personally completed")
    assert card.locator("[data-ends]").get_attribute("data-ends") == before
    assert card.get_attribute("data-state") == "recent"

    inspector.get_by_role("button", name="Correct own report").click()
    correction = page.get_by_role("dialog", name="Correct own report")
    pw.expect(correction.locator("input[role=combobox]")).to_have_value("Pikachu")
    pw.expect(correction.get_by_role("combobox", name="Choose a location")).to_have_value(reporter.ctx.live.list()[0]["community"]["location_id"])
    correction.get_by_role("textbox", name="Short details (optional)").fill("Corrected synthetic note")
    correction.get_by_role("button", name="Save report").click()
    pw.expect(inspector).to_contain_text("Corrected synthetic note")
    inspector.get_by_text("Local activity and corrections", exact=True).click()
    pw.expect(inspector.get_by_role("link", name="Previous report")).to_have_count(1)
    assert card.locator("[data-ends]").get_attribute("data-ends") == before
    inspector.get_by_role("button", name="Withdraw own report").click()
    page.get_by_role("dialog", name="Withdraw own report").get_by_role("button", name="Withdraw own report").click()
    pw.expect(card).to_have_count(0)
    pw.expect(inspector).to_contain_text("Withdrawn or corrected")
    assert len(reporter.ctx.live.list()) == 2
    assert not [error for error in page.errors if "status of 400" not in error]


@pytest.mark.parametrize(("language", "tool", "mode", "size", "title", "save", "catalog_location"), [
    ("en", "reports", "expanded", (720, 620), "Report an encounter", "Save report", "Route 1"),
    ("es", "reports", "compact", (340, 235), "Avisar de un encuentro", "Guardar aviso", "Ruta 1"),
    ("zh", "reports", "standard", (420, 370), "报告遭遇", "保存报告", "1号道路"),
    ("zh", "phenomena", "standard", (420, 520), "报告遭遇", "保存报告", "1号道路"),
])
def test_localized_report_forms_in_floating_windows(reporter, page, language, tool, mode, size, title, save, catalog_location):
    reporter.ctx.settings.update({"app.language": language, "live.community.enabled": True})
    page.set_viewport_size({"width": size[0], "height": size[1]})
    page.goto(reporter.srv.url("", popout=tool, mode=mode))
    page.get_by_role("button", name=title, exact=True).click()
    dialog = page.get_by_role("dialog", name=title)
    # Values stay canonical even when the field labels and location labels are translated.
    selections = dialog.locator("select")
    selections.nth(0).select_option("phenomena" if tool == "phenomena" else "swarm")
    selections.nth(1).select_option("unova")
    if tool == "phenomena":
        selections.nth(2).select_option("unknown")
        selections.nth(4).select_option("dust")
    else:
        dialog.locator('input[type="search"]').fill(catalog_location)
        options = selections.nth(3).locator("option")
        target = next(l["id"] for l in reporter.ctx.live.community.options()["locations"] if l["region"] == "unova" and l["name"] == "Route 1")
        assert options.filter(has_text=catalog_location).count() >= 1
        selections.nth(3).select_option(target)
        species = dialog.locator("input[role=combobox]")
        species.fill("皮卡丘" if language == "zh" else "#025")
        dialog.get_by_role("option", name=re.compile(r"#025")).wait_for()
        species.press("ArrowDown")
        species.press("Enter")
        pw.expect(dialog.get_by_role("listbox")).to_be_hidden()
    selections.nth(5).select_option("already_active")
    selections.nth(6).select_option("relayed")
    pw.expect(dialog.get_by_role("button", name=save, exact=True)).to_be_enabled()
    assert page.evaluate("document.querySelector('.modal').getBoundingClientRect().bottom <= innerHeight")
    page.evaluate("document.activeElement.blur(); document.querySelector('.modal .m-body').scrollTop = 0")
    capture(page, "community-popout-" + language)
    dialog.get_by_role("button", name=save, exact=True).click()
    pw.expect(dialog).to_have_count(0)
    if tool == "phenomena":
        pw.expect(page.locator("[data-observation]")).to_contain_text("结束时间未知")
        assert reporter.ctx.live.community.phenomena()[0]["location"] is None
    else:
        pw.expect(page.locator(".report-row")).to_have_count(1)
        row, = reporter.ctx.live.list()
        assert row["kind"] == "swarm" and row["species_id"] == 25
        assert row["community"]["provenance"] == "relayed"
    assert not page.errors


def test_species_results_scroll_and_keep_report_fields(reporter, page):
    reporter.ctx.settings.update({"live.community.enabled": True})
    page.set_viewport_size({"width": 355, "height": 330})
    page.goto(reporter.srv.url("", popout="reports", mode="standard"))
    page.get_by_role("button", name="Report an encounter", exact=True).click()
    dialog = page.get_by_role("dialog")
    region = dialog.get_by_role("combobox", name="Region", exact=True)
    region.select_option("kanto")
    location = dialog.get_by_role("combobox", name="Choose a location")
    location.select_option(label="Route 1")
    initial_location = location.input_value()
    details = dialog.get_by_role("textbox", name="Short details (optional)")
    details.fill("Preserve this report draft")
    region.select_option("unova")
    region.select_option("kanto")
    assert location.input_value() == initial_location
    dialog.get_by_role("searchbox", name="Search locations").fill("Cerulean")
    assert location.input_value() == initial_location

    species = dialog.locator("input[role=combobox]")
    species.fill("Hit")
    results = dialog.get_by_role("listbox")
    pw.expect(results.get_by_role("option").nth(2)).to_be_visible()
    assert [entry.split("#")[0].strip() for entry in results.get_by_role("option").all_inner_texts()[:3]] == [
        "Hitmonchan", "Hitmonlee", "Hitmontop",
    ]
    species.press("Enter")
    assert species.input_value() == "Hit"
    species.press("Escape")
    pw.expect(results).to_be_hidden()
    pw.expect(dialog).to_be_visible()
    species.fill("a")
    pw.expect(results).to_be_visible()
    assert results.evaluate("el => el.scrollHeight > el.clientHeight")
    results.evaluate("el => el.scrollTop = 80")
    assert results.evaluate("el => el.scrollTop") > 0
    species.fill("definitely not a Pokémon")
    pw.expect(dialog.get_by_text("No matching Pokémon.")).to_be_visible()
    dialog.get_by_role("button", name="Save report").click()
    pw.expect(dialog.get_by_role("alert")).to_have_text("Choose a Pokémon from the search results.")
    assert details.input_value() == "Preserve this report draft"
    species.fill("Hit")
    species.press("ArrowDown")
    species.press("ArrowDown")
    species.press("Enter")
    assert species.input_value() == "Hitmonlee"
    capture(page, "qa01-report-hitmonlee")
    dialog.get_by_role("button", name="Clear", exact=True).click()
    assert species.input_value() == ""
    species.fill("#237")
    species.press("ArrowDown")
    species.press("Enter")
    assert species.input_value() == "Hitmontop"

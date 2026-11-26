"""Breeding Plan regression checks with bundled data and temporary profiles."""
import json

import pytest

from companion.services.breeding import plan_summary
from tests.ui.test_ui_flows import Running, browser, go, page, pw  # noqa: F401

pytestmark = pytest.mark.ui
PLANS = "/api/docs/breeding_plan"
COMPUTE = "/api/tools/breeding/plan"
TARGET = 'input[aria-label="Target species"]'


@pytest.fixture
def planner(tmp_path):
    app = Running(tmp_path)
    app.ctx.settings.update({"app.onboarded": True})
    yield app
    app.stop()


def set_species(page, name, dex_number):
    picker = page.locator(TARGET)
    picker.fill(name)
    picker.dispatch_event("change")
    page.locator(".field .row").get_by_text(dex_number, exact=True).wait_for()


def test_draft_survives_recalculation_export_import_and_preview(planner, page, tmp_path):
    failed_assets = []
    page.on("response", lambda response: failed_assets.append(response.url) if response.status == 404 else None)
    go(page, planner, "#/tools/breeding?tab=plan&plan=__new")
    set_species(page, "Pikachu", "#025")
    name = page.get_by_role("textbox", name="Plan name")
    name.fill("Pikachu draft")
    price = page.get_by_role("spinbutton", name="Power Weight price")
    price.fill("13500")
    speed = page.get_by_role("checkbox", name="Spe 31", exact=True)
    speed.uncheck()
    nature = page.get_by_role("combobox", name="Nature", exact=True)
    nature.select_option("Timid")
    root = page.locator(".tree-node").first
    pw.expect(root.locator(".lbl")).to_contain_text("Timid")
    assert not speed.is_checked()
    assert page.locator(TARGET).input_value() == "Pikachu"
    assert name.input_value() == "Pikachu draft" and price.input_value() == "13500"
    assert "Everstone" in page.locator("table").inner_text()
    assert "Power Anklet" not in page.locator("table").inner_text()

    with page.expect_download() as downloaded:
        page.get_by_role("button", name="Export", exact=True).click()
    exported = tmp_path / "plan.json"
    downloaded.value.save_as(exported)
    payload = json.loads(exported.read_text(encoding="utf-8"))
    assert payload["version"] == 1 and payload["name"] == "Pikachu draft"
    assert payload["plan"]["species"] == 25 and payload["plan"]["prices"] == {"Power Weight": 13500}

    root.locator(".lbl").click()
    page.get_by_role("button", name="Open this step in Breeding Preview").click()
    parents = page.locator(".parent-card input[list]")
    pw.expect(parents.first).to_have_value("Pikachu")
    pw.expect(parents.last).to_have_value("Pikachu")
    pair = planner.ctx.storage.get_document("pairing", "current")["data"]
    tree_parents = plan_summary(payload["plan"])["tree"]["parents"]
    for parent, step in zip((pair["a"], pair["b"]), tree_parents):
        traits = step["node"]["traits"]
        assert parent["species"] == 25 and parent["item"] == step["item"]
        assert parent["ivs"] == {trait: 31 for trait in traits if not trait.startswith("nature:")}
        assert parent["nature"] == ("Timid" if "nature:Timid" in traits else None)

    page.get_by_role("tab", name="Breeding Plan").click()
    pw.expect(name).to_have_value("Pikachu draft")
    create = []
    page.route(f"**{PLANS}?*", lambda route: create.append(route), times=1)
    with page.expect_request(lambda req: f"{PLANS}?" in req.url and req.method == "POST"):
        page.get_by_role("button", name="Save plan", exact=True).click()
    name.fill("Pikachu saved")
    create[0].continue_()
    page.get_by_text("Autosaves", exact=True).wait_for()
    original, = planner.ctx.storage.list_documents("breeding_plan")
    assert original["name"] == "Pikachu saved" and original["data"] == payload["plan"]

    with page.expect_file_chooser() as chooser:
        page.get_by_role("button", name="Import", exact=True).click()
    chooser.value.set_files(exported)
    pw.expect(name).to_have_value("Pikachu draft (imported)")
    documents = {doc["id"]: doc for doc in planner.ctx.storage.list_documents("breeding_plan")}
    assert len(documents) == 2 and documents[original["id"]]["data"] == payload["plan"]
    assert all(doc["data"] == payload["plan"] for doc in documents.values())
    page.reload()
    pw.expect(name).to_have_value("Pikachu draft (imported)")
    pw.expect(price).to_have_value("13500")
    assert failed_assets == []
    assert page.errors == []


def test_rapid_edits_survive_slow_autosave_recalculation_and_plan_switch(planner, page):
    first_data = {"species": 25, "nature": None, "ivs": ["hp", "attack", "speed"], "prices": {}, "node_status": {}}
    other_data = {**first_data, "species": 4, "nature": "Bold"}
    db = planner.ctx.storage
    db.put_document("breeding_plan", "first", "First plan", first_data)
    db.put_document("breeding_plan", "other", "Other plan", other_data)
    held_write, held_calculation = [], []

    def hold_first_write(route):
        if route.request.method == "PUT" and not held_write:
            held_write.append(route)
        else:
            route.continue_()

    def hold_modest_calculation(route):
        if route.request.post_data_json["nature"] == "Modest":
            held_calculation.append(route)
        else:
            route.continue_()

    page.route(f"**{PLANS}/first?*", hold_first_write)
    page.route(f"**{COMPUTE}?*", hold_modest_calculation)
    go(page, planner, "#/tools/breeding?tab=plan&plan=first")
    name = page.get_by_role("textbox", name="Plan name")
    nature = page.get_by_role("combobox", name="Nature", exact=True)
    chooser = page.get_by_role("combobox", name="Saved plans")
    price = page.get_by_role("spinbutton", name="Power Weight price")
    root = page.locator(".tree-node").first
    with page.expect_request(lambda req: f"{PLANS}/first?" in req.url and req.method == "PUT"):
        name.fill("Opening edit")
    with page.expect_request(lambda req: COMPUTE in req.url and req.post_data_json["nature"] == "Modest"):
        nature.select_option("Modest")
    nature.select_option("Timid")
    pw.expect(root.locator(".lbl")).to_contain_text("Timid")
    with page.expect_response(lambda res: COMPUTE in res.url and res.request.post_data_json["nature"] == "Modest") as response:
        held_calculation[0].continue_()
    response.value.finished()
    assert "Timid" in root.locator(".lbl").inner_text()
    name.fill("Final edit")
    price.fill("15000")
    chooser.select_option("other")
    pw.expect(name).to_have_value("Other plan")
    pw.expect(page.locator(TARGET)).to_have_value("Charmander")
    chooser.select_option("first")
    pw.expect(name).to_have_value("Final edit")
    pw.expect(nature).to_have_value("Timid")
    pw.expect(price).to_have_value("15000")
    held_write[0].continue_()
    page.get_by_text("Autosaves", exact=True).wait_for()

    persisted = db.get_document("breeding_plan", "first")
    assert persisted["name"] == "Final edit"
    assert persisted["data"] == {**first_data, "nature": "Timid", "prices": {"Power Weight": 15000}}
    assert db.get_document("breeding_plan", "other")["data"] == other_data
    page.reload()
    pw.expect(name).to_have_value("Final edit")
    pw.expect(nature).to_have_value("Timid")
    assert page.errors == []


def test_failed_autosave_keeps_edits_and_can_be_retried(planner, page):
    data = {"species": 25, "nature": None, "ivs": ["hp", "attack"], "node_status": {"r": "done"}, "prices": {}}
    db = planner.ctx.storage
    db.put_document("breeding_plan", "keep", "Saved name", data)
    go(page, planner, "#/tools/breeding?tab=plan&plan=keep")
    page.route(f"**{PLANS}/keep?*", lambda route: route.fulfill(status=503, json={"error": "Temporary save failure"}), times=1)
    name = page.get_by_role("textbox", name="Plan name")
    name.fill("Local edit")
    page.get_by_role("button", name="Retry save").wait_for()
    assert db.get_document("breeding_plan", "keep")["name"] == "Saved name"
    chooser = page.get_by_role("combobox", name="Saved plans")
    chooser.select_option("__new")
    chooser.select_option("keep")
    pw.expect(name).to_have_value("Local edit")
    nature = page.get_by_role("combobox", name="Nature", exact=True)
    nature.select_option("Timid")
    dialog = page.get_by_role("dialog", name="Reset step progress?")
    dialog.get_by_role("button", name="Cancel", exact=True).click()
    pw.expect(nature).to_have_value("")
    page.get_by_role("button", name="Retry save").click()
    page.get_by_text("Autosaves", exact=True).wait_for()
    doc = db.get_document("breeding_plan", "keep")
    assert doc["name"] == "Local edit" and doc["data"] == data

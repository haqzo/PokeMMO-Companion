"""The Live UI and popouts display the same shared feed from isolated profiles."""

import re
import time

import pytest

from companion.server import CompanionServer
from test_shared_community import boot, lab, obs  # noqa: F401
from tests.ui.test_ui_community import capture
from tests.ui.test_ui_flows import browser, page, pw  # noqa: F401

pytestmark = pytest.mark.ui


def open_live(page, server, route="#/live/reports"):
    page.goto(server.url(route))
    page.locator(".main .page").wait_for()


def submit(page, share, note):
    page.get_by_role("button", name="Report an encounter").click()
    dialog = page.get_by_role("dialog", name="Report an encounter")
    checkbox = dialog.get_by_role("checkbox", name="Share this report with the test service")
    pw.expect(checkbox).not_to_be_checked()
    if share:
        checkbox.check()
    dialog.locator("select").nth(1).select_option("kanto")
    dialog.get_by_role("searchbox", name="Search locations").fill("Route 1")
    dialog.get_by_role("combobox", name="Choose a location").select_option(label="Route 1")
    species = dialog.locator("input[role=combobox]")
    species.fill("Pikachu")
    dialog.get_by_role("option", name=re.compile(r"#025")).click()
    dialog.get_by_role("combobox", name="When observed").select_option("already_active")
    dialog.get_by_role("combobox", name="Source of observation").select_option("firsthand")
    dialog.get_by_role("textbox", name="Short details (optional)").fill(note)
    dialog.get_by_role("button", name="Save report").click()
    pw.expect(dialog).to_have_count(0)


def test_explicit_sharing_merged_sources_and_remote_ownership(lab, page):
    alice, bob = lab.alice, lab.bob
    for ctx in (alice, bob):
        ctx.settings.update({"app.onboarded": True, "notify.alpha": "off"})
    boot(alice, bob)
    alice_ui = CompanionServer(alice).start()
    bob_ui = CompanionServer(bob).start()
    try:
        page.set_viewport_size({"width": 1280, "height": 1060})
        source = page.locator(".community-source")
        open_live(page, alice_ui)
        pw.expect(source).to_contain_text("Connected to test service")
        submit(page, False, "Alice's local report")
        boot(bob)
        assert bob.live.list() == []
        submit(page, True, "Synthetic report shared by Alice")
        inspector = page.locator(".rep-detail-head").locator("..")
        pw.expect(inspector.locator(".community-evidence")).to_contain_text("Shared with test service")
        boot(bob)
        remote, = bob.live.list()
        bob.live.ingest({"id": "ntfy-example", "topic": "alphapings", "title": "Pikachu", "time": int(time.time()),
                         "message": "Kanto, Route 1"})

        open_live(page, bob_ui, "#/live/reports/" + remote["id"])
        pw.expect(source).to_contain_text("Connected to test service")
        cards = page.locator(".cur-card.kind-alpha")
        pw.expect(cards).to_have_count(1)
        sources = cards.locator(".community-sources")
        pw.expect(sources).to_contain_text("Alphapedia")
        pw.expect(sources).to_contain_text("Companion Community")
        inspector = page.locator(".rep-detail-head").locator("..")
        pw.expect(inspector).to_contain_text("Shared report by alice")
        pw.expect(inspector.get_by_role("button", name="Correct own report")).to_have_count(0)
        pw.expect(inspector.get_by_role("button", name="Withdraw own report")).to_have_count(0)
        capture(page, "shared-live-en")

        lab.stop()
        bob.live.community.sync.poll()
        pw.expect(source).to_contain_text("Disconnected from test service")
        pw.expect(cards).to_have_count(1)
        capture(page, "disconnected-live-en")
        lab.start()
        boot(bob)
        pw.expect(source).to_contain_text("Connected to test service")
        assert page.errors == []
    finally:
        bob_ui.stop()
        alice_ui.stop()


@pytest.mark.parametrize(("language", "connected", "by_author"), [
    ("es", "Conectado al servicio de prueba", "Aviso compartido por alice"),
    ("zh", "已连接测试服务", "由 alice 共享的报告"),
])
def test_shared_provenance_is_localized_in_reports_popout(lab, page, language, connected, by_author):
    alice, bob = lab.alice, lab.bob
    boot(alice, bob)
    alice.live.community.submit(obs(alice, details="Synthetic report for a localized popout"))
    boot(bob)
    bob.settings.update({"app.language": language, "app.onboarded": True})
    server = CompanionServer(bob).start()
    try:
        page.set_viewport_size({"width": 720, "height": 620})
        page.goto(server.url("", popout="reports", mode="expanded"))
        pw.expect(page.locator(".community-source")).to_contain_text(connected)
        pw.expect(page.locator(".report-row .community-evidence")).to_contain_text(by_author)
        capture(page, "shared-popout-" + language)
        assert page.errors == []
    finally:
        server.stop()

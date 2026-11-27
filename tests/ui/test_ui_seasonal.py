import re
import os
from pathlib import Path

import pytest

from test_seasonal import fixture
from tests.ui.test_ui_flows import Running, browser, go, page, pw  # noqa: F401

pytestmark = pytest.mark.ui


def test_seasonal_panel_reports_and_manual_timer(tmp_path, page, monkeypatch):
    app = Running(tmp_path, internal_reporting=True)
    try:
        app.ctx.settings.update({"app.onboarded": True, "live.community.enabled": True})
        go(page, app, "#/home")
        assert not page.get_by_text("Synthetic seasonal event").is_visible()
        doc = fixture()
        monkeypatch.setattr(app.ctx.refdata, "seasonal_catalog", lambda: doc)
        app.ctx.bus.publish("reference")
        page.get_by_text("Synthetic seasonal event", exact=False).wait_for()
        go(page, app, "#/live/reports")
        page.get_by_text("Synthetic seasonal event", exact=False).wait_for()
        card = page.locator("details", has_text="Synthetic seasonal event").first
        card.get_by_role("button", name="Report an encounter").first.click()
        dialog = page.get_by_role("dialog", name="Synthetic observation")
        dialog.locator('select').nth(1).select_option("just_appeared")
        dialog.get_by_role("button", name="Save report").click()
        card.get_by_text("Estimated expiry", exact=False).wait_for()
        if output := os.environ.get("BATCH05_SCREENSHOTS"):
            page.screenshot(path=Path(output) / "seasonal-live.png", animations="disabled")
        with page.expect_popup() as pending:
            page.get_by_role("button", name="Pop out", exact=True).click()
        floating = pending.value
        floating.get_by_text("Synthetic seasonal event", exact=False).wait_for()
        floating.close()
        card.get_by_role("button", name="Start personal timer").click()
        pw.expect(page).to_have_url(re.compile(r"#/tools/timers$"))
        assert app.ctx.timers.list()["timers"][0]["state"] == "running"
    finally:
        app.stop()

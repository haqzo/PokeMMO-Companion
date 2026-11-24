"""Phenomenon UI backed by reconstructed fixtures and synthetic screenshot pixels."""
import base64
from datetime import datetime, timedelta, timezone

import pytest

from tests.ui.test_ui_flows import app, browser, data_dir, go, page  # noqa: F401
from test_phenomena import LOCAL, fixture_at, read, snapshot

pytestmark = pytest.mark.ui
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKlEAAAAASUVORK5CYII=")


def test_phenomena_on_home_live_and_popouts(app, page, monkeypatch):
    now = datetime.now(timezone.utc)
    grass = fixture_at(0, now - timedelta(minutes=5))
    shadow = {**fixture_at(1, now - timedelta(hours=2)), "image_url": None}
    app.ctx.live.phenomena.poll(LOCAL, 0, fetch=read(snapshot(now, grass, shadow)))
    monkeypatch.setattr("companion.server.fetch_image", lambda url: ("image/png", PNG))

    go(page, app, "#/home")
    home = page.locator(".home-phenomena")
    home.get_by_text("Grass at Village Bridge").wait_for()
    assert "Bottom Left" in home.inner_text() and "None required" in home.inner_text()
    assert "Activity unverified" in home.inner_text()
    assert home.get_by_text("Shadow at Route 1").count() == 0
    home.get_by_role("button", name="Enlarge location screenshot").click()
    dialog = page.get_by_role("dialog", name="Grass at Village Bridge")
    dialog.get_by_role("checkbox", name="Original size").check()
    img = dialog.locator("img")
    img.wait_for()
    page.wait_for_function("document.querySelector('[role=dialog] img')?.naturalWidth === 1")
    dialog.get_by_role("button", name="Close").click()
    home.get_by_role("button", name="Reports", exact=True).click()

    page.get_by_text("Grass at Village Bridge").wait_for()
    page.get_by_role("combobox", name="Report period").select_option("history")
    page.get_by_text("Shadow at Route 1").wait_for()
    page.get_by_role("combobox", name="Phenomenon region").select_option("unknown")
    assert page.locator(".phenomenon-card").count() == 1
    assert "Surf" in page.locator(".phenomenon-card").inner_text()
    page.get_by_role("searchbox", name="Search Phenomena").fill("no match")
    page.get_by_text("No saved reports match.").wait_for()
    page.get_by_role("searchbox", name="Search Phenomena").fill("")

    with page.expect_popup() as pending:
        page.get_by_role("button", name="Pop out", exact=True).click()
    popout = pending.value
    try:
        popout.get_by_text("Grass at Village Bridge").wait_for()
        popout.locator('button[title="Compact view"]').click()
        popout.get_by_text("Grass at Village Bridge").wait_for()
        assert popout.locator(".phenomenon-card").count() == 1
        popout.locator('button[title="Expanded view"]').click()
        popout.get_by_role("combobox", name="Report period").select_option("history")
        popout.get_by_text("Shadow at Route 1").wait_for()
    finally:
        popout.close()

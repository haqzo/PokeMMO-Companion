"""The offline reference replaces live Phenomenon UI without deleting saved reports."""
from datetime import datetime, timedelta, timezone

import pytest

from companion import __version__
from tests.ui.test_ui_flows import app, browser, data_dir, go, page  # noqa: F401
from test_phenomena import LOCAL, fixture_at, read, snapshot

pytestmark = pytest.mark.ui
WEBSITE = "https://alpha.pokemmotools.org/"
COMPANION_DISCORD = "https://discord.gg/5Wbh28M3gu"
ALPHAPEDIA_DISCORD = "https://discord.gg/Qeuc9k4yMw"


def test_phenomena_reference_on_home_live_and_popouts(app, page):
    now = datetime.now(timezone.utc)
    old = {**fixture_at(0, now - timedelta(hours=2)), "location": "Obsolete cached report"}
    app.ctx.live.phenomena.poll(LOCAL, 0, fetch=read(snapshot(now, old)))
    relay_requests = []
    page.on("request", lambda req: relay_requests.append(req.url) if "/api/live/phenomena" in req.url else None)
    go(page, app, "#/home")
    home = page.locator(".home-phenomena")
    assert home.get_by_role("link", name="Alphapedia", exact=True).get_attribute("href") == WEBSITE
    assert home.get_by_role("link", name="PokeMMO Companion Discord").get_attribute("href") == COMPANION_DISCORD
    assert "#phenomenon-callouts" in home.inner_text()
    home.get_by_role("button", name="Encounter reference").click()
    page.get_by_role("heading", name="Unova Phenomena").wait_for()
    assert page.get_by_role("link", name="Alphapedia", exact=True).get_attribute("href") == WEBSITE
    assert page.get_by_role("link", name="PokeMMO Companion Discord").get_attribute("href") == COMPANION_DISCORD
    assert page.locator(".phenomenon-card").count() == 4
    text = page.locator(".main").inner_text()
    for value in ("Emolga", "Village Bridge", "Alomomola", "Excadrill", "Surf", "#phenomenon-callouts"):
        assert value in text
    assert "Obsolete cached report" not in text
    assert page.locator(".main img").count() == 0
    assert page.get_by_role("button", name="Enlarge location screenshot").count() == 0
    assert not relay_requests

    with page.expect_popup() as pending:
        page.get_by_role("button", name="Pop out", exact=True).click()
    popout = pending.value
    try:
        popout.get_by_role("heading", name="Unova Phenomena").wait_for()
        popout.locator('button[title="Compact view"]').click()
        popout.get_by_text("Excadrill in Victory Road.").wait_for()
        assert popout.locator(".phenomenon-card img").count() == 0
        popout.locator('button[title="Expanded view"]').click()
        popout.get_by_role("link", name="Alphapedia Pheno List").wait_for()
    finally:
        popout.close()
    assert not page.errors


def test_verified_provider_links_and_no_relay_setup(app, page):
    go(page, app, "#/live/reports")
    assert page.get_by_role("link", name="Alphapedia", exact=True).get_attribute("href") == WEBSITE
    assert page.get_by_role("link", name="Alphapedia Discord").get_attribute("href") == ALPHAPEDIA_DISCORD
    go(page, app, "#/tools/links")
    assert WEBSITE in page.get_by_role("group", name="Alphapedia", exact=True).get_by_role("button").first.get_attribute("title")
    assert ALPHAPEDIA_DISCORD in page.get_by_role("group", name="Alphapedia Discord").get_by_role("button").first.get_attribute("title")
    go(page, app, "#/settings/sources")
    page.get_by_text("Alpha/Swarm report feed", exact=True).wait_for()
    assert page.get_by_role("checkbox", name="Enable Phenomenon reports").count() == 0
    page.get_by_role("button", name="Advanced", exact=True).click()
    page.get_by_role("heading", name="Advanced", exact=True).wait_for()
    assert page.get_by_label("Phenomenon relay override").count() == 0
    page.get_by_role("button", name="About & credits", exact=True).click()
    page.get_by_role("heading", name="About the Developer").wait_for()
    assert page.get_by_text(f"{__version__} Alpha", exact=True).is_visible()
    assert page.get_by_role("link", name="GitHub", exact=True).get_attribute("href") == "https://github.com/haqzo"
    assert page.get_by_role("link", name="Alphapedia", exact=True).get_attribute("href") == WEBSITE
    assert page.get_by_role("link", name="Alphapedia Discord").get_attribute("href") == ALPHAPEDIA_DISCORD

"""UI regressions for the native beta report of 2026-11-24: Home news order as rendered, Alpha & Swarm cards
(size, no clipped sprites, honest countdowns), built-in vs personal assets in Settings, walkthrough progress."""
import re
import time

import pytest

from tests.ui.test_ui_flows import DUMPS, app, browser, data_dir, go, page  # noqa: F401  (fixtures)

pytestmark = pytest.mark.ui


def _ingest(app, items):
    now = int(time.time())
    app.ctx.storage.execute("DELETE FROM reports")
    for mid, title, body, topic, ago_s in items:
        app.ctx.live.ingest({"id": mid, "event": "message", "time": now - ago_s, "topic": topic, "title": title, "message": body}, replay=True)


def test_home_news_is_rendered_newest_published_first(app, page):  # noqa: F811
    """Owner's case: a feed-discovered Nov 1 Halloween changelog was drawn above bundled Nov 13 / 7 / 5 posts."""
    app.ctx.settings.update({"app.onboarded": True, "home.sections": ["roamers", "live", "update", "news", "events", "quick"]})
    app.ctx.storage.set_settings({"news.feed_cache": {"ok": True, "items": [
        {"title": "Changelog - Halloween 2026", "link": "https://forums.pokemmo.com/index.php?/topic/990500-changelog-halloween-2026/",
         "published": "2026-11-01T17:00:00Z", "first_seen_at": "2026-11-24T16:00:00Z"}]}})
    try:
        page.set_viewport_size({"width": 1500, "height": 1000})
        go(page, app, "#/home")
        page.wait_for_selector(".home-news .list-row")
        rows = page.locator(".home-news .list-row")
        dates = rows.evaluate_all("els => els.map(e => e.dataset.published.slice(0, 10))")
        assert dates == sorted(dates, reverse=True), dates
        titles = rows.evaluate_all("els => els.map(e => e.innerText)")
        hall = next(t for t in titles if "Halloween" in t) if any("Halloween" in t for t in titles) else None
        if hall:                                       # shown only while it fits in the five newest
            assert "New" not in hall.split("\n") and "found later" in hall
        assert not page.errors
    finally:
        app.ctx.storage.set_settings({"news.feed_cache": None})


@pytest.mark.parametrize("n", [1, 2, 3])
def test_alpha_swarm_cards_use_the_panel_and_never_clip_sprites(app, browser, n):  # noqa: F811
    app.ctx.settings.update({"app.onboarded": True, "home.sections": ["roamers", "live", "update", "news", "events", "quick"]})
    _ingest(app, [("g1", "Gyarados", "Kanto, Route 12", "alphapings", 300), ("f1", "Feebas", "Hoenn, Route 119", "swarmpings", 420),
                  ("h1", "Houndoom", "Johto, Burned Tower", "swarmpings", 600)][:n])
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000})
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(app.url("#/home"))
    pg.wait_for_selector(".home-live .cur-card .rep-sprite img")
    pg.wait_for_timeout(800)
    cards = pg.locator(".home-live .cur-card")
    assert cards.count() == n
    info = cards.evaluate_all("""els => els.map(c => { const b = c.querySelector('.rep-sprite').getBoundingClientRect();
        const i = c.querySelector('.rep-sprite img').getBoundingClientRect();
        return { box: b.width, inside: i.left >= b.left - .5 && i.right <= b.right + .5 && i.top >= b.top - .5 && i.bottom <= b.bottom + .5,
                 card: c.getBoundingClientRect().width, timer: c.querySelector('.cur-timer').textContent }; })""")
    panel = pg.locator(".home-live .home-cur").bounding_box()["width"]
    for c in info:
        assert c["inside"], info                      # the visible sprite fits its box (was clipped at 72 px in a 56 px box)
        assert c["box"] >= 100, info                  # near the Roaming Legendaries size
        assert c["timer"] and not re.search(r"(?<![0-9])0 min", c["timer"])
    assert info[0]["card"] > panel * (0.95 if n == 1 else 0.45)        # one report spans the panel, two share it
    r = pg.locator(".home-roamers").bounding_box()
    lv = pg.locator(".home-live").bounding_box()
    assert abs(r["y"] - lv["y"]) < 1 and abs(r["height"] - lv["height"]) < 1
    assert not errors, errors
    ctx.close()


def test_countdowns_never_show_zero_minutes_or_contradict_the_status(app, page):  # noqa: F811
    app.ctx.settings.update({"app.onboarded": True, "live.swarm_estimate_minutes": 20})
    # ends in ~30 s, and one whose estimate ended ~20 s ago
    _ingest(app, [("s1", "Feebas", "Hoenn, Route 119", "swarmpings", 20 * 60 - 30), ("s2", "Wailmer", "Hoenn, Route 105", "swarmpings", 20 * 60 + 20)])
    go(page, app, "#/home")
    page.wait_for_selector(".home-live .cur-card")
    page.wait_for_timeout(500)
    feebas = page.locator(".home-live .cur-card", has_text="Feebas").inner_text()
    assert not re.search(r"(?<![0-9])0 min", feebas) and "under 1 min" in feebas and "Likely active" in feebas
    wailmer = page.locator(".home-live .cur-card", has_text="Wailmer")
    if wailmer.count():
        txt = wailmer.inner_text()
        assert not ("Likely active" in txt and "ended" in txt)       # never both
    assert not page.errors


def test_advanced_shows_builtin_sprites_as_built_in_not_as_your_files(app, page):  # noqa: F811
    app.ctx.sprite_library.remove()
    go(page, app, "#/settings/data")
    page.wait_for_selector("text=Built-in sprites")
    adv = page.locator(".main").inner_text()
    assert "Your files" not in adv and "Installed" not in adv.split("Built-in sprites")[1][:200]
    assert "included with Companion" in adv
    assert page.locator("input[aria-label='Sprite library folder']").input_value() == ""
    assert not page.locator("input[aria-label='Sprite library folder']").is_visible()      # tucked away: optional
    assert page.get_by_role("button", name="Remove and use the built-in sprites").count() == 0
    assert "Everything Companion needs is built in" in adv


def test_bundled_walkthrough_progress_counts_its_steps(app, page):  # noqa: F811
    run = app.ctx.guides.create_run("Progress check")
    app.ctx.settings.update({"guides.active_run": run["id"]})
    go(page, app, "#/guides/storyline?region=kanto")
    page.wait_for_selector(".progress")
    txt = page.locator(".main").inner_text()
    assert "0/454 steps" in txt and "0/0" not in txt                # was "0/0 main-story milestones"
    assert "Import them privately" not in txt and "original author" in txt


def test_community_link_is_optional_and_off_without_a_valid_invite(app, page, monkeypatch):  # noqa: F811
    app.ctx.settings.update({"app.onboarded": True, "home.community_link": True})
    go(page, app, "#/home")
    page.wait_for_selector(".home-head")
    link = page.locator("a.home-community")
    assert link.count() == 1 and link.get_attribute("href") == "https://discord.gg/5Wbh28M3gu"
    assert link.get_attribute("target") == "_blank" and "noopener" in link.get_attribute("rel")
    go(page, app, "#/settings/about")
    page.wait_for_selector("text=Credits")
    assert page.get_by_role("link", name="Join the community Discord").count() == 1
    # the player can hide it
    app.ctx.settings.update({"home.community_link": False})
    page.reload(); go(page, app, "#/home"); page.wait_for_selector(".home-head")
    assert page.locator("a.home-community").count() == 0
    # no (or a malformed) invite configured: no link anywhere, nothing breaks
    import companion.server as srv_mod
    monkeypatch.setattr(srv_mod, "community_links", lambda: {"discord": None})
    app.ctx.settings.update({"home.community_link": True})
    page.reload(); go(page, app, "#/home"); page.wait_for_selector(".home-head")
    assert page.locator("a.home-community").count() == 0
    go(page, app, "#/settings/about")
    page.wait_for_selector("text=Credits")
    assert page.get_by_role("link", name="Join the community Discord").count() == 0
    assert not page.errors


def test_invite_validation(monkeypatch):
    from companion import config
    for bad in ("", "http://discord.gg/x1", "https://discord.com/invite/abc", "https://discord.gg/<script>", None):
        monkeypatch.setattr(config, "COMMUNITY_DISCORD_INVITE", bad)
        assert config.community_links() == {"discord": None}
    monkeypatch.setattr(config, "COMMUNITY_DISCORD_INVITE", "https://discord.gg/5Wbh28M3gu")
    assert config.community_links()["discord"] == "https://discord.gg/5Wbh28M3gu"


def test_live_region_filter_and_disabled_phenomena_feed(app, page):  # noqa: F811
    _ingest(app, [("g1", "Gyarados", "Kanto, Route 12", "alphapings", 300), ("f1", "Feebas", "Hoenn, Route 119", "swarmpings", 420)])
    go(page, app, "#/live/reports")
    page.wait_for_selector(".report-row")
    assert page.locator(".report-row").count() == 2
    page.locator("select[aria-label='Region']").select_option("hoenn")
    page.wait_for_timeout(500)
    rows = page.locator(".report-row")
    assert rows.count() == 1 and "Feebas" in rows.first.inner_text()
    assert page.locator(".cur-card", has_text="Phenomen").count() == 0
    page.get_by_role("tab", name="Phenomena").click()
    page.get_by_text("Configure an approved relay", exact=False).wait_for()
    assert page.locator(".phenomenon-card").count() == 0
    assert not page.errors

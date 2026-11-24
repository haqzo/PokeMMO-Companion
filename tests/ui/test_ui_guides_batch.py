"""Unified Guides (All / Storyline / My Guides), old routes, guide timers and a linked team (2026-11-24)."""
import pytest

from tests.ui.test_ui_flows import app, browser, data_dir, go, page  # noqa: F401  (fixtures)

pytestmark = pytest.mark.ui


def _until(page, js, timeout=8000):
    """Poll an expression (the app's CSP forbids wait_for_function with a string)."""
    for _ in range(timeout // 100):
        if page.evaluate(js):
            return
        page.wait_for_timeout(100)
    raise AssertionError("condition not met: " + js)


def test_one_guides_destination_and_old_routes(app, page):  # noqa: F811
    g = app.ctx.cguides.create({"title": "Old bookmark guide", "scope": "money"})
    go(page, app, "#/home")
    page.wait_for_selector(".nav-item")
    assert page.locator(".nav-item[data-nav=guides]").count() == 1
    go(page, app, "#/tools")
    page.wait_for_selector(".page-head")
    assert "My guides" not in page.locator("#main").inner_text()       # no duplicate entry in Tools
    # old My guides links (bookmarks, notes, Quick access) redirect
    go(page, app, f"#/tools/cguides/{g['id']}")
    _until(page, f"location.hash === '#/guides/mine/{g['id']}'")
    page.wait_for_selector("h1:has-text('Old bookmark guide')")
    assert page.locator(".guides-tabs .tab.active").inner_text() == "My Guides"
    go(page, app, "#/tools/cguides")
    _until(page, "location.hash === '#/guides/mine'")
    # old storyline links open Storyline
    go(page, app, "#/guides?region=johto")
    page.wait_for_selector(".guides-tabs .tab.active")
    assert page.locator(".guides-tabs .tab.active").inner_text() == "Storyline"
    go(page, app, "#/guides")
    page.wait_for_selector(".guides-all")
    assert "Old bookmark guide" in page.locator(".guides-all").inner_text()
    assert not [e for e in page.errors if "favicon" not in e]


def test_personal_guide_without_run_with_timer_and_team(app, page):  # noqa: F811
    app.ctx.settings.update({"guides.active_run": None})
    g = app.ctx.cguides.create({"title": "Elite Four reruns", "scope": "elite_four", "recurring": True})
    app.ctx.cguides.put_steps(g["id"], [{"kind": "check", "depth": 0, "text": "Beat Lorelei", "links": []}])
    go(page, app, f"#/guides/mine/{g['id']}")
    page.wait_for_selector(".gx-timers")
    # add a guide timer (2 s) — nothing starts by itself
    page.locator(".gx-timers").get_by_role("button", name="Add timer").click()
    page.locator(".modal input[aria-label='Timer name']").fill("Quick test")
    page.locator(".modal input[aria-label=Minutes]").fill("0")
    page.locator(".modal input[aria-label=Seconds]").fill("4")
    page.locator(".modal .btn.primary").click()
    page.wait_for_selector(".gx-timer[data-tpl]")
    assert not app.ctx.timers.list(f"cg:{g['id']}")["timers"]
    page.locator(".gx-timer[data-tpl]").get_by_role("button", name="Start").click()
    _until(page, "/Running|Finished/.test(document.querySelector('.gx-timer[data-tpl]').textContent)")
    owned = app.ctx.timers.list(f"cg:{g['id']}")["timers"]
    assert len(owned) == 1 and owned[0]["owner"]["template"] and owned[0]["owner"]["cycle"]
    # it is the same timer in Tools › Timers, labelled with its guide; leaving the page does not stop it
    go(page, app, "#/tools/timers")
    page.wait_for_selector(".tm-card .tm-owner")
    assert "Elite Four reruns" in page.locator(".tm-card .tm-owner").first.inner_text()
    page.wait_for_timeout(4200)
    app.ctx.timers.tick()
    assert app.ctx.timers.get(owned[0]["id"])["state"] == "done"
    detail = app.ctx.cguides.get(g["id"])
    assert detail["done"] == 0                                      # finishing a timer never ticks a step
    # create and link a team from the guide; it is the same saved team in Team builder
    go(page, app, f"#/guides/mine/{g['id']}")
    page.wait_for_selector(".gx-team")
    page.locator(".gx-team").get_by_role("button", name="Create team").click()
    page.wait_for_selector(".modal .team-editor")
    page.locator(".modal input[aria-label='Slot 1']").fill("130")
    page.locator(".modal input[aria-label='Slot 1']").dispatch_event("change")
    page.locator(".modal").get_by_role("button", name="Save team").click()
    page.wait_for_timeout(400)
    page.locator(".modal").get_by_role("button", name="Close").last.click()
    page.wait_for_selector(".gx-team .team-strip")
    ex = app.ctx.guide_extras.get(f"cg:{g['id']}")
    assert ex["team"] and ex["team"]["data"]["version"] == 2
    page.locator(".gx-team").get_by_role("button", name="Open in Team builder").click()
    _until(page, f"location.hash === '#/tools/team?team={ex['team_id']}'")
    page.wait_for_selector(".team-editor")
    assert "Used in 1 guide" in page.locator("#main").inner_text()
    assert not [e for e in page.errors if "favicon" not in e]


def test_storyline_region_timer_and_step_timer(app, page):  # noqa: F811
    run = app.ctx.guides.create_run("Timer")
    app.ctx.settings.update({"guides.active_run": run["id"]})
    go(page, app, "#/guides/storyline?region=kanto")
    page.wait_for_selector(".step.current")
    page.locator(".step.current .gx-add-step").click()
    page.locator(".modal input[aria-label='Timer name']").fill("Heal")
    page.locator(".modal .btn.primary").click()
    page.wait_for_selector(".step.current .gx-step-timer")
    page.locator(".step.current .gx-step-timer").get_by_role("button", name="Start").click()
    _until(page, "document.querySelector('.step.current .gx-step-timer').textContent.includes('Running')")
    t = app.ctx.timers.list(f"story:{run['id']}:kanto")["timers"]
    assert len(t) == 1 and t[0]["owner"]["run"] == run["id"] and t[0]["owner"]["step"]
    # another run never shares this timer
    run2 = app.ctx.guides.create_run("Other")
    app.ctx.settings.update({"guides.active_run": run2["id"]})
    go(page, app, "#/guides/storyline?region=kanto")
    page.reload()
    page.wait_for_selector(".gx-timers")
    _until(page, "document.querySelector('.run-pill').textContent.includes('Other')")
    assert page.locator(".gx-step-timer").count() == 0
    app.ctx.timers.delete(t[0]["id"])
    assert not [e for e in page.errors if "favicon" not in e]

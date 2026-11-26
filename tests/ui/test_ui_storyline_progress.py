"""Storyline scrolling and live progress in two real Chromium windows."""

import os
from pathlib import Path

import pytest

from tests.ui.test_ui_flows import CHROME, Running, go, page, pw  # noqa: F401

pytestmark = pytest.mark.ui


@pytest.fixture(scope="module")
def browser():
    with pw.sync_playwright() as playwright:
        # The thumb is part of the test and the captured evidence.
        options = {"executable_path": CHROME} if CHROME else {}
        chromium = playwright.chromium.launch(args=["--no-sandbox"], ignore_default_args=["--hide-scrollbars"], **options)
        yield chromium
        chromium.close()


@pytest.fixture
def story(tmp_path):
    app = Running(tmp_path)
    app.ctx.settings.update({"app.onboarded": True})
    try:
        yield app
    finally:
        app.stop()


def create_hoenn(app, *, chapter=4):
    guides = app.ctx.guides
    run = guides.create_run("Hoenn test run", region="hoenn")
    steps = guides.steps("hoenn", "walkthrough")
    guides.set_steps(run["id"], [s["id"] for s in steps if s["chapter_index"] < chapter], True)
    app.ctx.settings.update({"guides.active_run": run["id"]})
    return run, steps


def capture(page, name):
    if folder := os.environ.get("POKEMMO_STORYLINE_EVIDENCE"):
        page.screenshot(path=Path(folder) / (name + ".png"), animations="disabled")


def scrollbar_input(page, scroll):
    scroll.evaluate("el => { el.scrollTop = 0; }")
    assert scroll.evaluate("el => el.scrollHeight > el.clientHeight > 0")
    assert scroll.evaluate("el => el.offsetWidth - el.clientWidth >= 6")
    scroll.focus()
    page.keyboard.press("PageDown")
    page.wait_for_function("(el) => el.scrollTop > 0", arg=scroll.element_handle())
    page.keyboard.press("End")
    page.wait_for_function("(el) => el.scrollTop >= el.scrollHeight - el.clientHeight - 1", arg=scroll.element_handle())
    box = scroll.bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.mouse.wheel(0, -160)
    page.wait_for_function("(el) => el.scrollTop < el.scrollHeight - el.clientHeight - 1", arg=scroll.element_handle())


def drag_thumb(page, scroll):
    scroll.evaluate("el => { el.scrollTop = 0; }")
    box = scroll.bounding_box()
    x, y = box["x"] + box["width"] - 5, box["y"] + 5
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x, y + min(120, box["height"] / 2), steps=12)
    page.mouse.up()
    page.wait_for_function("(el) => el.scrollTop > 0", arg=scroll.element_handle())


def test_readonly_and_active_storyline_scroll_with_visible_thumb(story, page):
    page.set_viewport_size({"width": 1030, "height": 385})
    go(page, story, "#/guides/storyline?browse=1&region=hoenn")
    page.locator(".browse-chapter").first.wait_for()
    scroll = page.locator(".story-page")
    page.locator(".browse-chapter > summary").first.click()
    scrollbar_input(page, scroll)
    drag_thumb(page, scroll)
    assert story.ctx.guides.list_runs() == []

    create_hoenn(story)
    go(page, story, "#/guides/storyline")
    page.locator(".step.current").wait_for()
    page.get_by_role("button", name="All chapters", exact=False).click()
    assert page.locator(".story-steps .step").count() == len(story.ctx.guides.steps("hoenn", "walkthrough"))
    scrollbar_input(page, scroll)
    drag_thumb(page, scroll)
    page.set_viewport_size({"width": 790, "height": 285})
    page.locator(".story-sidebar").scroll_into_view_if_needed()
    chapter_nav = page.get_by_role("navigation", name="Chapters")
    scrollbar_input(page, chapter_nav)
    page.locator('.chapter-btn[data-chapter="4"]').click()
    assert page.locator(".story-steps .step").count() == 3
    scrollbar_input(page, scroll)
    assert page.get_by_role("button", name="Jump to current").is_visible()
    page.evaluate("""async () => (await import('/js/core.js')).saveSettings({
        'appearance.theme': { layout: { scrollbar: 'hidden' } }
    })""")
    assert scroll.evaluate("el => getComputedStyle(el).scrollbarWidth") == "none"
    assert scroll.evaluate("el => el.scrollHeight > el.clientHeight")
    assert not page.errors


def test_hoenn_main_and_standard_popout_stay_in_sync(story, page, browser):
    run, steps = create_hoenn(story)
    second = story.ctx.guides.create_run("Second character", region="sinnoh")
    route102 = [s["id"] for s in steps if s["chapter_index"] == 4]
    route104 = [s["id"] for s in steps if s["chapter_index"] == 5]
    woods = next(s["id"] for s in steps if s["chapter_index"] == 6)
    go(page, story, "#/guides/storyline?region=hoenn")
    obj = page.locator(".story-page")
    pw.expect(obj).to_have_attribute("data-objective", route102[0])
    page.get_by_role("button", name="Jump to current").click()
    capture(page, "storyline-main-hoenn")

    pop = browser.new_page(viewport={"width": 385, "height": 270})
    try:
        pop.goto(story.srv.url("", popout="storyline", mode="standard"))
        cur = pop.locator(".story-pop-scroll")
        pw.expect(cur).to_have_attribute("data-objective", route102[0])

        # Two out-of-order/rapid changes in the same frame must go through the real UI handlers.
        page.evaluate("""() => {
            const rows = document.querySelectorAll('.story-steps input.check');
            rows[1].click();
            rows[0].click();
        }""")
        pw.expect(cur).to_have_attribute("data-objective", route102[-1])
        pop.locator(".step.current input.check").check()
        pw.expect(obj).to_have_attribute("data-objective", route104[0])
        pw.expect(page.locator(".chapter-btn.active")).to_have_attribute("data-chapter", "5")
        page.locator('.chapter-btn[data-chapter="4"]').click()
        assert story.ctx.guides.state(run["id"], "hoenn")["active_step_id"] == route104[0]

        for step in route104:
            pw.expect(cur).to_have_attribute("data-objective", step)
            pop.locator(".step.current input.check").check()
        pw.expect(cur).to_have_attribute("data-objective", woods)
        pw.expect(obj).to_have_attribute("data-objective", woods)
        total = len(steps)
        completed = sum(s["chapter_index"] < 6 for s in steps)
        pw.expect(page.locator(".story-page .progress + span").first).to_have_text(f"{completed}/{total} steps")
        pw.expect(pop.locator(".story-pop-head .progress + span")).to_have_text(f"{completed}/{total}")
        pw.expect(page.locator(".chapter-btn.active")).to_have_attribute("data-chapter", "4")
        assert page.locator(".story-steps .step.current").count() == 0
        page.get_by_role("button", name="Jump to current").click()
        pw.expect(page.locator(".chapter-btn.active")).to_have_attribute("data-chapter", "6")
        pw.expect(page.locator(".story-steps .step.current")).to_have_attribute("data-step", woods)
        page.get_by_role("button", name="Undo", exact=True).click()
        pw.expect(cur).to_have_attribute("data-objective", route104[-1])

        # Region and character selectors in either window update the same run context.
        pop.get_by_role("combobox", name="Region", exact=True).select_option("johto")
        pw.expect(obj).to_have_attribute("data-scope", f"{run['id']}:johto:walkthrough")
        pop.get_by_role("combobox", name="Switch character run").select_option(second["id"])
        pw.expect(obj).to_have_attribute("data-scope", f"{second['id']}:sinnoh:walkthrough")
        page.locator(".run-pill").click()
        page.locator(".menu button", has_text=run["display"]).click()
        pw.expect(obj).to_have_attribute("data-scope", f"{run['id']}:johto:walkthrough")
        pw.expect(cur).to_have_attribute("data-scope", f"{run['id']}:johto:walkthrough:standard")
        assert not page.errors
    finally:
        pop.close()


@pytest.mark.parametrize(("mode", "language", "next_label", "previous", "jump", "scale", "size"), [
    ("compact", "es", "Paso siguiente", "Paso anterior", "Ir al paso actual", 135, (340, 250)),
    ("standard", "en", "Next step", "Previous step", "Jump to current", 125, (385, 270)),
    ("expanded", "zh", "下一步", "上一步", "跳转到当前步骤", 115, (555, 320)),
])
def test_popout_keys_scroll_and_navigation_in_every_preset(story, page, mode, language, next_label, previous, jump, scale, size):
    run, steps = create_hoenn(story)
    # Pick a long actual objective so Compact also needs its scrollbar at this size.
    long_step = max(steps, key=lambda s: len(s["text"]))
    index = steps.index(long_step)
    story.ctx.guides.set_region_prefs(run["id"], "hoenn", active_step_id=long_step["id"])
    story.ctx.settings.update({"app.language": language, "window.storyline.text_scale": scale})
    page.set_viewport_size({"width": size[0], "height": size[1]})
    page.goto(story.srv.url("", popout="storyline", mode=mode))
    scroller = page.locator(".story-pop-scroll")
    pw.expect(scroller).to_have_attribute("data-objective", long_step["id"])
    nav = page.locator(".story-pop-nav")
    next_button = nav.get_by_role("button", name=next_label)
    assert next_button.bounding_box()["y"] < scroller.bounding_box()["y"]
    scrollbar_input(page, scroller)
    drag_thumb(page, scroller)

    page.get_by_role("button", name=jump).click()
    current = page.locator(".step.current")
    assert current.bounding_box()["y"] <= scroller.bounding_box()["y"] + scroller.bounding_box()["height"]
    next_button.focus()
    page.keyboard.press("Enter")
    pw.expect(scroller).to_have_attribute("data-objective", steps[index + 1]["id"])
    assert current.bounding_box()["y"] >= scroller.bounding_box()["y"] - 1
    assert current.bounding_box()["y"] < scroller.bounding_box()["y"] + scroller.bounding_box()["height"]
    pw.expect(next_button).to_be_focused()
    nav.get_by_role("button", name=previous).click()
    pw.expect(scroller).to_have_attribute("data-objective", long_step["id"])

    # The separate panels keep their saved collapse preference across a redraw and reload.
    details = scroller.locator(".gx-pop")
    assert details.get_attribute("open") is None
    details.locator("summary").click()
    pw.expect(details).to_have_attribute("open", "")
    page.wait_for_function("async () => (await (await import('/js/core.js')).get('/api/settings'))['guides.popout_extras_open']")
    page.reload()
    pw.expect(details).to_have_attribute("open", "")
    details.locator("summary").click()
    pw.expect(details).not_to_have_attribute("open", "")

    route104 = next(s["id"] for s in steps if s["chapter_index"] == 5)
    story.ctx.guides.set_steps(run["id"], [s["id"] for s in steps if s["chapter_index"] < 5], True)
    story.ctx.guides.set_region_prefs(run["id"], "hoenn", active_step_id=route104)
    page.set_viewport_size({"width": max(size[0], 420), "height": max(size[1], 475)})
    page.reload()
    pw.expect(scroller).to_have_attribute("data-objective", route104)
    capture(page, f"storyline-{mode}-{language}")
    assert not page.errors

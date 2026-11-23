"""UI on a CLEAN installation: no PokeMMO dump, no ROMs, no private data (POKEMMO_DUMPS_DIR is ignored here).

Every region must show its built-in map with clickable areas that open real PokeMMO encounters immediately.
"""
import json
import time
from pathlib import Path

import pytest

from tests.ui.test_ui_flows import Running, browser  # noqa: F401  (fixtures)

pytestmark = pytest.mark.ui
FIRST = {"kanto": ("r1", "Route 1"), "johto": ("r29", "Route 29"), "hoenn": ("r101", "Route 101"),
         "sinnoh": ("r201", "Route 201"), "unova": ("r1u", "Route 1")}


@pytest.fixture(scope="module")
def clean(tmp_path_factory):
    d = tmp_path_factory.mktemp("clean") / "data"
    r = Running(d)
    r.ctx.settings.update({"app.onboarded": False})
    assert not any(p.is_file() for p in (d / "private").rglob("*")) if (d / "private").exists() else True
    yield r
    r.stop()


@pytest.fixture
def pg(browser, clean):  # noqa: F811
    ctx = browser.new_context(viewport={"width": 1500, "height": 950})
    p = ctx.new_page()
    p.set_default_timeout(15000)
    p.errors = []
    p.on("pageerror", lambda e: p.errors.append(str(e)))
    # no network: block everything that is not this local app
    p.route("**/*", lambda route: route.continue_() if route.request.url.startswith(clean.srv.base_url.rstrip("/")) else route.abort())
    yield p
    ctx.close()


def _until(page, js, timeout=8.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(js):
            return True
        page.wait_for_timeout(100)
    raise AssertionError("condition not met: " + js)


def click_feature(page, fid):
    page.wait_for_selector(f'.map-svg g[data-feature="{fid}"]', state="attached")
    pt = page.evaluate(f"""(() => {{ const g = document.querySelector('.map-svg g[data-feature="{fid}"]');
        const el = g.querySelector('.hit-area, rect, circle');
        if (el.tagName === 'polyline') {{   // a point ON the route line (its middle), in screen coordinates
          const p = el.getPointAtLength(el.getTotalLength() / 2); const m = el.getScreenCTM();
          return [p.x * m.a + p.y * m.c + m.e, p.x * m.b + p.y * m.d + m.f]; }}
        const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }})()""")
    page.mouse.click(pt[0], pt[1])


def test_first_launch_has_no_import_gate(clean, pg):
    pg.goto(clean.url("#/home"))
    pg.wait_for_selector(".get-started")
    txt = pg.locator("#main").inner_text()
    assert "built in" in txt and "Install your PokeMMO data" not in txt and "Choose folder" not in txt
    pg.goto(clean.url("#/pokedex/25"))
    pg.wait_for_selector(".detail-head h2")
    assert "Pikachu" in pg.locator(".detail-head h2").inner_text()
    pg.goto(clean.url("#/pokedex/25?tab=moves"))
    pg.wait_for_selector(".moves-table tbody tr")
    assert not pg.errors


@pytest.mark.parametrize("region", ["kanto", "johto", "hoenn", "sinnoh", "unova"])
def test_every_region_map_click_shows_pokemmo_encounters(clean, pg, region):
    pg.goto(clean.url(f"#/tools/locations?region={region}"))
    pg.wait_for_selector(".map-box img.map-img")
    _until(pg, "document.querySelector('.map-img').complete && document.querySelector('.map-img').naturalWidth > 0")
    assert pg.locator(".map-unavailable").count() == 0
    assert "Import" not in pg.locator(".loc-map").inner_text()
    n = pg.locator(".map-svg g.mk.builtin").count()
    assert n >= 40
    fid, name = FIRST[region]
    click_feature(pg, fid)
    pg.wait_for_selector(".loc-detail .loc-enc tbody tr")
    assert pg.locator(".loc-detail h2").inner_text() == name
    assert pg.locator(f'.map-svg g.mk.sel[data-feature="{fid}"]').count() == 1
    rows = pg.locator(".loc-detail .loc-enc tbody tr").count()
    assert rows > 0 and pg.locator(".loc-detail .loc-method-head").count() >= 1
    assert "built-in PokeMMO data" in pg.locator(".loc-detail").inner_text()
    assert not pg.errors


def test_cave_floors_are_separate_subareas(clean, pg):
    pg.goto(clean.url("#/tools/locations?region=kanto"))
    click_feature(pg, "mt-moon")
    pg.wait_for_selector(".loc-subareas .tab")
    tabs = pg.locator(".loc-subareas .tab").all_inner_texts()
    assert [t.strip() for t in tabs] == ["1F", "B1F", "B2F"]
    first = pg.locator(".loc-sub-name").inner_text()
    pg.locator(".loc-subareas .tab", has_text="B2F").click()
    _until(pg, "document.querySelector('.loc-sub-name').textContent.includes('B2F')")
    assert first == "Mt. Moon (1F)"


def test_town_without_wild_pokemon_says_so(clean, pg):
    pg.goto(clean.url("#/tools/locations?region=kanto"))
    click_feature(pg, "saffron")
    pg.wait_for_selector(".loc-detail h2")
    assert "No wild Pokémon are listed for Saffron City" in pg.locator(".loc-detail").inner_text()
    assert pg.locator(".loc-detail .loc-enc").count() == 0


def test_sevii_submap_and_list_link(clean, pg):
    pg.goto(clean.url("#/tools/locations?region=kanto"))
    pg.wait_for_selector(".loc-submaps")
    pg.locator(".loc-side .loc-row", has_text="Kindle Road").click()
    _until(pg, "document.querySelector('.loc-submaps [aria-selected=true]').dataset.map.endsWith('sevii-123')")
    pg.wait_for_selector(".loc-detail .loc-enc tbody tr")
    assert pg.locator(".loc-detail h2").inner_text() == "Kindle Road"
    assert pg.locator('.map-svg g.mk.sel[data-feature="kindle-road"]').count() == 1


def test_pokemon_search_highlights_areas_and_zoom_keeps_alignment(clean, pg):
    pg.goto(clean.url("#/tools/locations?region=unova&species=531"))   # Audino
    pg.wait_for_selector(".map-svg g.mk.builtin", state="attached")
    hits = pg.locator(".map-svg g.mk.hit")
    assert hits.count() > 3
    assert pg.locator('.map-svg g.mk.hit[data-feature="r1u"]').count() == 1
    assert pg.locator('.map-svg g.mk.dim[data-feature="castelia"]').count() == 1
    # area outline and map pixels move together when zooming
    def rel():
        return pg.evaluate("""(() => { const img = document.querySelector('.map-img').getBoundingClientRect();
            const g = document.querySelector('.map-svg g[data-feature="r1u"] .hit-area').getBoundingClientRect();
            return [(g.x + g.width / 2 - img.x) / img.width, (g.y + g.height / 2 - img.y) / img.height]; })()""")
    a = rel()
    pg.get_by_role("button", name="Zoom in").click()
    pg.get_by_role("button", name="Zoom in").click()
    b = rel()
    assert abs(a[0] - b[0]) < 0.01 and abs(a[1] - b[1]) < 0.01
    assert not pg.errors


def test_personal_marks_overlay_and_reset(clean, pg):
    pg.goto(clean.url("#/tools/locations?region=hoenn"))
    pg.wait_for_selector(".map-box img.map-img")
    builtin_before = pg.locator(".map-svg g.mk.builtin").count()
    pg.get_by_role("button", name="My marks").click()
    pg.get_by_role("button", name="+ Marker").click()
    box = pg.locator(".map-img").bounding_box()
    pg.mouse.click(box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.97)   # open sea, inside the image
    pg.wait_for_selector(".modal")
    pg.locator(".modal input[type=search]").fill("Route 101")
    pg.locator(".modal select[aria-label=Location]").select_option(label="Route 101")
    pg.locator(".modal .btn.primary").click()
    _until(pg, "document.querySelectorAll('.map-svg g.mk.personal').length === 1")
    pg.get_by_role("button", name="Save", exact=True).click()
    _until(pg, "true")
    pg.wait_for_timeout(500)
    lay = clean.ctx.region_maps.layout("hoenn")
    assert len(lay["marks"]) == 1 and lay["marks"][0]["basis"] == "builtin-v1"
    assert pg.locator(".map-svg g.mk.builtin").count() == builtin_before        # built-in areas untouched
    pg.get_by_role("button", name="Reset to shipped map data").click()
    pg.locator(".modal .btn.danger").click()
    _until(pg, "document.querySelectorAll('.map-svg g.mk.personal').length === 0")
    pg.wait_for_timeout(400)
    assert clean.ctx.region_maps.layout("hoenn")["marks"] == []


def test_locations_popout_on_clean_install(clean, browser):  # noqa: F811
    clean.ctx.settings.update({"locations.region": "kanto", "locations.maps": {}})
    for mode, w, h_ in (("standard", 480, 640), ("expanded", 820, 700)):
        p = browser.new_context(viewport={"width": w, "height": h_}).new_page()
        errs = []
        p.on("pageerror", lambda e: errs.append(str(e)))
        p.goto(clean.srv.base_url + f"?token={clean.ctx.token}&popout=locations&mode={mode}&shell=browser#/")
        p.wait_for_selector(".map-box img.map-img")
        click_feature(p, "r1")
        p.wait_for_selector(".loc-detail .loc-enc tbody tr")
        assert p.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
        assert not errs
        p.context.close()


def test_no_rom_or_dump_files_in_repository():
    root = Path(__file__).resolve().parents[2]
    import subprocess
    files = subprocess.run(["git", "ls-files"], cwd=root, capture_output=True, text=True).stdout.split()
    banned = [f for f in files if f.lower().endswith((".gba", ".nds", ".png", ".gif", ".zip", ".webm", ".mp4", ".jpg", ".sav"))
              and not f.startswith(("ui/", "docs/", "companion/data/maps/game/"))]   # in-game maps: owner decision 2026-11-23
    assert banned == []
    maps = json.loads((root / "companion" / "data" / "maps" / "geometry.json").read_text())
    assert all(m["file"].endswith(".svg") or m.get("style") == "game" for m in maps["maps"])
    # no ROM, dump archive, Synergy/Serebii material or reference recordings anywhere in the repository
    media = (".png", ".jpg", ".jpeg", ".webp", ".webm", ".mp4", ".gif")
    assert not [f for f in files if ("synergy" in f.lower() or "serebii" in f.lower() or "screenshot" in f.lower()) and f.lower().endswith(media)]
    assert not [f for f in files if f.lower().endswith((".gba", ".nds", ".zip", ".7z"))]


def test_in_game_and_companion_styles(clean, pg):
    clean.ctx.settings.update({"locations.style": "game", "locations.maps": {}})
    pg.goto(clean.url("#/tools/locations?region=kanto"))
    pg.wait_for_selector(".map-box img.map-img")
    assert "/game/kanto.png" in pg.locator(".map-img").get_attribute("src")
    pg.get_by_role("button", name="In-game map").click()
    _until(pg, "document.querySelector('.map-img') && document.querySelector('.map-img').src.includes('kanto.svg')")
    click_feature(pg, "r1")
    pg.wait_for_selector(".loc-detail .loc-enc tbody tr")
    assert pg.locator(".loc-detail h2").inner_text() == "Route 1"
    pg.get_by_role("button", name="Companion map").click()
    _until(pg, "document.querySelector('.map-img').src.includes('game/kanto.png')")
    pg.locator('.loc-tabs [data-region="unova"]').click()
    _until(pg, "document.querySelector('.map-img') && document.querySelector('.map-img').src.includes('unova.svg')")
    assert pg.get_by_role("button", name="In-game map").count() == 0    # no in-game Unova artwork was located
    assert not pg.errors

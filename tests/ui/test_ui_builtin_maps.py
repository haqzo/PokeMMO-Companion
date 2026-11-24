"""UI on a CLEAN installation: no PokeMMO dump, no ROMs, no private data (POKEMMO_DUMPS_DIR is ignored here).

The Location Explorer is a directory (2026-11-24: interactive maps removed from the player UI): every region lists its
places as cards, and opening one shows real PokeMMO encounters immediately. Map assets stay in the repository.
"""
import json
import time
from pathlib import Path

import pytest

from tests.ui.test_ui_flows import Running, browser  # noqa: F401  (fixtures)

pytestmark = pytest.mark.ui
FIRST = {"kanto": "Route 1", "johto": "Route 29", "hoenn": "Route 101", "sinnoh": "Route 201", "unova": "Route 1"}


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


def open_card(page, name, exact=True):
    loc = page.locator(".loc-card", has=page.locator(".loc-card-name", has_text=name))
    if exact:
        loc = page.locator(".loc-card").filter(has=page.locator(".loc-card-name").get_by_text(name, exact=True))
    loc.first.click()


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
def test_every_region_directory_opens_pokemmo_encounters(clean, pg, region):
    pg.goto(clean.url(f"#/tools/locations?region={region}"))
    pg.wait_for_selector(".loc-card")
    assert pg.locator(".map-svg, .map-img, .map-box").count() == 0          # no interactive map in the player UI
    assert pg.locator(".loc-card").count() >= 30
    assert "Import" not in pg.locator(".loc-dir").inner_text()
    open_card(pg, FIRST[region])
    pg.wait_for_selector(".loc-detail .loc-enc tbody tr")
    assert pg.locator(".loc-detail h2").inner_text() == FIRST[region]
    assert pg.locator(".loc-detail .loc-enc tbody tr").count() > 0 and pg.locator(".loc-detail .loc-method-head").count() >= 1
    assert "built-in PokeMMO data" in pg.locator(".loc-detail").inner_text()
    assert not pg.errors


def test_categories_and_natural_route_order(clean, pg):
    pg.goto(clean.url("#/tools/locations?region=kanto"))
    pg.wait_for_selector(".loc-card")
    pg.locator('.loc-cats [data-cat="routes"]').click()
    names = pg.locator(".loc-card .loc-card-name").all_inner_texts()
    routes = [n for n in names if n.startswith("Route ")]
    nums = [int(n.split()[1]) for n in routes if n.split()[1].isdigit()]
    assert nums == sorted(nums) and nums[:3] == [1, 2, 3]                     # Route 2 before Route 10
    for cat in ("towns", "caves", "forests"):
        pg.locator(f'.loc-cats [data-cat="{cat}"]').click()
        assert pg.locator(".loc-card").count() > 0
    pg.locator('.loc-cats [data-cat="caves"]').click()
    assert "Mt. Moon" in pg.locator(".loc-cards").inner_text()


def test_cave_floors_are_separate_subareas(clean, pg):
    pg.goto(clean.url("#/tools/locations?region=kanto"))
    pg.wait_for_selector(".loc-card")
    open_card(pg, "Mt. Moon")
    pg.wait_for_selector(".loc-subareas .tab")
    tabs = pg.locator(".loc-subareas .tab").all_inner_texts()
    assert [t.strip() for t in tabs] == ["1F", "B1F", "B2F"]
    first = pg.locator(".loc-sub-name").inner_text()
    pg.locator(".loc-subareas .tab", has_text="B2F").click()
    _until(pg, "document.querySelector('.loc-sub-name').textContent.includes('B2F')")
    assert first == "Mt. Moon (1F)"


def test_town_without_wild_pokemon_says_so(clean, pg):
    pg.goto(clean.url("#/tools/locations?region=kanto"))
    pg.wait_for_selector(".loc-card")
    open_card(pg, "Saffron City")
    pg.wait_for_selector(".loc-detail h2")
    assert "No wild Pokémon are listed for Saffron City" in pg.locator(".loc-detail").inner_text()
    assert pg.locator(".loc-detail .loc-enc").count() == 0


def test_sevii_sub_region(clean, pg):
    pg.goto(clean.url("#/tools/locations?region=kanto"))
    pg.wait_for_selector('.loc-subs [data-sub="sevii"]')
    pg.locator('.loc-subs [data-sub="sevii"]').click()
    txt = pg.locator(".loc-cards").inner_text()
    assert "Kindle Road" in txt and "Viridian City" not in txt
    open_card(pg, "Kindle Road")
    pg.wait_for_selector(".loc-detail .loc-enc tbody tr")
    assert pg.locator(".loc-detail h2").inner_text() == "Kindle Road"


def test_pokemon_search_across_regions_filters_and_clear(clean, pg):
    pg.goto(clean.url("#/tools/locations?region=unova&species=531"))   # Audino
    pg.wait_for_selector(".loc-card")
    _until(pg, "document.querySelector('.loc-tabs [data-region=unova] .count') !== null")
    n_unova = int(pg.locator(".loc-tabs [data-region=unova] .count").inner_text())
    assert n_unova > 3
    assert pg.locator(".loc-card").count() == n_unova
    assert "Castelia City" not in pg.locator(".loc-cards").inner_text()
    pg.locator(".loc-tabs [data-region=all]").click()
    _until(pg, "document.querySelectorAll('.loc-group-head').length >= 1")
    # search by place name and clear everything
    pg.get_by_role("button", name="Clear filters").click()
    pg.wait_for_selector(".loc-card")
    pg.get_by_label("Search locations").fill("Route 10")
    _until(pg, "[...document.querySelectorAll('.loc-card-name')].some((e) => e.textContent === 'Route 10')")
    pg.get_by_label("Encounter type").select_option(index=1)
    assert pg.locator(".loc-count").inner_text() != ""
    pg.get_by_role("button", name="Clear filters").click()
    _until(pg, "document.querySelectorAll('.loc-card').length > 30")
    assert not pg.errors


def test_narrow_window_detail_and_back(clean, browser):  # noqa: F811
    p = browser.new_context(viewport={"width": 760, "height": 800}).new_page()
    errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.goto(clean.url("#/tools/locations?region=hoenn"))
    p.wait_for_selector(".loc-dir.narrow .loc-card")
    open_card(p, "Route 101")
    p.wait_for_selector(".loc-detail .loc-enc tbody tr")
    assert p.locator(".loc-back").is_visible()
    p.locator(".loc-back").click()
    p.wait_for_selector(".loc-card")
    assert p.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
    assert not errs
    p.context.close()


def test_locations_popout_modes_on_clean_install(clean, browser):  # noqa: F811
    clean.ctx.settings.update({"locations.region": "kanto"})
    for mode, w, h_ in (("compact", 360, 520), ("standard", 480, 640), ("expanded", 820, 700)):
        p = browser.new_context(viewport={"width": w, "height": h_}).new_page()
        errs = []
        p.on("pageerror", lambda e: errs.append(str(e)))
        p.goto(clean.srv.base_url + f"?token={clean.ctx.token}&popout=locations&mode={mode}&shell=browser#/")
        p.wait_for_selector(".loc-card")
        open_card(p, "Route 1")
        p.wait_for_selector(".loc-detail .loc-enc tbody tr")
        assert p.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), mode
        assert not errs
        p.context.close()


def test_map_assets_and_personal_marks_are_kept(clean):
    # interactive maps are gone from the UI, but the shipped assets and personal map data stay available
    root = Path(__file__).resolve().parents[2]
    assert (root / "companion" / "data" / "maps" / "geometry.json").is_file()
    assert any((root / "companion" / "data" / "maps" / "game").glob("*.png"))
    assert clean.ctx.region_maps.layout("hoenn") is not None


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

"""Application files included in each standalone package."""
import re
from pathlib import Path

# Explicit asset paths and formats. No whole-tree copy of data, settings, relay code or tooling.
asset_patterns = (
    r"ui/licenses/pokeapi\.txt",
    r"ui/fonts/(?:companion-han\.woff2|ofl\.txt)",
    r"ui/(?:index\.html|css/[a-z-]+\.css|img/[a-z-]+\.svg|js/(?:pages/)?[a-z0-9-]+\.js)",
    r"companion/data/(?:catalog_reference_synergy|form_art|forms|legendaries|legendary_mythical|news_snapshot|"
    r"pokemmo_availability|species_index|themes)\.json",
    r"companion/data/item-icons/(?:[0-9]+\.png|manifest\.json)",
    r"companion/data/sprites/(?:(?:static(?:-shiny)?|ani(?:-shiny)?)/[A-Za-z0-9_-]+\.(?:png|gif)|index\.json)",
    r"companion/data/maps/(?:[a-z0-9-]+\.svg|geometry\.json|game/[a-z0-9-]+\.png)",
    r"companion/data/reference/(?:manifest\.json|(?:extras|items|species)\.json\.gz)",
    r"companion/data/walkthroughs/(?:kanto|johto|hoenn|sinnoh|unova)\.json",
)
allow = re.compile("|".join(asset_patterns))


def bundle_assets(root: Path):
    yield Path("CREDITS.md")
    for directory in ("ui", "companion/data"):
        for file in sorted((root / directory).rglob("*")):
            relative = file.relative_to(root)
            if file.is_file() and allow.fullmatch(relative.as_posix()):
                if file.resolve() != file:
                    raise ValueError(f"Packaged asset must be a regular file: {relative}")
                yield relative

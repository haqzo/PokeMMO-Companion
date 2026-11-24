# Credits and sources

PokeMMO Companion is an unofficial community project, not affiliated with PokeMMO, Nintendo, Creatures Inc.,
GAME FREAK or The Pokémon Company. Pokémon and Pokémon character names are trademarks of Nintendo.

## Pokémon sprites — `companion/data/sprites/`
Gen V Black/White battle sprites (static and animated, normal and shiny, forms and female variants) from the
**PokeAPI/sprites** repository (https://github.com/PokeAPI/sprites, checkout of 13 Nov 2026). The repository is
released under CC0 1.0; the images themselves are © Nintendo / Creatures Inc. / GAME FREAK / The Pokémon Company.
Prepared with `tools/build_sprites.py`. Stills marked `derived` in `index.json` are the first frame of the same
Pokémon's animation (48 form / female stills that had no separate still file).

## Item icons — `companion/data/item-icons/`
PokeMMO's own item icons from the PokeMMO client (client data of 16 Nov 2026), mapped by the client's item icon
ids. © their respective owners. Included by the owner's decision; see the distribution note below.

## PokeMMO reference data — `companion/data/reference/`
Species, moves, items, locations and encounters derived from the PokeMMO client data (16 Nov 2026).

## Regional walkthroughs — `companion/data/walkthroughs/`
The complete Kanto, Johto, Hoenn, Sinnoh and Unova walkthroughs for PokeMMO are included with the permission of
their original author, as confirmed by the project owner. **Author name: not recorded in the source files — to be
added by the owner.** The Companion splits them into steps and tags them automatically; the instructions are
the author's.

## Theme palettes
* **Catppuccin Mocha** — Catppuccin (https://github.com/catppuccin/catppuccin), MIT licence.
* **Tokyo Night** — enkia/tokyo-night-vscode-theme (https://github.com/enkia/tokyo-night-vscode-theme), MIT licence.
* Companion Default, Graphite, Arctic and Emerald are the project's own palettes.

## Software
PokeMMO Companion: Python standard library, Qt / PySide6 (QtWebEngine) for the native window, Pillow (sprite
preparation only), `cryptography` (optional, signature checks).

## Community information
* Alpha and Swarm reports use the opt-in ntfy topics from [Alphapedia](https://alpha.pokemmotools.org/). [Alphapedia Discord](https://discord.gg/Qeuc9k4yMw)
* Unova Phenomenon reference examples draw on the [Alphapedia Pheno List](https://alpha.pokemmotools.org/pheno-list), [MightyBoxer’s Phenomenon Locations Guide](https://forums.pokemmo.com/index.php?/topic/77087-phenomenon-locations-guide/) and the owner’s verified callouts. Current callouts and location pictures are in [PokeMMO Companion Discord](https://discord.gg/5Wbh28M3gu) under `#phenomenon-callouts`.
* Swarm duration estimate and roaming cycle: PokeMMO community wiki (pokemmo.shoutwiki.com).

## Distribution note
The project owner decides what is distributed. Permission to redistribute the sprite images and PokeMMO client
assets (item icons, map images, reference data) has **not** been established; see docs/build/20.

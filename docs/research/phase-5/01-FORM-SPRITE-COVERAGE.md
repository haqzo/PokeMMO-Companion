# Alternate-form sprite coverage (2026-11-23)

Every catalogued form key (82) compared against your PokeMMO client dump (files dated 2026-11-16) and the
file lists of three public sprite repositories. Generated from `companion/data/form_art.json`
(`tools/build_form_art.py`). **No artwork is bundled with the Companion**; external columns only say whether an
exact file name exists in that repository (checked with `git ls-tree`, HEAD as of 2026-11-23).

## Summary

- **Client dump, correct form art:** 56 of 82 forms (box icons; Unown B–Q also have battle sprites).
- **Client dump, base art reused (refused):** 4 — the four Genesect Drive slots hold the base Genesect icon byte-for-byte.
- **Client dump, no art at all:** 22 — Arceus types (16), Tornadus/Thundurus/Landorus Therian, Black/White Kyurem, Keldeo Resolute.
- **Placeholders found by the old mapping:** the form *data* records 650–667 were used as art ids before this pass. 650/651 are eggs
  and 652–678 are Unown letters, so e.g. Wash Rotom (record 658) showed an Unown "H". Art now uses its own slot map, and
  every slot is fingerprinted at runtime: Egg/Unown placeholders and copies of base art are refused, changed files are labelled.
- **Client battle sprites for forms:** only Unown B–Q. Every other form's battle art is missing from the dump, so animated
  sprites must come from a sprite library you supply.
- **PokéAPI** (`sprites/pokemon/versions/generation-v/black-white/animated[/shiny]`): animated normal **and** shiny GIFs exist
  for all 82 forms and all 649 species.
- **Smogon** (`src/sprites/gen5`, source of Showdown's gen5ani): animated for all 82 forms; shiny for all but Unown F.
- **PokéSprite** (box icons): all 82 forms.
- **Synergy's provider:** not established. Nothing here assumes it uses Showdown.

Full coverage is **not** claimed for anything you have not installed: what you actually see depends on your own client
and on the sprite library you point the Companion at (Settings › Data › Animated sprite library). The in-app
"Form artwork report" shows your live status per form.

## Reuse status (read from each repository on 2026-11-23)

| Source | What the repository says | Companion use |
|---|---|---|
| Your PokeMMO client | Client assets of the game | Private; installed only on your computer, never committed or shared |
| PokéAPI/sprites | LICENCE.txt: repository CC0, but "All image contents within are Copyright The Pokémon Company" | Not bundled, not hotlinked; usable from your own local copy |
| smogon/sprites | README: code MIT; sprites © Nintendo/Game Freak/TPC; community-made sprites' licence "still being determined … talk to us first" | Not bundled, not hotlinked; usable from your own local copy |
| msikma/pokesprite | license: code MIT; "sprite images are © Nintendo/Creatures Inc./GAME FREAK Inc." | Not used at runtime |

Unresolved: none of the sources grants redistribution of the artwork, so a public release cannot ship it. Showdown's
served file names (`play.pokemonshowdown.com/sprites/gen5ani/<name>.gif`) are derived from the Smogon source names and
were not checked against the live site (it was not reachable from this session).

## Per form

| Key | Form | Client data record | Client art slot | Client art | PokéAPI | Smogon source | PokéSprite |
|---|---|---|---|---|---|---|---|
| `201:b` | Unown — B | — | icon 652, battle 652 | ✅ correct (checked) | `201-b` anim ✓ · shiny ✓ | `sunown-ob` anim ✓ · shiny ✓ | `unown-b` ✓ |
| `201:c` | Unown — C | — | icon 653, battle 653 | ✅ correct (checked) | `201-c` anim ✓ · shiny ✓ | `sunown-oc` anim ✓ · shiny ✓ | `unown-c` ✓ |
| `201:d` | Unown — D | — | icon 654, battle 654 | ✅ correct (checked) | `201-d` anim ✓ · shiny ✓ | `sunown-od` anim ✓ · shiny ✓ | `unown-d` ✓ |
| `201:e` | Unown — E | — | icon 655, battle 655 | ✅ correct (checked) | `201-e` anim ✓ · shiny ✓ | `sunown-oe` anim ✓ · shiny ✓ | `unown-e` ✓ |
| `201:f` | Unown — F | — | icon 656, battle 656 | ✅ correct (checked) | `201-f` anim ✓ · shiny ✓ | `sunown-of` anim ✓ · shiny ✗ | `unown-f` ✓ |
| `201:g` | Unown — G | — | icon 657, battle 657 | ✅ correct (checked) | `201-g` anim ✓ · shiny ✓ | `sunown-og` anim ✓ · shiny ✓ | `unown-g` ✓ |
| `201:h` | Unown — H | — | icon 658, battle 658 | ✅ correct (checked) | `201-h` anim ✓ · shiny ✓ | `sunown-oh` anim ✓ · shiny ✓ | `unown-h` ✓ |
| `201:i` | Unown — I | — | icon 659, battle 659 | ✅ correct (checked) | `201-i` anim ✓ · shiny ✓ | `sunown-oi` anim ✓ · shiny ✓ | `unown-i` ✓ |
| `201:j` | Unown — J | — | icon 660, battle 660 | ✅ correct (checked) | `201-j` anim ✓ · shiny ✓ | `sunown-oj` anim ✓ · shiny ✓ | `unown-j` ✓ |
| `201:k` | Unown — K | — | icon 661, battle 661 | ✅ correct (checked) | `201-k` anim ✓ · shiny ✓ | `sunown-ok` anim ✓ · shiny ✓ | `unown-k` ✓ |
| `201:l` | Unown — L | — | icon 662, battle 662 | ✅ correct (checked) | `201-l` anim ✓ · shiny ✓ | `sunown-ol` anim ✓ · shiny ✓ | `unown-l` ✓ |
| `201:m` | Unown — M | — | icon 663, battle 663 | ✅ correct (checked) | `201-m` anim ✓ · shiny ✓ | `sunown-om` anim ✓ · shiny ✓ | `unown-m` ✓ |
| `201:n` | Unown — N | — | icon 664, battle 664 | ✅ correct (checked) | `201-n` anim ✓ · shiny ✓ | `sunown-on` anim ✓ · shiny ✓ | `unown-n` ✓ |
| `201:o` | Unown — O | — | icon 665, battle 665 | ✅ correct (checked) | `201-o` anim ✓ · shiny ✓ | `sunown-oo` anim ✓ · shiny ✓ | `unown-o` ✓ |
| `201:p` | Unown — P | — | icon 666, battle 666 | ✅ correct (checked) | `201-p` anim ✓ · shiny ✓ | `sunown-op` anim ✓ · shiny ✓ | `unown-p` ✓ |
| `201:q` | Unown — Q | — | icon 667, battle 667 | ✅ correct (checked) | `201-q` anim ✓ · shiny ✓ | `sunown-oq` anim ✓ · shiny ✓ | `unown-q` ✓ |
| `201:r` | Unown — R | — | icon 668 | ✅ correct (checked) | `201-r` anim ✓ · shiny ✓ | `sunown-or` anim ✓ · shiny ✓ | `unown-r` ✓ |
| `201:s` | Unown — S | — | icon 669 | ✅ correct (checked) | `201-s` anim ✓ · shiny ✓ | `sunown-os` anim ✓ · shiny ✓ | `unown-s` ✓ |
| `201:t` | Unown — T | — | icon 670 | ✅ correct (checked) | `201-t` anim ✓ · shiny ✓ | `sunown-ot` anim ✓ · shiny ✓ | `unown-t` ✓ |
| `201:u` | Unown — U | — | icon 671 | ✅ correct (checked) | `201-u` anim ✓ · shiny ✓ | `sunown-ou` anim ✓ · shiny ✓ | `unown-u` ✓ |
| `201:v` | Unown — V | — | icon 672 | ✅ correct (checked) | `201-v` anim ✓ · shiny ✓ | `sunown-ov` anim ✓ · shiny ✓ | `unown-v` ✓ |
| `201:w` | Unown — W | — | icon 673 | ✅ correct (checked) | `201-w` anim ✓ · shiny ✓ | `sunown-ow` anim ✓ · shiny ✓ | `unown-w` ✓ |
| `201:x` | Unown — X | — | icon 674 | ✅ correct (checked) | `201-x` anim ✓ · shiny ✓ | `sunown-ox` anim ✓ · shiny ✓ | `unown-x` ✓ |
| `201:y` | Unown — Y | — | icon 675 | ✅ correct (checked) | `201-y` anim ✓ · shiny ✓ | `sunown-oy` anim ✓ · shiny ✓ | `unown-y` ✓ |
| `201:z` | Unown — Z | — | icon 676 | ✅ correct (checked) | `201-z` anim ✓ · shiny ✓ | `sunown-oz` anim ✓ · shiny ✓ | `unown-z` ✓ |
| `201:exclamation` | Unown — ! | — | icon 677 | ✅ correct (checked) | `201-exclamation` anim ✓ · shiny ✓ | `sunown-oexclamation` anim ✓ · shiny ✓ | `unown-exclamation` ✓ |
| `201:question` | Unown — ? | — | icon 678 | ✅ correct (checked) | `201-question` anim ✓ · shiny ✓ | `sunown-oquestion` anim ✓ · shiny ✓ | `unown-question` ✓ |
| `351:sunny` | Castform — Sunny Form | 662 | icon 679 | ✅ correct (checked) | `351-sunny` anim ✓ · shiny ✓ | `scastform-osunny` anim ✓ · shiny ✓ | `castform-sunny` ✓ |
| `351:rainy` | Castform — Rainy Form | 663 | icon 680 | ✅ correct (checked) | `351-rainy` anim ✓ · shiny ✓ | `scastform-orainy` anim ✓ · shiny ✓ | `castform-rainy` ✓ |
| `351:snowy` | Castform — Snowy Form | 664 | icon 681 | ✅ correct (checked) | `351-snowy` anim ✓ · shiny ✓ | `scastform-osnowy` anim ✓ · shiny ✓ | `castform-snowy` ✓ |
| `386:attack` | Deoxys — Attack Forme | 650 | icon 682 | ✅ correct (checked) | `386-attack` anim ✓ · shiny ✓ | `sdeoxys-oattack` anim ✓ · shiny ✓ | `deoxys-attack` ✓ |
| `386:defense` | Deoxys — Defense Forme | 651 | icon 683 | ✅ correct (checked) | `386-defense` anim ✓ · shiny ✓ | `sdeoxys-odefense` anim ✓ · shiny ✓ | `deoxys-defense` ✓ |
| `386:speed` | Deoxys — Speed Forme | 652 | icon 684 | ✅ correct (checked) | `386-speed` anim ✓ · shiny ✓ | `sdeoxys-ospeed` anim ✓ · shiny ✓ | `deoxys-speed` ✓ |
| `412:sandy` | Burmy — Sandy Cloak | — | icon 685 | ✅ correct (checked) | `412-sandy` anim ✓ · shiny ✓ | `sburmy-osandy` anim ✓ · shiny ✓ | `burmy-sandy` ✓ |
| `412:trash` | Burmy — Trash Cloak | — | icon 686 | ✅ correct (checked) | `412-trash` anim ✓ · shiny ✓ | `sburmy-otrash` anim ✓ · shiny ✓ | `burmy-trash` ✓ |
| `413:sandy` | Wormadam — Sandy Cloak | 653 | icon 687 | ✅ correct (checked) | `413-sandy` anim ✓ · shiny ✓ | `swormadam-osandy` anim ✓ · shiny ✓ | `wormadam-sandy` ✓ |
| `413:trash` | Wormadam — Trash Cloak | 654 | icon 688 | ✅ correct (checked) | `413-trash` anim ✓ · shiny ✓ | `swormadam-otrash` anim ✓ · shiny ✓ | `wormadam-trash` ✓ |
| `421:sunshine` | Cherrim — Sunshine Form | — | icon 689 | ✅ correct (checked) | `421-sunshine` anim ✓ · shiny ✓ | `scherrim-osunshine` anim ✓ · shiny ✓ | `cherrim-sunshine` ✓ |
| `422:east` | Shellos — East Sea | — | icon 690 | ✅ correct (checked) | `422-east` anim ✓ · shiny ✓ | `sshellos-oeast` anim ✓ · shiny ✓ | `shellos-east` ✓ |
| `423:east` | Gastrodon — East Sea | — | icon 691 | ✅ correct (checked) | `423-east` anim ✓ · shiny ✓ | `sgastrodon-oeast` anim ✓ · shiny ✓ | `gastrodon-east` ✓ |
| `479:heat` | Rotom — Heat Rotom | 657 | icon 692 | ✅ correct (checked) | `479-heat` anim ✓ · shiny ✓ | `srotom-oheat` anim ✓ · shiny ✓ | `rotom-heat` ✓ |
| `479:wash` | Rotom — Wash Rotom | 658 | icon 693 | ✅ correct (checked) | `479-wash` anim ✓ · shiny ✓ | `srotom-owash` anim ✓ · shiny ✓ | `rotom-wash` ✓ |
| `479:frost` | Rotom — Frost Rotom | 659 | icon 694 | ✅ correct (checked) | `479-frost` anim ✓ · shiny ✓ | `srotom-ofrost` anim ✓ · shiny ✓ | `rotom-frost` ✓ |
| `479:fan` | Rotom — Fan Rotom | 660 | icon 695 | ✅ correct (checked) | `479-fan` anim ✓ · shiny ✓ | `srotom-ofan` anim ✓ · shiny ✓ | `rotom-fan` ✓ |
| `479:mow` | Rotom — Mow Rotom | 661 | icon 696 | ✅ correct (checked) | `479-mow` anim ✓ · shiny ✓ | `srotom-omow` anim ✓ · shiny ✓ | `rotom-mow` ✓ |
| `487:origin` | Giratina — Origin Forme | 656 | icon 697 | ✅ correct (checked) | `487-origin` anim ✓ · shiny ✓ | `sgiratina-oorigin` anim ✓ · shiny ✓ | `giratina-origin` ✓ |
| `492:sky` | Shaymin — Sky Forme | 655 | icon 698 | ✅ correct (checked) | `492-sky` anim ✓ · shiny ✓ | `sshaymin-osky` anim ✓ · shiny ✓ | `shaymin-sky` ✓ |
| `493:fighting` | Arceus — Fighting | — | — | — none | `493-fighting` anim ✓ · shiny ✓ | `sarceus-ofighting` anim ✓ · shiny ✓ | `arceus-fighting` ✓ |
| `493:flying` | Arceus — Flying | — | — | — none | `493-flying` anim ✓ · shiny ✓ | `sarceus-oflying` anim ✓ · shiny ✓ | `arceus-flying` ✓ |
| `493:poison` | Arceus — Poison | — | — | — none | `493-poison` anim ✓ · shiny ✓ | `sarceus-opoison` anim ✓ · shiny ✓ | `arceus-poison` ✓ |
| `493:ground` | Arceus — Ground | — | — | — none | `493-ground` anim ✓ · shiny ✓ | `sarceus-oground` anim ✓ · shiny ✓ | `arceus-ground` ✓ |
| `493:rock` | Arceus — Rock | — | — | — none | `493-rock` anim ✓ · shiny ✓ | `sarceus-orock` anim ✓ · shiny ✓ | `arceus-rock` ✓ |
| `493:bug` | Arceus — Bug | — | — | — none | `493-bug` anim ✓ · shiny ✓ | `sarceus-obug` anim ✓ · shiny ✓ | `arceus-bug` ✓ |
| `493:ghost` | Arceus — Ghost | — | — | — none | `493-ghost` anim ✓ · shiny ✓ | `sarceus-oghost` anim ✓ · shiny ✓ | `arceus-ghost` ✓ |
| `493:steel` | Arceus — Steel | — | — | — none | `493-steel` anim ✓ · shiny ✓ | `sarceus-osteel` anim ✓ · shiny ✓ | `arceus-steel` ✓ |
| `493:fire` | Arceus — Fire | — | — | — none | `493-fire` anim ✓ · shiny ✓ | `sarceus-ofire` anim ✓ · shiny ✓ | `arceus-fire` ✓ |
| `493:water` | Arceus — Water | — | — | — none | `493-water` anim ✓ · shiny ✓ | `sarceus-owater` anim ✓ · shiny ✓ | `arceus-water` ✓ |
| `493:grass` | Arceus — Grass | — | — | — none | `493-grass` anim ✓ · shiny ✓ | `sarceus-ograss` anim ✓ · shiny ✓ | `arceus-grass` ✓ |
| `493:electric` | Arceus — Electric | — | — | — none | `493-electric` anim ✓ · shiny ✓ | `sarceus-oelectric` anim ✓ · shiny ✓ | `arceus-electric` ✓ |
| `493:psychic` | Arceus — Psychic | — | — | — none | `493-psychic` anim ✓ · shiny ✓ | `sarceus-opsychic` anim ✓ · shiny ✓ | `arceus-psychic` ✓ |
| `493:ice` | Arceus — Ice | — | — | — none | `493-ice` anim ✓ · shiny ✓ | `sarceus-oice` anim ✓ · shiny ✓ | `arceus-ice` ✓ |
| `493:dragon` | Arceus — Dragon | — | — | — none | `493-dragon` anim ✓ · shiny ✓ | `sarceus-odragon` anim ✓ · shiny ✓ | `arceus-dragon` ✓ |
| `493:dark` | Arceus — Dark | — | — | — none | `493-dark` anim ✓ · shiny ✓ | `sarceus-odark` anim ✓ · shiny ✓ | `arceus-dark` ✓ |
| `550:blue-striped` | Basculin — Blue-Striped Form | 665 | icon 699 | ✅ correct (checked) | `550-blue-striped` anim ✓ · shiny ✓ | `sbasculin-oblue_striped` anim ✓ · shiny ✓ | `basculin-blue-striped` ✓ |
| `555:zen` | Darmanitan — Zen Mode | 666 | icon 700 | ✅ correct (checked) | `555-zen` anim ✓ · shiny ✓ | `sdarmanitan-ozen` anim ✓ · shiny ✓ | `darmanitan-zen` ✓ |
| `585:summer` | Deerling — Summer Form | — | icon 701 | ✅ correct (checked) | `585-summer` anim ✓ · shiny ✓ | `sdeerling-osummer` anim ✓ · shiny ✓ | `deerling-summer` ✓ |
| `585:autumn` | Deerling — Autumn Form | — | icon 702 | ✅ correct (checked) | `585-autumn` anim ✓ · shiny ✓ | `sdeerling-oautumn` anim ✓ · shiny ✓ | `deerling-autumn` ✓ |
| `585:winter` | Deerling — Winter Form | — | icon 703 | ✅ correct (checked) | `585-winter` anim ✓ · shiny ✓ | `sdeerling-owinter` anim ✓ · shiny ✓ | `deerling-winter` ✓ |
| `586:summer` | Sawsbuck — Summer Form | — | icon 704 | ✅ correct (checked) | `586-summer` anim ✓ · shiny ✓ | `ssawsbuck-osummer` anim ✓ · shiny ✓ | `sawsbuck-summer` ✓ |
| `586:autumn` | Sawsbuck — Autumn Form | — | icon 705 | ✅ correct (checked) | `586-autumn` anim ✓ · shiny ✓ | `ssawsbuck-oautumn` anim ✓ · shiny ✓ | `sawsbuck-autumn` ✓ |
| `586:winter` | Sawsbuck — Winter Form | — | icon 706 | ✅ correct (checked) | `586-winter` anim ✓ · shiny ✓ | `ssawsbuck-owinter` anim ✓ · shiny ✓ | `sawsbuck-winter` ✓ |
| `641:therian` | Tornadus — Therian Forme | — | — | — none | `641-therian` anim ✓ · shiny ✓ | `stornadus-otherian` anim ✓ · shiny ✓ | `tornadus-therian` ✓ |
| `642:therian` | Thundurus — Therian Forme | — | — | — none | `642-therian` anim ✓ · shiny ✓ | `sthundurus-otherian` anim ✓ · shiny ✓ | `thundurus-therian` ✓ |
| `645:therian` | Landorus — Therian Forme | — | — | — none | `645-therian` anim ✓ · shiny ✓ | `slandorus-otherian` anim ✓ · shiny ✓ | `landorus-therian` ✓ |
| `646:black` | Kyurem — Black Kyurem | — | — | — none | `646-black` anim ✓ · shiny ✓ | `skyurem-oblack` anim ✓ · shiny ✓ | `kyurem-black` ✓ |
| `646:white` | Kyurem — White Kyurem | — | — | — none | `646-white` anim ✓ · shiny ✓ | `skyurem-owhite` anim ✓ · shiny ✓ | `kyurem-white` ✓ |
| `647:resolute` | Keldeo — Resolute Form | — | — | — none | `647-resolute` anim ✓ · shiny ✓ | `skeldeo-oresolute` anim ✓ · shiny ✓ | `keldeo-resolute` ✓ |
| `648:pirouette` | Meloetta — Pirouette Forme | 667 | icon 707 | ✅ correct (checked) | `648-pirouette` anim ✓ · shiny ✓ | `smeloetta-opirouette` anim ✓ · shiny ✓ | `meloetta-pirouette` ✓ |
| `649:douse` | Genesect — Douse Drive | — | icon 708 | ⚠ base art only — refused | `649-douse` anim ✓ · shiny ✓ | `sgenesect-odouse` anim ✓ · shiny ✓ | `genesect-douse` ✓ |
| `649:shock` | Genesect — Shock Drive | — | icon 709 | ⚠ base art only — refused | `649-shock` anim ✓ · shiny ✓ | `sgenesect-oshock` anim ✓ · shiny ✓ | `genesect-shock` ✓ |
| `649:burn` | Genesect — Burn Drive | — | icon 710 | ⚠ base art only — refused | `649-burn` anim ✓ · shiny ✓ | `sgenesect-oburn` anim ✓ · shiny ✓ | `genesect-burn` ✓ |
| `649:chill` | Genesect — Chill Drive | — | icon 711 | ⚠ base art only — refused | `649-chill` anim ✓ · shiny ✓ | `sgenesect-ochill` anim ✓ · shiny ✓ | `genesect-chill` ✓ |

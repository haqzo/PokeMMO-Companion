# v0.1.0 Pokédex direction — Synergy reference roster and forms

> **Superseded on 2026-11-23 (owner correction):** the Pokédex shows **one tile per species** (649 Gen I–V species).
> Alternate forms are no longer separate tiles; they are chosen inside the Pokémon Summary popup, and searching a
> form's name finds its parent species. The 731-key Synergy parity check stays as an internal data test only.
> See `docs/build/11-V0.1.0-CRITICAL-CORRECTION-REPORT.md`.

**Decision recorded:** 2026-11-22 · **State:** approved product direction; IMPLEMENTATION NOT YET DONE.
**Reference supplied by owner:** 50.54-second portrait recording of https://synergymmo.com/pokedex/ (`1000037758.mp4`, private, not committed).
**Public page:** https://synergymmo.com/pokedex/ · source viewed 2026-11-22.

## What the owner means
> "Just use same pokedex entirely like synergy same mons."

The Companion's **default Pokédex catalog** should follow **Synergy's Pokédex species + distinct alternate-form coverage**, instead of our self-invented "644 of 644" membership-based roster or the bare 649 base species. Keep our own polished Better Default visual identity while adopting the functional strengths of Synergy's browse experience.

This supersedes conflicting older design assumptions that the default browse grid must hide individual Pokémon simply because no in-game PokeMMO registration / permanent acquisition evidence has been established. This is about **which entries a reference Pokédex can show**, not blanket claims those Pokémon can be caught or owned.

## Observations from the user video
- On an Android portrait browser, Synergy Pokédex presents a **sprite-first, dense icon grid**, grouped under **GENERATION 1, 2, 3, 4, 5** headings, with simple small tiles, long continuous scrolling, a jump-to-top control, search and a Filters action.
- The visible toggle reads **"Synergy PokéDex Data: OFF"**. Do not assume without verification what OFF changes; do not replicate an unexplained toggle.
- Text at the bottom reads **"Browse all 731 Pokémon"** with links to species guides. The public indexed page likewise lists **731 entries** as of review. This is a **list including alternate forms**, NOT 731 distinct National species and NOT a PokeMMO in-game ownership denominator.
- Website visibly distinguishes forms (e.g. Deoxys, Rotom, Castform, Wormadam, Deerling, Basculin, Darmanitan, Therian/Incarnate legends, Kyurem fusions, Meloetta forms, Keldeo and Genesect drives) in its public index.
- The video displays **no claim that every tile is wild/permanently obtainable**. Do not infer that from the list.

## New default UX / data contract
1. **Browse catalog:** full Synergy-*equivalent* species + forms roster, grouped by generation and scrolled without 60/200 caps. Each distinct form has its own stable `entry_id`, `species_id`, `form_key`, `generation` and display name; multiple form entries map to the *same* canonical base species when appropriate. Base species 1–649 preserved, plus form entries. Explicit female/male visual differences only where genuinely a distinct browsable form, matching reference coverage where verified.
2. **Detailed and responsive:** initial default sprite-grid is dense and playful, not a wall of 649 large identical cards. Compact/Standard/Expanded popouts change window size/density but are ALL freely resizable and scroll the ENTIRE filtered catalog. Search any species or form, choose Gen I–V headings/filters, optional more detailed card mode; click to Pokémon detail for moves, stats, abilities, type matchups, evolution, actual PokeMMO encounters and manually saved notes.
3. **Do NOT use an arbitrary 604/603 or 644/649 denominator for this catalog.** Show `X of N catalog entries` where N is actual loaded source manifest count. If source verified to match current Synergy 731 entries, show `731 entries` rather than `731 species`. Count species and forms separately where useful.
4. **Separate availability axes:** each form/species may be displayed in catalog **even if** `in_game_dex` is unknown/no; `acquisition` can be wild, perma raid, seasonal raid, roamer, event temporary, storyline temporary, contested, historical, not currently obtainable or unknown; `in_game_dex` and personal seen/owned/OT/shiny/alpha/costume markers are distinct. User's actual game registration counts remain user-specific manual/local data, not automatically read from game.
5. **Do not give every form fabricated data.** Share base species facts only where applicable; independently validate altered typing, stats, abilities, moves, form-specific encounters, obtainability and special mechanics. Mark unavailable fields as Unknown with dated provenance and no invented percentages. Virizion #640 needs immediate permanent-raid correction, as documented in Phase 4.
6. **Distinct views/filters without contradiction:** default **All Pokémon & Forms (Synergy-style catalog)**; optional **PokeMMO acquisition** filter (raid/wild/event/unknown) and **My Pokédex** registration-filter view. Do not label 731 catalog entries as the game's precise National Pokédex total. Never hide Keldeo/Landorus/etc simply because data is uncertain; display the named entry with a correct non-wild/unknown classification.
7. **No import requirement for basic names/forms/list.** Ship an independently sourced/maintained versioned factual entry manifest if licensing and source terms permit. Do not redistribute Synergy's proprietary site content, curated text, sprites, private API, images or entire dataset without permission. Reconstruct independently from lawful/publicly permitted data sources and validate via comparison. User-local dump may supply opt-in local sprites/deeper client data without being added to public repo.
8. **Original visual treatment:** reference the browse behavior and form coverage, but use independent Better Default styling and own implementation, not pixel-identical copies of Team Synergy UI, icons, branding or source code.

## Test cases that prevent another roster argument
- Base species IDs #001–#649 still addressable, even if encounter/ownership classification differs.
- Forms include distinct selectable records for: Deoxys 4; Castform weather variants; Rotom six; Burmy/Wormadam; Shellos/Gastrodon East; Deerling/Sawsbuck seasonal; Basculin stripes; Darmanitan Zen; Tornadus/Thundurus/Landorus Incarnate/Therian; Kyurem Black/White; Keldeo ordinary/resolute; Meloetta aria/pirouette; Genesect drives.
- Compare **set of normalized {species_id, form_key} keys** against an approved Synergy reference roster; identify missing/extra/form-duplicate keys. Never pass just because integer count equals 731.
- A new form can open details in both main app and popout and navigate back without resetting filters or scroll. Every mode can scroll to last form.
- Virizion and other permanent raid Pokémon are **NOT** rendered as unavailable merely because they are not ordinary wild spawns.
- Alternate forms never inflate the user's personal National Seen/Owned counters without verifying the game's metric semantics.
- Source snapshot date + changed-form diff report on updates. A roster changing from 731 should prompt source review, not silently treat it as a bug.

## Copyright, data access and provider relationship
- Synergy's site is a reference for **feature scope/quality and public entry names**, not a licensed feed automatically supplied to our application.
- Do not automate large-scale site crawling, use private APIs or republish a proprietary database. Ask the site's maintainers for permission or a documented public integration if direct reuse becomes desirable. An independent, sourced, versioned catalog is a valid alternative.
- PokeMMO official rules on distributing game client assets and gameplay modifications still apply; keep protected sprites/raw dumps out of GitHub.
- If exact parity cannot be confirmed, show a verified independent subset with an explicit parity report instead of falsely announcing "731 matched."

## Implementation priority
Next Claude coding pass on `develop`, keep user-facing `0.1.0`. Treat this as a direct owner decision alongside the existing [accuracy and shared foundations assignment](../build/07-V0.1.0-ACCURACY-AND-FOUNDATIONS.md). Fix misinformation and form navigation first; visual density/popout details next. Existing user progress and stored species notes must migrate safely, linking form entries to canonical species where needed.

**Never claim this doc is implementation.**

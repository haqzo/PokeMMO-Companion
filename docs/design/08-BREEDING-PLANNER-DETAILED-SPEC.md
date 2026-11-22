# 08 — Breeding Planner: in-game familiar interface + full planning workspace
**Baseline:** 2026-11-22 | **Status:** Proposed UX and data contract; NOT an implemented or approved calculator.

## Guiding decision
Design the breeding **Preview** to evoke PokeMMO's genuine breeder screen: **Parent A | Expected Offspring | Parent B**, with the same logical information order: species, IVs, moves, nature and selected held items. Modernize spacing and responsiveness using Better Default v1.8.0 semantics rather than copying protected textures, icons or font files.

Source caveat: reference images observed on official forum posts date mainly to 2020–2024. Before pixel-level signoff, inspect the **current** 2026 in-game breeder interface and reconcile any UI changes.

## Main page: three internal tabs rather than separate app buttons
### 1. Breeding Preview (default)
- **Parent A left:** searchable/species-or-family selection from verified Pokédex, gender, form/costume, six individual IV inputs (0–31 or unknown), nature, ability/HA potential where supported, moves, held item and provenance ("Manual entry"/"Imported user file").
- **Offspring center:** projected species, verified inheritance breakdown, six IV result cells with distinct states: guaranteed value / possible range / probability only if verified; desired nature/moves; egg-group and validity notices. The center should visually read as **prediction**, never a current Pokémon owned by user.
- **Parent B right:** mirrors Parent A. Ditto and genderless special cases need explicit compatibility checking.
- Below three columns: simple compatibility/result strip (Compatible / Not compatible / Needs verification) with short reason. A "See why" details expander explains which IVs, items and parent species lead to the prediction.
- **Held items:** each parent holds at most one breeding item. Choosing Everstone on a parent must disable a Power brace on the SAME parent; another parent may still brace. Do not display impossible dual-item outcomes.
- **Consumption warning:** both parents are surrendered when breeding; the Companion never triggers or confirms the breed. Say "Double-check this prediction in PokeMMO before breeding."
- No fake "Breed" button in Companion. Use **Add this step to Plan** / **Save pairing** / **Open in game guide** rather than implying automated gameplay.

### 2. Breeding Plan
A dedicated breeding-tree workspace, NOT permanently visible next to three columns.
- Goal definition: target species, nature, chosen specific IVs (0–31 per stat; not 31-only), optional egg moves / shiny / Alpha / costume / HA potential, target gender where relevant, budget and ownership.
- Modes: **Simple goal** (show canonical stepping stones) and **Use my breeders** (user-maintained local inventory with compatible parents). Advanced optimization and "cheapest" claims require separate validated solver.
- Render a clean vertically/horizontally zoomable tree: base breeder leaves -> intermediate eggs -> final Pokémon. Show parent slot, held item, next child, gender decisions and item counts for each node.
- One selected node at a time populates the familiar three-column Preview. This makes the complex tree readable rather than covering every line with full Pokémon panels.
- Each node has explicit statuses: Not started, Breeders ready, Item missing, Done, Skipped / Alternative. The user manually marks progress; no assumption about game inventory.
- A side inspector provides shopping list / manual prices / braces, Everstones, gender fees, breed count, owned-vs-needed breeders and source of every price. No protected GTL API scraping. Allow manual price edits, export/import plan files and undo.
- Avoid double-counting an intermediary offspring as still available after it is consumed in a later step. A used breeder must disappear from available inventory upon confirmed user-recorded consumption, not because it was *planned*.

### 3. Egg Moves
- Species + desired move + version-aware compatible pathways; interactive step chain feeding into Breeding Plan.
- A move in a dump learnset but absent from verified move catalog is not assumed legally inheritable. Show "Needs verification".
- Distinguish moves known by parents, transferable by the offspring's legitimate learnset, move slots and constraints. PokeMMO-specific rules take priority over original game rules.
- Never silently add an egg move to the final build merely because it exists on some unrelated ancestor.

## Visual hierarchy and attention budget
- **Offspring center** gets the strongest subtle accent. Parents sit on matching neutral cards without oversized artwork.
- Only one highlighted inheritance state at a time when inspecting an IV; users should be able to compare Parent A / Offspring / Parent B values by row.
- Use actual Better Default stat-bar/selected state palette once extracted. No neon purple or excessive outlines.
- Costs/number of breeders belong to the Plan view, not stuffed into Preview; Preview shows just pairing requirements and any critical warning.
- Small compact icons for nature, gender, brace/Everstone with text tooltips and text labels in Expanded mode. No critical information conveyed by colour alone.
- No automatic game-state import, no memory reading. A possible **manual import of a user-exported 2026 in-game data file** can be researched and approved later once its actual format and permissions are checked. Never infer support solely from third-party tool claims.

## Popout layouts (purpose-designed, NOT a scaled-down copy)
| Density | Expected view | Controls |
| --- | --- | --- |
| Compact | Current step summary: two species, required held items, predicted offspring's most important verified IV/nature changes, "Open in main app" | Pin, opacity if legible, next/previous saved step, close |
| Standard | Three-column pair preview if enough width, otherwise **Parent A -> Offspring -> Parent B** in deliberate stacked segments; 6 IV rows, nature, items and compatibility visible | Select step, edit item / IV, open full plan |
| Expanded | Full three-column layout and tabbed move/nature/traits explanation; optional node breadcrumb and progress | Full preview and linked plan, comparison and export |

If user resizes, switch layout only to protect minimum readable widths; do not randomly discard partially entered edits. A popout may be pinned on game or unpinned on second monitor; same data.

## Inheritance model UI states (no misleading certainty)
- **Guaranteed:** value deterministically established under tested PokeMMO rules and selected braces.
- **Range:** multiple valid outcomes; display minimum–maximum and an explanation. Do not replace with simple average when the source requires random inheritance.
- **Probability:** only when formula/outcome distribution is verified; otherwise omit percentages and show possible values.
- **Unknown:** missing move/form/HA/costume rule or ambiguous parent data; block unsupported exact claims, not the entire planner.
- **Incompatible:** report specific failed condition (wrong gender, egg group, baby, Ditto exception, etc.), not a generic error.
- **Cost:** actual user-defined prices and date; no fake live GTL prices.

## Key PokeMMO mechanics and source confidence
- **Both parents are consumed** — documented PokeMMO breeding system / community and official guide history.
- **Braces guarantee one chosen parent's stat; Everstone passes parent's nature and occupies same single held-item slot** — official 2015 changelog and subsequent PokeMMO breeder guides.
- **Three direct inherited stats + other derived outcomes** — original official 2015 balance rule; exact current result distribution/rounding must be regression-tested before labeling exact.
- **Gender selection fee** depends on species ratio — confirm current fee categories with in-game examples.
- **Nature / Egg moves / Egg groups** — current learnset and species exceptions need verification. Standard cartridge rules are insufficient.
- **Shiny, Alpha, Hidden Ability potential and OT identity** must be separate fields, not a single "special" toggle. Exact cross-species/line inheritance is a test gate.
- **Costume inheritance** was introduced with Shiny Wars 2026. October 30, 2026 update fixed costumed-monster OT* breeding and cross-species compatible breeding; another 2026 patch addressed breeding Shiny Wars prize monsters with Ditto. Use patch-aware validation.
- Baby non-breedable/evolutions and genderless family constraints need precise exceptions, verified before optimization.
- The **in-game GTL Search Breeders feature** was introduced in October 2026; Companion should not pretend to place orders, scrape live prices or replace the game interface.

## Acceptance workflows
1. Two compatible ordinary parents -> IV preview -> choose one brace per parent -> changed guaranteed stat displayed; reset item -> result changes cleanly.
2. Give Parent A an Everstone -> Parent A brace is unavailable; give Parent B a brace remains possible.
3. Pick incompatible egg groups/opposite genders -> explain incompatibility, do not show valid final breeding action.
4. Ditto + a genderless species -> show legal pairing and species rule only after verified examples; two Dittos invalid.
5. Create 3×31, 5×31 with nature goals -> show a clear incremental tree and correct item/inventory accounting; no fixed total cost without price inputs.
6. User-owned 2×31 breeder -> use that single item in exactly one plan branch; no duplicated consumption or lost manual progress.
7. Egg move from source learnset with uncertain TM source -> surface unknown, do not promise inheritable.
8. Alpha + non-Alpha and Alpha + Alpha; Hidden Ability from different species/evolution family; shiny parent compatibility, OT identity and Costume + compatible different species -> only enable exact previews after current verification.
9. Changing desired gender updates fee and, if necessary, the breeding path.
10. Close or minimize main app with a pinned Compact pairing on a second screen/game -> popout stays readable; resume from saved plan when reopened.
11. Data source missing/offline -> local plan remains editable, predictions whose rules aren't validated become "Requires verification".

## Evidence and no-go policy
- Candidate source links recorded in **09-BREEDING-RESEARCH-AND-TEST-GATES.md**.
- Do not copy upstream tools' UI source, game sprites, art or stored user data without rights review. Use reference content only for mechanics verification and usability inspiration.
- Production implementation and numerical solver remain blocked pending user approval, tests against real 2026 in-game preview and reliable data sources.

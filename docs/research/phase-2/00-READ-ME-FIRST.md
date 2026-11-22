# PokeMMO Companion — Research Phase 2
**Research date:** 2026-11-22  
**Owner repository:** https://github.com/haqzo/PokeMMO-Companion  
**Workflow:** User + ChatGPT plan/research/QA, Claude implements only after explicit approval.

## What has actually been done
- Opened the exact user-supplied `Pokemmo-Dumps(5).zip`, including its nine embedded ZIP archives, and passed the inner archive CRC checks.
- Parsed `info/monsters.json`, `info/skills.json`, and `info/items.json` directly.
- Checked sprite and item-icon filenames against National Pokédex IDs and item icon IDs.
- Cross-researched 2026 official PokeMMO update notes, official support, community sources, PokeMMO-specific calculation engines, legal/asset policy, and Qt/Wayland behaviour.
- Reviewed reference screenshots of other Pokédex grids; created an original interaction specification instead of copying their UI.
- **Did not** build an application, edit GitHub, verify live ntfy payloads, prove overlay compatibility on the target machines, or validate all 33,405 encounter rows against a running game.

## Confidence labels used throughout
- **DUMP FACT:** directly read from supplied archive; says what the archive contains, not necessarily what's true on today's game server.
- **OFFICIAL DOCUMENTED:** sourced from published PokeMMO developer/official support page, with date where known.
- **COMMUNITY DOCUMENTED:** researched from relevant community project or guide, possibly stale or incomplete.
- **PROPOSED:** design/workflow recommendation, not a claim about PokeMMO.
- **BLOCKED / UNVERIFIED:** requires sample data, an in-game test, official confirmation or licensing review.

## Most important decisions
1. Full **grid/tile Pokédex with sprites**, variable columns, responsive layouts and focused detail panel, **not rows**.
2. National ID, generation of introduction, regional Pokédex membership, region where encountered, and user's personal regional storyline completion are **different things**.
3. Do **not** equate `obtainable: true` with permanent possession or ordinary wild encounter.
4. Each calculator must have a PokeMMO-specific mechanical specification and executable golden tests prior to public release. Good-looking numbers alone do not pass QA.
5. Favor official, locally exported data; field-by-field validation, source links, update timestamp, and clear `unverified` states. Do not silently fall back to cartridge/PokeAPI mechanics.
6. Independently movable, resizable tool windows; minimal launcher; Windows + Linux KDE X11/Wayland. **Proof-of-concept required first** because native Wayland window placement is restricted.
7. No encounter counter, gameplay automation, injected code, memory reading, or invasive account credentials.
8. No raw PokeMMO client assets committed to public GitHub; local imports / permissions review before any distribution.

## File order
- `01-DUMP-FORENSICS.md`: measured source inventory, data/sprite mapping and pitfalls
- `02-POKEDEX-GRID-DESIGN.md`: original grid layout, search/filter/navigation and Pokémon detail specification
- `03-POKEMMO-ACCURACY-POLICY.md`: data model, provenance, validation and edge cases
- `04-CALCULATOR-RESEARCH.md`: calculator-by-calculator formula/test/source readiness
- `05-LEGENDS-ALERTS-LIVE.md`: rotation, raids, alpha/swarm event subscriptions and status logic
- `06-WINDOWS-LINUX-OVERLAY.md`: feasibility and platform POC acceptance tests
- `07-STORYLINE-AND-COMPLEMENTARY-TOOLS.md`: five user's walkthroughs and other modules
- `08-CLAUDE-HANDOFF-AND-QA.md`: implementation preconditions, milestones and go/no-go criteria
- `09-SOURCES-AND-OPEN-ISSUES.md`: cited web sources, licensing and unresolved questions
- `RAW-DUMP-AUDIT.json`: measured aggregate audit metadata, no assets
- `DATA-EDGE-CASE-QUEUE.json`: difficult Pokémon and data cases for verification

**Next milestone:** approve layout and verification strategy, then obtain an authenticated on-device overlay test from Claude before production code. Keep original user dumps unmodified and private.
# 22 Nov 2026 — v0.1.0 second-build video review and extra reference
**Status:** Reviewed observations and requirements, not bug fixes.  
**App code reviewed:** `develop` commit `8a38a3d0239b5113da8c7c966232777ca68460b4`.  
**Private media:** `Screencast_20261122_193442.webm` (04:55.628, 2560×1440 @60 fps); six separately supplied in-game National Pokédex screenshots; additional image showing a **different third-party WIP theme editor**. **Do not commit media or private PokeMMO screenshots to public GitHub.**

## Inspection method
Inspected overview frames spanning 00:00–04:55 with closer high-resolution checks in sections where interface state materially changes. This is complete timeline coverage, **not a claim that all 17,738 individual frames were inspected one-by-one**. Real user interactions and visible states were recorded, but keyboard focus, persistence after restart and actual feed accuracy require separate test logs.

## Detailed recording timeline
| Approx range | What is seen | Action / quality gate |
| --- | --- | --- |
| 00:00–00:20 | New v0.1.0 launch with Qt terminal logging; existing window shell starts through X11/XWayland under KDE. A Qt portal registration warning is visible but app proceeds | Keep shell and tray/notifications; gather logs before attributing the portal warning to functionality failure |
| 00:20–01:03 | Main Pokedex opened, scrolled and toggled Small grid; detail inspector for **Lugia (#249)** visible with 'Unverified' source. At fullscreen width there are many tiny near-uniform cards, heavy empty dark space around detail and unclear source/availability | Improve readability, responsive panel, source visibility. **Don't equate unknown membership with obtainable**; classify Lugia's contested/can-be-seen mechanics separately |
| 01:03–01:29 | Home's new multi-column layout: latest official changelog hero, official events, source status, Live, Quick Access, run starter, empty Favourites. Home is improved and useful, but has lots of wide empty interiors and fairly tiny text | Retain events and in-app article details; improve proportional card heights, typographic scale and contextual empty states. Quick Access exists; make it discoverable and easy to configure |
| 01:29–01:43 | Live Alpha and Swarm reports show one **replayed swarm observation** with location and two explicitly marked TEST alerts. Source status says connected; other areas sparse with much empty space | Confirm correct replay/age semantics; 'Connected' means data source connected, **not** real-time spawn guaranteed. Responsive report inspector |
| 01:43–02:05 | Guides first-run create-run panel and desktop terminal, no populated named runs observed | Empty Guides state must explain manual runs, imported/custom guide options and immediate actions; no fake storyline progress |
| 02:05–02:15 | PokeMMO game launched; interface initially shows login with **an abnormally large white 3D Reshiram** across the scene. Companion windows remain independent | Treat unusual game login rendering as a **separate observed PokeMMO client/theme/ROM issue**, not proof caused by Companion. Do not modify ROMs or theme automatically |
| 02:15–03:45 | Multiple small Companion popouts (Pokédex grid, detail, other tools) dragged/resized and visible over PokeMMO login. Grid is usable but becomes dense and text small; transparency makes some text hard to read against bright model | Preserve freely movable/pinned popouts, opacity; improve text size and opacity contrast/legibility; allow default popout positioning and density independently of window dimensions |
| 03:45–04:29 | Type Matchups popout over game: full 17×17 chart displays row and column highlights, focus readout and keyboard/click controls. It is now much closer to request; readability remains tight at smaller sizes and against game | Keep XY crosshair, offensive/defensive distinction and 17-type correctness. Improve chart zoom/scroll, header legibility, fit-to-pane, focus selection |
| 04:29–04:55 | More popout positioning, display settings/smaller tool windows over PokeMMO login; tests of footprint and opacity continue | Mode must resize to sensible per-tool default **without disabling manual resize**; replace the A-/A+ popout footer with clear text-size icon/menu + slider and reset |

## Cross-check with prior in-game screenshots
- In-game National grid showed silhouettes, registration outlines, Advanced Search and **Seen 436/604, Owned 216/603, Caught OT 187/603, Alpha 14/362, Shiny 7/603, Costumes 1/12** for the user's recorded session. The denominators are **not confirmed permanent global max species counts** and must not be confused with 649 reference numbers.
- Current Companion label **'PokeMMO Dex, 644 of 644'** is **still not a verified reproduction** of PokeMMO roster. It omits five species based on stale classification and treats unknown as visible. UI even says 40 more unidentified: this is not a legitimate validated set.
- Critical new research: **Virizion is an obtainable permanent raid Pokémon** following the official Lunar New Year 2026 permanent raid introduction. Current registry's 'not in dex / unavailable' for #640 is factually unsound. See [research corrective register](../research/phase-4/00-POKEDEX-ACCURACY-CORRECTIONS.md).
- The same source framework must classify Cobalion and Terrakion, Cresselia, Heatran, Meloetta, roaming birds/beasts, KOTH-only legendaries, temporary story legendary encounters and event-only/raid-locked species individually, not as one generic 'not obtainable' class.

## Current code-backed architectural findings
- Local Pokémon Notes exists only **per species** in `ui/js/pages/pokedex.js`; a standalone Notes library with create/delete/tags is not built.
- Item dump has `3,006` records; nested `ItemSpriteDump.zip` has `2,366 PNG files`. `companion/services/importer.py` currently extracts **only breeding-item icons**, not a complete Item Library.
- Guides currently support milestone outline + local imported walkthroughs and run checklists; no rich editor for user-created guides, repeatable gym-rerun programs or image attachments.
- Sidebar Quick Access and two-axis type chart are **already present**; preserve and refine rather than rebuilding.
- No standalone owned-Pokémon box or user-designed shiny showcase; current Pokédex registration and species notes are not individual Pokémon-instance records.
- Popout text scaling uses A-/A+ footer controls that user wants replaced with a more polished, understandable UI.

## New reference screenshot
User supplied a screenshot of **Shu's WIP editor**, showing image/texture atlas browsing, colour browsing, canvas inspection, widget/node hierarchy, zoom and 9-slice controls. This is chiefly a reference for the **separate PokeMMO Theme Creator project**, not authorization to merge it into Companion or add a graphics editor to Companion. Design inspiration for a clean searchable Items/Sprites library inspector may be noted, but do not copy another creator's branding, art, assets or source.

## Testing / limitations
- These observations are from one KDE/XWayland machine and one user session. No Windows or Android test, no exact native screen capture proof, no actual successful catch-rate OCR, no game memory access, no validated in-game Pokedex membership list.
- The Reshiram scene may be caused by PokeMMO's login animation/model or a game/mod issue. Do **not** claim Companion caused it or fix game assets as part of Companion build.
- No game-client memory access/injection, automated inputs, account-password capture or ROM modification.

## Requested acceptance targets
1. First fix source-grounded availability (especially Virizion/raid classifications) and stop asserting a bogus 644-species 'PokeMMO Dex'.
2. Keep polished 5-section app and honest Live+News; improve typography/proportions, compact body layouts, transparency.
3. Add integrated new features on a realistic staged plan: Item Library, Notes, owned box, Shiny Showcase, custom Guides, clickable encounter region maps and expanded toolbar languages/settings.
4. Post-1.0 only: Android client and opt-in screen-only OCR research after rule/permission assessment.

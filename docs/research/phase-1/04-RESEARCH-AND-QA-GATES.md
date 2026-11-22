# 04 — Research and testing gates

## Gate R1 — Current data truth

- [x] Inventory source user dump and verify ZIP CRCs; record SHA256 in machine-readable audit.
- [x] Identify raw `obtainable` boolean semantic risk and special species.
- [x] Find official example proving boolean does not mean permanent ownership (Zekrom).
- [x] Find official July 2026 encounter patch.
- [ ] Complete current 649-species + special-form availability reference with evidence per nontrivial case.
- [ ] Document exact encounter rate/rarity flag semantics, season/time timezone, and form coverage.
- [ ] Compare systematic sample from each of 5 regions to in-game screenshot pages post update.
- [ ] Check 2026 legendaries, raids, uncatchable forms, costume/secret shiny definitions.
- [ ] Audit all five ODT walkthroughs against current game mechanics; do not publish unchecked instructions.

**Gate fail condition:** A statement labeled as fact has no attributable source, or contradicts current official client/notes. Display 'unverified' or defer feature.

## Gate R2 — Sources, permissions, feeds

- [x] Publisher announced public Alphapedia ntfy topic.
- [x] ntfy streaming/subscription protocol documented.
- [ ] Obtain real public messages and inspect schema, corrections, IDs, timestamp, stale/expiry semantics.
- [ ] Confirm publisher usage expectations, rate limits and fallback/disconnection behavior.
- [ ] Review redistributability of extracted assets and third-party repositories; keep raw assets private.
- [ ] Confirm specific source and license for each calculator before reuse.

## Gate D1 — UX sign-off

- [ ] Approve visual mockups for launcher, compact Pokédex, detailed Pokédex, toast, Roadmap.
- [ ] Confirm small and large display states, keyboard navigation, accessibility and customizable opacity.
- [ ] Approve the count of visible top-level controls, consistent interaction styles and feature scope.

## Gate T1 — Disposable floating-window proof

- [ ] Windows: game focused/unfocused, always-on-top panel, manual pin, drag, resize, transparency.
- [ ] Linux KDE X11: same tests.
- [ ] Linux KDE Wayland: stacking/focus, window placement fallback, drag and resize under compositor restrictions.
- [ ] Multi-monitor: portrait + landscape, DPI scaling, unplug/replug/reorder, restore on visible display.
- [ ] No game input interception when panel isn't intentionally interactive.
- [ ] App remains usable if overlay mode fails; separate-monitor mode still works.

## Gate T2 — Data and feature QA (future build)

- [ ] Spot-check 25 Pokémon across regions, evolution methods, forms, abilities, and move sources.
- [ ] 5 locations per region, including 4-season variations and time-specific encounters.
- [ ] Special `--`, `Lure`, `Special`, horde cases never claim exact rates.
- [ ] Legendary roamer rollover and time zone; raids and story-only separated.
- [ ] Tests for actual ntfy report, correction, duplicate, expired alert, offline reconnect.
- [ ] Every calculator must have reproducible known-in-game fixtures before being labeled accurate.

## Git hygiene

Keep `main` for reviewed releases. Use planning docs in a research branch only if the owner approves publication; no surprise pushes. Never commit raw game/client files from the user's dump to a public GitHub repo.
# PokeMMO Companion — Research Phase 1 (2026-11-22)

**Owner's repository:** https://github.com/haqzo/PokeMMO-Companion  
**Roles:** Claude = implementation; ChatGPT + user = research, planning, source auditing, design approval and QA.  
**Status:** RESEARCH / NO PRODUCTION CODE AUTHORIZED.

## Decisions locked so far

- Standalone external desktop companion for **Windows and Linux**, including testing on KDE Plasma Wayland and X11.
- Small optional launcher; user-controlled independent floating/resizable/minimizable tool windows, not a giant always-open dashboard.
- Distinctive, clean, cohesive visual identity and sensible density; basic gameplay stays visible.
- Pokédex of actual PokeMMO species, forms, obtainable statuses and region/time/season-specific encounter information.
- Real Alpha/Swarm alerts using public feeds where lawful and verified; history, filtering, corrections, and stale-report indicators.
- Roaming Legendary Rotations and special-legendary roadmap: monthly roamers vs raids vs limited/temporary story mechanics.
- Type matchups, reference utilities, later verified calculators, team planning, breeding, encounter search, optional story guides.
- **NO encounter counter**; no gameplay automation, injection, process memory access, or simulated input.
- Raw PokeMMO client assets and strings stay private pending source/redistribution permission review.

## Scope of this package

1. `01-DATA-AND-ACCURACY.md`: exact dump inventory, data pitfalls, treatment of availability and encounter rates.
2. `02-SOURCES-AND-OPEN-QUESTIONS.md`: authoritative/community sources and what we have or have not confirmed.
3. `03-UX-AND-PLATFORM.md`: design direction and floating-window proof required.
4. `04-RESEARCH-AND-QA-GATES.md`: order of work, acceptance tests, and stopping rules.
5. `05-CLAUDE-PREBUILD-BRIEF.md`: safe handoff without a premature coding directive.
6. `DATA-AUDIT-SUMMARY.json`: machine-readable evidence generated from this user-supplied archive.
7. `AVAILABILITY-VERIFICATION-QUEUE.csv`: sample Pokémon requiring manual classification; **not a release dataset**.

**Do not commit the user-provided dump, game client assets, or their private reference files to a public repository.**
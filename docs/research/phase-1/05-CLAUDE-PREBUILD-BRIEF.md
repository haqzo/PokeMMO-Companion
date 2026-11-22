# 05 — Claude handoff: planning only

You are the implementation lead **after** the owner approves the design and data acceptance criteria. ChatGPT + owner lead research/planning/QA.

Repository: https://github.com/haqzo/PokeMMO-Companion. As checked Nov 22 2026 the `main` branch contained a minimal `README.md` and no production code.

## Current instruction

**DO NOT immediately build the full application.** First review the research findings, highlight contradictions/unverified mechanics, recommend a windowing approach with concrete tests for Windows and Linux KDE X11/Wayland, and create polished visual specification options for owner review. You may propose a *disposable* floating-window technical experiment only when explicitly authorized.

## Nonnegotiable requirements

- Native-feeling companion that **complements** PokeMMO, not replacing its in-game tools.
- No encounter counter, macros, automation, input injection, game memory reading, anti-cheat interference, or player control.
- PokeMMO-only source truth for data; careful obtainable vs temporary vs special classifications.
- Compact launcher, independent floating tool windows, per-window sizing/minimize/visibility; cross-platform fallbacks.
- Data traceability (source/update date, verification state); no fabricated percentages.
- Alerts integrate only verified public signals; updates/corrections/expiry handled explicitly.
- Treat raw uploaded dumps as private user material. Do not publish assets or strings by default.
- Windows and Linux supported from first deliverable and jointly tested.
- Keep main clean; use separate working branch only after user approves.

## First deliverable to request from you

A small **feasibility and visual-design proposal**: 2 windowing architecture options, supported/unsupported feature matrix, 5 screen wireframes, complete open questions, and acceptance tests. Include no production code or invented PokeMMO facts.
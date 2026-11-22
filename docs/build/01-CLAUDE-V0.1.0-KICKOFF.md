# Claude Implementation Assignment — PokeMMO Companion v0.1.0
**Status:** Ready to hand to Claude now. **This is a BUILD assignment, superseding earlier documents that requested more design-only work.** This handoff does not imply ChatGPT has already started Claude.

## Instructions from project owner
We want a **broad, cohesive, usable first release candidate** in one sustained work pass. Keep version **0.1.0**, implement as far into the full PokeMMO Companion as possible. The user will review by recording a video of the complete application; bug/polish/feature iterations follow from that video. Do not stop after a shell or ask the user to approve every small internal code milestone.

### Repository and branch
- Repository: https://github.com/haqzo/PokeMMO-Companion
- Read and work only on `develop`. **Never merge to `main`** and do not create lots of development branches.
- Main documentation: `docs/build/00-V0.1.0-FIRST-PASS-PLAN.md`, `docs/design/README.md` and all linked design documents, `docs/research/phase-3/00-START-HERE.md`, source register, goldens, and Windows/Linux QA.
- Prior documents saying "do not build yet" describe the old pre-approval stage. The current owner direction is to **prepare v0.1.0 as a complete first preview**; deliver runnable code on develop. You can request one essential missing resource (e.g., exact local Better Default path) without stopping all unrelated implementation.

### Your engineering role
You do the implementation; user and ChatGPT handle product direction, data research, review and testing. We want a real desktop application, not static screenshots, fake feeds, disabled navigation disguised as done features, or another oversized one-panel dashboard.

### Important architecture decisions
- **Normal desktop application** designed for a second monitor or beside the PokeMMO game; full main app need NOT be an overlay.
- **Optional independent popouts** can be pinned / transparent / resizable and remain usable while main app minimized.
- Five main destinations: **Home, Pokédex, Tools, Live, Guides**. Settings in gear. Horizontal or vertical nav option.
- Three layout densities per popout, purposeful content reflow rather than uniform scaling: Compact, Standard, Expanded.
- Real **Better Default** styling and Poké Ball identity. No default purple.
- Homescreen with **actual in-app** PokeMMO official changelog, news, events data and article details; source links optional secondary. Correct event status, staleness, offline cache.
- Pokédex 649 species, responsive sprite cards, forms/locations/stats/moves where verified, fallback imagery and local-import mechanism if lawful and necessary.
- Tools grouped (Battle/Stats, Breeding, Planning/Hunting); breeding **Parent A | Offspring | Parent B** mimic of in-game *workflow*, not copied art. Breeding plan separate tab for the tree.
- Live tabs: Reports (Alphas/Swarms/history), Legendaries, Altering Cave. Toast notifications and native OS notifications as independent opt-in channels. Do not confuse ntfy message cache expiry with despawn time.
- Guides: typed character name, separate saved runs across 5 regions, manually checked objectives, autosave + backup, translucent readable pinned current-step popout inspired by user reference video. No cartoon avatars.
- Settings: per-tool opacity, pin, window position where supported, text scaling, nav direction, notifications, privacy/offline and accessible keyboard controls.

### Technology: use pragmatic judgment to move fast
- Prefer **one consistent cross-platform technology**, and justify it. Qt 6 / PySide6 (Qt Widgets or QML) is a strong candidate for desktop windows, local state and OS integration, but choose another only with a concrete advantage. Create a small end-to-end technology smoke test at the start and then **continue into full implementation in the same run**.
- For KDE Wayland, don't claim programmatic window positioning or always-on-top in exclusive fullscreen without observing it. Provide user-facing disabled or fallback states.
- Use safe local persistence (e.g., SQLite or well-designed atomic JSON) with versioned schema; keep data sourcing isolated behind repositories/adapters, no network blocks in UI thread.
- Bundle only original/open-licensed public-safe metadata/assets and source code. Store locally selected PokeMMO client dumps privately, never in Git and never auto-upload.

### Non-negotiable quality bar
- Every interactive control is wired or explicitly disabled with reason.
- Content either comes from verified PokeMMO current source + timestamp, is labelled as a **sample/demo**, or says **Unavailable/Unknown**. Never make up rates, Alpha location, current cave, exact catching odds, official event dates or breeding outcomes.
- Keep official stable updates and PTS separate. Ended events must not display as live.
- Source-driven calculators need regression fixtures; until validated show **estimate** or defer computed numbers. Breeding plan UI can be working even when advanced inheritance formula is not yet validated.
- Windows/Linux support targeted; actually test on available host OS and provide manual Windows/KDE tests where unavailable.
- Do not add an encounter counter, read game memory, inject code, automate gameplay, or default-enable OCR.
- No silent global system tweaks, broad package installs or touching user's original ROMs/themes/other project folders.
- Use Bash-compatible instructions, one clear test/run command and explicit **Close Companion / Keep Companion Open** instructions before each test.
- Git changes limited to `develop`; frequent coherent commits. No binary asset dumps.

### Internal sequence to implement without user micro-approvals
A. Architecture skeleton + real application main shell, navigation and shared styling.
B. Independent window/popout manager + local state, notifications/tray.
C. Home in-app news/changelog/events data reader with verified snapshot/cached offline support.
D. Pokédex grid/detail/search/filter with lawful data/asset strategy and clear unknown fields.
E. Guides full main page + named local runs, persistent region progress, transparent popout.
F. Live reports/history and real notification-path demo; roaming roadmap/cave observed data semantics.
G. Tools hub, type/nature quick references, breeding preview/plan and expanded calculators only when tested.
H. Settings, onboarding, error states, build/runtime instructions, automated tests, smoke QA and accessibility.
Iterate internally over A–H; don't break between with "Should I build the rest?" unless essential access is missing.

### How to finish your Claude turn
Do not announce a fake success. Deliver:
1. Repository commit SHA / current `develop` head and **version 0.1.0**.
2. Exact Bash commands to install/run on CachyOS, instructions on whether any Companion window should be closed, and how to run Windows build/test if possible.
3. A short honest **working features vs incomplete/blocked** table, noting specifically external data/asset limitations.
4. Smoke-test and automated-test results; differentiate tests actually run from ones needing the user.
5. A suggested **video walkthrough order** (Home -> Pokédex -> Tools -> Live -> Guides -> Popouts -> Settings -> Restart / persisted state).
6. No PR or merge to main, no new official public GitHub release without user approval.

If you cannot fully finish every feature, prioritize a *working broad application with coherent flows* and record exact remaining issues, rather than replacing missing features with misleading visuals. Continue building as far as safely feasible within this one effort.

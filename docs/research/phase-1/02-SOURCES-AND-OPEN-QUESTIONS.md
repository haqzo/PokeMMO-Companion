# 02 — Sources and unresolved research

## Primary PokeMMO sources

- **Official July 29, 2026 encounter/Pokédex changelog:** https://forums.pokemmo.com/index.php?/topic/199536-changelog-shiny-wars-2026/  
  Confirms comprehensive encounter changes, actual percentage rates by time of day, multi-season browsing, precise sublocations, Sweet Scent as separate type, forms, advanced search, etc.
- **Official Nov 19, 2026 update:** https://forums.pokemmo.com/ — GTL/new UI changes; source to monitor, not a data warranty for the dump.
- **Zekrom story-only nature:** https://support.pokemmo.com/knowledgebase/article/catching-zekrom
- **Code of Conduct:** https://pokemmo.com/en/code_of_conduct/
- **Terms of Service:** https://pokemmo.com/en/tos/
- **Support penalty policy:** https://support.pokemmo.com/knowledgebase/article/penalty-policy
- **Asset/video policy:** https://pokemmo.com/en/video_policy/ (states client assets must not be extracted and distributed separately; conduct a fuller permission/legal review before publication).

## Community references, not substitutes for verification

- **PokeMMO official forum legendary guide (updated February 2026):** https://forums.pokemmo.com/index.php?/topic/187603-the-ultimate-legendary-guide/
- **Monthly legendary calendar:** https://pokemmo.info/calendar
- **Alpha/Swarm feed announced by publisher:** https://ntfy.pokemmotools.org/alphapings ; https://alpha.pokemmotools.org/alphapedia ; https://forums.pokemmo.com/index.php?/topic/197731-alphapedia-real-time-alphaswarm-pok%C3%A9mon-notifications-and-history-for-pc-mobile/
- **ntfy documented subscription protocol:** https://docs.ntfy.sh/subscribe/api/
- **3s PokeMMO Tool (inspiration only):** https://github.com/muphy09/3s-PokeMMO-Tool — latest release checked was v3.3.8 in October 2025, no license surfaced in repo metadata; do not reuse proprietary source/assets without review.
- **PokeMMOZone data reference:** https://github.com/PokeMMOZone/PokeMMO-Data — PokeAPI-based, last push before July 2026 overhaul; its GPLv2 license has compliance implications if copied.
- **PokeMMO-Tools data reference:** https://github.com/PokeMMO-Tools/pokemmo-data — may not reflect post-July-2026 encounters; license review required.
- **PokeMMOZone adapted damage calculator:** https://github.com/PokeMMOZone/pokemmo-calc — archived; use as a possible reference and obtain known-correct fixtures, not proof of current mechanics.
- **Qt Wayland limitations:** https://doc.qt.io/qt-6/application-windows.html
- **Official Flatpak launcher documentation:** https://github.com/flathub/com.pokemmo.PokeMMO

## Questions we must answer before implementation

- Do we have a maintained *current* authoritative full obtainable/form/availability list? How do 2026 raid legends and event exceptions classify?
- Can we verify raw encounter percentages against game client pages with screenshots/video and live dates? If not, ship only verified slices.
- What exactly do rarity flag bit masks mean? How do `Special`, `Lure`, horde rows, and 0/blank percentages map to displayed information?
- Are there permitted ways to redistribute the user's extracted icons/sprites, or do we need independently licensed art or a local-only import pipeline?
- Which precise Alpha/Swarm/Pheno categories are actually emitted by the Alphapedia topic? What is the JSON shape, expiry semantics, corrections and report IDs? No endpoint contract verified yet.
- What are the current calendar mechanics and time zones for seasons, monthly roamers, daily events, and unusual event overrides?
- Which calculator implementations are publicly licensed and specifically updated for PokeMMO's 2026 changes?
- Which Freeze tool did the owner mean? Exact URL or repo not identified by our searches; do not invent attribution.
- How should Wayland's lack of absolute top-level window placement affect per-window position restoration and always-on-top behavior?
- How current are the five uploaded regional walkthroughs? Treat them as unverified reference material and review route by route.
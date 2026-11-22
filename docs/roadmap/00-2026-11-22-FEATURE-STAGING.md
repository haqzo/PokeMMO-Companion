# PokeMMO Companion roadmap — accuracy now, integrated features next, Android/OCR after 1.0
**Date:** 2026-11-22 | **Status:** Prioritized planning, not commitments to exact release dates.

## Still v0.1.0 — next correction work, no version bump yet
Priority 0: Fix **Virizion and other raid/legendary availability**, stop unverified 644 default as claimed game roster, split Dex membership/Seen/Owned/OT/etc, source date/conflict queue. Fix any inaccurate labels / field semantics. Keep current user's local progress and raw dump private. Regression tests for changed 2026 raid releases.
Priority 1: Finish legibility/composition from 04:55 video; keep Home/Events/Changelog good content; polish popout backgrounds/contrast, remove A-/A+ buttons into unified text-size popover, improve selector and type chart zoom. Keep all popouts independent, resizable and saved.
Priority 2: Lay **shared entity model** groundwork (individual Pokémon Box, global Notes, Item Library) without implementing ten disconnected half-features. Validate import mapping and data migration. Prioritize one or two end-to-end tools in v0.1.0 if Claude can genuinely finish, but **don't hide unresolved Pokédex errors behind new shiny features**.
Priority 3: Verify native focus/opacity on KDE, test actual live Alpha payload and official-feed refresh; don't infer source connection = active spawn. Add source-reference/golden tests and release-note log.

## Before stable 1.0 (next minor iterations after user approves v0.1.0)
- **Integrated Item Library** with locally imported item icons/metadata, meaningful search and links to breeding/held items.
- **General Notes** CRUD + tagging, popouts, entity links and local backup.
- **My Pokémon (curated Box)** plus detailed Summary record and selective sync into Breeding/Team/Showcase.
- **Shiny Showcase** streaming popout with static or lawfully sourced animation; privacy defaults.
- **Custom Guide Builder** with uploaded personal pictures and text/docx/odt/pdf import; repeatable Gym Reruns.
- **Map Explorer** first data-linked location list then original/licensed clickable 5-region maps incl Sevii, and verified times/seasons/lure/hordes.
- **Toolbar languages** EN primary, ES and Chinese beta; expanded per-tool customization; improve desktop Windows testing and app packaging.
- Release readiness requires PokeMMO accuracy proof, no client asset redistribution issues, stable persistence/migrations, Windows+KDE QA and user visual sign-off. Avoid arbitrary target date or fictional completed states.

## Explicitly after stable 1.0 — feasibility + ToS approval gates
### Android Companion
Explore a real Android adaptation only after desktop 1.0 quality is demonstrated. Different window/overlay permissions and performance: cannot assume desktop Qt popout model ported unchanged. Preserve user data export/interchange and accessible touch UI. Do not promise a mobile build now.

### Optional optical Route/Battle/Storyline/Catch-rate tracking
Research **pure screenshot/optical recognition** (not memory hooks) as **opt-in, OFF by default**, local-only, frame capture scoped by user to game window; no uploads; explicit privacy/onboarding, source confidence and ability to pause/stop.
- Candidate scene recognition: route/location name, battle species/form/HP estimate and player selected tool input, dialogue text or manual story checklist prompt. Mark uncertainty and false-positive handling. Catch-rate estimates **must not claim exact odds without verified PokeMMO mechanics and captured status/ball/HP**.
- **Hard no-go:** no automated clicks/keypresses, macros, botting, background memory scanning, client injection, unsolicited account/data access. User must remain in control and can delete recognition history.
- PokeMMO official Code of Conduct prohibits reverse engineering client and automated control; Macro FAQ explicitly forbids automated inputs. Optical-only safety is **not blanket staff approval**: seek staff clarification before enabling unattended continuous capture/overlays and consider local privacy policies and anti-cheat risk.
- First future milestone could be **user-initiated screenshot import / offline OCR**, then after policy validation consider live observation. Record exact support limitations for Windows/KDE/Android.
- Helpful reference (not license/approval): https://mylis.github.io/pokemmo_ocr/ is an existing community screenshot/video-to-Pokémon data extraction workflow; that alone is not official permission.

## External references and ownership
- Interactive Maps inspiration: https://synergymmo.com/region-maps/
- Route/Hunting interface: https://synergymmo.com/route-finder/
- Optical examples: https://mylis.github.io/pokemmo_ocr/
- Official rules: https://pokemmo.com/en/code_of_conduct/ and https://support.pokemmo.com/knowledgebase/article/macroing-faq
- Asset redistribution constraint: https://pokemmo.com/en/video_policy/ states PokeMMO client assets may not be taken and distributed separately. Verify specific asset terms independently before shipping a public package.
- Theme Creator WIP screenshots are references for a **separate project**, not authorization to merge projects.

**No game assets or imported personal files are committed to this roadmap.**

# Translation review and friends-only alpha gates

Owner reconfirmed 25 November 2026. Current development baseline: 4884052ad935760da9c8fb25bc214b576dc37df6, version 0.1.0, develop. The actual friends-only alpha version target is 0.8.0. Translation-review builds and internal QA remain 0.1.0. This is a plan/checklist, not a completed test report.

## 1 — Localization completion before reviewer builds

- [ ] Audit every main destination, dialog, interaction, settings section, native shell, empty/error state, notification and popout in EN/ES/zh-Hans; target approximately 99% coverage of application-owned visible text. Record a defensible denominator (unique applicable messages or observed strings), unresolved list, intentional originals and limitations. Do not infer a percentage from the catalog count.
- [ ] Confirm terminology for species, forms, moves, items, abilities, nature, types, stats, locations, ribbons and PokeMMO-specific wording. Keep canonical IDs/values stable and preserve user content/provider prose.
- [x] Source coverage: 2,845/2,845 bundled walkthrough steps per language and 318/318 chapter headings per prior Build 29 record. Current source catalog has 2,900 supplemental keys (2,990 merged), with 71 native entries per prior checkpoint; native and rendered audit still pending.
- [ ] Review gameplay-sensitive walkthroughs identified in Build 28 (Bell Tower warp, Lake of Rage conditions, ribbon and Route 29 prerequisites, Shoal Cave tide clock and Sinnoh threshold). Translation coverage is not proof of correct instructions.
- [ ] Verify font coverage, wrapping, accessibility and compact/expanded readability.

## 2 — Engineering QA / reviewer packages

- [ ] Exact-SHA clean-profile full Python/Playwright regression; record passed/failed/skipped and reasons. Real-dump/ROM checks only using owner-local inputs.
- [ ] Three-language route and popout matrix with interaction coverage, screenshots and remaining fallback inventory. Check normal use, failures, resizing, text scaling, themes, saved language after restart, no network required for offline reference/tools.
- [ ] Verify Linux AppImage and Windows x64 ZIP with fresh profiles, package checksums and native smoke tests. Private-only hosted Windows build guard remains unchanged; use authorized local build if appropriate. Review-build sharing requires applicable rights.

## 3 — Language review

MaToRiuKo: Simplified Chinese. Spanish-speaking reviewer: name not specified. Review English alongside the selected language when wording is ambiguous. Review packages stay at 0.1.0. Report issues without translating personal notes or external report content.

| Review scope | What to inspect |
|---|---|
| Home, menus, quick access, settings | Natural wording, button labels, onboarding, theme and accessibility, language persistence |
| Pokédex, comparison, locations, Item Library | Local game terminology, form identity, species/move/item search, encounter and availability caveats |
| All tools, Box, Notes, Showcase, teams, breeding, timers | Calculations/limits unchanged, fields and action labels, plural/numeric formatting, errors and confirmations |
| Guides and custom routines | Chapter names, movement directions, quantities, puzzle sequences, storyline and popout actions, original custom content |
| Live and reference pages | Opt-in state, status, source caveats, notification text, preserved external content |
| Native shell and floating tools | Font/glyphs, narrow windows, Compact/Standard/Expanded, opacity, pinning, resizing and focus |

Issue template: build SHA/version; OS and display scaling; locale; page/tool and mode; current wording; suggested correction; issue category (untranslated, terminology, grammar, gameplay, wrapping/glyph, functional); reproduction steps; optional privacy-reviewed screenshot. Record review status and retest corrections.

## 4 — Owner functional testing and correction

- [ ] Walk through existing features using the owner's normal game/desktop workflow, including video-based review. Verify persistence, migrations, independent popouts, shortcuts, clean install, backups and restore, startup/quit, live opt-in, offline tools and data correctness. Test Windows as available and KDE Wayland/XWayland behavior. No new scope required.
- [ ] Fix reported issues and retest affected and adjacent workflows. Record evidence; do not label unexecuted tests as passed.

## 5 — Final alpha readiness

- [ ] Full regression on final candidate; native packages, inventory, checksums, installation/relaunch, recovery and tester instructions. Confirm applicable asset/reference/walkthrough derivative rights and distribution audience. Owner approves the actual alpha build and delivery method.
- [ ] Bump **0.1.0 → 0.8.0** only when ready for the actual friends-only alpha; rebuild and verify the versioned artifacts. No automatic main merge, tag, public release or Discord announcement. Public beta and stable 1.0 remain later milestones.

Excluded scope remains unchanged: no encounter counter, damage calculator, GTL scraping, PokeMMO Hub API, game automation, memory hooks, Android/OCR/sync during this phase.

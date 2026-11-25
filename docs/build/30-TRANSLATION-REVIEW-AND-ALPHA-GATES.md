# Fast path to friends-only closed alpha 0.8.0

Owner correction, 25 November 2026. Development remains 0.1.0 on develop until the actual alpha candidate is ready. Translation review by MaToRiuKo and a Spanish-speaking tester takes place during the 0.8.0 friends-only alpha, alongside the owner and invited friends. No separate pre-alpha reviewer build or exhaustive owner testing stage. This is a checklist, not a completed test report.

## 1 — Finish localization

- [ ] Complete application-owned visible text in EN/ES/zh-Hans across all pages, tools, popouts, dialogs, settings, notifications, accessibility and native UI. Target 100% coverage; intentional originals such as personal text, external reports, filenames and technical identifiers are excluded.
- [ ] Use existing audit and regression tooling to identify and close actual gaps. Check game terms, numeric placeholders, font rendering, and known gameplay-sensitive walkthrough issues; do not infer coverage from catalog counts.
- [x] Prior source checkpoint: 2,845/2,845 walkthrough steps per language, 318/318 chapter headings, 2,900 supplemental interface keys (2,990 merged), 71 native entries. Rendered coverage and full application checks remain pending.

## 2 — Verify the candidate

- [ ] Run existing full regression and localization checks on the exact candidate SHA; report actual passed/failed/skipped counts. Use existing route/popout matrices and focused interaction checks to identify remaining English, rendering, offline, persistence and functional blockers. Preserve personal data and use private dumps only locally.
- [ ] Basic native Linux/KDE and Windows launch, restart and package checks. Existing private-only hosted Windows workflow guard remains; use authorized local build if appropriate.

## 3 — Quick performance smoke

- [ ] Measure startup time, idle and active CPU/RAM including native child processes. Check normal navigation, a few floating tools, sprite animation, closing tools and quitting/relaunching. Record machine/OS and measurements; investigate sustained abnormal growth or major slowdown.
- [ ] Fix material performance issues only; no extensive profiling, speculative optimization or extra feature work.

## 4 — Stabilize and prepare the alpha

- [ ] Fix material bugs found by verification or quick performance checks. Retest affected paths and run final candidate checks. Keep scope limited to readiness.
- [ ] Confirm applicable asset/reference/walkthrough redistribution permissions, intended audience and delivery method. When ready, bump 0.1.0 to **0.8.0**, build and verify Linux AppImage and Windows x64 ZIP, record checksums and supply recovery/tester instructions. Owner approval before distribution; no automatic main merge, public release, tag or Discord announcement.

## 5 — Friends-only closed alpha testing

The owner and invited friends use the same 0.8.0 build. MaToRiuKo reviews Simplified Chinese; a Spanish-speaking reviewer reviews Spanish. Collect normal-use feedback on wording, game terminology, missing text, glyphs/wrapping, functionality, layout, performance and platform issues. Correct reported problems during the alpha phase.

Feedback: version/build SHA, OS, locale, page/tool and mode, steps to reproduce, current/expected wording or behavior, optional privacy-reviewed screenshot or video. Retest corrections before subsequent builds.

Public beta and 1.0 remain later milestones. Existing exclusions remain unchanged: no encounter counter, damage calculator, GTL scraping, PokeMMO Hub API, game automation, memory hooks, Android/OCR/sync during this phase.

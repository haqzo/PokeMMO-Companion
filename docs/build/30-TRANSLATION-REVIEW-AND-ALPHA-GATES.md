# Fast path to friends-only closed alpha 0.8.0

Owner correction, 25 November 2026. Development remains 0.1.0 on develop until the actual alpha candidate is ready. Translation review by MaToRiuKo and a Spanish-speaking tester takes place during the 0.8.0 friends-only alpha, alongside the owner and invited friends. No separate pre-alpha reviewer build or exhaustive owner testing stage. The latest completed checks and limitations are recorded in [Build 31](31-FINAL-OPTIMIZATION-AND-ALPHA-QA.md).

## 1 — Finish localization

- [ ] Complete application-owned visible text in EN/ES/zh-Hans across all pages, tools, popouts, dialogs, settings, notifications, accessibility and native UI. Target 100% coverage; intentional originals such as personal text, external reports, filenames and technical identifiers are excluded.
- [ ] Use existing audit and regression tooling to identify and close actual gaps. Check game terms, numeric placeholders, font rendering, and known gameplay-sensitive walkthrough issues; do not infer coverage from catalog counts.
- [x] Prior source checkpoint: 2,845/2,845 walkthrough steps per language, 318/318 chapter headings, 2,958 supplemental interface keys (3,048 merged), 79 native entries. Rendered coverage and full application checks remain pending.

## 2 — Verify the candidate

- [x] Run existing full regression and localization checks on the exact candidate SHA; report actual passed/failed/skipped counts. Use existing route/popout matrices and focused interaction checks to identify remaining English, rendering, offline, persistence and functional blockers. Preserve personal data and use private dumps only locally.
- [x] Native Linux/KDE launch, restart and package checks.
- [ ] Windows ZIP build and desktop verification using an authorized Windows host.

**Current verification:** 605 passed, 51 skipped, zero failures on the packaged source. Linux fresh-profile startup, restart, offline and package checks passed. Windows still needs a native build and desktop smoke test.

## 3 — Quick performance smoke

Use the optional developer-only `tools/performance_smoke.py` with psutil installed in the development environment. Start a fresh-profile native app, identify its main PID, then run `python tools/performance_smoke.py PID --output /tmp/companion-perf.json` (choose a writable Windows path on Windows). Four short samples: idle, navigation, popouts, recovery. Record startup/relaunch and process exit separately. No installed-app dependency or telemetry.

- [x] Measure startup time, idle and active CPU/RAM including native child processes. Check normal navigation, a few floating tools, sprite animation, closing tools and quitting/relaunching. Record machine/OS and measurements; investigate sustained abnormal growth or major slowdown.
- [x] Settled PSS and two close/reopen cycles on both source builds confirmed destruction of floating windows and renderer recovery. Process exit checks passed.
- [x] Close optimization after the matched native workloads and regression passed.

## 4 — Stabilize and prepare the alpha

- [x] Resolve the native diagnostic failure, remove the unused Linux TIFF loader and verify the internal package.
- [ ] After owner approval, change the version to **0.8.0**, build and verify the agreed packages, and record checksums. The owner handles permissions, audience and distribution. Use the [tester guide](../closed-alpha.md) for installation and recovery.

## 5 — Friends-only closed alpha testing

The owner and invited friends use the same 0.8.0 build. MaToRiuKo reviews Simplified Chinese; a Spanish-speaking reviewer reviews Spanish. Collect normal-use feedback on wording, game terminology, missing text, glyphs/wrapping, functionality, layout, performance and platform issues. Correct reported problems during the alpha phase.

Feedback: version/build SHA, OS, locale, page/tool and mode, steps to reproduce, current/expected wording or behavior, optional privacy-reviewed screenshot or video. Retest corrections before subsequent builds.

Public beta and 1.0 remain later milestones. Existing exclusions remain unchanged: no encounter counter, damage calculator, GTL scraping, PokeMMO Hub API, game automation, memory hooks, Android/OCR/sync during this phase.

## Owner-approved pre-0.8.0 performance requirement (25 November)

Full baseline at 3c8b634: 581 passed, 52 skipped, no failures. Before packaging, optimize Balanced/default itself (not merely a low-performance preset). Prioritize incremental item popouts, detached sprite/card observer cleanup, cache retention, selective rendering and hidden animation handling. Preserve every feature and preference; do not delay timers or live alerts. Measure against the recorded owner baseline. Add localized Performance settings only for implemented, verifiable controls, with Balanced default and meaningful Lightweight/Custom options after the default improves. Re-run affected browser regressions and native measurements before version bump; Windows and distribution gates remain. No new release or main merge.

## Final verification procedure (source candidate)

Use the same harness from the candidate checkout for both the pre-optimization baseline (3c8b634cc9afee24b82e53f5281736cce9a7611e) and the current candidate, in separate clean checkouts and fresh profiles. Install psutil in the existing QA environment only. Keep the desktop/session, monitor resolution, Qt/Python versions and workload constant; avoid playing PokeMMO or doing other heavy work during the comparison.

```sh
python tools/native_performance_check.py --repo /path/to/baseline --output baseline-native.json
python tools/native_performance_check.py --repo /path/to/candidate --output candidate-native.json
python -m pytest -q --tb=short
python tools/clean_install_check.py
```

The native tool requires PySide6 and a real desktop. Both native JSONs must say passed and confirm actual normal versus static GIF rendering. Compare like-for-like PSS and CPU, both recovery cycles, item tile counts and startup-to-render. Repeat anomalous results rather than setting arbitrary numerical guarantees. It does not prove packaged-app behavior or Windows compatibility. If measurements and regression are acceptable, close the optimization phase; do not require further speculative tuning. Build the internal packages at 0.1.0. Approve the version change and distribution before preparing the 0.8.0 packages.

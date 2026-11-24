# 21 — Native beta bug fixes & polish (`develop`, still v0.1.0, 2026-11-24)

Base `807597f`. main untouched at `6c90033`. No release, no version bump, no packages. Fixes only — no new tools
or features. Source: the owner's native CachyOS KDE test of build 20 on an existing and a clean profile.

## 1. Pokémon comparison crashed (critical)
**Cause.** One move in the bundled PokeMMO data, **Snowscape** (TM, added when PokeMMO split Hail and
Snowscape on 30 Oct 2026), has no type, category or power in the client data (`verified_meta: false`; the
summary's Moves tab already shows it as “details awaiting verification”). 164 species learn it — including
Mudkip and Treecko. `compare.js` looked its type up in the type chart: `T.indexOf(undefined)` = −1 →
`matrix[-1]` = undefined → `undefined[4]` (Treecko's Grass column) / `undefined[1]` (Fire). The error stopped
the panel from rendering. It was not a native-runtime difference: the same error happens in Chromium.

**Why the tests passed.** The build-20 tests compared Charizard, Geodude, Venusaur, Wash Rotom and Gengar —
none of them learns Snowscape — and no test swept a wider set of species. Fixed by testing the reported pair,
a sweep of 16 Pokémon (starters, forms, legendaries) with a page-error check, and tampered data (other casing,
an unknown type, a move with no fields). The new Mudkip/Treecko test fails on the old `compare.js`.

**Fix.** Every chart lookup goes through one guarded function: types are lower-cased, unknown or missing types
return *no value* (shown as “unknown” / “?”), never an invented multiplier and never an exception. A move
without confirmed details is listed as *awaiting verification* with no effectiveness, category or STAB. All
sorts cope with missing fields. Still only on the main Type Matchups page. Same result with bundled data and
with the owner's imported dumps.

## 2. Home — Alpha & Swarm
* **Clipped sprites.** Home builds each card before placing it; the report sprite measured its box while still
  detached (width 0 → fallback 72 px) and was then shown in a 56 px box with `overflow: hidden`. Sprites now
  fit when the box has its real size and refit whenever it changes (ResizeObserver); the animated image is
  kept, so animations never restart.
* **Bigger cards.** One report spans the panel (128 px sprite), two sit side by side, three or more use a
  two-column grid where an odd last card spans the row (104 px sprites, close to Roaming Legendaries' 116 px);
  80 px in narrow panels, one column below ~420 px. Transparency, animation, aspect ratio and the per-context
  sprite preferences are unchanged; the outer panels stay aligned.
* **Countdowns.** “≈ 0 min left” came from rounding the last seconds; the last minute now reads *Estimated
  window ends in under 1 min*. A card whose estimate has ended no longer says *Likely active* (the server's
  state can be up to a minute old; the badge now follows the actual end time, also while ticking).

## 3. News order on the rendered Home
The backend was fixed in build 20, but Home drew **two lists back to back**: posts the feed had discovered,
then the bundled articles. A feed-discovered Nov 1 Halloween changelog was therefore drawn above the bundled
Nov 13 / Nov 7 / Nov 5 posts. The backend now returns one merged list for Home (bundled + feed, deduplicated by
topic id, newest **publication** first) with honest flags: *New* only when published in the last 7 days,
*Edited* when an edit was seen, *found later* (with both dates in the tooltip) when the feed noticed an old post.
Tested with mixed bundled + cached-feed fixtures in the backend and on the rendered page.

## 4. BrokenPipeError
A client that disconnects mid-response (scrolled-away sprite, page change, closed popout) raised
`BrokenPipeError` in `_send`; for API calls the generic handler logged it as an *API error* and then tried to
send a 500 on the dead socket, which raised again and socketserver printed a traceback. Now only
`BrokenPipeError`, `ConnectionResetError` and `ConnectionAbortedError` are treated as “client gone” (debug log,
connection closed) in `_send`, in `handle()` (half-read requests) and in the server's `handle_error`. Every other
exception is still logged as before (tested). Regression test resets 45 connections mid-download (800 KB JSON,
the largest GIF, a script) plus a half-sent POST: no error log, no traceback, server keeps serving — and it
reproduces the original traceback on the old code.

## 5. Built-in assets and Settings wording
* Settings › Advanced › *Pokémon sprites*: the built-in set was shown as “Your files · Installed … from
  built-in” with “built-in” in the folder box. Now: **Built-in sprites — included with Companion, nothing to
  install** (counts), and the import is tucked into *Optional: use your own sprite collection instead*. A personal
  library shows as *Your own sprite library is in use* with *Remove and use the built-in sprites* (only the
  personal copy is deleted; the built-in files are never touched).
* Advanced starts with “Everything Companion needs is built in…”; technical `DUMP_ONLY` badges replaced by
  plain words.
* Storyline: removed the “Have your own walkthrough files? Import them privately” prompt; the bundled source is
  described as the complete walkthrough by its original author; the Storyline popout labels it the same way.
* **Bug found while reviewing:** with the bundled walkthrough the Storyline progress read **0/0 main-story
  milestones** (and Home's *Continue* card and the popout computed 0 %), because only `imported` sources counted
  every step. Full walkthroughs (built-in or your own) now count every step (0/454 for Kanto); the milestone
  outline keeps its milestone count. Checkmarks were never affected.

## 6. Regression review
* Changed UI code since build 19 scanned for APIs newer than QtWebEngine's Chromium: only container queries
  (Chromium 105+, already used before) — no new compatibility risk found.
* Animated Pokédex: animations now start only when scrolling pauses (~140 ms) and only for tiles still on
  screen; tiles that fly past keep their still image. Headless worst-case scroll (one new row per frame):
  animated median / p95 / max frame **73 / 266 / 922 ms → 18 / 35 / ≤ 94 ms**; static 24–26 / 48–62 ms. Indicative
  only — not measured in native Qt.
* Themes, scaling, popouts: covered by the existing suites (all passing); no further regressions found.
* Caught by the full suite during this pass: counting the bundled walkthrough as a full guide must not change its
  approved *All chapters* view — the view default is now tied to your own imported files only.

## Tests
* Backend: **323 passed + 31 skipped** (clean profile), **354 passed** with the owner's dumps and ROM folder.
  New: `test_server_disconnect.py` (2), Home news list (1).
* Browser (headless Chromium — not native Qt): **137 passed** with the owner's dumps; clean profile 116 passed +
  20 skipped (dumps-only tests) with one failure that was then fixed and re-run clean (29 passed in the affected
  files); `clean_install_check.py` PASS. New:
  `test_ui_native_fixes.py` (7: rendered news order, Alpha & Swarm cards with 1/2/3 reports — sprites inside
  their boxes, ≥ 100 px, equal panels —, countdowns, Advanced wording, walkthrough progress),
  `test_ui_compare_guides.py` +3 (Mudkip vs Treecko, 16-Pokémon sweep, tampered types).
* Not done here: native Qt, Wayland/X11, packaged builds, Windows.

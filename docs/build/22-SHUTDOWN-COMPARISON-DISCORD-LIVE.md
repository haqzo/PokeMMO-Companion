# 22 — Safe shutdown, comparison polish, community Discord, live-report checks (`develop`, still v0.1.0, 2026-11-24)

Base `9525054`. main untouched at `6c90033`. No release, no version bump. Scope: the owner's "final native repairs"
brief — no new tools, no gameplay tracking, no hosted relay.

## 1. Shutdown race (`sqlite3.ProgrammingError: Cannot operate on a closed database`)
**Cause.** On quit the shell ran `server.stop()` then `ctx.shutdown()`. `server.stop()` only stopped the accept
loop; the HTTP handler threads (daemon threads, never joined) kept serving **keep-alive connections** of windows
and popouts that were still loading or refreshing — every window fetches `/api/shortcuts` at load — and the
background workers were only *signalled*, never waited for. A request or a worker could therefore reach SQLite
after it was closed. Reproduced exactly on `9525054` (`/api/shortcuts` → 500 `ProgrammingError`).

**Fix (no blanket suppression).**
* `RequestGate` in `server.py`: `stop()` first marks the server closing — new requests (also on open keep-alive
  connections) get `503 Companion is closing` without touching the app — then stops accepting, then waits up to
  5 s for requests already running. The event stream notices closing within 1 s (was up to 15 s).
* `AppContext.shutdown()`: signals every worker, **joins** them with one shared deadline (4 s; includes the one-off
  start-up jobs), then closes the database. Idempotent.
* `Storage`: after `close()` every query raises a typed `StorageClosedError` instead of sqlite's generic error.
  The API maps only that error to 503 (logged at INFO); workers that are already stopping end quietly on it; in
  every other situation it is raised and logged like any error. Real database errors are untouched (tested).
* ntfy worker: if its connection fails *because* Companion is closing, it no longer writes its status.
* Rapid close → relaunch: a new launch that cannot reach a still-closing instance now waits up to 20 s for the
  lock and starts normally (before: “already running” and nothing opened).
* Tests (`tests/test_shutdown.py`, 7): request mid-flight at shutdown completes (200) before the database
  closes; keep-alive request after stop → 503, no database access; typed error + 503; real errors not hidden;
  ntfy worker blocked “connecting” past the deadline, then failing — no error logs; four close/relaunch cycles on
  one profile; relaunch waits for a lock held by another process.

## 2. Pokémon comparison polish
* Sprites 56 → **96 px** (still follows Settings › Pokémon & sprites › comparison size).
* The two move tables moved out of the narrow side panel into a **full-width row under the chart and panel**
  (side by side when wide, stacked when narrow): no sideways scrolling at 1600 or 1000 px; panel keeps picks,
  types, both-direction effectiveness, weaknesses and ability notes.
* **Header bug fixed:** a global `.th-sort { all: unset }` rule (meant for buttons) was applied to the header
  cells themselves, so the header row collapsed and did not line up with the columns. Now fixed column widths,
  right-aligned tabular numbers, sticky header, zebra rows, full category names.
* Data conventions shown honestly (also in the summary's Moves tab for power): accuracy > 100 = *never misses*
  (“—”), power 1 = *variable power* (“var.”). Unverified moves (Snowscape) stay “awaiting verification”.
* Still only on the main Type Matchups page (tested). Tests: +2 (sprite size, no table scroll, header cells
  aligned with columns at 1600/1000 px, data conventions).

## 3. Community Discord
* One central, validated setting: `COMMUNITY_DISCORD_INVITE` in `companion/config.py` =
  `https://discord.gg/5Wbh28M3gu` (owner-supplied). Anything that is not `https://discord.gg/<code>` turns every
  link off. Exposed as `bootstrap.community.discord`.
* Home: small *Community Discord* link in the header (opens the system browser); Settings › Home can hide it.
  About & credits: Community section + a Credits list. README: Community section. Discord is optional everywhere.
* `.github/workflows/discord-release.yml` + `.github/scripts/discord_release.py` (standard library only): on
  `release: published`, posts title, version, changelog and link; beta/pre-release vs stable clearly marked
  (colour, title, field, footer); `allowed_mentions.parse = []` and @everyone/@here/user/role syntax neutralised;
  embed limits (title 256, description 4096, fields 1024, footer 2048, total 6000, content 2000); drafts ignored;
  `workflow_dispatch` with *test* (posts a connection test) or *dry-run* (prints the payload, no secret). Only
  `actions/checkout@v4`, `permissions: contents: read`, `persist-credentials: false`; the secret is only an env
  variable and is never printed (error messages never include it). GitHub runs release/dispatch workflows from
  the default branch, so it works once the owner merges to main. Not run against Discord in this session.
* Tests: `tests/test_discord_release.py` (8: stable/beta, mentions, limits, empty changelog, sending with a fake
  opener, CLI dry-run/draft/missing secret, workflow triggers/permissions/secret handling, no webhook committed)
  and UI tests for the link and the missing-invite case.

## 4. Provider research (Alphapedia)
| Question | Finding | Evidence |
|---|---|---|
| Documented feeds | ntfy `alphapings` (Alphas) and `swarmpings` (Swarms) on `ntfy.pokemmotools.org` | Alphapedia help page, 2026-11-17 (recorded in project notes); not re-fetched today |
| Phenomena | Discord bot and personal webhooks (Discord/Telegram/Slack/custom) only — **no ntfy topic** | same; owner's Discord confirms the bot posts Phenomenon calls |
| Payloads | Alpha: `title` = species, `message` = "Region, Location"; Swarm: `title` = species, `message` = "Region\nLocation"; actions "Open in Alphapedia" (alpha.pokemmotools.org) and "Call made by <player>" | real messages observed 2026-11-17 |
| Identifiers | ntfy message `id` (stable per message); no event id across separate calls | ntfy API + observation |
| Corrections / cancellations | **Not documented**; no delete/edit semantics verified → a re-sent call arrives as a new message | — |
| Expiry | ntfy `expires` = cache retention (time + 1 h), **not** despawn. Game durations: Alpha 75 min (official changelog), Swarm ~20 min (community estimate) | ntfy docs; changelog; community wiki |
| HM / ability / moveset / encounter list | Not present in the ntfy payloads observed | observation |
| Replay | `since=<last id>` on reconnect returns cached messages; Companion marks them *replayed* and never notifies them | ntfy API, implementation |
| Permission / attribution / rate limits | Not documented for third-party apps; Companion uses the public topics read-only, opt-in, one connection, attribution “Alphapedia” in Live and credits | — |

**Network in this session:** fetching alpha.pokemmotools.org/help and the ntfy topic needed the owner's approval,
which was not answered, so nothing was re-fetched and **no new live sample was recorded**. A web search found no
other documentation of feeds or Phenomena.

**Decision:** Phenomenon live integration stays **disabled**. Live shows a short note and links the optional
community Discord, where the Alphapedia bot posts them. No Discord scraping, user tokens, bot credentials or
hosted relay.

## 5. Live-report improvements (verified scope only)
* **One notification per event:** another call of the same Alpha/Swarm (same Pokémon, region and place within its
  window — another player, or a re-sent call under a new message id) is saved to history and grouped but **not
  notified again**; the event's timer stays on the earliest report. Same message id twice → stored once.
  Replays never notify. A different place, or the same Pokémon after its window, is a new event.
* Live › Report history: **region filter** (alongside the existing category filter and search).
* Unknown fields stay unknown; unknown topics are “other”, never shown as current Alpha/Swarm.
* Not done (no verified source): Phenomenon category, HM/ability/moveset/encounter fields, corrections and
  cancellations — the normalized fields can only be filled once a provider documents them.
* Tests `tests/test_live_provider.py` (15): reconstructed Alpha/Swarm shapes, `expires` not used as despawn, same
  id/replay, repeat calls (saved, not re-notified, timer kept), new event after the window, expired/uncertain
  never active, malformed/oversized messages, unknown topic, test isolation, source outage, per-kind preferences.
  Data labels: *reconstructed* (shapes from the 2026-11-17 observation, synthetic ids/times) and *synthetic*.

## Test results (this session)
* Backend: **353 passed + 31 skipped** (clean profile), **384 passed** with the owner's dumps and ROM folder.
* Browser (headless Chromium — not native Qt): **142 passed** with dumps; **122 passed + 20 skipped** (dumps-only)
  on a clean profile. `tools/clean_install_check.py` PASS.
* The original shutdown race was reproduced on `9525054` with a standalone script (500 `ProgrammingError` on
  `/api/shortcuts`) and passes with this build.

## Not verified
Native Qt (shutdown with popouts open, relaunch timing), Wayland/X11, packaged builds, Windows, the Discord
workflow against GitHub/Discord, any live Alphapedia message from today.

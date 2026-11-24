# 13 — Live data providers, normalization, test fixture backlog
**Date:** 2026-11-22 · **Status:** Research/implementation gate. Not a public live service or confirmed feed.

## Provider register
| Provider | Proposed usage | Last verified this planning round | Blocking unknown |
| --- | --- | --- | --- |
| Alphapedia published ntfy topic | Read-only Alpha/Swarm reports | Public topic documented, ntfy API spec reviewed on 2026-11-22 | Actual current message payload, edits, uptime, permission, retention |
| Alphapedia Phenomena | — (not integrated) | 2026-11-17: Alphapedia help documents Phenomena via its Discord bot and personal webhooks only; no ntfy topic. 2026-11-24: owner confirms the bot posts Alpha, Swarm and Phenomenon calls in the community Discord | No supported feed a desktop app may read; scraping Discord, user tokens or a hosted relay are excluded without owner approval |
| Official PokeMMO update forum | Stable game mechanics affecting Live | Official/community indexed summaries reviewed Nov 2026 | Source rate limits/allowed feed, post edits and reliable structured retrieval |
| Roaming Legendaries FAQ | Monthly cycle and regional requirements | Forum FAQ indexed results rechecked 2026-11-22 | Current month rollover time/patch changes and exact method/odds |
| Community Altering Cave tracker | Candidate current rotation observations | Community tracker referenced in recent forum posts | Official integration permission, real feed and freshness/accuracy |
| PokeMMO dump snapshot | Species names, forms, general Pokédex connections | Earlier Phase 3 dump audit | Not a live rotation feed; stale special encounter tables |

**Priority:** official live-game patch notes for mechanics, most recent time-stamped actual observations for transient data, clearly labelled community guide for recurring calendar. No assumption a site updated recently means every field is updated.

## Source-side schema boundary
Separate provider-specific parsed payload from stable Companion entities. All tool pages read normalized records with provenance; none use provider HTML text directly as authoritative mechanics.
Suggested normalized structures (subject to actual samples):
- `LiveReport`: provider, topic, message_id, optional sequence_id, kind, species, form, region, location, title, body, source_time, received_time, last_corrected_time, status, raw_hash, confidence, source_uri.
- `LegendaryCalendarRule`: region, species_id, applicable_months, source_kind, source_date, patch_window, unlock_prereqs, observed_current_month?, manual_player_state.
- `CaveObservation`: observation_id, observed_at, reported_at, cave_cycle_id **only if known**, crystal, species, encounter_kind, horde_size, pickup_item, source_uri, source_type, confidence, patch_window, revoked_at?.
- `SourceHealth`: endpoint, last_attempt_at, last_success_at, fetch_failure, reliability, parse_version, connectivity_status.
- `NotificationPreference`: alpha_channels, swarm_channels, sound, quiet_hours, monitor, corner, toast_duration, opacity, favourite_filter, region_filter, retention_policy.

## Displayed status vocabulary
- **Verified current:** only when a real, recent and sufficiently authoritative source supports this, including source date and expiry/clock synchronization as needed.
- **Reported:** provider announcement/observation not independently guaranteed to be currently active.
- **Historic:** past time window, event/rotation ended or cached record.
- **Unknown:** insufficient current evidence.
- **Offline:** source cannot currently be contacted; always include last successful observation time.
- **Corrected/cancelled:** only if source correction is tied to prior report by real stable mapping.

For ntfy, `expires` refers to **message cache retention**, not game event expiry. Never display the raw cache timestamp as 'despawn at'.

## Incremental validation tasks
1. Check provider's public usage rules and get permission if needed for polling/subscription or reuse.
2. Capture 5–10 **real** Alpha and Swarm messages during an agreed limited test, then validate field mapping and correction semantics. Use redacted fixtures if user data appears; no source fabrication.
3. Implement proposed parser as a standalone offline validation harness (once user approves a technical spike), no toasts yet.
4. Test reconnect and replay ordering, duplicate IDs, malformed or missing fields, corrupted/invalid JSON, network failure and rate limits.
5. Test native notifications and custom toasts on Windows and KDE Wayland/X11, including PokeMMO windowed/borderless/fullscreen game and multi-monitor DPI.
6. Independently confirm monthly legendary rotation and exact boundary; document acquisition exceptions.
7. For Altering Cave, obtain approved timestamped source or explicitly ship a **history and manual report reference** without claiming live monitoring.
8. Have user review main-page + popout densities before full-feature build.

## Source URLs / provenance notes
- https://forums.pokemmo.com/index.php?/topic/197731-alphapedia-real-time-alphaswarm-pok%C3%A9mon-notifications-and-history-for-pc-mobile/
- https://ntfy.pokemmotools.org/alphapings
- https://docs.ntfy.sh/subscribe/api/
- https://forums.pokemmo.com/index.php?/topic/160729-roaming-legendaries-faq/
- https://forums.pokemmo.com/index.php?/topic/199670-altering-cave-data/
- https://alpha.pokemmotools.org/altering-cave
- https://forums.pokemmo.com/index.php?/topic/201356-changelog-30102026/

## Update 2026-11-24 (build 22)
See `docs/build/22-SHUTDOWN-COMPARISON-DISCORD-LIVE.md` § Provider research. Summary: ntfy `alphapings` and
`swarmpings` remain the only documented feeds; Phenomena stay disabled (link to the optional community Discord
instead). This session could not fetch alpha.pokemmotools.org or the ntfy topic (network approval unavailable), so
no new live sample was recorded; tests use field shapes reconstructed from the 2026-11-17 observations plus
synthetic messages, labelled as such.

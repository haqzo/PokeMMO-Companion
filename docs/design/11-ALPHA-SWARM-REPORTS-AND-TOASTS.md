# 11 — Alpha/Swarm Reports, toasts, history and delivery settings
**Date:** 2026-11-22 · **Status:** Detailed UX specification, no live integration tested.
**Related:** 01-LIVE-ALERTS-AND-NOTIFICATIONS.md; 10-LIVE-WORKSPACE-SPEC.md

## Report interaction model
A report is a **community observation**, not a verified game object tracked by the Companion. The UI never invents spawn count, despawn countdown, channel, map coordinates or duration. All report data has source, publication timestamp, arrival timestamp, normalized optional fields and freshness.

### Report row (full-page Reports)
1. Type icon and label: Alpha / Swarm; distinct subdued treatments, not many neon panels.
2. Pokémon name + small locally imported/licensed sprite if available; otherwise neutral placeholder.
3. Optional region and sub-location; omit missing data or show 'Location not confirmed'.
4. Source-relative report time and absolute date on hover/detail; current / historical **report age**, never guaranteed live time.
5. Status: reported, corrected, cancelled/withdrawn, stale, source unavailable. Only use statuses that provider payload truly supports.
6. Inline open/details and quiet 'Pokédex' action.
Detailed selected-report panel includes raw verified metadata (source ID, edits, type, timestamp, report body or permitted summary) and one secondary link to provider page.

### Home
At most one or two latest relevant report summaries; small timestamp + 'Open Live'. No page-long feed or auto-expanding alerts.

## User delivery settings (one logical routing engine)
Separate routing choices for Alphas and Swarms:
- Disabled
- Custom Companion toast only
- Native operating-system notification only
- Both

Also allow source enabled/disabled, region/type filters, favourites/whitelist, per-type sound and volume where supported, silence/quiet-hours, optional toast stacking, opacity, monitor and corner, duration and reduced motion. Quiet-hours schedules use user local time and survive DST; suppress sound/toast but preserve reports in history.

### Custom toast
- Short Better Default-like panel with icon, label, Pokémon, region/location when known, **Reported X ago** text and open/dismiss controls.
- User decides monitor+corner. Never cover the center of the game or intercept pointer outside the toast itself. Avoid PokeMMO battle controls if possible by explicit position preference (not impossible dynamic client tracking).
- Never claim it will always appear over exclusive fullscreen or KDE Wayland unless proven in a test. If unsupported, offer native OS notifications and history.
- Does **not** steal keyboard focus from PokeMMO on arrival.
- Several reports: quiet stack with limit and a '+N more reports' summary. No endless tower of boxes.

### Native OS notification
- Use supported Windows notification facility or Linux desktop notification portal/system-tray integration (toolkit to be selected after feasibility spike).
- Its appearance, delivery and whether it interrupts fullscreen are controlled partly by the OS. Explain users may need to enable notifications/disable DND; do not promise identical UI to custom toasts.
- Actions where supported: Open in Companion, dismiss. Native notification does not mark the report permanently active.
- Closing main window must be unambiguous: app may run in tray for alerts only when user opts in. Explicit Quit stops notifications.

### History
- Stored in a local database with reasonable retention and clear/delete controls. Distinguish unread/seen from active/stale/cancelled.
- Filters: type, Pokémon, region, source, date, favourites.
- Corrections update visible item while keeping prior versions/event history when supported; no cloned duplicate alerts.
- On reconnect, consume a bounded cache replay using source timestamps/IDs; **do not** replay all old messages as new toasts.
- No upstream write capability to ntfy or publishing; only subscription/read.
- On unsupported/malformed messages, store a safe diagnostic reason without showing raw untrusted markup/scripts as rich text.

## ntfy adapter research notes — documented vs NOT confirmed
- Upstream documentation: https://docs.ntfy.sh/subscribe/api/ .
- Topic advertised by Alphapedia: https://ntfy.pokemmotools.org/alphapings .
- ntfy supports `/json`, SSE or WebSocket streaming, `since`, `poll`, message ID, `time`, optional `sequence_id`, `message_clear` / `message_delete` events.
- Crucial: `expires` in ntfy's JSON means **server cached-message expiry**, not PokeMMO despawn time.
- Normalized report schema is a **proposal**, not an assertion of the real Alphapedia payload:
  `{provider,provider_message_id,provider_sequence_id?,report_type?,species_id?,form_id?,location?,region?,provider_time_utc,received_at_utc,source_url?,summary,correction_status?,raw_payload_hash,parser_version,confidence,checked_at_utc}`.
- No verified live payload captured in this research round. Do NOT write a brittle parser that assumes a Pokémon name or location is encoded in a particular JSON key.
- No proof that Alphapedia corrections specifically use ntfy `sequence_id`; compare real samples before linking revisions. Provider may publish updated reports differently.

## Critical event replay tests for Claude
1. An actual valid Alpha report: appears once in Reports, optional toast and OS notification as configured.
2. An actual valid Swarm report with unknown Pokémon/region: informative placeholder, no forged values.
3. A corrected/withdrawn report from provider: update previous item **only if stable association verified**.
4. Network outage > reconnect: replay cached reports to history, don't produce a new toast for old records.
5. Duplicate same message: de-dupe by topic/source/ID; avoid duplicate popouts.
6. Multiple reports at once: toast queue/stack limits, no focus theft or blocking game input.
7. OS DND or native notification disabled: Companion history remains correct; clear indicator of disabled channel.
8. Main app minimized with tray opted in, Windows 10/11 and KDE X11/Wayland.
9. Fullscreen PokeMMO borderless and exclusive modes; custom toast may fail to show, never falsely mark it delivered.
10. Disconnected source: no "All quiet" or "No active Alphas" just because fetch failed.

## Privacy/security
Only opt-in read-only external notifications. No player location/account login, client memory reads, automated gameplay, mod injection, or in-game chat bot. Sanitize message bodies and never blindly trust external links/actions.

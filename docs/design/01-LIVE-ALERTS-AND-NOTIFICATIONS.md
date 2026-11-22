# Live Alpha/Swarm notifications — UX and reliability contract
**Date:** 2026-11-22 · **Status:** User-approved feature direction; payload and OS prototype pending

## Three destinations from one verified report
- **Custom in-game-style toast:** Small, native-Companion-styled temporary popout near a configurable corner/monitor with optional opacity/sound. Must not intercept clicks outside its bounds or steal game keyboard focus. Avoid battle HUD by placement preference; adapt to fullscreen/windowing/Wayland restrictions. Cannot claim guaranteed display above exclusive fullscreen or all Wayland compositors.
- **Native OS notification:** Notification-center toast via OS integration; supported in principle by Qt system-tray messaging, but must be tested on Windows 10/11 and KDE Plasma (Wayland/X11) and subject to OS focus-assist/Do-Not-Disturb settings.
- **Persistent internal history:** Live -> Notifications keeps received reports, timestamps, source labels, type, region, location, edits/corrections and cleared/stale flags. Works if toast or system popups are turned off.

**User choice:** None / in-app toast / OS notification / both, independently for Alpha and Swarm. Avoid double notifications for the same item unless both deliberately enabled. Separate controls for sound, duration, opacity, corner and screen, silent mode/quiet hours, preferred regions and favourites.

## Notification content
Required for a report: type (Alpha or Swarm), source display name, source message ID, received time and source time when present, and a validated non-empty informative title. Optional: Pokémon name/form, location, region, channel, image (only licensed or locally imported), source URL.

Show placeholders such as **Location not confirmed** rather than fabricate. Show **Reported [timestamp]**, not **Active now** when duration/expiry is not authoritatively supplied. Clicking alert opens the report in Live; closing it does not erase history.

## Live source integration — important blockers
- Published Alphapedia topic: https://forums.pokemmo.com/index.php?/topic/197731-alphapedia-real-time-alphaswarm-pok%C3%A9mon-notifications-and-history-for-pc-mobile/
- Published ntfy topic: https://ntfy.pokemmotools.org/alphapings
- Upstream ntfy JSON/WebSocket contract: https://docs.ntfy.sh/subscribe/api/
- ntfy messages include IDs/timestamps and support history replay (e.g., `since=`), but **exact Alphapedia live message payload, all Swarm types, correction semantics, maintenance policy and uptime are not yet empirically validated**.
- Before implementation capture genuine consent-compliant samples (not fabricated) for new Alpha, Swarm, corrected report, duplicate/reconnect and malformed payload. Check provider rules and reliability.
- Keep an adapter boundary: source event -> validated normalized report -> state/history -> user-configured delivery channels.

## Correctness rules
1. Deduplicate by source plus message ID / known revision. Update/correct an existing report when provider semantics prove an update; do not invent correction relationships.
2. Reconnect without re-toasting old reports: replay to history, distinguish newly received vs historical, respect source timestamps.
3. If disconnected, show feed offline and last successful fetch. Do not advertise stale reports as ongoing.
4. Prioritize current legitimate reports; no invented despawn times or current channels.
5. User can mute by type and location, open history, and disable all alerts without losing saved settings.
6. App minimized: preserve notifications only while explicitly running in tray/background; closing/exiting must be clearly understood.
7. No game injection, input automation or memory access.

## Cross-platform acceptance matrix (must be observed)
Windows 10/11 and KDE Plasma X11/Wayland:
- App on second monitor; game on primary, both windowed/borderless; test exclusive fullscreen where possible.
- App minimized with tray mode explicitly enabled; custom toast vs native OS notification behavior.
- Toast never silently steals keyboard focus, covers large regions of the game, or leaves invisible click blockers.
- Per-monitor DPI and rotated displays; different toast corners and monitor selection.
- Sound/DND, simultaneous reports, duplicate events, correction, expiry/unknown status, disconnect/reconnect, offline.
- Pin and opacity of persistent popout do not alter ephemeral toast settings.

## References
- https://doc.qt.io/qt-6/qsystemtrayicon.html (Windows/KDE desktop notification interfaces)
- https://doc.qt.io/qt-6/qml-qt-labs-platform-systemtrayicon.html
- https://docs.ntfy.sh/subscribe/api/
- https://wayland.app/protocols/kde-plasma-shell (compositor-specific surface limitations)

All technical feasibility statements here are planning assumptions until tested on the actual user devices.

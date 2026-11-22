# 15 — Transparent Storyline popout: gameplay-first design
**Date:** 2026-11-22 | **Status:** Detailed proposed UX based on the user's uploaded PokeMMO quest-tracker example.
**Important distinction:** the example was a forum video/screenshots; its behavior has NOT been independently tested on Windows/KDE.

## Overall goal
A **lightweight, semi-transparent current-objective window** that comfortably overlays the user's PokeMMO game or sits beside it. Use the same Guides data, run selection, and checkbox state as the main Companion — no duplicate tracker database. It should feel like a small part of PokeMMO's UI, not a web browser or an intrusive gaming HUD.

## Layout and visual hierarchy
- A small header: **Character/run name** + **region / current location** and minimal titlebar actions. Typed names only; no cartoon avatars.
- Beneath header: one compact region progress indicator (done/mandatory total); optionally 'overall progress' in expanded mode where a valid denominator exists.
- Checklist: current active objective plus 1–3 immediately nearby steps, checked/unchecked with slim readable rows. Allow scroll in Standard/Expanded, but do not fill the game view by default.
- One unobtrusive navigation strip: previous/next area or step, Switch run, font -/+, collapsed display button. Keep optional options in overflow menu.
- Use **Better Default's real theme-derived semantic colours** when extracted; neutral translucent window surface, readable text layer, restrained accents, consistent thin border/pin/close controls. Do not reproduce original app's distinct UI imagery.
- Right amount of text: action-oriented task first, longer context expandable or opened in main Guides. Inline map/screenshot only if specifically requested/available; no giant pictures in the overlay.

## Three purposely different density modes
### Compact: Current objective
A small unobtrusive header and the next unfinished step with a checkbox; optionally step X/Y and single line context. Designed to be pinned near an edge during play.
No giant window title, no portrait, no progress-card stack.

### Standard: Current area checklist
Header with name, region/location; a slim progress bar; up to ~5–8 task rows depending on user-selected height; minimal next/previous, Switch and text size. This is the **default** if user says "like the video".
Rows scroll inside the panel rather than stretching to cover the game.

### Expanded: Area / chapter guide
Visible area grouping, full checklist and selected objective's compact details; optionally important item reminders. Suitable pinned on side screen, not forced to overlay entire game.

Popout resize may adapt density if text would clip; user can override to a preferred density. Keep separate saved layout modes per tool, not three copies.

## Transparency: background opacity vs text clarity
- Per-popout **panel background opacity**, not just whole-window opacity by default. Important: translucent surface while text, checkboxes, focus ring and progress remain readable.
- User controls background transparency with an appropriately tested slider and remembers it per tool/character preference; no fixed 30% or 80% forced value before contrast QA.
- Optional darker backdrop behind text or a 'High readability' setting.
- If desktop compositor cannot support per-pixel translucency, provide a stable more-opaque fallback with an explanation.
- Avoid busy blur/backdrop-filter effects by default; performance and Wayland compatibility first.

## Pinning, moving, focus and mouse behavior
- **Pin** means always-on-top *where the OS/window manager allows it*. Pin is independent from **Lock position**, which prevents accidental dragging/resizing.
- A *view-only click-through mode* can be proposed separately: when enabled, checkboxes are intentionally not clickable; user must toggle interactivity through a visible or configurable safe mechanism. Do NOT claim simultaneously full mouse click-through and interactive checkboxes in the same area.
- No invisible fullscreen surface intercepts the game. Clicking outside panel should go directly to PokeMMO.
- Manual checkboxes work with direct mouse/keyboard. No automatic quest detection, game client injection, or memory reads.
- When popout is dismissed/hidden or app's main window minimized, user progress is saved; pinned popout may stay alive while app is running. Full Exit stops it.
- Focus: passive visual changes shouldn't steal keyboard focus from game. User-initiated edit can take focus; return to game naturally when user clicks back.
- Pin, opacity and restore positions are **conditional capabilities** until tested on Windows, Plasma X11 and Plasma Wayland, game windowed/borderless and fullscreen.
- Optional keyboard/controller navigation is a future/secondary enhancement: customizable and OFF by default, conflict warnings with PokeMMO controls. Video mentions controller controls, but user has only prioritized mouse/simple UI.

## User actions
- Click checkbox -> changes the current run's current region/step and autosaves locally.
- Switch -> opens a *small native text-name list* for character runs; chooses and instantly changes displayed checklist.
- Region picker -> Kanto/Johto/Hoenn/Sinnoh/Unova; the same character can have progress in all regions.
- Go back/forward -> changes visible area/step. Does not auto-complete tasks unless user explicitly ticks them.
- Return to Main Guide -> focuses full-page Guide at same run/region/step; popout remains open unless user closes it.
- Open from Home "Continue guide" -> last active run/region/step; no extra welcome dialog once configured.
- Resizing, adjusting transparency/font, changing density -> never loses checkboxes or moves the current objective unexpectedly.

## Minimum acceptance scenarios
1. Launch PokeMMO on primary monitor, Companion on second, Standard Guide popout pinned over game corner. Can read steps and play normally without click-blocking away from actual popout.
2. At 60% *background* opacity (example test value, not default), objective text remains readable. Try a bright battle area and dark night map; use accessibility contrast checks.
3. Test small font and 200% scaling, tall/short popout, portrait and landscape monitors.
4. Check a task, minimize main app, re-open main, find task checked. Switch character: different task state; switch back: original preserved.
5. Lock position, attempt drag -> no movement. Unpin, verify window stacking. On Wayland unsupported behavior is acknowledged/fallback, not silently broken.
6. View-only click-through mode: user can click game beneath; task tick controls are disabled until mode exit.
7. Exit app fully and restart -> selected run, region, active step, popout display settings restored when platform permits; no auto-open without user preference.
8. Offline guide remains available, unknown changed step facts display source date and check status.

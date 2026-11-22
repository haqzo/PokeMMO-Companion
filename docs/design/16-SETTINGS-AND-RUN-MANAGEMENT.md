# 16 — Settings, run management and window preferences
**Date:** 2026-11-22 | **Status:** Proposed whole-application settings structure.
**Intent:** Powerful but NOT an overwhelming wall of dozens of controls.

## Where Settings lives
Single gear icon in the main Companion chrome. In popouts, a tiny contextual settings/menu for relevant controls; global Settings opens the full main app. Do not add Settings as a sixth permanent primary navigation category.

## Suggested groups (compact category list)
### Appearance
- Actual **Better Default v1.8.0 baseline palette** and neutral theme; never make purple default. Exact semantic tokens pending extraction from readable theme archive.
- Optional imported preset colours (user explicitly provides local source; no game memory reading), high-contrast mode, text scale (aim for practical 60%–200% if tested), reduced motion, font and density settings.
- Navigation: Vertical / Horizontal; matching five destinations, retained active page. Main application size/position and last page restoration controls.

### Windows & Popouts
- Per-tool preferred mode (Compact/Standard/Expanded), pin default, restore last size/location where OS permits, position lock, monitor preference, saved opacity, optional current popout stacking order.
- Storyline popout gets independent **background transparency** control, font scaling and compact objective-view preference; choose sensible legibility bounds after testing.
- Explicit close behaviour: Close main window = quit / minimize to tray (opt-in), Quit all windows ends live alerts. Avoid surprising background operation.
- Custom toast monitor/corner and native OS notifications are separately configured. Unsupported KDE Wayland behaviors get clear fallback UI.

### Notifications
- Alpha and Swarm independently choose Custom / OS / Both / None; sounds, queue, retention, quiet hours, favourites, source last checked.
- Global 'Do not disturb while playing' manual toggle (without detecting game via memory). Native OS DND separately described.
- Reports saved as history despite disabled toasts when source subscription/history is enabled and app running.

### Guides & Characters
- Manage **named runs**, run labels, rename, duplicate independent copy, delete with confirm, choose default run.
- Five regions per run, remember current location/task and show whether optional tasks are included in progress counts.
- Autosave enabled; export/import backups; direct 'Review changed guide steps' after official game patch updates.
- Never force visual avatars, trainer sprite pickers or external account login.

### Language & Accessibility
- English primary, initial Spanish/Chinese translation only if tested and clearly beta; show original localized Pokémon/PokeMMO names correctly and fall back to English. Language selection must not alter run IDs or checkboxes.
- Clear keyboard focus, text size, contrast, reduced motion, large controls and optional screen-reader labels.
- Hotkeys for tool window toggling, pin/show-hide, Storyline next/previous and checkbox action only when explicitly enabled; detect known conflicts and never intercept game controls globally by default.
- Optional voice narration is **not in initial scope** despite reference video; user would have to opt in later.

### Data, Updates & Privacy
- Official news/changelog sources and event last-verified timestamps, refresh settings subject to provider policies, offline cache and error details.
- Local guide database revision and source; changing game facts must not silently overwrite checklist state.
- Export/import user run progress and saved calculator/team plans; private backup default.
- Live feeds read-only; exact provider permissions/contract and optional telemetry policy must be reviewed before public release. No account passwords, injected client hooks, game memory access or automated gameplay.
- Clear cached news/alerts and reset tool windows separately; resetting appearance does not delete character runs by surprise.

## Settings ergonomics
- Five to six clearly labelled groups, with quick search inside Settings if necessary. Keep advanced controls collapsed by default, show the most common controls first.
- Each slider/option previews actual effect when possible (e.g. Storyline transparency) without affecting all other tools.
- Global Defaults with per-tool overrides; indicate which level a setting is applying to.
- Reset action warns specifically what resets. Irreversible run deletion requires confirmation.
- Accessible keyboard navigation at 125/150/200% scale.

## Acceptance gate
- Changing Vertical -> Horizontal navigation preserves active page and no popouts close.
- Main window minimized/closed follows selected explicit tray/quit policy; passive Alpha notifications require enabled background mode.
- A specific Storyline popout opacity adjustment does not fade the main app or other pinned popouts.
- Three separate named runs maintain distinct region progress through app restart and export/import.
- Changing language, font scale, or display/monitor does not lose run data or leave a window irretrievably off-screen.
- No feature claims universal pinning atop fullscreen game until actually tested on platform.

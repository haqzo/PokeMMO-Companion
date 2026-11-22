# Floating-tool platform research and test matrix

## Intended interaction
- A tiny always-accessible launcher which can collapse to a single icon. Clicking a tool launches an **independent** movable/resizable surface; launcher is not a bloated full dashboard.
- Each tool has minimize/collapse/close, own geometry, optional opacity, text size, pin/always-on-top, window-level privacy (no memory reads). Restore state when OS permits.
- Overlay never traps PokeMMO input while unfocused; clicks outside a panel return to game. A master hide/show shortcut should be user-configured/off by default.
- No encounter counter. Alerts appear only on user-approved triggers and don't obscure battle controls by default.
- Content-first minimum size responsive; allow 60–200% text scaling if feasible, or explicitly constrain to usable tested range, no clipping.

## Framework decision is intentionally OPEN
- Qt 6/QML is a promising desktop UI candidate, but it must pass tests before selection. Qt docs: https://doc.qt.io/qt-6/application-windows.html and https://doc.qt.io/qt-6/qt.html . On Wayland, top-level programmatic positioning is often unavailable; save sizes and allow compositor-mediated repositioning rather than promising fixed coordinates.
- Some Plasma Wayland overlay prototypes use Qt 6/QML + LayerShellQt; that approach might support topmost/clickthrough panels but is NOT automatically suitable for freely draggable regular windows: https://github.com/erik96/koverlay . Validate architecture for **both** launcher and regular child windows.
- Windows always-on-top semantics can differ from Linux; test exclusive fullscreen versus borderless/windowed PokeMMO, DPI and monitor changes.

## Required test matrix, to be run by human with Claude's *tiny* spike
1. CachyOS KDE Plasma Wayland + PokeMMO Flatpak: launch/focus, always-on-top, clickthrough outside window, drag/resizing, multiple display scales, portrait side monitor.
2. CachyOS KDE X11: same cases + persisted XY geometry, alt-tab behavior.
3. Windows 10/11: always-on-top, multiple monitors, per-monitor DPI, borderless/fullscreen game behavior, Windows Defender packaging warning and no privileged actions.
4. Both: disconnected networks, 649 card filtering speed, 3+ child windows, transient toast during battle, crash/restart restore, uninstalled cleanly, resource use during game.

## Safety and distribution
- No game memory inspection, hooks, injected DLL, automated keypress, scraping protected GTL APIs, OCR/game capture by default. Game Code of Conduct prohibits automation: https://pokemmo.com/en/code_of_conduct/ . For novel integrations, get staff confirmation if unclear.
- Keep asset dumps private. PokeMMO policy says client assets must not be redistributed separately: https://pokemmo.com/en/video_policy/ . Plan for local-only user asset import or independently licensed alternatives before any public build.
- Public repo can initially contain docs, design specs, source code (when approved), tests and authored assets only.
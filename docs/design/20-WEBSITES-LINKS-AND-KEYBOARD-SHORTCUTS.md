# 20 — Websites & Favorites, configurable shortcuts, and Storyline controls
**Decision:** 2026-11-22. **Status:** OWNER APPROVED FOR NEXT v0.1.0 DEVELOPMENT PASS; not yet implemented.
**Branch:** develop. **Version:** 0.1.0. **Main/release:** untouched.
**Companion entrypoint:** docs/build/08-V0.1.0-RECOVERY-AND-APPROVED-UPGRADES.md (the full Claude handoff).

## A. Websites & Favorites — functioning user-managed Links page

**Placement:** Tools > Websites / Links; accessible via optional Quick Access pin and Home shortcut. The established five primary destinations remain Home, Pokédex, Tools, Live, Guides; do not add a sixth permanent primary destination or create a second launcher.

**User workflow:**
- Seed a small set of default bookmarks with verified HTTPS URLs: PokeMMO Forums (https://forums.pokemmo.com/), PokeMMO official (https://pokemmo.com/), PokeMMO Support (https://support.pokemmo.com/), Team Synergy (https://synergymmo.com/), PokeMMO Hub (https://pokemmohub.com/). Other sites may be added only after validating addresses. Treat these as bookmarks, NOT trusted APIs, datasets, endorsement or redistribution permission.
- Normal user can add custom links with title, URL, optional description, category, favourite/pin and optional user-provided icon if already handled safely; edit, reorder, delete/hide, restore default links, search, filter and sort.
- Preset links must not be undeletable; their inclusion should never silently overwrite a user's edited URL or deleted bookmark during a future migration.
- Opening a link invokes the user's default external browser via native Qt URL launcher / safe OS integration. Do NOT embed untrusted pages into privileged QtWebEngine surfaces and do NOT scrape or proxy website contents.
- HTTPS by default. Validate and normalize user-entered URLs, prevent javascript:, data:, file:, command, shell and custom-protocol execution, reject malformed links; display and confirm destinations as needed. No arbitrary HTML injection through titles/descriptions. Handle browser-launch failures without pretending success.
- Store user bookmarks locally in the Companion database with stable IDs. Support backups and migration. No account/sync service; no tracking analytics; no login requirement. User-editable categories and optional export/import may be implemented if feasible and tested.
- If the source site is offline, external browser behavior is normal; do not invent availability. May show site logo via safe local fallback, but don't fetch/rehost protected icons or import third-party datasets.

**Acceptance tests:** seed defaults exactly once; edits/deletions persist after restart and updates; custom bookmark CRUD; duplicate policy deterministic; link validation/escaping; search/favourites; external URL launch mocked/checked; no client input manipulation; main nav stays five items; popout/Quick Access integration follows existing architecture where practical.

## B. Keyboard shortcuts / keybinds — configurable per action

**Central Settings > Keyboard Shortcuts**:
- Discoverable, searchable list of registered Companion actions, grouped by module (General, Popouts, Pokédex, Guides, Notes, Items, tools).
- Click an action then record a key combination (keyboard capture), save, clear/unassign, restore defaults. Show current binding, scope (focused tool/application/global), conflict warnings and platform availability. Keep binding stable by action ID, not translated action title or button text.
- When a tool is focused, shortcuts act only within Companion. Default global hotkeys OFF. Global shortcuts are OPTIONAL and only enabled with informed opt-in on platforms where registration is genuinely supported and verified; never intercept PokeMMO keystrokes by default. On KDE Wayland, avoid promising reliable global registration or unrestricted focus. Do not simulate keystrokes or send input to PokeMMO.
- Do not assign known dangerous/reserved OS combos. Duplicate/conflicting bindings, shortcuts already registered within Companion and key combinations interacting with the native shell must be rejected or require explicit conflict resolution. Textareas, editable inputs, IME composition and modal dialogs must not accidentally trigger step completion/navigation.
- Auto-repeat, rapid presses and multiple Guide popouts must not double-toggle an objective; use a single state/data action with focus ownership and appropriate debouncing. Keyboard shortcuts should not invoke browser/OS commands without explicit user action.
- Save across app restarts, migrate safely, reset individual actions or all defaults, and provide an obvious on/off switch for scope-sensitive bindings. Respect language-independent physical key combos where appropriate.

**Storyline Guide actions (must actually work):**
1. Toggle current checklist objective done / undone.
2. Go to next objective (step).
3. Go to previous objective.
4. Optional: show/hide focused Guide popout and jump back to active main Guide, ONLY if supported safely by existing shell.
5. Operate against the ACTIVE character run, region and guide step; maintain a stable selected-step ID. An action never marks a different run or a nonselected task. Persist through existing manual progress store and update full Guides and popout views together. At region boundaries navigate correctly and do not silently complete tasks.
6. Optional suggested focused-only defaults (do not force global): Ctrl+Shift+Right = next step, Ctrl+Shift+Left = previous step, Ctrl+Shift+Enter = toggle current step. Verify no conflicts; all are user-remappable and can initially be unassigned if required for safety.

**Additional candidate actions only where actual functionality exists:**
- Open/focus a chosen tool popout, hide/show, pin, unpin.
- Notes: create new note, toggle favourite, focus search (when not editing).
- Pokédex: focus search, previous/next selected entry.
- Links: focus search; open selected bookmarked site only on user action.
Avoid empty advertised actions and broad tool proliferation.

**Acceptance tests:** correct action and focused scope; remap + persistence + migration; conflicts and reserved keys; Guide check/uncheck single toggle, next/previous across boundaries, per-character isolation; no triggers during typing; no global interception without opt-in; XWayland/KDE limitations labelled honestly; Windows untested if not executed.

## C. Priority and constraints

This is an additional v0.1.0 task, NOT permission to displace ongoing interrupted implementation. Recover workspace before coding. Priorities remain Pokédex/availability, Item Library/Notes, safe popouts, research-backed Breeding/Catch/Stats/EV tools. Damage Calculator removed. Fixed breeding prices. PokeMMO Hub is a bookmark/research source ONLY; no Hub API, GTL pricing, vendor frameworks, protected assets, memory extraction or market watchlists.

If shortcuts take longer due to Wayland global registration restrictions, SHIP a robust focused-only implementation first. Do not ship inert controls. Tests and actual implementation report required. Remain develop, version 0.1.0, no main merge/release.

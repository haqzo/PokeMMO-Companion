# Design spec 05 — Better Default visual language and component tokens
**Date:** 2026-11-22  
**Status:** Style direction agreed; precise colour tokens still PENDING source extraction and user sign-off. **Not a completed visual mockup.**

## Source evidence
- Author's own Better Default v1.8.0 release and repository: https://github.com/haqzo/better-default/releases/tag/v1.8.0 and https://github.com/haqzo/better-default/blob/main/README.md
- Published v1.8.0 theme documentation confirms **13 presets, 61 PC colour settings, 14 other settings**.
- Specific existing visual patterns: optional window borders (No/Faint/Medium/Strong, Thin/Thick); accent-ring / underline / pill selection; optionally accented stat bars; trainer-card header band; redesigned move/type/status labels; soft backgrounds and carefully aligned controls.
- This research session successfully reviewed its v1.8.0 README and release metadata but could not read the raw theme release file through the library or download a binary copy. **Do not claim we know exact official colour hex values, typography assets, or XML variable names yet.**
- The extracted client dump is a separate source of Pokémon data and sprite dimensions, *not* evidence of Better Default's theme hex values.

## Design goal
The desktop Companion should feel **at home beside the player's Better Default PokeMMO UI** while retaining a suitable, accessible, independently resizable desktop-window structure. Not an oversized "gaming HUD". No default purple or glowing gradients. The app is unofficial and not injected into PokeMMO.

**Recommended default aesthetic:** understated Better Default neutral/dark baseline, understated blue-teal neutral emphasis *only if confirmed by actual theme source*, thin strokes, lightly separated window header, crisp Pokémon imagery, restrained Poke Ball logo. A user's custom theme preset/colours should be an *optional* import/match feature in a later milestone, not a requirement for startup.

## Semantic token map (names proposed for Companion, not extracted theme variable names)
| Token / component | Design role | Extraction/review target |
| --- | --- | --- |
| `bg.app` | Main workspace background | Actual Better Default background/window-body colours |
| `bg.window` | Main window and popouts | Window body |
| `bg.header` | Titlebars, card title band | Trainer card/window header variants |
| `bg.card` | Information cards and sprite tiles | Raised panel/slot look |
| `bg.hover`, `bg.selected` | Focused controls | Accent ring, selected highlight and pocket styles |
| `border.subtle`, `border.active` | Standard / pinned windows | Faint/Medium border values, accent colour |
| `text.primary`, `text.secondary`, `text.muted` | Hierarchy / metadata | Main text and label colours |
| `accent.primary`, `accent.soft` | Navigation selection, links, focus | Better Default preset accent / selected highlight |
| `type.*` | Pokémon type badges ONLY | Actual PokeMMO/Better Default type-tag palette, verified separately |
| `status.*` | Confirmed, approximate, unavailable, stale | Accessibility-controlled semantics, not decorative neon |
| `spacing.*`, `radius.*`, `typography.*` | Consistent controls and density | Observe theme proportions, then verify legibility for desktop usage |

The colour palette must be stored as named semantic tokens, **not hardcoded separately in every tool**. Hex/RGB values remain deliberately blank pending approved extraction. The designer may propose values for a temporary local prototype, but they must be explicitly labelled placeholders.

## Component grammar
- **App frame:** standard OS-respecting draggable/resizable main desktop window; restrained Poke Ball app identity; no oversized game artwork.
- **Navigation:** horizontal top tabs OR vertical left rail, the same five destinations and active state. Do not duplicate primary navigation inside every screen.
- **Tool titlebar:** small icon, specific title, context (if useful), then consistent **popout / pin / layout density / opacity / minimize / close** controls. Controls must be functionally meaningful.
- **Cards:** subtle surface distinction, restrained border, no thick coloured border around every Pokémon; strong highlight only on keyboard focus or selection.
- **Tabs:** familiar underline/pill/ring cues reminiscent of Better Default's selectable bag-pocket styles. Avoid visual changes between the same control on different pages.
- **Stats:** subtle bar backing, readable numeric value, selectable actual stat-colour vs accent bar pattern. Avoid hiding the raw numbers behind a graph.
- **Type/move labels:** use appropriately coloured type tags; ordinary metadata stays neutral. Avoid gradients except where actually part of chosen theme.
- **Empty/loading/errors:** matching card skeletons with calm copy, never multi-colour alerts everywhere.
- **Notifications:** toasts and native notifications are different delivery systems; custom toast styling follows same window/border/typography tokens, not a flashy special theme.

## Proposed sizing, to be confirmed through real layouts
- Main app comfortable viewport ~1080×740 logical px; smaller responsive width down to ~800 logical px if practical.
- Main UI base body text ~13–14 logical px at 100% scale; user-adjustable, with tested high zoom and OS DPI scaling. Do not enforce one physical font size.
- Touch/click target ~28–36 logical px minimum for desktop tools, larger when user selects accessibility setting.
- Spacing scale anchored around 4 logical px increments (4/8/12/16/24). **Proposed**, not measured from Better Default.
- Corner radii modest (e.g. 4–8 logical px). **Proposed**, not extracted theme-specific.
- Opacity is per-tool where useful: Storyline Guide may use more transparency than a text-heavy breeding planner. If opacity reduces contrast too far, raise the foreground panel backing or enforce a usable minimum.

## Supported theming modes (design proposal)
1. **Better Default baseline** — initial look drawn from the actual v1.8.0 default after tokens are extracted.
2. **Follow imported preset colours** — optional local, user-chosen Better Default configuration import once approved. No injection, memory reading or automatic PokeMMO settings scanning. Show precisely which fields import and how the user reverts.
3. **High contrast / reduced motion** — accessibility mode, regardless of preset.

Do **not** promise support for automatic sync to all thirteen presets until a real config format and legal/use-safe local import path are tested.

## Non-negotiable QA
- Normal text >= 4.5:1 contrast and essential icon boundaries >= 3:1 where relevant (WCAG targets), or report failing combinations and adjust.
- Accessibility at 125%, 150% and 200% OS scaling; user text scale tested across chosen supported range.
- Consistent keyboard focus, no invisible controls hidden behind backdrop opacity.
- Each component in Home, Pokédex, Tools, Live and Guides uses shared semantic tokens.
- Custom popout frame should not assume the window manager allows arbitrary Wayland positioning or always-on-top over exclusive fullscreen games.
- Do not include screenshots, sprites, proprietary theme atlases or other extracted client files in this public design documentation.

## Sign-off gate
Before Claude creates production UI code: inspect v1.8.0 archive locally, populate exact tokens and reference samples, compare with the real theme on screen, and get the user's approval of density, selected state and typography.
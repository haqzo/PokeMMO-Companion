# 10 — Live workspace: three focused sections
**Date:** 2026-11-22 · **Status:** Proposed full-page UX for user review; implementation not authorized.
**Parent navigation:** One of five Companion top-level pages: Home | Pokédex | Tools | **Live** | Guides.

## Purpose
Live is the information center for *time-sensitive PokeMMO activity*. It is not a chaotic all-at-once dashboard. It surfaces **source-backed reports**, periodic legendary rotation information, and **reported Altering Cave rotations**. Information that cannot be refreshed remains clearly labelled as unknown or stale, never silently displayed as active.

## Navigation
Only three local sub-tabs, preserving each tab's filters/scroll:
1. **Reports** — Alphas and Swarms, plus persistent notification history.
2. **Legendaries** — Monthly roaming rotation, species information, manual per-character progress.
3. **Altering Cave** — Current reported biome/crystal, encounters/Pickup if verified, and history.

Do NOT create new main navigation buttons or global widget boxes for the sub-tabs. Home displays one quiet summary line per relevant item with a timestamp and a link into the correct sub-tab.

## Live page shell
- Header: title, **source connection status and time last checked**; source-specific status in relevant tab rather than a single green dot implying every feed is live.
- Next row: three restrained tabs, same Better Default-derived tab/selection style as Pokédex/Tools; only one tab's full data visible at once.
- Content: purpose-built page; no permanently expanded news/events, Pokédex, all legendary months, multiple calculators and alert settings in one view.
- Popout action for selected tab; popouts can remain independently pinned while main app is minimized/on the other monitor. Avoid opening duplicate instances without asking when the same tool is already open.
- Data provenance: source, UTC report time / local display time, last successful refresh, official vs community vs estimate. No invented activity expiry.
- Screen reader labels, keyboard tab navigation, helpful empty states and error banners.

## Full-page overview
### Reports
Left/primary: readable chronological reports; each item shows type (Alpha/Swarm), Pokémon species/form where known, region, location, report age, source, any verified correction/cancel marker.
Right/optional inspector on wide layouts: selected report details, update history, source and options to open corresponding Pokédex species; on narrow layout use navigation to a full detail.
Filters are compact collapsible controls: Alpha / Swarm, region, search, recent/history; no permanent two-column settings inspector.
One subtle connection-state header, not blinking LED badges for every card. Settings for alerts are under a small bell/gear action.

### Legendaries
Quiet current-month panel for Kanto bird and Johto beast with verified month context; next-month preview; compact 12-month calendar accessible by explicit action, not all 12 months expanded by default.
Acquisition/requirements and user notes beneath selected Pokémon. Separate roamers from raids/story/contested encounters; never pretend all are seasonal roamers.

### Altering Cave
Top: latest **reported** cave condition, source, observation time; 'Unknown' when no trustworthy current report.
Middle: observed normal/special singles, hordes, current Pickup items where verified, with Pokémon names/links; no unverified encounter rates. A rarity field marked UNKNOWN is not '0%'.
Bottom tab/drawer: dated historic rotations and community research notes; do not create deterministic forecast from observations.

## Layout density per tool
| Sub-tool | Main/expanded | Standard popout | Compact popout |
| --- | --- | --- | --- |
| Reports | Full feed with filters and report detail inspector | Filtered recent reports + selected detail | Last valid report(s), connection status, open-history action |
| Legendaries | Calendar, rules, unlock requirements, saved progress and sources | Current + next rotation and requirements | Monthly pair of names/sprites where art licensed, source date |
| Altering Cave | Current report, detailed single/horde/Pickup and dated history | Crystal + confirmed observed spawns/hordes, last checked | Current *reported* crystal and age; Unknown when stale |

**Compact does not mean unreadable.** Design content specifically for compact state. Persist independent view size, opacity and pin settings. Main and popout share source data and saved user progress, but can maintain independent tabs and scroll.

## Timeliness / safety semantics
- A community report can be *received recently* but still be *unconfirmed active*. Use 'Reported [time]' rather than 'Active now' unless there is independent expiration data.
- Cached alerts after reconnect do not trigger fresh popup notifications. Historic reports can populate history.
- Event/seasonal content from Halloween 2026 is no longer current; permanent changelog gameplay effects may still apply.
- Update or correction requires provider-supported stable grouping identifiers or a clearly documented correction link, not guessing by Pokémon species + location.
- If providers cannot be reached, keep last known **historical** details, show 'Feed unavailable / Last seen…' and no current cave/alpha assertion.
- Don't use game injection, memory reads, automated movement or publishing into upstream community feeds.

## Remaining prerequisites
1. Real Alphapedia ntfy payloads / provider permission and timestamp/correction semantics.
2. Dated current Altering Cave source with acceptable freshness; Oct 2026 removals must be respected.
3. Official/forum corroboration of monthly legendary cycle, in-game exact rollover/conditions, and correct player requirements.
4. Verified Windows/Plasma toast, tray, pin, focus and monitor behavior, with a fallback.
5. User approval of one calm readable Live layout, not image-gen mockups.

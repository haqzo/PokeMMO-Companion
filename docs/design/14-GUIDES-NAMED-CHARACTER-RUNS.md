# 14 — Guides workspace and named character runs
**Date:** 2026-11-22 | **Status:** Design proposal based on user's uploaded quest-tracker reference video and the previously supplied five walkthroughs. Not production code.

## What the user's reference video actually shows
The supplied 38.6-second phone recording is **a mobile browsing session of a PokeMMO forum post**, illustrating another quest tracker via screenshots/text; it is not a direct performance test of that software. Visible examples show:
- a semi-transparent, border-light, always-on-top quest checklist over PokeMMO;
- character name, current region/location, current objective, checked/unchecked tasks and regional/global progress;
- compact controls including character switch, typography changes and navigation;
- a character creation dialog with a name field, character-avatar selector and on-screen letter-grid input; region-of-start choices;
- separate profile/character hub and gamepad/keyboard support described by the post.

**User preference:** adopt the floating, readable, adjustable transparency and separate-character-run *behavior*. **Do NOT recreate goofy avatars, avatar selection, or on-screen alphabet keyboard**. Use a clean native text field to type character/run names. No copying third-party app UI/assets/code.

## Main Companion -> Guides
One primary tab **Guides** in horizontal or vertical app navigation. Subsections only inside Guides:
- **Storyline:** five region walkthroughs and character/run progress, initially the primary experience.
- **Reference:** verified important items, HMs, routes/quest prerequisites and optionally known optional areas.
- **Run history:** local records and backups, not a live account/profile API.

Proposed page layout (wide main app):
1. Top compact named **Current run** selector with 'Create run', 'Rename', 'Duplicate as new run', 'Export', and 'Manage' in its menu.
2. Row of five region tabs — Kanto, Johto, Hoenn, Sinnoh, Unova. A character may progress in several regions; selection is NOT a one-time region lock.
3. Region heading + current area and **mandatory storyline progress** bar (explicit definition of denominator). Optional items/side activities have separately tracked counts, never silently folded into primary completion.
4. Flexible main content: area/chapter navigation on left, **current step checklist and detailed instructions** on right. Narrow widths become a single-column area list then step detail, with a Back path.
5. Sparse tool actions: Search steps, Show optional tasks, Open current step as popout, Jump to current, Source/date details. No permanent cluttered toolbar.
6. Under current step, *only if available and verified*, show associated NPC, relevant route, HM/item, prerequisites and brief actionable in-game instructions; maps/screenshots are optional, never invented or distributed without licensing.

The full page is a comfortable guide reader / progress planner on the other monitor. It must be useful with **all popouts closed**.

## Characters and runs, without portraits
### New run
- One ordinary editable text field: **Character name** (required; any reasonable PokeMMO-style text, validated for length and distinctness).
- Optional **Run label** (e.g., Main, Alt, Challenge) to support separate playthroughs under the same character name without pretending they are different in-game accounts.
- Optional initial region to open after creation; does not limit later region selection.
- Create, Cancel. No avatar grid, no role/class, no forced picture, no virtual A-Z keyboard.
- Start with all tracked steps unchecked. Offer explicit 'Start from current chapter' / bulk checkpoint marking as a user-invoked action for people continuing existing runs, with undo/confirmation and a preview of affected tasks.

### Current run selector
- Display **typed name** with optional run label; an unobtrusive text-only initial or neutral icon is acceptable, not a character portrait.
- Dropdown has searchable named runs, current selected region/area preview, New and Manage; no avatars.
- Switching run restores that run's current region, chapter, last active step, checkboxes, optional-task preferences and layout preferences.
- Run progress is **independent** across every run; no progress merging when switching.
- Rename does not reset progress. Duplicate creates an independent snapshot, not a synced copy. Delete is confirmation-gated and recoverable from backup when available.

### Proposed local data shape (not in-game account state)
```json
{
  "run_id": "local-opaque-id",
  "character_name": "typed user name",
  "run_label": "optional",
  "regions": {
    "kanto": {"step_status": {}, "active_step_id": "stable-quest-id", "notes": {}},
    "johto": {},
    "hoenn": {},
    "sinnoh": {},
    "unova": {}
  },
  "last_region": "kanto",
  "created_at": "ISO-UTC",
  "updated_at": "ISO-UTC",
  "guide_catalog_revision": "versioned-guide-id"
}
```
No fake UUID implementation required at design stage. Stable internal run IDs prevent name collision problems; rename changes text only.

## Step and progress definitions
- A step has stable ID, region, chapter, area, ordered objective, *mandatory/optional* category, source/revision and dependencies. It can be unchecked/completed (optional skipped/blocked states when really helpful, not ten tags).
- Every checkbox change is **manual**; no PokeMMO memory reading, OCR or automated gameplay required. Undo last change and keyboard navigation.
- Counters: current chapter done/total, region mandatory done/total, optional activities done/total separately. Global progress across regions is available only when denominators are valid and weighted clearly; don't claim story progression from raw checkboxes alone.
- A 'current step' is the user's selected/next incomplete mandatory objective, with an optional manual 'Set current' action. Don't force the user to tick dozens of older steps on first use.
- Optional items, trainers, TMs/HMs and location-specific notes may be in separate section that can be hidden while playing. Not every story run must document all collected Pokémon or all item pickups.

## Autosave and backup
- Local autosave on checkbox changes and run edits, with transaction safety and crash recovery.
- Export a human-readable, versioned JSON backup containing run IDs, names, per-region progress, optional notes and selected preferences. Import with merge/replace confirmation; never silently overwrite another run.
- A separate **guide catalog version** and **user progress state**: app updates can revise step wording/location without deleting progress. Migrate by stable step ID or show an explicit unmatched-task reconciliation panel.
- No cloud sync unless later user-approved; no account login. Keep filenames non-sensitive if export may be shared.
- When the data source is updated due to PokeMMO changelogs, keep existing run progress and show only the relevant changed steps needing review.

## Game accuracy
- Five earlier user-supplied walkthroughs are research references, not automatically an authorized public distributable. Review every chapter against live PokeMMO rules/updates.
- Verify area order, required tasks, region transitions, HM acquisition after 19-Nov-2026 Defog updates and optional item locations. Old generic FireRed/Emerald/Platinum/BW guides are not automatically PokeMMO-accurate.
- Track per-step {source, checked_at, game_patch_version, status}; uncertain or edited content clearly labelled and not presented as a verified mandatory objective.
- User may locally use their own source files. Public GitHub documentation must not include original copyrighted walkthrough content or in-game client graphics without permissions.

## Definition of done for the Guides page (not yet tested)
1. Create two runs with same character text and different labels; check different tasks; switching keeps progress independent.
2. Create one run and complete separate Kanto/Unova chapters; switches preserve each region's current step.
3. Rename/duplicate/delete with confirmation; no lost progress; explicit import/export and revision migration test.
4. Jump to current step from Home -> Guides and optional popout without changing the game itself.
5. Test narrow/wide main window, horizontal/vertical nav, 125%/150%/200% OS DPI, text zoom and keyboard navigation.
6. Event/changelog updates don't silently overwrite previously checked tasks; provide per-run migration and date.

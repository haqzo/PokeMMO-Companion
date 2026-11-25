# Build 29 — calculator, collection and news localization continuation

Starting checkpoint: 05e5055f45896bc9a9949a062db262f43bb9a7b0.

## Completed changes

- Calculator, capture conditions, stat formulas, validation messages, recent tools and collection/team stat controls: 48 additional keys (commit b09fbb353d7cd874ada35be341bdaa4a37e1631b).
- Bundled news/event snapshot: all 101 distinct title, summary, detail, provenance, timezone and impact strings have Spanish and Simplified Chinese entries (commit 9a830b130022b851ca0eb510651dc2f0fe818680). Exact source matching preserves the English source, avoids applying an old translation to revised source text, and leaves unmatched external headlines unchanged.
- Added browser regression assertions covering real catch-table output, numeric interpolation, complete bundled snapshot coverage and fallback for external content.

## Verification

Source-level evaluation of the actual dictionary and presentation helpers passed in English, Spanish and Simplified Chinese. All 2,644 keys in UI_STRINGS are unique, nonempty in all three languages and have matching placeholder sets. Isolated calculator checks preserved all quantities and multipliers. All 101 snapshot strings resolve, with unchanged names/abbreviations intentionally allowed. The original English snapshot and calculator formulas were not changed. Existing walkthrough coverage remains 2,845/2,845 per language.

The browser tests have been authored but not executed against the complete app. A rendered audit is still needed, especially for dynamic errors and reference prose. Native-speaker review, Linux/Windows runtime verification and an updated QA package remain open. The news snapshot is historical content: this translation pass did not re-verify its gameplay claims or update its date.

Version remains 0.1.0. No changes to main and no release. Reconcile any local Codex edits before using this branch in the user's checkout.

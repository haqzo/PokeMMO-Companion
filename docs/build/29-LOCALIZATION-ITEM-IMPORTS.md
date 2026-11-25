# Build 29 — imported item display safeguards

Base: d38321bd4741711c5fc8a71c2a05343d5ce2d155.

- Bundled catalog contains 2,090 item groups; game descriptions are intentionally excluded (see test_bundled_manifest_integrity_and_no_private_material). No game-description text was added. Imported descriptions with unresolved STRING references now fall back to readable English when available, marked as such. Original unresolved strings remain accessible in a separate detail panel; no raw data is rewritten. Missing descriptions retain the established bundled-data explanation.
- Item search now includes the actual rendered label; note link selection requests the active language while storing canonical item names. New notes from item details use the corrected display label rather than an unresolved label. Existing notes are unchanged.
- Localized item quantity validation without changing its original error message. Four catalog entries added.
- Static syntax and catalog checks and five isolated description cases passed. Browser regression cases added for en/es/zh; full browser/native regression, independent terminology review and QA packaging remain outstanding. No personal imported dump available in this session.

Version 0.1.0; develop only; no merge or release.

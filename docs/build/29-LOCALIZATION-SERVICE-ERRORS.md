# Build 29 — service errors, shortcut localization and roadmap reconciliation

Base: f7b0ce1ca05c44a6a86da063c0dc70f3b65049ec.

- 68 three-language entries covering collection, Notes, guides, backups, application update validation, reference errors, HTTP/session errors and keyboard shortcuts. Only known application messages are translated; unknown/provider text and original ApiError.rawMessage remain intact.
- Shortcut conflict detection uses the original structured message rather than translated wording. Known conflict actions use their localized labels; shortcut search matches both original and translated labels. Reset no longer asks to replace a binding on unrelated errors.
- Updated the documentation index and current roadmap, and clarified closed-alpha language gates. Existing feature staging, permissions and version remain unchanged.
- Verified syntax of changed JavaScript modules, 2801 unique complete catalog entries and matching placeholders, and 201 isolated cases across all three languages using the actual error helper and supplemental catalog. Added browser regressions; not executed in full app. No CI run or native package verified for this revision. Public repo cannot run existing private-only Windows packaging job; guard retained.

Remaining: dynamic field validation, additional reference/service prose, rendered audit, full regression, native review and QA packaging. No main merge, tag, release or asset upload.

## Follow-up: shortcut registry and storyline feedback

23 additional entries: all 13 registered shortcut action labels, group labels, global shortcut explanation, and storyline keyboard feedback. The guide action API now returns additive message metadata with original step ID/hash/text and position; original messages and progress behavior are preserved. Imported objectives remain original-language text. Actual assembled catalog and guide/shortcut helpers were evaluated in three languages: 2824 supplemental keys, 2914 merged keys, no missing or mismatched placeholders, all 13 action labels localized, original custom text retained, and a hash-matched bundled step localized. Python/browser execution remains pending. Browser regression cases added.

## Follow-up: dynamic service-field validation

Added 71 catalog entries for guide and team validation, EV planning, dynamic validation wrappers and known field/stat/counter display names. Reused five existing calculator error translations centrally. Preserved source English, unknown values, numeric limits, raw error messages and canonical identifiers. The actual merged catalog contains 2985 keys (2895 supplemental); syntax, duplicate-key and placeholder checks passed, as did 102 isolated error cases across en/es/zh. Browser regression cases added; full application execution remains outstanding.

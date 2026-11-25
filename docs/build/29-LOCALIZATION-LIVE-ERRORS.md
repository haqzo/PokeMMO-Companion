# Build 29 — live notifications, API messages and availability references

Starting checkpoint: cbd8a6c2f65d703a506829adf0f53ddb010f0bfd.

- 33 additional interface keys and 9 native notification entries in commit 39205b933d693c8652f004764a0674839bf497cb.
- Feed health, reconnect delays, simulated report titles and bodies, and shared API errors are localized. Provider content and stored report records are not translated. Native notification payloads localize the app-owned prefix and test content at delivery time.
- API errors retain rawMessage. Unknown messages are unchanged rather than guessed; shortcut conflict recognition remains unchanged.
- Legendary region labels and non-roamer species names use the game terminology catalog.
- Added 13 source descriptions for the availability registry and localized their displayed link text. No changes to acquisition evidence or URLs.
- Targeted isolated evaluation of the actual JavaScript helpers in en/es/zh passed. Added three browser regression cases; full browser/native tests are not yet run. Source-level JavaScript parsing is not runtime verification.

Walkthrough coverage remains complete. The interface catalog now contains 2,690 keys. Reference claims were translated, not independently re-verified. Additional service errors, user-visible fallback audit, native-speaker review, full suite and packaging remain open.

Version 0.1.0; develop only. No release or manual testing.

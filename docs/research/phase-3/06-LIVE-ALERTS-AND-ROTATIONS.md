# Live alerts, legendary roadmap, Altering Cave

## Alphapedia / ntfy
- Official forum publisher topic: https://forums.pokemmo.com/index.php?/topic/197731-alphapedia-real-time-alphaswarm-pok%C3%A9mon-notifications-and-history-for-pc-mobile/
- Public subscription reference: https://ntfy.pokemmotools.org/alphapings
- Current feed access and exact JSON schema were **not fetched / tested** here. Until live test, required fields are a PROPOSED adapter contract, not established payload.
- Proposed normalized report: source, source_message_id, report_type alpha|swarm|other, species_id/form (optional), region, location confidence, first_seen_at UTC, updated_at UTC, expiry_at if verified, verified_by_source, update_kind new|edit|remove, source_url.
- Handle reconnect since last ID, duplicates, edits/corrections, expired data, offline badge, opt-in sound, per-type/region preferences and actionable history. Never use 'live now' solely from an old cached alert.
- No source-key automation without provider consent; no in-game click or movement automation.
- Test samples required: new alpha, changed location, cancelled report, 2 region swarms, offline/reconnect/double message, corrupted/missing fields.

## Monthly Legendary Roadmap
- Candidate community cycle: Jan/Apr/Jul/Oct Zapdos+Entei; Feb/May/Aug/Nov Moltres+Suicune; Mar/Jun/Sep/Dec Articuno+Raikou. Cite https://forums.pokemmo.com/index.php?/topic/160729-roaming-legendaries-faq/ . Verify current stable behavior and exact rollover timezone before production.
- Show current and next two months, catch status manual per character, source date, methods/requirements and a 12-month calendar. Do not imply all legendaries are roamers.
- Classify other legendary/mythical content: permanent raids, event-only, story temporary, contested temporary, unobtainable/unknown. Do not infer from dump `obtainable` flag.

## Altering Cave
- Official July 29: cave encounters and Pickup pool rotate each in-game day. Community documentation confirms approx six real-world hours and change at 00:00 in-game: https://pokemmo.shoutwiki.com/wiki/Altering_Cave . Verify exact server synchronization before countdown.
- Oct 30 changelog: species removed temporarily for balancing. Current species pool MUST be dated as of late Oct/Nov and cannot be copied from summer spreadsheets.
- Dump contains only two static Altering Cave entries, both Unown: **NOT ENOUGH FOR LIVE ROTATION**.
- Current rotation display must include crystal/type, report timestamp, confidence, source, current singles/horde observations and Pickup items if available. Never predict next lineup from past history; show 'unknown' when no trusted update.
- Historical rotations in separate tab; favourite-watch alerts only if a reliable feed or allowed polling exists. Do not invent exact uncommon spawn percentages.

## Event expiration
- Halloween 2026 ended Nov 13 at 23:59 UTC. Event spawns, temporary encounter bonuses, boss raids or boosts should be marked historical, not current. Preserve permanent balance changes from the October patch.
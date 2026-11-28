# Changelog

## v0.8.2 Alpha

### Fixed

- Fixed Windows certificate verification compatibility affecting Alphapedia Alpha and Swarm reports.
- Improved HTTPS compatibility with the Alphapedia notification service.

### Compatibility

- Existing user data and settings are preserved.
- Linux functionality remains unchanged.
- No new features or manual configuration required.

Verified packaged connectivity on Windows Server 2025 and Linux.

[Installation and platform notes](docs/releases/0.8.2.md)

## v0.8.1 Alpha

### Storyline and planning

- Keep scrolling, keyboard navigation and the active step usable in short Storyline popouts. Save checkmarks and advance the next objective together, skipping completed steps and hidden optional steps.
- Preserve Breeding Plan edits through autosave and navigation.

### Encounters and references

- Add [Report via Alphapedia](https://alpha.pokemmotools.org/help#tab-publish) to Home, Live, Phenomena, and their floating windows. [Alphapedia by FlaProGmr and LordDuskk](https://alpha.pokemmotools.org/) provides the optional Alpha and Swarm feeds.
- Group repeat Alpha and Swarm reports around the earliest reliable report time. Keep estimated elapsed windows distinct from confirmed in-game outcomes.
- Use consistent estimated-time indicators for likely active, uncertain and elapsed windows on Home and Live. Active encounter sprites and current Kanto and Johto roamers honor the existing motion settings.
- Expand the offline Unova Phenomena reference with documented area and spot precision. Credit MaToRiuKo and yuisigamy for the multilingual field reference.
- Prepare signed seasonal definitions for later reference updates. The bundled seasonal catalog is empty.

### Interface and packages

- Resize the floating 17-type chart with the window, keep the selected view across modes and offer vertical or horizontal column headers.
- Clarify the scope of portable backups. Local report history stays in the profile and in SQLite migration safety copies.
- Distribute a Windows x86-64 portable ZIP and Linux x86-64 AppImage with signed checksums.

[Installation and platform notes](docs/releases/0.8.1.md)

## 0.8.0 Alpha

- Bundles the offline Pokédex, normal and shiny artwork, Location Explorer, and item and move references.
- Includes five regional walkthroughs, per-character story progress, team and breeding tools, notes, collection, and timers.
- Adds English, Spanish, and Simplified Chinese interfaces with adjustable themes, performance profiles, and native floating windows.
- Prepares portable Windows x86-64 and Linux x86-64 packages and signed download verification for published updates.

[Installation and platform notes](docs/releases/0.8.0.md)

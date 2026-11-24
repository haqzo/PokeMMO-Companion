# Build 25 — Phenomena reference and verified links

Build 24 base `5f1518761ebb81f7837b8dad503ec20dbe96c7f1`. The AppImage application files were built from `69b5cbea784452d52085ffb1300e666da29ffafb`. The app version remains `0.1.0`.

- Home, Live and the Phenomena popout point to current callouts and location pictures in the Companion Discord. Live and the popout show selected offline Unova encounter examples, including Pokémon and spot-specific requirements where documented.
- Normal startup and settings changes leave the internal relay dormant. Existing Phenomenon preferences and history stay in the profile. The app no longer displays report screenshots or treats cached entries as current.
- The provider help documents direct Alpha and Swarm ntfy topics. Phenomena notifications are documented through Discord and webhook integrations. The direct subscriptions for Alpha and Swarm continued to respond over HTTPS. [Alphapedia help](https://alpha.pokemmotools.org/help)
- HTTPS checks confirmed the Alphapedia website, Pheno List, Altering Cave tracker and MightyBoxer guide. Public Discord invite metadata confirmed the Alphapedia server and the Companion server’s `#phenomenon-callouts` channel. [Alphapedia](https://alpha.pokemmotools.org/) · [Pheno List](https://alpha.pokemmotools.org/pheno-list) · [Phenomenon Locations Guide](https://forums.pokemmo.com/index.php?/topic/77087-phenomenon-locations-guide/) · [Alphapedia Discord](https://discord.gg/Qeuc9k4yMw) · [PokeMMO Companion Discord](https://discord.gg/5Wbh28M3gu)

The focused regression suite finished with **180 passed and 2 skipped**. The Linux AppImage self-check passed with system Python off PATH. Two native Qt offscreen start and quit cycles passed with the Alpha and Swarm reports popout and the Phenomena popout. All 4,459 packaged UI and data files matched the source byte-for-byte.

| Local artifact | Bytes | SHA-256 |
|---|---:|---|
| `PokeMMO-Companion-0.1.0-x86_64.AppImage` | 270,678,520 | `04f2090d90445c223ee021ace8e8aa2d582af5063f48cb7361376e702dec6414` |

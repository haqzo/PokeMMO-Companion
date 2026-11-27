# Final reporting scope verification

27 November 2026. This checkpoint covers the proposed v0.8.1 Alpha under feature freeze. Both candidates retain the existing 0.8.0 version metadata.

## Reviewed source and reporting workflow

- Starting develop checkpoint `5237b00f605ad44c50948bea95c9cda9f5b056b8`
- Reviewed develop source `67cdbc3174586ccbd779bd226d6ebcb2a8eb33ee`
- Shared untagged candidate snapshot `841f22291f8b4f607be42b36722fa24b25d008a5`
- Main base `527398f4d3142878c57288cdb1e9d98b481c4472`

Home, Live and the floating Reports window link to Alphapedia’s publishing guide. Phenomena and its floating window link directly to the Phenomena publishing instructions. The retired signup URL returned HTTP 404. The current guide returned HTTP 200 and its tabs opened the Alpha, Swarm and Phenomena instructions. The site documents manual publishing after Discord sign-in. Companion opens the guide in the browser. [Alphapedia publishing guide](https://alpha.pokemmotools.org/help#tab-publish) · [Alphapedia Phenomena instructions](https://alpha.pokemmotools.org/help#publish-pheno-panel)

The public application leaves independent reporting disabled at startup. It omits its settings, banner, action controls and API routes. Internal tests explicitly opt in when constructing their test application. Public coverage reopens a profile with all three reporting settings enabled and checks that the historical reports, feedback and precise Phenomena spot data remain readable. Old profile settings, backup imports and loopback test environment variables cannot enable reporting. There is no schema change. The opt-in Alphapedia feeds, incoming notifications, history and existing Phenomena reference and callout links remain available.

## Regression suites

- Linux passed **783 tests** with no skips. This includes 529 backend tests and 254 Chromium tests with the optional local fixtures. The separate offline clean-install check passed.
- Windows Server 2025 x86-64 passed the offline clean-install check and **289 regression tests**. Eight tests required local dump files unavailable to CI. The run covered the public reporting scope and the explicitly enabled internal modes. [Windows regression job](https://github.com/haqzo/PokeMMO-Companion/actions/runs/46045145579/job/140662420759)

## Linux candidate

The official candidate builder ran on Ubuntu 22.04 x86-64 with pinned Python 3.13.14, dependencies and AppImage tools. It checked the release inventory, bundled runtimes, trust store, ELF dependencies and glibc symbols. The maximum required glibc version is **2.35**.

| Package | Bytes | SHA-256 |
| --- | ---: | --- |
| Linux x86-64 AppImage | 259,521,016 | `e1d63830d8dcafc23b9957b49010a3c054fa96bf54d142db3a6508586484d997` |

The packaged self-check and a loopback-only startup passed with bundled Pokédex, five guide catalogs, maps, item icons and Phenomena references. The packaged app completed a real HTTPS update check. Native Qt on KDE Wayland and XWayland verified the Reports and Phenomena popouts, the reporting links, the Home indicators, and the Type Chart and roaming Legendary windows. The Linux host denied direct FUSE mounting. Extraction-based verification passed.

The published Linux 0.8.0 AppImage upgraded from SQLite v5 to v9 in a disposable profile. Notes, character progress, team and breeding plans, specimens, showcase, timer, window settings and report history survived two launches. One SQLite migration safety copy retained the earlier report history. The profile kept its old reporting settings on disk while the packaged app kept independent reporting off. Portable ZIP Merge and Replace both kept the destination’s report history. Portable ZIP and JSON exports exclude that history.

## Windows candidate

Windows Server 2025 x86-64 built and verified the same untagged snapshot with pinned Python 3.13.14. Verification checked the extracted executable, bundled Python and Qt, release inventory, package checksum and HTTPS trust store. The extracted application passed its clean-profile self-check with outbound HTTP and HTTPS blocked. It separately served bundled reference data and completed a real HTTPS update check.

| Package | Bytes | SHA-256 |
| --- | ---: | --- |
| Windows x86-64 portable ZIP | 260,659,985 | `6a5f0efb904499a9c133434f09a7293edf937469787b26668318fda94ab9c3e2` |

The verified published Windows 0.8.0 ZIP upgraded from SQLite v5 to v9. Its settings, note, Storyline progress and report history survived two launches. The SQLite safety copy retained the report. The packaged checks confirmed that submission and settings changes were blocked on fresh and migrated profiles, including a profile with all prior reporting preferences saved as enabled. The candidate ZIP was discarded at the end of the native run. GitHub Actions retained zero downloadable artifacts. [Windows package verification job](https://github.com/haqzo/PokeMMO-Companion/actions/runs/46045145579/job/140662420276)

## Owner acceptance

Run the staged AppImage from its candidate folder with a new test profile.

```sh
./PokeMMO-Companion-0.8.0-x86_64.AppImage --data-dir "$(mktemp -d)"
```

If the mount fails, use `--appimage-extract-and-run` as the first argument. Direct Linux FUSE and interactive Windows 10/11 desktop acceptance remain open.

The private review bundle contains the revised README, changelog, release notes, showcase, forum opening post, forum update and Discord announcement. The drafts credit Alphapedia for the feeds and external reporting workflow, credit the Unova Phenomena field references and describe the empty seasonal foundation. The binaries and publication drafts stay outside the repository.

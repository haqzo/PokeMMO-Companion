# Owner UI refinements and private candidate

27 November 2026. Feature-freeze follow-up after owner testing of the earlier Linux candidate. The accepted main-window Type Chart and Home layouts keep their existing presentation.

## Behavior and verification

- The Type Chart popout adapts row height, cell width, labels and typography to the viewport without rerendering the grid on resize or mode change. The chosen Full Chart or Focus view persists while that window is open. Column labels abbreviate when space is tight and expose their full names. Sticky headers, keyboard navigation, matchup values, both axes of the crosshair and offensive and defensive tools remain available.
- Browser checks exercised all presets and a manually reduced viewport. The horizontal matrix fit its own scroll area at all three defaults. Packaged Qt tests passed on KDE/XWayland and Wayland. The default native Standard and Expanded matrices fit, and the native Compact matrix kept its horizontal fit with 18 px of vertical scroll in the measured viewport. A saved 270 × 200 native size and the 260 × 180 browser minimum allowed scrolling on both axes. The native test also exercised an orientation switch, keyboard navigation and the text-size setting with Arctic and high contrast. English, Spanish and Simplified Chinese were checked.
- Live encounter cards use the same likely-active rule and server time as Home. The estimated-time pill distinguishes likely-active time remaining, uncertainty and a window whose estimate has elapsed. Duplicate reports keep the first timestamp and sprite node. The expiry probe observed the pill turn red and the default animation stop together, with zero additional requests to the current feed. The original evidence classification stays intact.
- Current Legendary artwork uses Home's rendering and existing motion and size preferences. The rotation calendar is static. Browser checks exercised character-specific caught tracking and all three popout modes. Packaged Qt exercised the three Legendary modes and two animated synthetic encounters on both native backends.
- Browser checks covered the neutral artwork for ambiguous reports, test and historical handling, Lightweight, Balanced, Full quality and Custom motion, explicit sprite preferences and reduced motion. Existing source-state, report creation, correction, withdrawal and personal feedback workflows were included in the regression coverage.
- In one matched six-second Chromium renderer sample, the older page recorded about 13 ms of task time and the new page recorded about 9 ms with two animated encounters. Neither issued a repeat current-feed request during that sample. Navigating away removed the animated nodes. These samples cover this fixture and are separate from sustained system CPU measurements.

## Regression suites

The full run recorded 724 passes, 51 skips and three failures from assertions tied to the former Live countdown markup and wording. The updated assertions check the pill and the server's unchanged estimate. All three scenarios passed in the subsequent affected-suite runs. The main affected browser run recorded 53 passes and six skips. The final focused dashboard, report action and motion run passed all 15 selected tests. Optional local dumps or ROMs are required by some of the skipped tests.

## Private Linux package

| Item | Result |
| --- | --- |
| Starting development checkpoint | `b900978f144a0e18498dff5e24ef8ab8f13fa040` |
| Runtime development source | `1f02d0c72763bcc7eb954c1bb2b8a6d604fb1bf2` |
| Candidate snapshot | `e795b05222ee506be31caa322473ca58408936a4` |
| Snapshot tree | `272d651204e5f8d020f91ec43c28e94cd037a5c5` |
| Package | `PokeMMO-Companion-0.8.0-x86_64.AppImage` |
| Size | 259,516,920 bytes |
| SHA-256 | `33b23b132627cc24fcd7de5cbaa2d562daf1c18e2178df054d236181439c569e` |
| Maximum required glibc | 2.35 |

Built with the verified Ubuntu 22.04 and Python 3.13.14 x86-64 toolchain, pinned dependencies and AppImage tools from [package compatibility QA](04-PACKAGE-COMPATIBILITY-QA.md). Candidate validation passed checksum comparison, asset and runtime inventory, ELF dependency resolution, glibc ceiling, HTTPS trust store and packaged self-check. Loopback-only startup also served the offline Pokédex, Phenomena reference, five guide catalogs, a built-in map and an item icon. Packaged native testing used AppImage extraction. The earlier candidate's checksum still matches its recorded value.

The local review bundle contains before-and-after captures for all three Type Chart modes, the Live encounter page and the Legendary page. The revised README, changelog, release notes, showcase, forum drafts and Discord draft remain private and local. The next step is owner acceptance of the new Linux candidate.

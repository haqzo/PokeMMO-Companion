# Build 24 — Final closed-alpha preparation

The verified Build 23 base is `325eee8ff5640d74c44bcfc8b95684d55f19a482`. The AppImage was built from `74122754e2d69fa352f74b2357fa1f1f72a3f625` on `develop`. The application still identifies itself as `0.1.0`.

## Changes

- A user enables the Phenomenon source in Live settings. The build’s centrally configured HTTPS relay is used automatically. Advanced retains the manual override and existing profiles keep their opt-in and override. With an empty default URL the app shows service unavailable and keeps saved reports. The Python relay works as before.
- Screenshot coverage now asserts that a public IPv4 address reaches the socket and TLS still receives the approved hostname. The same test suite checks rejected private, link-local, multicast and reserved addresses, including IPv6 site-local addresses. The owner previously verified the real relay, original screenshots and native functionality on the base commit.
- Websites & Links adds Projects by Haqzo through a one-time seed batch. Existing matching URLs and deleted entries are respected. About & credits adds the developer and co-developer attribution. Theme contrast feedback updates immediately after a colour edit.

## Validation

- Focused relay, public IPv4 screenshot, bookmarks, About and theme regression checks returned 53 passes.
- The final full suite returned 506 passes and 51 skips, with zero failures. The skips include tests that depend on a private PokeMMO dump. The suite used Python 3.14.10 and Playwright Chromium with four isolated workers.
- The manual trigger, private repository guard, asset-approval upload condition and pinned action revisions passed a static workflow check.

## Linux build

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `PokeMMO-Companion-0.1.0-x86_64.AppImage` | 270,678,520 | `71510b5bed0f31f65a12f8e53e56bdd97f8043bacca8a3e6936812de45852cfb` |

The local CachyOS x64 build used Python 3.14.10 and the pinned packaging dependencies. All 4,459 bundled UI and data files matched the source byte-for-byte. The bundle and frozen module inventory contain no prohibited asset filenames, tests or relay code. The backend self-check passed with system Python off PATH. Two offscreen native Qt start/quit cycles passed with a temporary profile, offline references and both reports popouts. Direct FUSE launch and compositor-specific controls need target-desktop coverage. The existing optional Qt TIFF plugin dependency warning remains. The supported PNG, JPEG, WebP and GIF assets are included and unchanged.

## Windows

Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\packaging\windows\build.ps1` on an x64 Windows host with Python 3.13.14. The development workflow builds on Windows x64 and performs a fresh-profile self-check. Its job requires a private repository and the `develop` branch. Upload requires both the repository’s asset-approval variable and opt-in at dispatch. This workflow was validated statically. A native Windows run and manual Windows smoke test are pending. [Windows build and private dispatch instructions](../../packaging/README.md)

## Relay hosting and remaining gates

For launch, reuse the tested Python relay on an existing always-on Linux host with HTTPS if one is available. Cloudflare Workers Free with a scheduled poll and D1 is a viable managed pilot. It requires a small server-side implementation, load verification and a private pilot. The cloud service was researched only. [Hosting options, quotas and deployment requirements](../../relay/README.md)

Before sharing the closed-alpha build, approve asset redistribution, version and distribution method. If the alpha includes the shared feed, approve the audience, Discord permissions, report and screenshot redistribution, and the HTTPS endpoint. Configure `PHENOMENA_RELAY_URL` only after that approval. Windows distribution also requires the native build and adoption of the private workflow if using hosted CI. [Closed-alpha tester guide and gates](../closed-alpha.md)

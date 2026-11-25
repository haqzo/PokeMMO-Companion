# 31 — Final optimization and internal closed-alpha QA

Development version **0.1.0**, branch `develop`. Tested and packaged source `66229d65c2854979866bd8196ba9557010793a27`. The follow-up commit records verification and updates the tester instructions.

## Native lifecycle

The owner’s archived regression passed with 596 tests and 52 skips. Its native baseline and candidate both retained all three closed popout renderers after the first cycle and stalled opening the same tools in cycle two. The baseline timed out on Pokédex, and the candidate timed out on Item Library. A local rerun of the old diagnostic reproduced the Item Library stall.

The old diagnostic ran an entire workload inside a Qt timer callback and entered nested event loops for JavaScript, readiness polling, and sampling. The floating windows use `WA_DeleteOnClose`. Closing them removed the entries from the app’s registry, while Qt could defer deletion of the native window and its child WebEngine view and page until the original event loop regained control. The corrected diagnostic yields back to that loop between probes. It checks the native validity of the window, view and page on both closes and records each observed popout renderer’s PID and recovery. The repeated cycles use the existing application lifecycle. The Qt shell and JavaScript application code are identical to the owner-tested revision.

## Comparable measurements

Baseline `3c8b634cc9afee24b82e53f5281736cce9a7611e` and candidate `66229d65c2854979866bd8196ba9557010793a27`, measured consecutively with the same corrected harness on CachyOS x86-64, KDE/XWayland (`xcb`), Python 3.14.10 and PySide6 6.12.0. Each run used a fresh profile, English, explicit normal sprite motion when animated, the same three displays and an eight-second sampling window after a five-second settle. The candidate used Balanced. PSS/RSS are median MiB across the process tree. Summed RSS counts shared pages in each process. CPU is percent of one logical core over the sample. Process numbers are peak observed live process counts.

| Workload | PSS, baseline → candidate | RSS, baseline → candidate | CPU, baseline → candidate | Processes, baseline → candidate |
|---|---:|---:|---:|---:|
| Animated Home | 517.2 → 509.4 | 770.9 → 763.6 | 14.4 → 16.5 | 5 → 5 |
| Static Home | 539.2 → 522.7 | 795.1 → 777.0 | 5.5 → 6.7 | 5 → 5 |
| Animated Home after reload | 553.8 → 536.5 | 809.8 → 791.1 | 14.3 → 14.1 | 5 → 5 |
| Pokédex | 609.9 → 589.4 | 866.4 → 844.6 | 6.1 → 6.5 | 5 → 5 |
| Item Library | 637.1 → 614.0 | 893.9 → 869.5 | 6.1 → 6.0 | 5 → 5 |
| Three popouts, cycle 1 | 860.8 → 758.6 | 1443.2 → 1337.3 | 19.1 → 13.6 | 8 → 8 |
| Recovery, cycle 1 | 662.5 → 633.3 | 922.1 → 893.8 | 15.3 → 12.3 | 5 → 5 |
| Three popouts, cycle 2 | 834.2 → 754.9 | 1420.8 → 1338.1 | 17.0 → 17.2 | 8 → 8 |
| Recovery, cycle 2 | 670.8 → 640.1 | 930.4 → 900.5 | 16.3 → 14.2 | 5 → 5 |

Startup to ready Home, measured from fresh profile setup through the rendered sprite check, went from **1.318 s to 1.191 s**. Both rendered two animated GIFs, zero in static mode and two after restoring motion, all 649 Pokédex cards and the initial 240 Item Library tiles.

Three open tools used **102.2 MiB less PSS (11.9%)** in the first cycle and **79.3 MiB less PSS (9.5%)** in the second. PSS and RSS were lower in every sampled phase. CPU ranged from 1.2–2.1 percentage points higher on the first animated and static Home samples to 5.5 points lower in the first three-popout sample. The second three-popout sample differed by 0.2 points. The earlier owner comparison showed lower candidate Home CPU, so the Home readings varied between runs.

Both runs went from eight processes with the tools open to five after each close. All three windows, views and pages were destroyed in each cycle. Every distinct popout renderer exited, and the external process watcher recorded zero surviving processes from ten observed children per run. Recovery memory remained above the initial Home reading after navigating through both libraries, with no retained popout renderers.

## Regression and clean profile

The exact packaged source passed the full regression with **605 passed, 51 skipped, zero failures**, in 250.03 seconds. The final run used four pytest workers and included the optional cryptography dependency. The earlier single-worker check recorded 596 passed and 52 skipped in 714.07 seconds, consistent with the owner’s archived run. The QA profiles used bundled data.

The standalone clean-install checker passed with 649 species, 559 moves, 2,090 items, 629 locations and 33,405 encounters. All encounter locations were reachable, and there were zero broken location IDs. The profile contained no ROMs or dumps. Shipped maps also passed the file and HTTP delivery checks.

## Linux x86-64 AppImage

- Local artifact `PokeMMO-Companion-0.1.0-x86_64.AppImage`, **300,292,600 bytes** (286.38 MiB). SHA-256 `74bfa146ffb6bf738a093e4fe9c2ad1e8587341ac4124bafe67c6987ef880b36`.
- Built on CachyOS x86-64, kernel 7.3.6-1-cachyos and glibc 2.44, with Python 3.14.10, PyInstaller 6.19.0, PySide6 6.10.2 and appimagetool build `5735cc5`. The supplied x86-64 type-2 runtime hashed to `617aa77314d57c8b8e4fae9c3f0b35af7b30d5529cb69e98f64f92510ed98a46`.
- `--appimage-extract-and-run --check` passed on a fresh data directory with only shell utilities on PATH and a loopback-only network namespace. Manual extraction and `AppRun` passed on the same package. This host has no `/dev/fuse`. Mounted execution and older Linux distributions still need platform coverage.
- The extracted package passed native KDE/XWayland and Wayland smoke tests and an offline run in a loopback-only namespace. The offline run used Qt's offscreen backend with the Chromium sandbox disabled only for the QA process in the root-mapped namespace. Normal KDE tests used the packaged defaults for Chromium.
- Covered first launch, normal and shiny animated sprites, item icons, all five regional walkthroughs, English/Spanish/Simplified Chinese, Companion Han, Tokyo Night, 125% text scale, all three calculator window modes, panel opacity and stored window geometry. On XWayland, the window manager confirmed always-on-top, window opacity and identical native window position and size after reopening. Chromium’s font inspection confirmed the bundled font rendered the Chinese test label. Each run checked backup preview and restore, persistence, second-launch handover, immediate relaunch, and clean exit of both instances and their observed WebEngine children.
- Compared 4,471 bundled files byte-for-byte with the source. The bundle retained the credits, font OFL, PokeAPI and cryptography notices. The extract contained the Python runtime and QtWebEngine helper. Checked 493 ELF files with zero unresolved dynamic dependencies on the build host after excluding the unused Linux TIFF plugin. Audited package paths for private data, ROMs, dumps, keys, project tooling and broken links. Content hashing found about 333 KiB of repeated regular-file bytes in the shipped art and Qt resources.

## Windows x86-64 ZIP

The build requires a 64-bit Python interpreter on the build host. The manual Windows CI check now hashes and extracts the actual ZIP, then runs its frozen executable with a fresh profile from a path containing spaces. The private-repository guard remains in effect. Local workflow syntax and the intended execution sequence were checked. A Windows host was unavailable for this batch, so no ZIP was built and no Windows runtime claim is made. [Windows build and tester steps](../../packaging/README.md#windows-x86-64)

## Readiness

**Optimization is complete.** The corrected benchmark completed both reopen cycles, showed lower Balanced memory use in every sample and found no material reproducible performance issue requiring another optimization pass.

**The tested KDE Linux configuration is ready for an owner-approved alpha build using the extraction route.** A two-platform alpha still needs a real Windows build and smoke test. Broader Linux compatibility and mounted AppImage launch remain to be verified on applicable hosts.

Use the [tester guide](../closed-alpha.md) for installation, feedback, update and recovery. The owner controls the 0.8.0 version change and distribution. Spanish and Simplified Chinese wording review takes place during the closed alpha.

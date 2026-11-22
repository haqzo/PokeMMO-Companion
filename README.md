# PokeMMO Companion

A research-first, PokeMMO-specific companion planned for **Windows and Linux**.

**Status:** v0.1.0 development preview on `develop` (not a release). The video correction pass is implemented; see the [correction pass report](https://github.com/haqzo/PokeMMO-Companion/blob/develop/docs/build/05-V0.1.0-CORRECTION-PASS-REPORT.md) (changes, tests, what is still unverified) and the earlier [implementation report](https://github.com/haqzo/PokeMMO-Companion/blob/develop/docs/build/03-V0.1.0-IMPLEMENTATION-REPORT.md). Inputs: [three-video audit](https://github.com/haqzo/PokeMMO-Companion/blob/develop/docs/reviews/2026-11-22-three-video-audit.md) · [correction assignment](https://github.com/haqzo/PokeMMO-Companion/blob/develop/docs/build/04-V0.1.0-VIDEO-CORRECTION-PASS.md).

## Vision
A compact, collapsible launcher and clean, independently movable/resizable floating tools alongside PokeMMO. The Pokédex should use a responsive, searchable **sprite-card grid** instead of long rows, with verified species details, obtainable status, encounters, moves, evolution and forms.

Planned research areas: Alpha/Swarm notifications, Legendary rotations, Altering Cave, PokeMMO-specific calculators, team/breeding tools and optional region walkthroughs. We will not add an encounter counter because PokeMMO already has one.

## Quick start (Linux, Bash)
```bash
git clone -b develop https://github.com/haqzo/PokeMMO-Companion.git && cd PokeMMO-Companion
./scripts/setup-venv.sh      # optional: PySide6 in ./.venv for native pinned popouts
./run.sh                     # native windows, or browser mode if PySide6 is missing
./run.sh --spike             # native window feasibility test → spike-report.json
```
If your PokeMMO dumps are in a known folder (e.g. `~/Documents/PokeMMO-Companion/Pokemmo-Dumps`), Home offers a one-click **Install**; otherwise import them in **Settings › Data & privacy**. They stay on your computer and are never modified. Close the Companion before `git pull` and relaunch. Requires Python 3.10+. Windows: `run.ps1` (untested).

## v0.1.0 development plan
[Full first-pass scope and acceptance criteria](docs/build/00-V0.1.0-FIRST-PASS-PLAN.md) | [Claude coding handoff](docs/build/01-CLAUDE-V0.1.0-KICKOFF.md) | [User video review](docs/build/02-V0.1.0-VIDEO-REVIEW-CHECKLIST.md)

One coherent **locally runnable full-app preview** now exists on `develop`; the first user video review drives subsequent polish and versions. It is not a released executable.

## Design and research
[Design specification](docs/design/README.md) — current approved product direction and proposed detailed UX for Home, windows, notifications and Pokédex.

## Research
**[Read the research library](docs/research/README.md)** for PokeMMO changelog cross-checks, archive audit findings, data provenance rules, QA cases and Claude's pre-build handoff.

Information is **not yet production-validated**. PokeMMO updates frequently; data from extracts and third-party tools must be compared against current official changelogs and live gameplay before release.

## Branches
- `main` — stable, approved releases only.
- `develop` — research, design, implementation and testing; Claude will work on this branch.

## Asset policy
Extracted PokeMMO client assets, ROMs, proprietary strings, original personal dumps and source walkthrough documents are not included. Research describes them without redistributing their contents. Public assets require separate permission/licensing review.

*Unofficial community project, not affiliated with PokeMMO.*

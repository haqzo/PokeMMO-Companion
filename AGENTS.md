# PokeMMO Companion — contributor and assistant instructions

Read [the active development checkpoint](docs/roadmap/01-ACTIVE-DEVELOPMENT-CHECKPOINT.md) at the start of every task. It is the authoritative current project handoff. Recheck the actual branch and relevant source/tests before work; older roadmap and closed-alpha documents are historical when they conflict with the checkpoint.

- Public Alpha launched on 25 November 2026; v0.8.1 is the subsequent published release. This is no longer a prelaunch or friends-only project.
- Work on `develop`. Preserve development history and unrelated changes. `main` is the clean release source and public documentation branch.
- No unapproved version bump, merge to main, tag movement, release publication or replacement of signed packages. Use the existing packaging and signing procedure.
- Prioritize alpha feedback, Windows desktop testing, bug fixes, translation accuracy, reference data and performance. Do not turn future brainstorms into features without owner approval.
- Keep the application independent, offline-first and ROM/dump-free by default. No encounter counter, gameplay automation, game memory reading or code injection.
- Verify changes with relevant tests; distinguish automated package verification from interactive desktop testing. Keep backups and personal data compatibility in mind.
- Update the active checkpoint with meaningful decisions, verification evidence, remaining work and blockers so ChatGPT, Codex and Claude can resume consistently.

The owner's latest explicit instructions supersede older plans. Ask before any release-affecting change. See [release runbook](packaging/README.md) and [current release notes](docs/releases/0.8.1.md).

## Owner workstation and research continuity

- On the owner's CachyOS workstation, the permanent development HDD is mounted at `/mnt/development`. Canonical active repositories belong under `Projects/`; project assets under `Workspace/`; private ROMs, client dumps and tools under `Resources/`; historical outputs under `Archives/`; unsorted inputs under `00-Inbox/`. Existing compatibility links may point there. These are owner-local conventions, not installation requirements; discover actual paths on other systems. Verify the intended drive is mounted before writing, and do not write into its unmounted mountpoint.
- Use `~/Development-Scratch/` on the owner's NVMe for fast disposable builds, tests and temporary asset editing. Record the canonical checkout, branch, revision and any local changes before starting. Never overwrite another checkout, discard uncommitted changes, or create conflicting permanent copies. Return valuable results to the canonical project and clean only verified disposable build products; do not delete unsorted or unidentified files.
- At the start of a task, read the current project handoff, relevant research and existing agent instructions. Compare recovered research against the current branch by content, not filenames alone. Put genuinely new, publishable research, source references, decisions, limitations, and QA findings in the corresponding repository's documentation, with status (idea, experimental, approved, verified or superseded). Do not overwrite newer decisions with archived notes. Preserve conflicting or private material locally for review.
- Do not commit raw ROMs, client dumps, personal data, credentials, signing keys, private collaborator assets, generated caches or large temporary builds. Review research and permissions before publication. No unapproved implementation, version bumps, release changes, deployment or merge. Follow the repository's existing branch and testing rules.
- End substantive work with a concise handoff: changes, tests, known limitations, source references, pending decisions and locations of preserved artifacts. Keep ChatGPT, Codex and Claude aligned through the same repository documentation rather than relying on a chat session.

Use `docs/roadmap/`, `docs/research/`, `docs/design/` and `docs/build/` as the existing knowledge base; review the automatic-update roadmap before any approved update work. Keep live catch-rate/OCR, Android and cross-device research separate from approved implementation. Preserve offline-first behavior, owner approval gates and release signing.

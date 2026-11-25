# PokeMMO Companion — contributor and assistant instructions

Read [the active development checkpoint](docs/roadmap/01-ACTIVE-DEVELOPMENT-CHECKPOINT.md) at the start of every task. It is the authoritative current project handoff. Recheck the actual branch and relevant source/tests before work; older roadmap and closed-alpha documents are historical when they conflict with the checkpoint.

- Public 0.8.0 Alpha launched on 25 November 2026. This is no longer a prelaunch or friends-only project.
- Work on `develop`. Preserve development history and unrelated changes. `main` is the clean release source and public documentation branch.
- No unapproved version bump, merge to main, tag movement, release publication or replacement of signed packages. Use the existing packaging and signing procedure.
- Prioritize alpha feedback, Windows desktop testing, bug fixes, translation accuracy, reference data and performance. Do not turn future brainstorms into features without owner approval.
- Keep the application independent, offline-first and ROM/dump-free by default. No encounter counter, gameplay automation, game memory reading or code injection.
- Verify changes with relevant tests; distinguish automated package verification from interactive desktop testing. Keep backups and personal data compatibility in mind.
- Update the active checkpoint with meaningful decisions, verification evidence, remaining work and blockers so ChatGPT, Codex and Claude can resume consistently.

The owner's latest explicit instructions supersede older plans. Ask before any release-affecting change. See [release runbook](packaging/README.md) and [current release notes](docs/releases/0.8.0.md).

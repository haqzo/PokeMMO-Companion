# Release snapshots

Develop retains the complete development history. Main contains reviewed snapshots of the public application. The initial cleanup starts from the owner-authored root commit `6c90033f69a20febd8b2b5bf098b3d457c187bfe`. Once that transition is approved, each new snapshot has the current released `main` commit as its sole parent, so subsequent updates are fast-forwards.

## Prepare and review

1. Fetch the current branch and tag refs. Record the full, reviewed `develop` SHA and the intended `main` parent SHA. Check whether the owner changed credits or public documentation directly on `main`. Synchronize and review approved changes on `develop` before selecting the source commit. Preserve the exact credits blob.
2. Review [the release-source policy](../packaging/release-source.json). Runtime trees include their maintained assets and notices. Packaging and workflow inputs are listed individually. Development research, tests, tools and relay infrastructure stay on `develop`. Add a classification and review its dependencies when introducing unclassified tracked paths. Preserve older release notes under `docs/releases/`.
3. Run the generator from a clean clone. It reads the reviewed commit’s policy and copies the selected Git blobs and file modes. It validates required files and records the development SHA in `RELEASE-SOURCE`. The new commit has only the supplied release parent. The generator creates no branch, tag, or push.

   ```sh
   release_sha=$(python3 tools/release_snapshot.py \
     --source "$reviewed_develop_sha" --base "$release_parent_sha" \
     --message 'Release PokeMMO Companion VERSION' --inventory /path/to/inventory.json)
   git worktree add --detach /path/to/release-review "$release_sha"
   ```

4. Review `inventory.json`, the public file tree, credits and documentation links. Compare `git diff --exit-code "$reviewed_develop_sha" "$release_sha" -- companion ui`. Run the development regression suite for changed runtime inputs and run clean-install and source launcher checks against the separate snapshot. Check workflow syntax and packaging inputs. Inspect the generated commit’s parent and verify that no development commits were merged into it.
5. Keep a recoverable reference to the candidate until review is complete. For the one-time history replacement, keep named backup refs and a verified Git bundle containing the former main tip and the original annotated release tag. Obtain explicit approval of the exact old and new remote ref values before any replacement. Pause if the remote refs have advanced.
6. For subsequent releases, confirm the current remote `main` is the approved snapshot’s parent. After separate owner approval, push the reviewed snapshot as an ordinary fast-forward. Create the approved annotated tag at the snapshot, then use the official workflow from `main`. Its `source_sha` input is the release snapshot commit. Per-platform and combined provenance record that commit and the original reviewed `develop` SHA. Approve artifact retention and draft staging separately.

Generated commits use the repository's configured author identity and receive the message supplied to the generator. Original development authorship remains on `develop`. GitHub's contributor sidebar updates on its own schedule.

## Public repository metadata

Proposed description:

> An unofficial desktop companion for PokeMMO with offline tools, guides, Pokédex and customizable floating windows for Windows and Linux.

Proposed topics: `pokemmo`, `pokemon`, `companion-app`, `pokedex`, `python`, `pyside6`, `desktop-app`, `linux`, `windows`.

Place owner-supplied screenshots or GIFs under the feature overview in the public README when available. Leave the website field blank.

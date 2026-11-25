#!/usr/bin/env python3
"""Create an unreferenced release commit from an exact reviewed develop SHA."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory


def git(*args, data=None, env=None):
    return subprocess.check_output(["git", *args], input=data, env=env)


def commit_sha(value):
    if not re.fullmatch(r"[0-9a-f]{40}", value):
        raise ValueError("Supply a full Git commit SHA.")
    if git("cat-file", "-t", value).strip() != b"commit":
        raise ValueError(f"Expected a commit object: {value}")
    return value


def matches(path, rules):
    return any(path.startswith(rule) if rule.endswith("/") else path == rule for rule in rules)


def snapshot(source, base, message, inventory_path):
    source, base = map(commit_sha, (source, base))
    policy = json.loads(git("show", f"{source}:packaging/release-source.json"))
    inventory = {"develop_source": source, "release_parent": base, "retained": {}, "excluded": {},
                 "generated": {"RELEASE-SOURCE": source}}
    included = []
    entries = git("ls-tree", "-rz", source).rstrip(b"\0").split(b"\0")
    for entry in entries:
        metadata, raw_path = entry.split(b"\t", 1)
        path = raw_path.decode("utf-8")
        groups = [(decision, reason)
                  for key, decision in (("include", "retained"), ("exclude", "excluded"))
                  for reason, rules in policy[key].items() if matches(path, rules)]
        if len(groups) != 1:
            raise ValueError(f"Expected exactly one inventory rule for {path}")
        decision, reason = groups[0]
        inventory[decision][path] = reason
        if decision == "retained":
            if metadata.split()[0] not in (b"100644", b"100755"):
                raise ValueError(f"Expected a regular file: {path}")
            included.append(entry)

    required = set(policy["required"])
    required.update(rule for rules in policy["include"].values() for rule in rules if not rule.endswith("/"))
    if missing := required - inventory["retained"].keys():
        raise ValueError(f"Missing required files: {', '.join(sorted(missing))}")

    marker = git("hash-object", "-w", "--stdin", data=f"{source}\n".encode()).strip()
    included.append(b"100644 blob " + marker + b"\tRELEASE-SOURCE")
    with TemporaryDirectory(prefix="release-index-") as directory:
        env = {**os.environ, "GIT_INDEX_FILE": str(Path(directory) / "index")}
        git("read-tree", "--empty", env=env)
        git("update-index", "-z", "--index-info", data=b"\0".join(included) + b"\0", env=env)
        tree = git("write-tree", env=env).strip().decode()

    commit = git("commit-tree", tree, "-p", base, "-m", message).strip().decode()
    inventory["release_commit"] = commit
    inventory_path.write_text(json.dumps(inventory, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return commit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--message", required=True)
    parser.add_argument("--inventory", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(snapshot(args.source, args.base, args.message, args.inventory))
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()

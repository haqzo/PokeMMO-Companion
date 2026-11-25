"""Release series and package names shared by the updater and release tools."""

import re

_TAG = re.compile(r"v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?")


def parse_version(tag: str) -> tuple | None:
    match = _TAG.fullmatch(tag.strip()) if isinstance(tag, str) and len(tag) <= 128 else None
    if not match:
        return None
    major, minor, patch = map(int, match.groups()[:3])
    suffix = match[4]
    identifiers = suffix.split(".") if suffix else ()
    if any(p.isdigit() and len(p) > 1 and p.startswith("0") for p in identifiers):
        return None
    prerelease = tuple((0, int(p)) if p.isdigit() else (1, p) for p in identifiers)
    return (major, minor, patch, not suffix, prerelease)


def release_channel(tag: str, prerelease: bool = False) -> str:
    version = parse_version(tag)
    if version:
        if version[:2] == (0, 8):
            return "alpha"
        if version[:2] == (0, 9):
            return "beta"
        identifiers = version[4]
        if identifiers and identifiers[0][1] in ("alpha", "beta"):
            return identifiers[0][1]
        if identifiers:
            return "prerelease"
    return "prerelease" if prerelease else "stable"


def package_names(version: str) -> dict[str, str]:
    return {
        "linux": f"PokeMMO-Companion-{version}-x86_64.AppImage",
        "windows": f"PokeMMO-Companion-{version}-windows-x86_64.zip",
    }

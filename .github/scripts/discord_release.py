#!/usr/bin/env python3
"""Announce a published GitHub release in the PokeMMO Companion Discord (standard library only).

Used by .github/workflows/discord-release.yml. The webhook URL comes from the DISCORD_WEBHOOK_URL environment
variable (a repository secret) and is never printed, logged or written anywhere.

  release     read the release from GITHUB_EVENT_PATH (the `release: published` event) and post it
  test        post a short connection-test message (workflow_dispatch)
  --dry-run   print the JSON that would be sent (no network, no secret needed)

Discord limits respected: embed title 256, description 4096, field value 1024, footer 2048, whole embed 6000
characters. Mentions are never pinged: `allowed_mentions.parse` is empty and @everyone / @here / role and user
mention syntax in the release text is neutralised.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from companion.release import package_names, release_channel

TITLE_MAX, DESC_MAX, FOOTER_MAX, EMBED_MAX = 256, 4096, 2048, 6000
STABLE_COLOUR, BETA_COLOUR, TEST_COLOUR = 0x3BA55D, 0xE0A030, 0x5865F2
ZWSP = "​"
WEBHOOK_RX = re.compile(r"^https://(?:ptb\.|canary\.)?discord(?:app)?\.com/api/webhooks/\d+/[\w-]+$")


def neutralise(text: str) -> str:
    """Stop the text from pinging anyone, even if allowed_mentions were ignored."""
    text = re.sub(r"@(everyone|here)", "@" + ZWSP + r"\1", text or "")
    return re.sub(r"<@([!&]?\d+)>", "<@" + ZWSP + r"\1>", text)


def clip(text: str, limit: int) -> str:
    text = text or ""
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def release_payload(release: dict, repo: str = "haqzo/PokeMMO-Companion") -> dict:
    tag = str(release.get("tag_name") or "").strip()
    version = tag[1:] if tag.lower().startswith("v") else tag
    channel = release_channel(tag, bool(release.get("prerelease")))
    kind = {"alpha": "Alpha", "beta": "Beta", "prerelease": "Prerelease", "stable": "Stable"}[channel]
    prerelease = channel != "stable"
    name = (release.get("name") or "").strip() or f"PokeMMO Companion {tag}"
    url = str(release.get("html_url") or f"https://github.com/{repo}/releases/tag/{tag}")
    body = (release.get("body") or "").strip() or "No changelog was written for this release."
    more = f"\n\n[Full changelog on GitHub]({url})"
    desc = clip(neutralise(body), DESC_MAX - len(more)) + more
    title = clip(neutralise(f"{'🧪 ' if prerelease else ''}{name}"), TITLE_MAX)
    footer = clip(f"{kind} release · version {version or '?'} · {repo}", FOOTER_MAX)
    fields = [{"name": "Version", "value": clip(version or "?", 1024), "inline": True},
              {"name": "Channel", "value": f"{kind} — may contain bugs, back up first" if prerelease else kind, "inline": True}]
    assets = {a.get("name") for a in release.get("assets", []) if a.get("state", "uploaded") == "uploaded"}
    downloads = [label for platform, label in (("linux", "Linux x86-64 AppImage"), ("windows", "Windows x86-64 portable ZIP"))
                 if package_names(version)[platform] in assets]
    if downloads:
        fields.append({"name": "Downloads", "value": f"[{' · '.join(downloads)}]({url}#assets)"})
    if "SHA256SUMS" in assets:
        fields.append({"name": "Checksums", "value": f"[SHA256SUMS]({url}#assets)"})
    embed = {"title": title, "url": url, "description": desc, "color": BETA_COLOUR if prerelease else STABLE_COLOUR,
             "fields": fields, "footer": {"text": footer}}
    if release.get("published_at"):
        embed["timestamp"] = release["published_at"]
    # whole-embed limit: shorten the description if the rest pushes it over
    over = embed_length(embed) - EMBED_MAX
    if over > 0:
        embed["description"] = clip(neutralise(body), max(0, DESC_MAX - len(more) - over - 1)) + more
    content = f"**New {kind.lower()} release of PokeMMO Companion: {neutralise(version or tag)}**"
    return {"content": clip(content, 2000), "embeds": [embed], "allowed_mentions": {"parse": []}}


def test_payload(run_url: str = "") -> dict:
    text = "Connection test from the GitHub Actions workflow — release announcements will appear in this channel."
    if run_url:
        text += f"\n{run_url}"
    return {"content": text, "allowed_mentions": {"parse": []},
            "embeds": [{"title": "PokeMMO Companion · webhook test", "description": "No release was published.", "color": TEST_COLOUR}]}


def embed_length(embed: dict) -> int:
    n = len(embed.get("title", "")) + len(embed.get("description", "")) + len((embed.get("footer") or {}).get("text", ""))
    return n + sum(len(f.get("name", "")) + len(f.get("value", "")) for f in embed.get("fields", []))


def send(payload: dict, webhook: str, opener=urllib.request.urlopen) -> int:
    if not WEBHOOK_RX.match(webhook or ""):
        # never echo the value — only say what is wrong
        raise SystemExit("DISCORD_WEBHOOK_URL is missing or is not a Discord webhook URL (value not shown).")
    req = urllib.request.Request(webhook + "?wait=true", data=json.dumps(payload).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json", "User-Agent": "PokeMMO-Companion-release-bot"})
    try:
        with opener(req, timeout=20) as resp:
            return int(getattr(resp, "status", 200))
    except urllib.error.HTTPError as exc:                   # the error text never contains the webhook URL
        raise SystemExit(f"Discord rejected the message: HTTP {exc.code}") from None
    except urllib.error.URLError as exc:
        raise SystemExit(f"Could not reach Discord: {type(exc.reason).__name__}") from None


def main(argv: list[str]) -> int:
    mode = argv[1] if len(argv) > 1 else "release"
    dry = "--dry-run" in argv
    if mode == "release":
        with open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8") as fh:
            event = json.load(fh)
        release = event.get("release") or {}
        if not release.get("tag_name") or release.get("draft"):
            print("Draft or missing release: nothing announced.")
            return 0
        payload = release_payload(release, os.environ.get("GITHUB_REPOSITORY", "haqzo/PokeMMO-Companion"))
    elif mode == "test":
        run = ""
        if os.environ.get("GITHUB_RUN_ID"):
            run = f"{os.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/{os.environ.get('GITHUB_REPOSITORY')}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
        payload = test_payload(run)
    else:
        raise SystemExit(f"unknown mode {mode!r} (release | test)")
    if dry:
        print(json.dumps(payload, indent=1, ensure_ascii=False))
        return 0
    status = send(payload, os.environ.get("DISCORD_WEBHOOK_URL", ""))
    print(f"Posted to Discord (HTTP {status}).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

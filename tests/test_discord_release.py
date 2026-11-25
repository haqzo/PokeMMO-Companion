"""Discord release workflow + payload builder (synthetic releases, fake webhook, no network, no real secret)."""
import importlib.util
import io
import json
import re
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / ".github" / "scripts" / "discord_release.py"
WORKFLOW = ROOT / ".github" / "workflows" / "discord-release.yml"
FAKE = "https://discord.com/api/webhooks/123456789012345678/not-a-real-token_ABC-def"

spec = importlib.util.spec_from_file_location("discord_release", SCRIPT)
dr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dr)


def _rel(**kw):
    base = {"tag_name": "v0.9.0", "name": "PokeMMO Companion 0.9.0", "body": "## Changes\n- Themes\n- Built-in sprites",
            "html_url": "https://github.com/haqzo/PokeMMO-Companion/releases/tag/v0.9.0", "prerelease": False, "draft": False,
            "published_at": "2026-12-01T12:00:00Z"}
    return {**base, **kw}


def test_stable_and_beta_are_clearly_distinguished():
    s = dr.release_payload(_rel(tag_name="v1.0.0", name="PokeMMO Companion 1.0.0",
                                html_url="https://github.com/haqzo/PokeMMO-Companion/releases/tag/v1.0.0"))
    b = dr.release_payload(_rel(tag_name="v0.9.0-beta.1", prerelease=True, name="0.9.0 beta 1"))
    assert "stable" in s["content"].lower() and "beta" in b["content"].lower()
    assert s["embeds"][0]["color"] != b["embeds"][0]["color"]
    assert {f["value"] for f in b["embeds"][0]["fields"]} >= {"0.9.0-beta.1"}
    assert "Beta" in b["embeds"][0]["footer"]["text"] and "Stable" in s["embeds"][0]["footer"]["text"]
    assert "Prerelease" in dr.release_payload(_rel(tag_name="v1.0.0-rc.2"))["embeds"][0]["footer"]["text"]
    e = s["embeds"][0]
    assert e["url"].endswith("/v1.0.0") and "Themes" in e["description"] and e["title"] == "PokeMMO Companion 1.0.0"


@pytest.mark.parametrize(("version", "channel"), [("0.8.0", "Alpha"), ("0.8.12", "Alpha"), ("0.9.0", "Beta")])
def test_series_and_downloads_follow_uploaded_assets(version, channel):
    url = f"https://github.com/haqzo/PokeMMO-Companion/releases/tag/v{version}"
    p = dr.release_payload(_rel(tag_name=f"v{version}", html_url=url, assets=[
        {"name": f"PokeMMO-Companion-{version}-x86_64.AppImage", "state": "uploaded"},
        {"name": f"PokeMMO-Companion-{version}-windows-x86_64.zip", "state": "starter"},
        {"name": "SHA256SUMS"},
    ]))
    fields = {field["name"]: field["value"] for field in p["embeds"][0]["fields"]}
    assert fields["Channel"].startswith(channel)
    assert fields["Downloads"] == f"[Linux x86-64 AppImage]({url}#assets)"
    assert fields["Checksums"] == f"[SHA256SUMS]({url}#assets)"


def test_mentions_never_ping():
    p = dr.release_payload(_rel(body="Thanks @everyone and @here! <@123> <@&456> <@!789>", name="@everyone release"))
    assert p["allowed_mentions"] == {"parse": []}
    blob = json.dumps(p, ensure_ascii=False)
    assert "@everyone" not in blob and "@here" not in blob
    assert not re.search(r"<@[!&]?\d+>", blob)


def test_discord_length_limits_are_respected():
    p = dr.release_payload(_rel(body="x" * 20000, name="N" * 600, tag_name="v" + "9" * 2000))
    e = p["embeds"][0]
    assert len(e["title"]) <= 256 and len(e["description"]) <= 4096 and len(e["footer"]["text"]) <= 2048
    assert all(len(f["value"]) <= 1024 for f in e["fields"]) and dr.embed_length(e) <= 6000
    assert len(p["content"]) <= 2000
    assert e["description"].endswith(")") and "Full changelog on GitHub" in e["description"]   # the link survives cutting


def test_empty_changelog_and_missing_name():
    e = dr.release_payload(_rel(body="", name=""))["embeds"][0]
    assert "No changelog" in e["description"] and "v0.9.0" in e["title"]


class _Resp(io.BytesIO):
    status = 204

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_send_posts_json_to_the_webhook_and_never_shows_the_secret(capsys):
    sent = {}

    def opener(req, timeout):
        sent["url"], sent["body"], sent["headers"] = req.full_url, json.loads(req.data), dict(req.headers)
        return _Resp(b"")
    assert dr.send(dr.release_payload(_rel()), FAKE, opener) == 204
    assert sent["url"] == FAKE + "?wait=true" and sent["body"]["allowed_mentions"] == {"parse": []}
    for bad in ("", "https://example.com/hook", "http://discord.com/api/webhooks/1/x"):
        with pytest.raises(SystemExit) as exc:
            dr.send({}, bad, opener)
        assert "value not shown" in str(exc.value) and (not bad or bad not in str(exc.value))
    import urllib.error

    def rejecting(req, timeout):
        raise urllib.error.HTTPError(FAKE, 401, "Unauthorized", {}, None)
    with pytest.raises(SystemExit) as exc:
        dr.send({}, FAKE, rejecting)
    assert "401" in str(exc.value) and "not-a-real-token" not in str(exc.value)
    out = capsys.readouterr()
    assert "not-a-real-token" not in out.out + out.err


def test_cli_release_event_dry_run_and_draft(tmp_path):
    ev = tmp_path / "event.json"
    ev.write_text(json.dumps({"release": _rel(prerelease=True, tag_name="v0.9.0-beta.1")}))
    env = {"GITHUB_EVENT_PATH": str(ev), "GITHUB_REPOSITORY": "haqzo/PokeMMO-Companion", "DISCORD_WEBHOOK_URL": FAKE, "PATH": "/usr/bin:/bin"}
    out = subprocess.run([sys.executable, str(SCRIPT), "release", "--dry-run"], env=env, capture_output=True, text=True)
    assert out.returncode == 0 and json.loads(out.stdout)["embeds"][0]["fields"][1]["value"].startswith("Beta")
    assert "not-a-real-token" not in out.stdout + out.stderr
    ev.write_text(json.dumps({"release": _rel(draft=True)}))
    out = subprocess.run([sys.executable, str(SCRIPT), "release"], env=env, capture_output=True, text=True)
    assert out.returncode == 0 and "Draft" in out.stdout
    out = subprocess.run([sys.executable, str(SCRIPT), "test", "--dry-run"], env={"PATH": "/usr/bin:/bin"}, capture_output=True, text=True)
    assert out.returncode == 0 and "webhook test" in out.stdout
    # missing secret: clear failure, nothing leaked, nothing sent
    out = subprocess.run([sys.executable, str(SCRIPT), "test"], env={"PATH": "/usr/bin:/bin"}, capture_output=True, text=True)
    assert out.returncode != 0 and "missing" in out.stderr


def test_workflow_triggers_permissions_and_secret_handling():
    wf = yaml.safe_load(WORKFLOW.read_text())
    on = wf.get("on", wf.get(True))                    # YAML 1.1 reads the key `on` as True
    assert on["release"]["types"] == ["published"] and "workflow_dispatch" in on
    assert wf["permissions"] == {"contents": "read"}
    steps = wf["jobs"]["announce"]["steps"]
    text = WORKFLOW.read_text()
    assert "secrets.DISCORD_WEBHOOK_URL" in text and "echo" not in text and "set -x" not in text
    for st in steps:
        if "secrets." in json.dumps(st):
            assert st["env"] == {"DISCORD_WEBHOOK_URL": "${{ secrets.DISCORD_WEBHOOK_URL }}"} and "secrets" not in st["run"]
    uses = [s["uses"] for s in steps if "uses" in s]
    assert uses == ["actions/checkout@v4"]                 # no third-party actions
    assert steps[0]["with"]["persist-credentials"] is False


def test_no_webhook_url_is_committed():
    out = subprocess.run(["git", "grep", "-nE", r"discord(app)?\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]{20,}", "--", ".", ":!tests/test_discord_release.py"],
                         cwd=ROOT, capture_output=True, text=True)
    assert out.stdout.strip() == ""

import copy
import io
import json
import socket
import threading
from unittest.mock import Mock
from datetime import datetime, timedelta, timezone
from email.message import Message
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

import pytest

from companion.app import AppContext
from companion.phenomenon_protocol import CHANNEL_ID, FEED_PATH, endpoint_url, image_url
from companion.services import phenomena
from relay.phenomena import DISCORD_URL, Relay, ThreadingHTTPServer, handler, normalize

MESSAGES = json.loads((Path(__file__).parent / "fixtures/phenomena.json").read_text())["messages"]
LOCAL = "http://127.0.0.1:8767" + FEED_PATH
GUILD = "123456789012345678"


class JSONResponse(io.BytesIO):
    def __init__(self, value, headers=None):
        super().__init__(json.dumps(value).encode())
        self.headers = headers or {}


def read(value):
    return lambda req, timeout: JSONResponse(value)


def fetch_error(*args, **kwargs):
    raise TimeoutError("upstream timed out")


def test_observed_report_shapes():
    grass, shadow = [normalize(m, GUILD) for m in MESSAGES]
    assert (grass["type"], grass["location"], grass["region"]) == ("Grass", "Village Bridge", "unova")
    assert grass["reported_at"] == "2026-11-24T21:06:03.153000Z"
    assert (grass["possible_pokemon"], grass["notes"], grass["required_hms"]) == (["Emolga"], "(Bottom Left)", "None required")
    assert (grass["image_width"], grass["image_height"]) == (1280, 962)
    assert grass["source_url"] == f"https://discord.com/channels/{GUILD}/{CHANNEL_ID}/{grass['message_id']}"
    assert (shadow["type"], shadow["location"], shadow["region"]) == ("Shadow", "Route 1", None)
    assert shadow["possible_pokemon"] is None and shadow["required_hms"] == "Surf"
    assert (shadow["image_width"], shadow["image_height"]) == (1377, 577)


@pytest.mark.parametrize("change", [
    {"channel_id": "123456789012345678"}, {"author": {"id": "123456789012345678", "bot": True}},
    {"author": {"id": "1499786261118845050", "bot": False}}, {"embeds": None},
    {"embeds": [{"title": "Unknown format"}]}, {"timestamp": "yesterday"}, {"id": "abc123"},
])
def test_relay_ignores_wrong_source_and_unsupported_messages(change):
    assert normalize({**MESSAGES[0], **change}) is None


def test_missing_fields_and_mentions():
    m = {**MESSAGES[0], "content": "Unrelated user message", "embeds": [
        {"title": "Grass Pheno at Village Bridge", "description": "<@12345>"},
    ]}
    report = normalize(m)
    assert report["type"] == "Grass"
    assert all(report[k] is None for k in ("image_url", "image_width", "possible_pokemon", "required_hms", "notes", "description"))
    assert "content" not in report and "author" not in report


@pytest.mark.parametrize("url", [
    None, "http://i.imgur.com/test.png", "https://i.imgur.com.evil.test/a.png", "https://i.imgur.com@127.0.0.1/x.png",
    "https://i.imgur.com:123/a.png", "https://i.imgur.com/a.svg", "https://i.imgur.com/a.png?next=https://10.0.0.2",
    "https://i.imgur.com/%2e%2e/x.png", "https://i.imgur.com/abc.png#fragment", "https://[::1]/a.png",
])
def test_image_allowlist(url):
    assert image_url(url) is None
    raw = copy.deepcopy(MESSAGES[0])
    raw["embeds"][0]["image"]["url"] = url
    assert normalize(raw)["image_url"] is None


def test_image_proxy_checks_dns_before_connecting(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *args, **kwargs: [
        (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("127.0.0.1", 443)),
        (socket.AF_INET6, socket.SOCK_STREAM, 0, "", ("fd00::1", 443, 0, 0)),
        (socket.AF_INET6, socket.SOCK_STREAM, 0, "", ("fec0::1", 443, 0, 0)),
        (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("169.254.1.1", 443)),
        (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("240.0.0.1", 443)),
        (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("224.0.0.1", 443)),
    ])
    monkeypatch.setattr(socket, "socket", lambda *args: pytest.fail("attempted connection to a disallowed address"))
    with pytest.raises(OSError, match="unavailable"):
        phenomena.fetch_image("https://i.imgur.com/Test.png")


def test_image_proxy_connects_to_public_ipv4_and_verifies_hostname(monkeypatch):
    address = ("8.8.8.8", 443)
    monkeypatch.setattr(socket, "getaddrinfo", lambda *args, **kwargs: [
        (socket.AF_INET, socket.SOCK_STREAM, 0, "", address),
    ])
    raw = Mock()
    connection = Mock()
    connection.__enter__ = Mock(return_value=raw)
    connection.__exit__ = Mock(return_value=False)
    monkeypatch.setattr(socket, "socket", lambda *args: connection)
    tls = Mock()
    host = "i.imgur.com"
    client = phenomena.PublicImageConnection(host, context=tls, timeout=3)
    client.connect()
    raw.connect.assert_called_once_with(address)
    tls.wrap_socket.assert_called_once_with(raw, server_hostname=host)
    assert client.sock is tls.wrap_socket.return_value


def test_relay_edits_and_outages():
    edit = copy.deepcopy(MESSAGES[0])
    edit["edited_timestamp"] = "2026-11-24T21:07:00+00:00"
    edit["embeds"][0]["fields"][0]["value"] = "Updated"
    def upstream(req, timeout):
        assert req.full_url == DISCORD_URL and req.get_method() == "GET"
        assert req.headers["Authorization"] == "Bot fixture-private-token"
        return JSONResponse([MESSAGES[0], edit, *MESSAGES])
    relay = Relay("fixture-private-token", fetch=upstream)
    assert relay.refresh() == 60
    initial = relay.snapshot()
    assert len(initial["reports"]) == 2
    assert initial["reports"][0]["notes"] == "Updated"
    assert initial["reports"][0]["reported_at"] == "2026-11-24T21:06:03.153000Z"
    assert "fixture-private-token" not in json.dumps(initial)
    for fetch, status in ((read({"unexpected": []}), "invalid_response"), (fetch_error, "offline")):
        relay.fetch = fetch
        relay.refresh()
        assert relay.snapshot() == {**initial, "source": {**initial["source"], "status": status}}
    relay.fetch = read(MESSAGES)
    relay.refresh()
    assert relay.snapshot()["source"]["status"] == "connected"
    assert relay.snapshot()["reports"][0]["notes"] == "Updated"


def test_relay_rate_limits():
    def rate_limited(req, timeout):
        headers = Message()
        headers["Retry-After"] = "91.5"
        raise HTTPError(req.full_url, 429, "rate limit", headers, JSONResponse({"retry_after": 103}))
    relay = Relay("fixture-token", fetch=rate_limited)
    assert relay.refresh() == 103
    assert relay.snapshot()["source"]["status"] == "rate_limited"
    relay.fetch = lambda req, timeout: JSONResponse([], {"X-RateLimit-Remaining": "0", "X-RateLimit-Reset-After": "75"})
    assert relay.refresh() == 75


def test_feed_http_is_versioned_and_read_only():
    relay = Relay("fixture-token", fetch=read(MESSAGES))
    relay.refresh()
    with ThreadingHTTPServer(("127.0.0.1", 0), handler(relay)) as server:
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        try:
            base = f"http://127.0.0.1:{server.server_port}"
            with urlopen(base + FEED_PATH, timeout=2) as res:
                assert res.headers.get_content_type() == "application/json"
                assert json.load(res) == relay.snapshot()
            with pytest.raises(HTTPError) as err:
                urlopen(base + FEED_PATH, b"{}", timeout=2)
            assert err.value.code == 501
        finally:
            server.shutdown()
            thread.join()


def snapshot(now, *reports, status="connected"):
    return {"version": 1, "source": {"status": status, "last_success_at": now.isoformat()}, "reports": list(reports)}


def fixture_at(index, now):
    return {**normalize(MESSAGES[index]), "reported_at": now.isoformat()}


def test_client_history_notification_and_reconnect(ctx, client):
    ctx.settings.update({"notify.phenomena": "toast"})
    service = ctx.live.phenomena
    toasts = []
    ctx.live.toast_backend = lambda payload: toasts.append(payload) or True
    now = datetime.now(timezone.utc)
    old = fixture_at(1, now - timedelta(hours=2))
    first = now - timedelta(minutes=2)
    service.poll(LOCAL, 0, fetch=read(snapshot(first, old)))
    assert not toasts
    cur = fixture_at(0, now - timedelta(minutes=1))
    service.poll(LOCAL, 0, fetch=read(snapshot(now, old, cur, cur)))
    assert len(toasts) == 1 and toasts[0]["route"].endswith(cur["message_id"])
    edit = {**cur, "edited_at": now.isoformat(), "notes": "edited location note"}
    service.poll(LOCAL, 0, fetch=read(snapshot(now, edit, cur)))
    service.poll(LOCAL, 0, fetch=fetch_error)
    code, data = client.call("GET", "/api/live/phenomena?id=" + cur["message_id"])
    assert code == 200 and data["source"]["status"] == "offline"
    assert data["source"]["last_success_at"] == phenomena.timestamp(now.isoformat())
    assert [r["message_id"] for r in data["recent"]] == [cur["message_id"]]
    assert len(data["history"]) == 2 and data["selected"]["notes"] == edit["notes"]
    assert client.call("GET", "/api/live/reports")[1]["reports"] == []
    assert client.call("GET", "/api/live/phenomena", token=False)[0] == 401
    new = {**cur, "message_id": "1574893888588615793"}
    service.poll(LOCAL, 0, fetch=read(snapshot(now, cur, new)))
    assert len(toasts) == 1 and service.report(new["message_id"])["caught_up"]
    assert service.report(cur["message_id"])["reported_at"] == phenomena.timestamp(cur["reported_at"])


def test_client_preserves_cached_history_across_restart(tmp_path):
    now = datetime.now(timezone.utc) - timedelta(seconds=10)
    report = fixture_at(0, now)
    ctx = AppContext(str(tmp_path))
    ctx.live.phenomena.poll(LOCAL, 0, fetch=read(snapshot(now, report)))
    ctx.shutdown()
    restarted = AppContext(str(tmp_path))
    try:
        restarted.live.phenomena.poll(LOCAL, 0, fetch=fetch_error)
        data = restarted.live.phenomena.history()
        assert data["source"]["status"] == "offline"
        assert data["recent"][0]["message_id"] == report["message_id"]
    finally:
        restarted.shutdown()


def test_endpoint_validation_and_blocked_poll_shutdown(ctx, monkeypatch):
    with pytest.raises(ValueError):
        endpoint_url("http://192.168.1.2/v1/phenomena")
    with pytest.raises(ValueError):
        endpoint_url("https://name:secret@relay.example/v1/phenomena")
    assert endpoint_url("https://relay.example/v1/phenomena")
    start, finish = threading.Event(), threading.Event()
    service = ctx.live.phenomena
    original = service.poll
    failures = []
    now = datetime.now(timezone.utc)
    def blocked(*_args, **_kwargs):
        start.set()
        assert finish.wait(3)
        return JSONResponse(snapshot(now, fixture_at(0, now)))
    def poll(endpoint, generation):
        try:
            original(endpoint, generation, fetch=blocked)
        except Exception as exc:
            failures.append(exc)
    monkeypatch.setattr(service, "poll", poll)
    ctx.settings.update({"live.phenomena.endpoint": LOCAL})
    service.apply_settings()
    try:
        assert start.wait(1)
        ctx.shutdown(join_timeout=0.05)
    finally:
        finish.set()
        service._thread.join(2)
    assert not service._thread.is_alive() and not failures


def test_internal_endpoint_opt_in_and_legacy_override(ctx, client, monkeypatch):
    source_path = "/api/live/phenomena/source"
    default = "https://relay.example/v1/phenomena"
    service = ctx.live.phenomena
    polled = threading.Event()

    def poll(endpoint, generation):
        service.poll_result = endpoint
        polled.set()

    monkeypatch.setattr(service, "poll", poll)
    assert client.call("GET", source_path)[1]["status"] == "disabled"
    assert client.call("PATCH", "/api/settings", {"live.phenomena.enabled": True})[0] == 200
    service.apply_settings()
    assert client.call("GET", source_path)[1]["status"] == "unconfigured"
    assert service._thread is None

    # A maintainer-supplied default must be HTTPS, even though local overrides may use HTTP.
    monkeypatch.setattr(phenomena.config, "PHENOMENA_RELAY_URL", LOCAL)
    service.apply_settings()
    assert client.call("GET", source_path)[1]["status"] == "unconfigured"
    assert service._thread is None

    monkeypatch.setattr(phenomena.config, "PHENOMENA_RELAY_URL", default)
    client.call("PATCH", "/api/settings", {"live.phenomena.enabled": False})
    service.apply_settings()
    assert service._thread is None
    assert client.call("GET", source_path)[1] == {
        "enabled": False, "configured": True, "status": "disabled", "last_success_at": None,
    }
    client.call("PATCH", "/api/settings", {"live.phenomena.enabled": True})
    service.apply_settings()
    assert polled.wait(2) and service.poll_result == default

    polled.clear()
    client.call("PATCH", "/api/settings", {"live.phenomena.endpoint": LOCAL, "live.phenomena.enabled": None})
    service.apply_settings()
    assert polled.wait(2) and service.poll_result == LOCAL
    client.call("PATCH", "/api/settings", {"live.phenomena.enabled": False})
    service.apply_settings()
    assert client.call("GET", source_path)[1]["status"] == "disabled"
    assert ctx.settings.get("live.phenomena.endpoint") == LOCAL
    assert client.call("PATCH", "/api/settings", {"live.phenomena.enabled": "true"})[0] == 400


def test_stored_phenomenon_settings_do_not_start_relay_or_remove_history(ctx, client):
    now = datetime.now(timezone.utc) - timedelta(days=60)
    service = ctx.live.phenomena
    report = fixture_at(0, now)
    service.poll(LOCAL, 0, fetch=read(snapshot(now, report)))
    ctx.storage.execute("UPDATE reports SET received_at=? WHERE provider='discord-relay'", (now.isoformat(),))
    saved = {"live.phenomena.enabled": True, "live.phenomena.endpoint": LOCAL, "notify.phenomena": "both"}
    assert client.call("PATCH", "/api/settings", saved)[0] == 200
    ctx.live.apply_settings()
    ctx.live.prune()
    assert service._thread is None
    assert all(ctx.settings.get(key) == value for key, value in saved.items())
    assert service.report(report["message_id"])["reported_at"] == phenomena.timestamp(report["reported_at"])
    assert client.call("GET", f'/api/live/phenomena/{report["message_id"]}/image')[0] == 404


def test_batch04_reference_and_conservative_relay_matching(ctx, client):
    from companion.phenomenon_reference import match_area, relay_location
    from test_community import observation

    service = ctx.live.phenomena
    community = ctx.live.community
    ctx.settings.update({"live.community.enabled": True})
    code, reference = client.call("GET", "/api/live/phenomena/reference")
    assert code == 200
    assert {entry["area"]["id"] for entry in reference["entries"] if entry["evidence"] == "catalog"} == {
        "unova:324", "unova:325"}
    assert match_area(ctx.dex, "unova", "Cueva Manantial") == {"status": "ambiguous"}
    assert match_area(ctx.dex, "unova", "泉源洞穴（B1F）")["id"] == "unova:325"
    assert match_area(ctx.dex, "unova", "Ruta 3")["id"] == "unova:321"
    assert match_area(ctx.dex, "unova", "三草")["id"] == "unova:321"
    assert match_area(ctx.dex, "unova", "１１水")["id"] == "unova:365"

    now = datetime.now(timezone.utc)
    raw = fixture_at(0, now - timedelta(seconds=30))
    assert relay_location(ctx.dex, {**raw, "notes": "Across the bridge"})["spot_id"] is None
    service.poll(LOCAL, 0, fetch=read(snapshot(now, raw)))
    payload = dict(kind="phenomena", region="unova", location_id="unova:255", species_id=None,
                   phenomenon_type="grass", provenance="relayed")
    exact = community.submit(observation(ctx, **payload, spot_id="village-bridge-southwest"))
    area = community.submit(observation(ctx, **payload))
    distant = community.submit(observation(ctx, **payload, spot_id="village-bridge-southwest",
                                            observed_at=(now - timedelta(minutes=10)).isoformat()))
    history = service.history()
    assert history["links"] == {raw["message_id"]: [exact["id"]]}
    assert {r["id"] for r in history["observations"]} == {area["id"], distant["id"], exact["id"]}
    assert history["recent"][0]["received_at"] and history["recent"][0]["caught_up"]
    assert exact["status"]["ends_at"] is None
    assert community.act(exact["id"], "complete")["updated"]
    assert community.act(area["id"], "not_found")["updated"]
    assert service.history()["links"] == history["links"]

    ambiguous = {**raw, "message_id": str(int(raw["message_id"]) + 1)}
    service.poll(LOCAL, 0, fetch=read(snapshot(now, raw, ambiguous)))
    assert service.history()["links"] == {}
    service.poll(LOCAL, 0, fetch=read(snapshot(now, raw, {**ambiguous, "notes": "Other spot", "edited_at": now.isoformat()})))
    assert service.history()["links"] == history["links"]
    service.poll(LOCAL, 0, fetch=read(snapshot(now, raw, ambiguous)))
    assert service.history()["links"] == history["links"]

    corrected = community.submit(observation(ctx, **payload), correction=exact["id"])
    assert service.history()["links"] == {}
    assert community.act(corrected["id"], "withdraw")["updated"]
    with pytest.raises(ValueError, match="choose_phenomenon_spot"):
        community.submit(observation(ctx, **payload, spot_id="route-1-west-middle"))

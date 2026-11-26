"""Independent profiles and a standalone HTTP relay, using only synthetic data."""

import json
import statistics
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from companion.app import AppContext
from companion.community_protocol import CommunityError, MAX_REQUEST
from companion.services.community_sync import TestConnection as Connection
from companion.storage import utcnow
from relay.community import TestRelay as Relay

READ = "synthetic-read-" + "r" * 32
WRITERS = {"alice": "synthetic-alice-" + "a" * 32, "bob": "synthetic-bob-" + "b" * 32}


class SharedLab:
    def __init__(self, root):
        self.root = root
        self.profiles = []
        self.alice = self.profile("alice")
        self.server = None
        self.start()
        self.bob = self.profile("bob")

    def start(self):
        self.server = Relay(self.root / "relay.sqlite3", self.alice.dex, READ, WRITERS)
        self.worker = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True)
        self.worker.start()
        for profile, actor in self.profiles:
            self.connect(profile, actor)

    def stop(self):
        if self.server:
            self.server.shutdown()
            self.worker.join()
            self.server.server_close()
            self.server = None

    def connect(self, ctx, actor):
        ctx.live.community.sync.config = Connection(self.server.server_port, READ, actor, WRITERS.get(actor, ""))

    def profile(self, actor, path=None):
        ctx = AppContext(str(self.root / (path or actor)))
        self.profiles.append((ctx, actor))
        ctx.settings.update({"live.community.enabled": True, "live.community.receive": True,
                             "live.community.share": bool(WRITERS.get(actor))})
        if getattr(self, "server", None):
            self.connect(ctx, actor)
        return ctx

    def close_profile(self, ctx):
        self.profiles = [(profile, actor) for profile, actor in self.profiles if profile is not ctx]
        ctx.shutdown()

    def close(self):
        for ctx, _ in self.profiles:
            ctx.shutdown()
        self.stop()


@pytest.fixture
def lab(tmp_path):
    instance = SharedLab(tmp_path)
    try:
        yield instance
    finally:
        instance.close()


def obs(ctx, **change):
    location = next(row["id"] for row in ctx.dex.locations()
                    if row["region"] == "kanto" and row["name"] == "Route 1")
    return {"observation_id": uuid4().hex, "kind": "alpha", "species_id": 25, "region": "kanto",
            "location_id": location, "observed_at": utcnow(), "onset": "already_active",
            "provenance": "firsthand", "share": True, **change}


def boot(*profiles):
    for ctx in profiles:
        sync = ctx.live.community.sync
        for _ in range(5):
            sync.poll()
            if sync.connection == "connected":
                break
        assert sync.connection == "connected"


def feed(ctx):
    return ctx.live.community.sync.config.request("/v1/feed?after=0")


def alarms(ctx, monkeypatch):
    calls = []
    deliver = ctx.live.deliver
    monkeypatch.setattr(ctx.live, "deliver", lambda report: calls.append(report["id"]) or deliver(report))
    return calls


def test_credentials_and_ownership_are_separate(lab):
    a, b = lab.alice, lab.bob
    boot(a, b)
    writer = a.live.community.sync.config
    service = lab.server.journal.id
    with pytest.raises(CommunityError) as denied:
        writer.request("/v1/reports", payload=obs(a), service="0" * 32)
    assert denied.value.status == 409
    reader_only = Connection(writer.port, READ, "alice", READ)
    with pytest.raises(CommunityError) as denied:
        reader_only.request("/v1/reports", payload=obs(a), service=service)
    assert denied.value.status == 403
    with pytest.raises(CommunityError) as denied:
        Connection(writer.port, WRITERS["alice"]).request("/v1/feed?after=0")
    assert denied.value.status == 403
    viewer = lab.profile("reader")
    boot(viewer)
    assert not viewer.live.community.source_status()["can_share"]
    viewer.settings.update({"live.community.share": True})
    with pytest.raises(CommunityError, match="share_denied"):
        viewer.live.community.submit(obs(viewer))
    assert not viewer.live.list()
    data = obs(a)
    original = a.live.community.submit(data)
    assert original["is_own"] and original["publication"]["state"] == "shared"
    boot(b)
    remote, = b.live.list()
    assert not remote["is_own"] and remote["community"]["contributor"] == "alice"
    assert b.live.current()["current"][0]["own_report_id"] is None
    for action in ("withdraw", "correct"):
        with pytest.raises(CommunityError, match="own_only"):
            if action == "withdraw":
                b.live.community.act(remote["id"], "withdraw")
            else:
                b.live.community.submit(obs(b), correction=remote["id"])
        with pytest.raises(CommunityError, match="own_only") as denied:
            b.live.community.sync.config.request(f"/v1/reports/{remote['message_id']}/{action}",
                                                payload={} if action == "withdraw" else obs(b), service=service)
        assert denied.value.status == 403
    assert feed(a)["head"] == 1


@pytest.mark.parametrize("alphabet_first", [True, False])
def test_either_source_arrives_first_without_extending_or_realerting(lab, monkeypatch, alphabet_first):
    a, b = lab.alice, lab.bob
    boot(a, b)
    called = alarms(b, monkeypatch)
    t = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(minutes=3)
    first, second = t, t + timedelta(minutes=2)

    def alpha(at):
        return b.live.ingest({"id": "ntfy-example", "topic": "alphapings", "time": int(at.timestamp()),
                             "title": "Pikachu", "message": "Kanto, Route 1"})

    def share(at):
        a.live.community.submit(obs(a, observed_at=at.isoformat(), provenance="relayed"))
        boot(b)
        return next(r for r in b.live.list() if r["provider"].startswith("companion-shared:"))

    start = alpha(first) if alphabet_first else share(first)
    end = share(second) if alphabet_first else alpha(second)
    card, = b.live.current()["current"]
    assert card["duplicates"] == 1 and set(card["sources"]) == {"ntfy", "companion-shared"}
    assert start["event_id"] == end["event_id"] and start["status"]["ends_at"] == card["status"]["ends_at"]
    assert called == [start["id"]]
    assert len(b.live.list()) == 2 and not card["local_feedback"]


def test_lost_response_retry_and_no_upload_of_existing_local_history(lab, monkeypatch):
    a, b = lab.alice, lab.bob
    a.live.community.submit(obs(a, share=False, details="Earlier local report"))
    boot(a, b)
    assert feed(a)["head"] == 0
    send = Connection.request
    responses = []

    def lose_once(connection, path, **kwargs):
        result = send(connection, path, **kwargs)
        if path == "/v1/reports" and not responses:
            responses.append(result)
            raise ConnectionError("synthetic lost response")
        return result

    monkeypatch.setattr(Connection, "request", lose_once)
    data = obs(a, details="Explicit report")
    failed = a.live.community.submit(data)
    assert failed["publication"]["state"] == "failed"
    assert feed(a)["head"] == 1
    boot(b)
    assert len(b.live.list()) == 1

    # Retrying the ordinary local save is not a new explicit sharing request.
    assert a.live.community.submit({**data, "share": False})["publication"]["state"] == "failed"
    shared = a.live.community.retry_share(failed["id"])
    assert shared["publication"]["state"] == "shared" and feed(a)["head"] == 1
    boot(a)
    assert len(a.live.list()) == 2 and all(r["is_own"] for r in a.live.list())

    # A second lost response is recoverable by pulling the existing acknowledgment.
    responses.clear()
    pending = a.live.community.submit(obs(a, kind="swarm"))
    assert pending["publication"]["state"] == "failed"
    boot(a)
    assert a.live.get(pending["id"])["publication"]["state"] == "shared"
    assert len(a.live.list()) == 3 and feed(a)["head"] == 2


def test_offline_correction_withdrawal_and_restart_do_not_restore_obsolete_revisions(lab, monkeypatch):
    a, b = lab.alice, lab.bob
    boot(a, b)
    calls = alarms(b, monkeypatch)
    first = a.live.community.submit(obs(a, kind="swarm", details="Initial observation"))
    boot(b)
    card, = b.live.current()["current"]
    first_end = card["status"]["ends_at"]
    lab.stop()
    for ctx in (a, b):
        ctx.live.community.sync.poll()
        assert ctx.live.community.source_status()["connection"] == "disconnected"
    a.live.community.submit(obs(a, share=False, species_id=4, details="Offline local observation"))
    updated = a.live.community.submit(obs(a, kind="swarm", details="Corrected observation"), correction=first["id"])
    assert updated["publication"]["state"] == "failed"
    lab.close_profile(a)
    lab.close_profile(b)
    lab.alice = a = lab.profile("alice")
    lab.bob = b = lab.profile("bob")
    calls = alarms(b, monkeypatch)
    lab.start()
    boot(a, b)
    assert feed(a)["head"] == 1
    assert b.live.current()["current"][0]["status"]["ends_at"] == first_end
    assert a.live.community.retry_share(updated["id"])["publication"]["state"] == "shared"
    boot(b)
    old, new = sorted(b.live.list(), key=lambda r: r["body"], reverse=True)
    assert old["withdrawn_at"] and not new["withdrawn_at"]
    assert new["community"]["corrects"] == old["id"] and new["source_time"] == old["source_time"]
    a.live.community.act(updated["id"], "withdraw")
    boot(b)
    assert not b.live.current()["current"]
    assert all(r["withdrawn_at"] for r in b.live.list())
    lab.stop()
    lab.start()
    boot(b)
    assert len(b.live.list()) == 2 and not b.live.current()["current"] and not calls


def test_simultaneous_observations_and_private_completion(lab, monkeypatch):
    a, b = lab.alice, lab.bob
    viewer = lab.profile("reader")
    boot(a, b, viewer)
    data = obs(a)
    with ThreadPoolExecutor(max_workers=2) as workers:
        own = list(workers.map(lambda ctx: ctx.live.community.submit(data), [a, b]))
    assert {r["publication"]["contributor"] for r in own} == {"alice", "bob"}
    called = alarms(viewer, monkeypatch)
    boot(viewer, a, b)
    assert len(viewer.live.list()) == 2 and len(called) == 1
    assert {r["community"]["contributor"] for r in viewer.live.list()} == {"alice", "bob"}
    card, = viewer.live.current()["current"]
    viewer.live.community.act(card["id"], "not_found")
    viewer.live.community.act(card["id"], "complete")
    assert viewer.live.current()["current"][0]["status"]["state"] == "recent"
    assert not a.live.current()["current"][0]["local_feedback"] and feed(a)["head"] == 2


def test_bounded_payload_and_stale_or_expired_observations(lab, monkeypatch):
    a, b = lab.alice, lab.bob
    boot(a)
    config = a.live.community.sync.config
    for data, status in ((obs(a, details="x" * MAX_REQUEST), 413), (obs(a, species_id=False), 400)):
        with pytest.raises(CommunityError) as failed:
            config.request("/v1/reports", payload=data, service=lab.server.journal.id)
        assert failed.value.status == status
    stale = (datetime.now(timezone.utc) - timedelta(minutes=11)).isoformat()
    failed = a.live.community.submit(obs(a, observed_at=stale))
    assert failed["publication"]["error"] == "community.stale_share" and feed(a)["head"] == 0
    a.live.community.submit(obs(a))
    called = alarms(b, monkeypatch)
    boot(b)
    cached, = b.live.list()
    assert cached["is_replay"] and not called
    assert not b.live.current(now=datetime.now(timezone.utc) + timedelta(hours=3))["current"]


def test_feed_does_not_confirm_conflicting_retry_from_same_contributor(lab):
    a, b = lab.alice, lab.bob
    another_alice = lab.profile("alice", path="second-alice")
    boot(a, b, another_alice)
    data = obs(a, details="First submitted observation")
    a.live.community.submit(data)
    local = another_alice.live.community.submit({**data, "details": "Conflicting observation"})
    assert local["publication"]["error"] == "community.id_conflict"
    boot(another_alice, b)
    local = another_alice.live.get(local["id"])
    assert local["publication"]["state"] == "failed"
    assert {r["body"] for r in another_alice.live.list()} == {"First submitted observation", "Conflicting observation"}
    assert len(b.live.list()) == 1 and feed(a)["head"] == 1


def test_background_delivery_latency_and_phenomena(lab):
    a, b = lab.alice, lab.bob
    boot(a, b)
    b.live.community.sync.apply_settings()
    samples = []
    for i, kind in enumerate(("alpha", "swarm", "phenomena") * 3):
        details = f"Synthetic latency sample {i}"
        fields = dict(kind=kind, details=details)
        if kind == "phenomena":
            fields.update(species_id=None, phenomenon_type="grass")
        started = time.monotonic()
        result = a.live.community.submit(obs(a, **fields))
        assert result["publication"]["state"] == "shared"
        deadline = started + 5
        while time.monotonic() < deadline:
            row = b.storage.query_one("SELECT received_at FROM reports WHERE body=?", (details,))
            if row:
                samples.append((time.monotonic() - started) * 1000)
                break
            time.sleep(0.015)
        else:
            pytest.fail(f"Background delivery timed out for sample {i}")
    phenomena = b.live.community.phenomena()
    assert len(phenomena) == 3 and all(r["status"]["ends_at"] is None for r in phenomena)
    assert not b.live.phenomena.history()["history"]
    print(f"Loopback submit-to-receiver storage, n={len(samples)}: min={min(samples):.1f} ms, "
          f"median={statistics.median(samples):.1f} ms, max={max(samples):.1f} ms.")


def test_documented_phenomenon_spot_crosses_shared_feed_and_correction(lab):
    from test_phenomena import LOCAL, fixture_at, read, snapshot

    a, b = lab.alice, lab.bob
    boot(a, b)
    now = datetime.now(timezone.utc)
    relay = b.live.phenomena
    callout = fixture_at(0, now - timedelta(seconds=15))
    relay.poll(LOCAL, 0, fetch=read(snapshot(now, callout)))
    payload = {"kind": "phenomena", "region": "unova", "species_id": None,
               "location_id": "unova:255", "phenomenon_type": "grass", "provenance": "relayed"}
    original = a.live.community.submit(obs(a, **payload, spot_id="village-bridge-southwest"))
    boot(b)
    remote, = b.live.community.phenomena()
    assert not remote["is_replay"]
    assert remote["community"]["spot_id"] == "village-bridge-southwest"
    assert relay.history()["links"] == {callout["message_id"]: [remote["id"]]}
    assert b.live.community.act(remote["id"], "complete")["updated"]
    assert not a.live.get(original["id"])["local_feedback"]
    assert feed(a)["head"] == 1

    corrected = a.live.community.submit(obs(a, **payload), correction=original["id"])
    boot(b)
    assert relay.history()["links"] == {}
    a.live.community.act(corrected["id"], "withdraw")
    boot(b)
    assert all(r["withdrawn_at"] for r in b.live.community.phenomena())
    assert relay.history()["links"] == {}


def test_legacy_relay_echoes_area_only_without_duplicating_owner_report(lab, monkeypatch):
    import relay.community as relay
    from companion.services.community_sync import _matches_observation

    wire = relay.wire_observation

    def v1_area_only(fields):
        data = wire(fields)
        data.pop("spot_id", None)
        return data

    monkeypatch.setattr(relay, "wire_observation", v1_area_only)
    a, b = lab.alice, lab.bob
    boot(a, b)
    data = obs(a, kind="phenomena", region="unova", location_id="unova:255", species_id=None,
               phenomenon_type="grass", spot_id="village-bridge-southwest")
    saved = a.live.community.submit(data)
    assert saved["publication"]["state"] == "shared"
    boot(a, b)
    assert len(a.live.community.phenomena()) == 1
    assert a.live.get(saved["id"])["community"]["spot_id"] == data["spot_id"]
    assert "spot_id" not in b.live.community.phenomena()[0]["community"]
    assert not _matches_observation({"spot_id": "wrong"}, {"spot_id": data["spot_id"]})
    a.live.community.act(saved["id"], "withdraw")
    boot(b)
    assert b.live.community.phenomena()[0]["withdrawn_at"]

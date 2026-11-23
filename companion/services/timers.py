"""Tools › Timers: your own named countdown timers. They have nothing to do with Live's spawn estimates.

Time keeping
  * While the Companion runs, a background thread measures elapsed time with CLOCK_BOOTTIME on Linux
    (counts through suspend, unaffected by wall-clock changes) — falling back to time.monotonic() elsewhere.
  * Every state change also stores the wall-clock end time (`ends_at`, Unix seconds) in the database, so
    timers survive closing the app, a restart or a reboot: on the next start the remaining time is
    ends_at − now. A timer that ran out while the Companion was closed is shown as "finished while closed"
    and notified once, late, at the next start.
  * Suspend / sleep: the boot clock keeps counting, so a timer that expires during sleep fires once on wake
    (marked late). A repeating timer skips the periods it slept through and fires once, not once per period.
  * Paused timers store the remaining time and never move.
The page does not need to stay open: completion is detected here, in the backend, and delivered through the
same toast / OS-notification routes as Live reports (Do-not-disturb respected). Each completion has an
event id; it is delivered at most once, and only one open window plays the sound (first to claim it).
"""
from __future__ import annotations

import threading
import time
import uuid

from ..storage import utcnow

KIND = "timer"
MAX_TIMERS = 50
MAX_SECONDS = 99 * 3600 + 59 * 60 + 59
PRESETS = [("5 min", 300), ("15 min", 900), ("30 min", 1800), ("1 h", 3600)]


def _boot_clock():
    try:
        clk = time.CLOCK_BOOTTIME  # type: ignore[attr-defined]
        time.clock_gettime(clk)
        return lambda: time.clock_gettime(clk), "boottime"
    except (AttributeError, OSError):
        return time.monotonic, "monotonic"


class TimerError(Exception):
    pass


class TimerService:
    def __init__(self, store, settings, bus=None, notifier=None, wall=time.time, clock=None):
        self.store, self.settings, self.bus, self.notifier = store, settings, bus, notifier
        self.wall = wall
        if clock is None:
            self.clock, self.clock_name = _boot_clock()
        else:
            self.clock, self.clock_name = clock, "injected"
        self.toast_backend = None  # set by the native shell
        self._lock = threading.RLock()
        self._anchor: dict[str, tuple[float, float]] = {}   # id -> (clock at anchor, remaining at anchor)
        self._claims: dict[str, float] = {}
        self._delivered: set[str] = set()
        self.timers: dict[str, dict] = {}
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.load()

    # ---------------------------------------------------------- persistence
    def load(self) -> None:
        with self._lock:
            self.timers = {}
            for doc in self.store.list_documents(KIND):
                t = (self.store.get_document(KIND, doc["id"]) or {}).get("data")
                if isinstance(t, dict) and t.get("id"):
                    self.timers[t["id"]] = t
                    if t.get("last_event"):
                        self._delivered.add(t["last_event"])
            now_wall, now_clk = self.wall(), self.clock()
            for t in self.timers.values():
                if t["state"] == "running":
                    self._anchor[t["id"]] = (now_clk, float(t["ends_at"]) - now_wall)

    def _save(self, t: dict) -> None:
        self.store.put_document(KIND, t["id"], t["name"], t)

    # ---------------------------------------------------------- queries
    def remaining(self, t: dict) -> float:
        if t["state"] == "running":
            a = self._anchor.get(t["id"])
            if a is None:
                return max(0.0, float(t["ends_at"]) - self.wall())
            return max(0.0, a[1] - (self.clock() - a[0]))
        if t["state"] == "done":
            return 0.0
        return float(t.get("remaining", t["duration"]))

    def view(self, t: dict) -> dict:
        rem = self.remaining(t)
        return {**t, "remaining": round(rem, 3), "progress": round(1 - rem / t["duration"], 4) if t["duration"] else 1}

    def list(self) -> dict:
        with self._lock:
            ts = sorted(self.timers.values(), key=lambda t: (t.get("order", 0), t["created_at"]))
            return {"timers": [self.view(t) for t in ts], "presets": [{"label": l, "seconds": s} for l, s in PRESETS],
                    "server_wall": self.wall(), "clock": self.clock_name}

    def get(self, tid: str) -> dict:
        t = self.timers.get(tid)
        if not t:
            raise TimerError("Timer not found")
        return t

    # ---------------------------------------------------------- mutations
    @staticmethod
    def _clean_name(name) -> str:
        n = " ".join(str(name or "").split())[:60]
        return n or "Timer"

    @staticmethod
    def _clean_duration(seconds) -> int:
        try:
            s = int(seconds)
        except (TypeError, ValueError):
            raise TimerError("Duration must be a whole number of seconds")
        if not 1 <= s <= MAX_SECONDS:
            raise TimerError("Duration must be between 1 second and 99:59:59")
        return s

    def create(self, name="", seconds=300, repeat=False, sound=True, notify=True, start=False) -> dict:
        with self._lock:
            if len(self.timers) >= MAX_TIMERS:
                raise TimerError(f"You can keep up to {MAX_TIMERS} timers")
            dur = self._clean_duration(seconds)
            t = {"id": uuid.uuid4().hex[:10], "name": self._clean_name(name), "duration": dur, "remaining": dur,
                 "repeat": bool(repeat), "sound": bool(sound), "notify": bool(notify), "state": "idle", "ends_at": None,
                 "created_at": utcnow(), "completed_at": None, "late_by": 0, "cycles": 0, "last_event": None,
                 "order": max([x.get("order", 0) for x in self.timers.values()] + [0]) + 1, "pinned": False}
            self.timers[t["id"]] = t
            if start:
                self._start(t)
            self._save(t)
            self._publish("changed", t)
            return self.view(t)

    def update(self, tid: str, **fields) -> dict:
        with self._lock:
            t = self.get(tid)
            if "name" in fields:
                t["name"] = self._clean_name(fields["name"])
            for k in ("repeat", "sound", "notify", "pinned"):
                if k in fields:
                    t[k] = bool(fields[k])
            if "order" in fields:
                t["order"] = int(fields["order"])
            if "seconds" in fields:
                dur = self._clean_duration(fields["seconds"])
                t["duration"] = dur
                if t["state"] in ("idle", "done"):
                    t.update(state="idle", remaining=dur)
                elif t["state"] == "paused":
                    t["remaining"] = min(t["remaining"], dur)
            self._save(t)
            self._publish("changed", t)
            return self.view(t)

    def _start(self, t: dict, remaining: float | None = None) -> None:
        rem = float(remaining if remaining is not None else (t["remaining"] if t["state"] == "paused" else t["duration"]))
        if rem <= 0:
            rem = float(t["duration"])
        self._anchor[t["id"]] = (self.clock(), rem)
        t.update(state="running", ends_at=self.wall() + rem, remaining=rem, completed_at=None, late_by=0)

    def action(self, tid: str, act: str) -> dict:
        with self._lock:
            t = self.get(tid)
            if act == "start":
                if t["state"] != "running":
                    self._start(t)
            elif act == "pause":
                if t["state"] == "running":
                    rem = self.remaining(t)
                    self._anchor.pop(tid, None)
                    t.update(state="paused", remaining=rem, ends_at=None)
            elif act == "resume":
                if t["state"] == "paused":
                    self._start(t, t["remaining"])
            elif act == "reset":
                self._anchor.pop(tid, None)
                t.update(state="idle", remaining=t["duration"], ends_at=None, completed_at=None, late_by=0)
            elif act == "duplicate":
                c = self.create(t["name"] + " (copy)", t["duration"], t["repeat"], t["sound"], t["notify"])
                return c
            else:
                raise TimerError("Unknown action")
            self._save(t)
            self._publish("changed", t)
            return self.view(t)

    def delete(self, tid: str) -> None:
        with self._lock:
            self.get(tid)
            self.timers.pop(tid, None)
            self._anchor.pop(tid, None)
            self.store.delete_document(KIND, tid)
            self._publish("deleted", {"id": tid})

    # ---------------------------------------------------------- completion
    def tick(self) -> list[dict]:
        """Check every running timer once. Returns the completions delivered (also used by tests)."""
        fired = []
        with self._lock:
            for t in list(self.timers.values()):
                if t["state"] != "running":
                    continue
                a = self._anchor.get(t["id"])
                if a is None:
                    self._anchor[t["id"]] = a = (self.clock(), float(t["ends_at"]) - self.wall())
                rem = a[1] - (self.clock() - a[0])
                if rem > 0:
                    continue
                late = -rem
                event = f"{t['id']}:{t['cycles'] + 1}"
                t["cycles"] += 1
                t["completed_at"] = utcnow()
                t["late_by"] = round(late, 1)
                if t["repeat"]:
                    skipped = int(late // t["duration"])
                    next_rem = t["duration"] - (late % t["duration"])
                    self._anchor[t["id"]] = (self.clock(), next_rem)
                    t.update(state="running", ends_at=self.wall() + next_rem, remaining=next_rem, skipped=skipped)
                else:
                    self._anchor.pop(t["id"], None)
                    t.update(state="done", remaining=0, ends_at=None)
                t["last_event"] = event
                self._save(t)
                if event not in self._delivered:
                    self._delivered.add(event)
                    fired.append(self._deliver(t, event, late))
                self._publish("changed", t)
        return fired

    def _deliver(self, t: dict, event: str, late: float) -> dict:
        quiet = bool(self.settings.get("notify.quiet"))
        route = self.settings.get("notify.timer") or "both"
        late_txt = f" (finished {int(late // 60)} min {int(late % 60)} s ago — the Companion was closed or asleep)" if late >= 5 else ""
        payload = {"id": t["id"], "kind": "timer", "title": f"Timer finished: {t['name']}", "line": (
            "Repeats — next round started." if t["repeat"] else "Your timer is up.") + late_txt,
                   "reported": utcnow(), "is_test": False, "species_icon": None, "event": event,
                   "route": "#/tools/timers", "open_label": "Open Timers", "meta": "Tools › Timers (your own timer)",
                   "sound": bool(t["sound"]) and not quiet,
                   "corner": self.settings.get("notify.toast_corner"), "duration": self.settings.get("notify.toast_duration"),
                   "opacity": self.settings.get("notify.toast_opacity"), "screen": self.settings.get("notify.toast_screen")}
        result = {"event": event, "timer": t["id"], "quiet": quiet, "route": route, "late_by": round(late, 1)}
        if self.bus:
            # Always tell open windows (they update the ring and, unless quiet, one of them plays the chime).
            self.bus.publish("timers.done", payload)
        if quiet or not t["notify"] or route == "off":
            result["suppressed"] = "Do not disturb" if quiet else "notifications off for this timer"
            return result
        if route in ("toast", "both"):
            if self.toast_backend:
                try:
                    result["toast"] = bool(self.toast_backend(payload))
                except Exception:  # pragma: no cover
                    result["toast"] = False
            elif self.bus:
                self.bus.publish("toast", payload)
                result["toast"] = "in-window"
        if route in ("os", "both") and self.notifier:
            result["os"] = self.notifier.notify(payload["title"], payload["line"])
        return result

    def claim_sound(self, event: str) -> bool:
        """The first window to ask for an event plays the chime; every later window is told not to."""
        with self._lock:
            now = time.monotonic()
            for k in [k for k, v in self._claims.items() if now - v > 600]:
                self._claims.pop(k, None)
            if event in self._claims:
                return False
            self._claims[event] = now
            return True

    def _publish(self, what: str, t: dict) -> None:
        if self.bus:
            self.bus.publish("timers", {"what": what, "id": t["id"]})

    # ---------------------------------------------------------- thread
    def start(self, interval: float = 0.25) -> None:
        if self._thread:
            return

        def loop():
            while not self._stop.wait(interval):
                try:
                    self.tick()
                except Exception:  # pragma: no cover - keep the loop alive
                    pass
        self._thread = threading.Thread(target=loop, name="timers", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

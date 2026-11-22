"""In-process publish/subscribe used to keep the main window and popouts in sync.

Every window subscribes over Server-Sent Events; any state change (a guide
checkbox, a setting, a new report) is broadcast so all surfaces re-read the
single source of truth held by the backend.
"""
from __future__ import annotations

import itertools
import queue
import threading
from typing import Any


class EventBus:
    def __init__(self, max_queue: int = 500):
        self._subs: dict[int, queue.Queue] = {}
        self._lock = threading.Lock()
        self._ids = itertools.count(1)
        self._max = max_queue
        self._seq = itertools.count(1)

    def subscribe(self) -> tuple[int, queue.Queue]:
        q: queue.Queue = queue.Queue(maxsize=self._max)
        with self._lock:
            sid = next(self._ids)
            self._subs[sid] = q
        return sid, q

    def unsubscribe(self, sid: int) -> None:
        with self._lock:
            self._subs.pop(sid, None)

    def publish(self, topic: str, data: Any = None, origin: str | None = None) -> None:
        event = {"seq": next(self._seq), "topic": topic, "data": data, "origin": origin}
        with self._lock:
            subs = list(self._subs.values())
        for q in subs:
            try:
                q.put_nowait(event)
            except queue.Full:  # slow consumer: drop oldest, keep newest
                try:
                    q.get_nowait()
                    q.put_nowait(event)
                except queue.Empty:
                    pass

    @property
    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subs)

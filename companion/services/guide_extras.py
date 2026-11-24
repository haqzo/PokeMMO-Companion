"""Things attached to a guide without changing the guide itself: timer templates and a linked team.

Stored in the documents table (kind "guide_extras"), one record per guide key:
  "cg:<custom guide id>"            — one of My Guides
  "story:<run id>:<region>"         — a character run's storyline guide for one region
Data:
  {"timers": [template, ...],                 # timers for the whole guide
   "step_timers": {"<step id>": [template]},   # timers shown on one step
   "team_id": "<saved team id>" | null}        # a saved team (documents kind "team"), shared by id, never copied
A template is only a recipe (name, duration, repeat, sound, notification). The running timer lives in TimerService
with an owner {guide, step, run, cycle, template}, so the same template in another run or cycle is a separate timer.
Templates never start by themselves, and finishing a timer never ticks a step.
"""
from __future__ import annotations

import re
import uuid

from ..storage import utcnow

KIND = "guide_extras"
KEY_RE = re.compile(r"^(cg:[A-Za-z0-9_-]{1,40}|story:[A-Za-z0-9_-]{1,40}:(kanto|johto|hoenn|sinnoh|unova))$")
MAX_TEMPLATES = 40
MAX_SECONDS = 99 * 3600 + 59 * 60 + 59


class GuideExtrasError(Exception):
    pass


def _template(t) -> dict:
    if not isinstance(t, dict):
        raise GuideExtrasError("Invalid timer")
    try:
        secs = int(t.get("seconds"))
    except (TypeError, ValueError):
        raise GuideExtrasError("Timer duration must be a whole number of seconds")
    if not 1 <= secs <= MAX_SECONDS:
        raise GuideExtrasError("Timer duration must be between 1 second and 99:59:59")
    name = " ".join(str(t.get("name") or "").split())[:60] or "Timer"
    tid = str(t.get("id") or uuid.uuid4().hex[:8])
    if not re.match(r"^[A-Za-z0-9_-]{1,24}$", tid):
        raise GuideExtrasError("Invalid timer id")
    return {"id": tid, "name": name, "seconds": secs, "repeat": bool(t.get("repeat")),
            "sound": bool(t.get("sound", True)), "notify": bool(t.get("notify", True))}


class GuideExtras:
    def __init__(self, storage):
        self.store = storage

    @staticmethod
    def check_key(key: str) -> str:
        if not KEY_RE.match(key or ""):
            raise GuideExtrasError("Unknown guide")
        return key

    def get(self, key: str) -> dict:
        self.check_key(key)
        doc = self.store.get_document(KIND, key)
        data = (doc or {}).get("data") or {}
        out = {"key": key, "timers": data.get("timers", []), "step_timers": data.get("step_timers", {}), "team_id": data.get("team_id")}
        team = self.store.get_document("team", out["team_id"]) if out["team_id"] else None
        out["team"] = team and {"id": team["id"], "name": team["name"], "data": team["data"], "updated_at": team["updated_at"]}
        out["team_missing"] = bool(out["team_id"] and not team)
        return out

    def put(self, key: str, body: dict) -> dict:
        self.check_key(key)
        cur = self.get(key)
        timers = cur["timers"]
        step_timers = cur["step_timers"]
        team_id = cur["team_id"]
        if "timers" in body:
            if not isinstance(body["timers"], list) or len(body["timers"]) > MAX_TEMPLATES:
                raise GuideExtrasError("Too many timers")
            timers = [_template(t) for t in body["timers"]]
        if "step_timers" in body:
            st = body["step_timers"]
            if not isinstance(st, dict) or len(st) > 500:
                raise GuideExtrasError("Invalid step timers")
            step_timers = {}
            for k, v in st.items():
                if not isinstance(k, str) or len(k) > 120 or not isinstance(v, list) or len(v) > 10:
                    raise GuideExtrasError("Invalid step timers")
                if v:
                    step_timers[k] = [_template(t) for t in v]
        if "team_id" in body:
            team_id = body["team_id"] or None
            if team_id is not None and (not isinstance(team_id, str) or not self.store.get_document("team", team_id)):
                raise GuideExtrasError("That team does not exist")
        ids = [t["id"] for t in timers] + [t["id"] for v in step_timers.values() for t in v]
        if len(ids) != len(set(ids)):
            raise GuideExtrasError("Duplicate timer id")
        self.store.put_document(KIND, key, key, {"timers": timers, "step_timers": step_timers, "team_id": team_id, "updated_at": utcnow()})
        return self.get(key)

    def guides_using_team(self, team_id: str) -> list[str]:
        return [d["id"] for d in self.store.list_documents(KIND) if (d["data"] or {}).get("team_id") == team_id]

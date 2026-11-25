"""HTTP routes for region-map artwork (extracted locally from your own ROMs), map layouts and Tools › Timers."""
from __future__ import annotations

from .services.region_maps import REGIONS, RegionMapError
from .services.timers import TimerError
from .services.guide_extras import GuideExtrasError


def register(r, ctx, ApiError, Request) -> None:
    add = r.add

    def guard(fn):
        def run(req):
            try:
                return fn(req)
            except RegionMapError as exc:
                raise ApiError(400, str(exc))
            except (TimerError, GuideExtrasError) as exc:
                raise ApiError(400, str(exc))
        return run

    def region_of(req) -> str:
        reg = req.params["region"]
        if reg not in REGIONS:
            raise ApiError(404, "Unknown region")
        return reg

    def known_locations(region: str) -> set[str]:
        return {l["id"] for l in ctx.dex.locations() if l["region"] == region} if ctx.dex.imported else set()

    # ------------------------------------------------------------ built-in maps (always available, offline)
    def builtin(req):
        import json as _json
        from .config import BUNDLED_DATA_DIR
        doc = _json.loads((BUNDLED_DATA_DIR / "maps" / "geometry.json").read_text(encoding="utf-8"))
        for m in doc["maps"]:
            m["url"] = f"/assets/builtin-maps/{m['file']}?v={m['sha256'][:10]}"
        return doc
    add("GET", "/api/maps/builtin", builtin)

    # ------------------------------------------------------------ developer: ROM artwork extraction (not used by the viewer)
    add("GET", "/api/maps", guard(lambda req: ctx.region_maps.status()))

    def identify(req):
        path = str((req.body or {}).get("path") or "").strip()
        if not path:
            raise ApiError(400, "Type or choose a ROM file or the folder that holds your ROMs")
        from pathlib import Path
        p = Path(path).expanduser()
        if p.is_dir():
            return {"folder": str(p), "files": ctx.region_maps.scan_folder(str(p))}
        from .services.region_maps import identify as ident
        return {"files": [{**ident(p), "path": str(p)}]}
    add("POST", "/api/maps/identify", guard(identify))

    def start(req):
        path = str((req.body or {}).get("path") or "").strip()
        if not path:
            raise ApiError(400, "Choose a ROM file")
        return {"job": ctx.region_maps.start_import(path)}
    add("POST", "/api/maps/import", guard(start))

    def job(req):
        j = ctx.region_maps.jobs.get(req.params["jid"])
        if not j:
            raise ApiError(404, "Unknown job")
        return j
    add("GET", "/api/maps/jobs/<jid>", job)

    def accept(req):
        reg = region_of(req)
        out = ctx.region_maps.accept(reg)
        ctx.bus.publish("maps", {"region": reg, "state": "installed"})
        return out
    add("POST", "/api/maps/<region>/accept", guard(accept))

    def reject(req):
        reg = region_of(req)
        ctx.region_maps.reject(reg)
        ctx.bus.publish("maps", {"region": reg, "state": "rejected"})
        return {"ok": True}
    add("POST", "/api/maps/<region>/reject", guard(reject))

    def remove(req):
        reg = region_of(req)
        ctx.region_maps.remove(reg)
        ctx.bus.publish("maps", {"region": reg, "state": "removed"})
        return {"ok": True}
    add("DELETE", "/api/maps/<region>", guard(remove))

    # ------------------------------------------------------------ layouts
    def layout_get(req):
        reg = region_of(req)
        lay = ctx.region_maps.layout(reg)
        known = known_locations(reg)
        for m in lay.get("marks", []):
            m["unmatched"] = bool(m.get("location_id") and known and m["location_id"] not in known)
        return {"layout": lay, "draft": ctx.region_maps.draft(reg)}
    add("GET", "/api/maps/<region>/layout", guard(layout_get))

    def layout_put(req):
        reg = region_of(req)
        out = ctx.region_maps.save_layout(reg, req.body or {}, known_locations(reg))
        ctx.region_maps.clear_draft(reg)
        ctx.bus.publish("maps", {"region": reg, "state": "layout"})
        return out
    add("PUT", "/api/maps/<region>/layout", guard(layout_put))

    def layout_check(req):
        """Validate an imported layout file without saving it."""
        reg = region_of(req)
        clean, problems = ctx.region_maps.validate_layout(reg, req.body or {}, known_locations(reg))
        return {"layout": clean, "problems": problems}
    add("POST", "/api/maps/<region>/layout/check", guard(layout_check))

    def draft_put(req):
        reg = region_of(req)
        ctx.region_maps.save_draft(reg, req.body or {})
        return {"ok": True}
    add("PUT", "/api/maps/<region>/draft", guard(draft_put))

    def draft_del(req):
        ctx.region_maps.clear_draft(region_of(req))
        return {"ok": True}
    add("DELETE", "/api/maps/<region>/draft", guard(draft_del))

    # ------------------------------------------------------------ timers
    def timers_list(req):
        ctx.timers.tick()  # also reconciles when no background thread runs (tests, browser self-check)
        return ctx.timers.list(req.q("guide") or None)
    add("GET", "/api/timers", guard(timers_list))

    def timers_create(req):
        b = req.body or {}
        return ctx.timers.create(b.get("name", ""), b.get("seconds", 300), b.get("repeat", False), b.get("sound", True),
                                 b.get("notify", True), b.get("start", False), b.get("owner"))
    add("POST", "/api/timers", guard(timers_create))

    add("GET", "/api/timers/presets", guard(lambda req: {"presets": ctx.timers.presets()}))

    def preset_save(req):
        b = req.body or {}
        return ctx.timers.save_preset(b.get("label", ""), b.get("seconds", 300), b.get("repeat", False), b.get("sound", True),
                                      b.get("notify", True), req.params.get("pid"))
    add("POST", "/api/timers/presets", guard(preset_save))
    add("PUT", "/api/timers/presets/<pid>", guard(preset_save))
    add("DELETE", "/api/timers/presets/<pid>", guard(lambda req: {"ok": ctx.timers.delete_preset(req.params["pid"])}))

    def timer_owner(req):
        return ctx.timers.attach(req.params["tid"], (req.body or {}).get("owner"))
    add("PUT", "/api/timers/<tid>/owner", guard(timer_owner))
    add("POST", "/api/timers/cleanup", guard(lambda req: {"removed": ctx.timers.cleanup_finished(
        str((req.body or {}).get("guide") or ""), (req.body or {}).get("keep_cycle"))}))

    add("GET", "/api/dex/moves", lambda req: {"moves": [{"name": m["name"], "type": m.get("type"), "category": m.get("category"),
                                                         "power": m.get("power")} for m in ctx.dex.skills()]})

    def cg_cycle(req):
        """The active cycle of one of My Guides (created when missing), so a guide timer can belong to it."""
        gid = req.params["gid"]
        ctx.cguides.get(gid)
        return ctx.cguides.active_cycle(gid, create=True)
    add("POST", "/api/cguides/<gid>/cycle", cg_cycle)

    # ------------------------------------------------------------ guide extras (timers + team attached to a guide)
    from urllib.parse import unquote   # the router does not decode path segments ("cg%3A…" from encodeURIComponent)

    def extras_get(req):
        return ctx.guide_extras.get(unquote(req.params["key"]))
    add("GET", "/api/guide-extras/<key>", guard(extras_get))

    def extras_put(req):
        key = unquote(req.params["key"])
        out = ctx.guide_extras.put(key, req.body or {})
        ctx.bus.publish("guide_extras", {"key": key}, origin=req.q("origin"))
        return out
    add("PUT", "/api/guide-extras/<key>", guard(extras_put))
    add("GET", "/api/teams/<tid>/guides", guard(lambda req: {"guides": ctx.guide_extras.guides_using_team(req.params["tid"])}))

    def timers_update(req):
        b = {k: v for k, v in (req.body or {}).items() if k in ("name", "seconds", "repeat", "sound", "notify", "order", "pinned")}
        return ctx.timers.update(req.params["tid"], **b)
    add("PATCH", "/api/timers/<tid>", guard(timers_update))

    def timers_action(req):
        return ctx.timers.action(req.params["tid"], req.params["act"])
    add("POST", "/api/timers/<tid>/<act>", guard(timers_action))

    def timers_delete(req):
        ctx.timers.delete(req.params["tid"])
        return {"ok": True}
    add("DELETE", "/api/timers/<tid>", guard(timers_delete))

    def claim(req):
        return {"play": ctx.timers.claim_sound(str((req.body or {}).get("event") or ""))}
    add("POST", "/api/timers/sound-claim", guard(claim))

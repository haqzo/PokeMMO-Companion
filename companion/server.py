"""Loopback HTTP server: static UI, JSON API and Server-Sent Events.

Security: binds to 127.0.0.1 only, rejects foreign Host headers (DNS
rebinding) and requires a per-launch random token on every /api request.
"""
from __future__ import annotations

import json
import logging
import mimetypes
import queue
import re
import threading
import traceback
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qs, urlparse

from .app import AppContext
from .services.dex import FILTER_TAGS
from .config import UI_DIR
from .data import reference as ref
from .data.window_presets import PRESETS
from .services import backup, breeding, calcs, importer
from .services.guides import GuideError
from .services.sprite_library import SpriteLibraryError
from .settings import SettingsError
from .storage import utcnow

log = logging.getLogger("companion.http")
Handler = Callable[["Request"], Any]


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


class Request:
    def __init__(self, method: str, path: str, query: dict, body: Any, params: dict):
        self.method, self.path, self.query, self.body, self.params = method, path, query, body, params

    def q(self, key: str, default: str | None = None) -> str | None:
        v = self.query.get(key)
        return v[0] if v else default

    def json(self, key: str, default: Any = None) -> Any:
        return self.body.get(key, default) if isinstance(self.body, dict) else default


class Router:
    def __init__(self) -> None:
        self.routes: list[tuple[str, re.Pattern, Handler]] = []

    def add(self, method: str, pattern: str, fn: Handler) -> None:
        rx = re.compile("^" + re.sub(r"<(\w+)>", r"(?P<\1>[^/]+)", pattern) + "$")
        self.routes.append((method, rx, fn))

    def match(self, method: str, path: str) -> tuple[Handler, dict] | None:
        for m, rx, fn in self.routes:
            if m == method:
                mo = rx.match(path)
                if mo:
                    return fn, mo.groupdict()
        return None


def build_router(ctx: AppContext) -> Router:
    r = Router()
    S = ctx.settings

    def favs() -> set[int]:
        return {x["species_id"] for x in ctx.storage.query("SELECT species_id FROM favourites")}

    def int_param(v: Any, name: str) -> int:
        try:
            return int(v)
        except (TypeError, ValueError):
            raise ApiError(400, f"{name} must be a number")

    # ---------------------------------------------------------------- core
    def bootstrap(req: Request) -> dict:
        return {"version": ctx.version, "mode": ctx.shell.mode, "capabilities": ctx.shell.capabilities,
                "settings": S.all(), "dex": ctx.dex.status(), "notifier": ctx.notifier.describe(),
                "data_dir": str(ctx.paths.root), "now": utcnow(),
                "storage": {"migrated_from": ctx.storage.migrated_from, "backup": ctx.storage.backup_created},
                "window_presets": PRESETS}
    r.add("GET", "/api/bootstrap", bootstrap)

    def settings_get(req: Request) -> dict:
        return S.all()

    def settings_patch(req: Request) -> dict:
        if not isinstance(req.body, dict):
            raise ApiError(400, "Expected an object of settings")
        clean = S.update(req.body)
        ctx.bus.publish("settings", clean, origin=req.q("origin"))
        if any(k.startswith("live.ntfy.") for k in clean):
            ctx.live.apply_settings()
        return {"ok": True, "applied": clean}
    r.add("GET", "/api/settings", settings_get)
    r.add("PATCH", "/api/settings", settings_patch)

    def settings_reset(req: Request) -> dict:
        n = S.reset(req.json("prefix", ""))
        ctx.bus.publish("settings", {"reset": req.json("prefix")})
        return {"reset": n}
    r.add("POST", "/api/settings/reset", settings_reset)

    # ------------------------------------------------------------- import
    def import_detect(req: Request) -> dict:
        folder = req.json("folder") or req.q("folder")
        if not folder:
            raise ApiError(400, "folder is required")
        return importer.detect_sources(folder)
    r.add("POST", "/api/import/detect", import_detect)

    r.add("GET", "/api/data/status", lambda req: {**importer.data_status(ctx.paths), "sync": ctx.data_sync})

    def import_suggest(req: Request) -> dict:
        home = Path.home()
        cands = [home / "Documents" / "PokeMMO-Companion", home / "Documents" / "PokeMMO-Companion" / "Pokemmo-Dumps",
                 home / "Documents" / "PokeMMO-Companion" / "Storyline-guides"]
        return {"candidates": [str(c) for c in cands if c.is_dir()]}
    r.add("GET", "/api/import/suggest", import_suggest)

    def import_run(req: Request) -> dict:
        kind = req.params["kind"]
        folder = req.json("folder")
        if not folder:
            raise ApiError(400, "Choose a folder first")
        job = uuid.uuid4().hex[:8]
        ctx.import_jobs[job] = {"id": job, "kind": kind, "state": "running", "messages": [], "started": utcnow()}

        def work() -> None:
            j = ctx.import_jobs[job]
            try:
                with ctx._import_lock:
                    if kind == "dumps":
                        j["result"] = importer.import_dumps(ctx.paths, folder=folder,
                                                            progress=lambda m: j["messages"].append(m))
                        ctx.dex.reload()
                        ctx.items.reload()
                    elif kind == "guides":
                        j["result"] = importer.import_guides(ctx.paths, folder=folder)
                    else:
                        raise importer.ImportError_("Unknown import kind")
                j["state"] = "done"
            except importer.ImportError_ as exc:
                j.update(state="error", error=str(exc))
            except Exception as exc:  # pragma: no cover - surfaced to UI
                j.update(state="error", error=f"{type(exc).__name__}: {exc}")
                log.exception("import failed")
            ctx.bus.publish("import", {"job": job, "kind": kind, "state": j["state"]})
        threading.Thread(target=work, daemon=True).start()
        return {"job": job}
    r.add("POST", "/api/import/<kind>", import_run)
    r.add("GET", "/api/import/jobs/<job>", lambda req: ctx.import_jobs.get(req.params["job"]) or {"state": "unknown"})

    # ------------------------------------------------------------ pokédex
    def progress_run(req: Request) -> str | None:
        run = req.q("run")
        if not run or run == "none":
            return None
        if not ctx.storage.query_one("SELECT id FROM runs WHERE id=? AND deleted_at IS NULL", (run,)):
            raise ApiError(404, "Run not found")
        return run

    def dex_list(req: Request) -> dict:
        run = progress_run(req)
        prog = ctx.dex_progress(run)
        return {"species": ctx.dex.summaries(favs(), prog), "forms": ctx.dex.catalog_forms(favs(), prog),
                "forms_version": ctx.dex.forms_doc["version"], "status": ctx.dex.status(),
                "registry": {k: ctx.dex.registry[k] for k in ("registry_version", "checked_at")},
                "filter_tags": FILTER_TAGS, "observations": ctx.dex.registry.get("observations", []), "progress_run": run}
    r.add("GET", "/api/dex/species", dex_list)

    LEVELS = ("unregistered", "seen", "owned", "caught_ot")

    def progress_set(req: Request) -> dict:
        run = req.params["run"]
        sid = int_param(req.params["sid"], "species id")
        if sid not in ctx.dex.index:
            raise ApiError(404, "Unknown species")
        if not ctx.storage.query_one("SELECT id FROM runs WHERE id=? AND deleted_at IS NULL", (run,)):
            raise ApiError(404, "Run not found")
        b = req.body or {}
        status = b.get("status", "unregistered")
        if status not in LEVELS:
            raise ApiError(400, f"status must be one of {LEVELS}")
        flags = {k: 1 if b.get(k) else 0 for k in ("caught_alpha", "owned_shiny", "owned_costume")}
        if status == "unregistered" and not any(flags.values()):
            ctx.storage.execute("DELETE FROM dex_progress WHERE run_id=? AND species_id=?", (run, sid))
        else:
            ctx.storage.execute("INSERT OR REPLACE INTO dex_progress(run_id, species_id, status, caught_alpha, owned_shiny, "
                                "owned_costume, updated_at) VALUES(?,?,?,?,?,?,?)",
                                (run, sid, status, flags["caught_alpha"], flags["owned_shiny"], flags["owned_costume"], utcnow()))
        ctx.bus.publish("dex.progress", {"run": run, "id": sid}, origin=req.q("origin"))
        return {"ok": True}
    r.add("PUT", "/api/dex/progress/<run>/<sid>", progress_set)

    def progress_counts(req: Request) -> dict:
        run = req.params["run"]
        prog = ctx.dex_progress(run) or {}
        scope = [sid for sid in ctx.dex.index if req.q("scope", "reference") == "reference" or ctx.dex.availability(sid)["in_game_dex"] != "no"]
        def lvl(sid: int) -> int:
            return LEVELS.index((prog.get(sid) or {}).get("status", "unregistered"))
        return {"run": run, "scope_size": len(scope), "tracked": len(prog),
                "seen": sum(1 for s in scope if lvl(s) >= 1), "owned": sum(1 for s in scope if lvl(s) >= 2),
                "caught_ot": sum(1 for s in scope if lvl(s) >= 3),
                "caught_alpha": sum(1 for s in scope if (prog.get(s) or {}).get("caught_alpha")),
                "owned_shiny": sum(1 for s in scope if (prog.get(s) or {}).get("owned_shiny")),
                "owned_costume": sum(1 for s in scope if (prog.get(s) or {}).get("owned_costume")),
                "scope": "Gen I–V reference" if req.q("scope", "reference") == "reference" else "reference minus species you marked Not listed",
                "note": "Entered by you in the Companion — not read from your PokeMMO account. In-game maxima differ per counter and patch; "
                        "record them under Availability report › Your in-game counters."}
    r.add("GET", "/api/dex/progress/<run>/counts", progress_counts)

    def roster(req: Request) -> dict:
        obs = [{**o, "counters": json.loads(o["counters"])} for o in
               ctx.storage.query("SELECT * FROM dex_observations ORDER BY observed_at DESC, created_at DESC")]
        return ctx.dex.roster_report(obs)
    r.add("GET", "/api/dex/roster", roster)

    def roster_check(req: Request) -> dict:
        sid = int_param(req.params["sid"], "species id")
        if sid not in ctx.dex.index:
            raise ApiError(404, "Unknown species")
        val = req.json("in_dex")
        if val == "clear":
            ctx.storage.execute("DELETE FROM roster_checks WHERE species_id=?", (sid,))
        elif val in ("yes", "no"):
            ctx.storage.execute("INSERT OR REPLACE INTO roster_checks(species_id, in_dex, checked_at, note) VALUES(?,?,?,?)",
                                (sid, val, utcnow(), str(req.json("note") or "")[:300]))
        else:
            raise ApiError(400, "in_dex must be yes, no or clear")
        ctx.load_roster_checks()
        ctx.bus.publish("dex.roster", {"id": sid})
        return {"availability": ctx.dex.availability(sid)}
    r.add("PUT", "/api/dex/roster/<sid>", roster_check)

    def dex_detail(req: Request) -> dict:
        sid = int_param(req.params["sid"], "species id")
        note = ctx.storage.query_one("SELECT body FROM notes WHERE species_id=?", (sid,))
        d = ctx.dex.detail(sid, favs(), note["body"] if note else None)
        if not d:
            raise ApiError(404, "Unknown species")
        run = progress_run(req)
        if run:
            d["progress"] = (ctx.dex_progress(run) or {}).get(sid) or {"status": "unregistered"}
            d["progress_run"] = run
        d["catalog_forms"] = ctx.dex.species_forms(sid)
        fk = req.q("form")
        if fk:
            f = ctx.dex.form_entry(f"{sid}:{fk}")
            if not f:
                raise ApiError(404, "Unknown form")
            d["form"] = f
            d["form_matchups"] = ctx.dex.type_matchups(f["types"])
        d["library_notes"] = ctx.notes.list(state="active", kind="species", ref_=str(sid))["notes"]
        d["box_entries"] = [e for e in ctx.box.list() if e["species_id"] == sid]
        return d
    r.add("GET", "/api/dex/species/<sid>", dex_detail)

    def dex_parity(req: Request) -> dict:
        ref_doc = json.loads((Path(__file__).parent / "data" / "catalog_reference_synergy.json").read_text(encoding="utf-8"))
        return ctx.dex.parity(ref_doc)
    r.add("GET", "/api/dex/catalog/parity", dex_parity)

    # Optional sprite library you supply yourself (animated Gen V sprites). Nothing is downloaded by the Companion.
    def sprites_status(req: Request) -> dict:
        st = ctx.sprite_library.status()
        st["local_forms"] = {}
        for k, v in getattr(ctx.dex, "local_form_art", {}).items():
            st["local_forms"][v["status"]] = st["local_forms"].get(v["status"], 0) + 1
        return st
    r.add("GET", "/api/sprites/library", sprites_status)

    def sprites_import(req: Request) -> dict:
        folder = str((req.body or {}).get("folder") or "").strip()
        if not folder:
            raise ApiError(400, "Choose the folder or .zip that contains the sprites")
        try:
            return {"job": ctx.sprite_library.start_import(folder)}
        except SpriteLibraryError as exc:
            raise ApiError(400, str(exc))
    r.add("POST", "/api/sprites/library/import", sprites_import)

    def sprites_remove(req: Request) -> dict:
        ctx.sprite_library.remove()
        ctx.bus.publish("sprites", {"state": "removed"})
        return {"ok": True}
    r.add("DELETE", "/api/sprites/library", sprites_remove)

    def dex_art_report(req: Request) -> dict:
        """Per-form artwork status: what your client has, what your sprite library has, and where else it exists."""
        rows = []
        for key, e in ctx.dex.form_art["forms"].items():
            sid, fk = key.split(":")
            a = ctx.dex.art(int(sid), fk)
            rows.append({"key": key, "name": (ctx.dex.forms.get(key) or {}).get("form_name"), "species": ctx.dex.name(int(sid)),
                         "local_status": a["local_status"], "local_reason": a["local_reason"],
                         "library": sorted(k for k in ("ani", "ani_shiny", "static", "static_shiny") if a.get(k)),
                         "known_sources": {"pokeapi_animated": e["pokeapi"]["animated"], "pokeapi_animated_shiny": e["pokeapi"]["animated_shiny"],
                                           "smogon_animated": e["smogon"]["animated"], "smogon_shiny": e["smogon"]["shiny"],
                                           "pokesprite_icon": e["pokesprite"]["exists"]}})
        return {"forms": rows, "checked": ctx.dex.form_art["checked"], "sources": ctx.dex.form_art["sources"]}
    r.add("GET", "/api/dex/art", dex_art_report)

    def fav_set(req: Request) -> dict:
        sid = int_param(req.params["sid"], "species id")
        if sid not in ctx.dex.index:
            raise ApiError(404, "Unknown species")
        if req.json("fav"):
            ctx.storage.execute("INSERT OR IGNORE INTO favourites(species_id, added_at) VALUES(?,?)", (sid, utcnow()))
        else:
            ctx.storage.execute("DELETE FROM favourites WHERE species_id=?", (sid,))
        ctx.bus.publish("favourites", {"id": sid, "fav": bool(req.json("fav"))})
        return {"ok": True}
    r.add("PUT", "/api/dex/species/<sid>/favourite", fav_set)

    def note_set(req: Request) -> dict:
        sid = int_param(req.params["sid"], "species id")
        body = str(req.json("body", ""))[:4000]
        if body.strip():
            ctx.storage.execute("INSERT OR REPLACE INTO notes(species_id, body, updated_at) VALUES(?,?,?)",
                                (sid, body, utcnow()))
        else:
            ctx.storage.execute("DELETE FROM notes WHERE species_id=?", (sid,))
        ctx.bus.publish("notes", {"id": sid})
        return {"ok": True}
    r.add("PUT", "/api/dex/species/<sid>/note", note_set)

    # -------------------------------------------------------------- news
    r.add("GET", "/api/news", lambda req: ctx.news.listing())

    def news_article(req: Request) -> dict:
        a = ctx.news.article(req.params["aid"])
        if not a:
            raise ApiError(404, "Article not found")
        return a
    r.add("GET", "/api/news/<aid>", news_article)

    def news_event(req: Request) -> dict:
        e = ctx.news.event(req.params["eid"])
        if not e:
            raise ApiError(404, "Event not found")
        return e
    r.add("GET", "/api/events/<eid>", news_event)
    def news_check(req: Request) -> dict:
        res = ctx.news.check_feed(manual=True)
        ctx.bus.publish("news", {"ok": res.get("ok"), "manual": True})
        return {k: v for k, v in res.items() if not k.startswith("_") and k not in ("etag", "last_modified")}
    r.add("POST", "/api/news/check", news_check)

    # ------------------------------------------------------------- tools
    r.add("GET", "/api/tools/typechart", lambda req: {
        "types": ref.TYPES, "matrix": ref.chart_matrix(), "status": "CORROBORATED",
        "note": "Generation II–V chart with 17 types (no Fairy), matching PokeMMO's dump and the in-game "
                "type chart. Steel resists Ghost and Dark."})
    r.add("GET", "/api/tools/natures", lambda req: {"natures": ref.natures_table(), "labels": ref.STAT_LABELS,
                                                     "status": "CORROBORATED"})

    def calc_stats(req: Request) -> dict:
        sid = int_param(req.json("species"), "species")
        sp = ctx.dex.species.get(sid)
        if not sp:
            raise ApiError(400, "Import data and choose a species")
        base = sp["stats"]
        form = req.json("form")
        if form:
            f = ctx.dex.form_entry(f"{sid}:{form}")
            if not f:
                raise ApiError(400, "Unknown form")
            base = f["stats"] or base
        level = int_param(req.json("level", 50), "level")
        ivs, evs = req.json("ivs", {}) or {}, req.json("evs", {}) or {}
        nature = req.json("nature")
        try:
            out = calcs.stat_block(base, ivs, evs, level, nature)
            at50 = calcs.stat_block(base, ivs, evs, 50, nature)
            at100 = calcs.stat_block(base, ivs, evs, 100, nature)
        except (ValueError, TypeError) as exc:
            raise ApiError(400, str(exc))
        return {"stats": out, "level": level, "at_50": at50, "at_100": at100, "base": base,
                "ev_total": sum(int(evs.get(k, 0) or 0) for k in ref.STATS),
                "note": "Gen III+ formula with integer rounding (same core formula as the PokeMMO Showdown and PokéStats calculators). "
                        "Base stats from your installed data" + (" (form-specific)" if form else "") + "."}
    r.add("POST", "/api/tools/stats", calc_stats)

    def catch_calc(req: Request) -> dict:
        sid = int_param(req.json("species"), "species")
        sp = ctx.dex.species.get(sid)
        if not sp:
            raise ApiError(400, "Import data and choose a species")
        ov = calcs.CATCH_RATE_OVERRIDES.get(sid)
        rate = ov["rate"] if ov else sp["catch_rate"]
        b = req.body or {}
        c = {"max_hp": b.get("max_hp") or 100, "hp_percent": b.get("hp_percent", 100), "cur_hp": b.get("cur_hp"),
             "status": b.get("status") or "none", "turn": int(b.get("turn") or 1), "time": b.get("time") or "day",
             "cave": bool(b.get("cave")), "water": bool(b.get("water")), "level": int(b.get("level") or 30),
             "caught_before": bool(b.get("caught_before")), "types": ctx.dex.index.get(sid, {}).get("types", [])}
        try:
            res = calcs.catch_table(rate, c)
        except ValueError as exc:
            raise ApiError(400, str(exc))
        res.update({"species": sid, "name": ctx.dex.name(sid), "rate_source": ov["source"] if ov else "Your installed dump",
                    "notes": ["Gen III/IV capture formula with four shake checks, as used by public PokeMMO catch calculators.",
                              "Percentages are per ball thrown. Balls marked “condition not confirmed” use mainline values whose PokeMMO "
                              "behaviour has not been confirmed.", "Alpha, raid and legendary capture rules are not modelled."]})
        return res
    r.add("POST", "/api/tools/catch", catch_calc)

    def ev_plan(req: Request) -> dict:
        try:
            return calcs.ev_plan(int(req.json("yield", 1)), int(req.json("current", 0)), int(req.json("target", 252)),
                                 int(req.json("horde", 5)), bool(req.json("macho_brace")))
        except (ValueError, TypeError) as exc:
            raise ApiError(400, str(exc))
    r.add("POST", "/api/tools/ev/plan", ev_plan)

    def breeding_preview(req: Request) -> dict:
        return breeding.preview(ctx.dex, req.json("a", {}) or {}, req.json("b", {}) or {})
    r.add("POST", "/api/tools/breeding/preview", breeding_preview)
    r.add("POST", "/api/tools/breeding/plan", lambda req: breeding.plan_summary(req.body or {}))
    r.add("GET", "/api/tools/breeding/eggmoves/<sid>",
          lambda req: breeding.egg_move_candidates(ctx.dex, int_param(req.params["sid"], "species")))
    r.add("GET", "/api/tools/breeding/items", lambda req: {
        "items": breeding.ITEMS, "braces": breeding.BRACES,
        "icons": {k: (f"/assets/private/items/{v['icon_id']}.png" if v.get("icon_id") is not None else None)
                  for k, v in ctx.dex.extras.get("breeding_items", {}).items()}})

    # Generic saved documents (breeding plans, pairings, teams, EV plans)
    DOC_KINDS = ("breeding_plan", "pairing", "team", "ev_plan")

    def docs_list(req: Request) -> dict:
        kind = req.params["kind"]
        if kind not in DOC_KINDS:
            raise ApiError(404, "Unknown document kind")
        return {"items": ctx.storage.list_documents(kind)}

    def docs_put(req: Request) -> dict:
        kind = req.params["kind"]
        if kind not in DOC_KINDS:
            raise ApiError(404, "Unknown document kind")
        doc_id = req.params.get("doc") or uuid.uuid4().hex[:10]
        name = str(req.json("name", "Untitled"))[:60] or "Untitled"
        doc = ctx.storage.put_document(kind, doc_id, name, req.json("data", {}))
        ctx.bus.publish("documents", {"kind": kind, "id": doc_id}, origin=req.q("origin"))
        return doc

    def docs_delete(req: Request) -> dict:
        ok = ctx.storage.delete_document(req.params["kind"], req.params["doc"])
        ctx.bus.publish("documents", {"kind": req.params["kind"], "deleted": req.params["doc"]})
        return {"deleted": ok}
    r.add("GET", "/api/docs/<kind>", docs_list)
    r.add("POST", "/api/docs/<kind>", docs_put)
    r.add("PUT", "/api/docs/<kind>/<doc>", docs_put)
    r.add("DELETE", "/api/docs/<kind>/<doc>", docs_delete)

    # -------------------------------------------------------------- live
    def live_reports(req: Request) -> dict:
        return {"reports": ctx.live.list(req.q("kind"), req.q("q"), req.q("tests", "1") == "1"),
                "source": ctx.live.source_status(), "notifier": ctx.notifier.describe()}
    r.add("GET", "/api/live/reports", live_reports)

    def live_report(req: Request) -> dict:
        try:
            return ctx.live.get(req.params["rid"])
        except KeyError:
            raise ApiError(404, "Report not found")
    r.add("GET", "/api/live/reports/<rid>", live_report)
    r.add("POST", "/api/live/test", lambda req: ctx.live.create_test(req.json("kind", "alpha")))
    r.add("POST", "/api/live/seen", lambda req: {"updated": ctx.live.mark_seen(req.json("id"))})
    r.add("POST", "/api/live/clear", lambda req: {"deleted": ctx.live.clear(bool(req.json("tests_only")))})
    r.add("GET", "/api/live/source", lambda req: ctx.live.source_status())

    def legend(req: Request) -> dict:
        return ctx.live.legendaries(req.q("run") or S.get("guides.active_run"))
    r.add("GET", "/api/live/legendaries", legend)

    def legend_caught(req: Request) -> dict:
        run = req.json("run") or S.get("guides.active_run")
        if not run:
            raise ApiError(400, "Create or select a character run in Guides first")
        try:
            ctx.live.set_caught(run, int_param(req.json("species"), "species"), bool(req.json("caught")))
        except ValueError as exc:
            raise ApiError(400, str(exc))
        ctx.bus.publish("legendaries", {"run": run})
        return {"ok": True}
    r.add("POST", "/api/live/legendaries/caught", legend_caught)
    r.add("GET", "/api/live/cave", lambda req: ctx.live.cave())

    def cave_add(req: Request) -> dict:
        try:
            res = ctx.live.add_observation(req.body or {})
        except ValueError as exc:
            raise ApiError(400, str(exc))
        ctx.bus.publish("cave", res)
        return res
    r.add("POST", "/api/live/cave", cave_add)

    def cave_del(req: Request) -> dict:
        ok = ctx.live.delete_observation(req.params["oid"])
        ctx.bus.publish("cave", {"deleted": req.params["oid"]})
        return {"deleted": ok}
    r.add("DELETE", "/api/live/cave/<oid>", cave_del)

    # ------------------------------------------------------------ guides
    G = ctx.guides

    def runs_list(req: Request) -> dict:
        return {"runs": G.list_runs(), "deleted": [x for x in G.list_runs(True) if x["deleted_at"]],
                "active": S.get("guides.active_run")}

    def run_create(req: Request) -> dict:
        run = G.create_run(req.json("name", ""), req.json("label", ""), req.json("region", "kanto"))
        S.update({"guides.active_run": run["id"]})
        ctx.bus.publish("guides", {"run": run["id"], "created": True})
        ctx.bus.publish("settings", {"guides.active_run": run["id"]})
        return run

    def run_patch(req: Request) -> dict:
        rid = req.params["rid"]
        b = req.body or {}
        if "name" in b or "label" in b:
            cur = G.get_run(rid)
            G.rename_run(rid, b.get("name", cur["character_name"]), b.get("label", cur["run_label"]))
        if "region" in b or "source" in b or "active_step_id" in b or "show_optional" in b:
            region = b.get("region") or G.get_run(rid)["last_region"]
            G.set_region_prefs(rid, region, b.get("source"), b.get("active_step_id"), b.get("show_optional"))
        ctx.bus.publish("guides", {"run": rid}, origin=req.q("origin"))
        return G.get_run(rid)

    def run_delete(req: Request) -> dict:
        rid = req.params["rid"]
        G.delete_run(rid)
        if S.get("guides.active_run") == rid:
            remaining = G.list_runs()
            S.update({"guides.active_run": remaining[0]["id"] if remaining else None})
        ctx.bus.publish("guides", {"run": rid, "deleted": True})
        ctx.bus.publish("settings", {})
        return {"deleted": True}

    def run_restore(req: Request) -> dict:
        run = G.restore_run(req.params["rid"])
        ctx.bus.publish("guides", {"run": run["id"]})
        return run

    def run_duplicate(req: Request) -> dict:
        run = G.duplicate_run(req.params["rid"], req.json("label", ""))
        ctx.bus.publish("guides", {"run": run["id"], "created": True})
        return run

    def run_state(req: Request) -> dict:
        rid = req.params["rid"]
        region = req.q("region") or G.get_run(rid)["last_region"]
        st = G.state(rid, region)
        st["steps"] = G.steps(region, st["source"])
        return st

    def run_steps(req: Request) -> dict:
        rid = req.params["rid"]
        ids = req.json("steps") or ([req.json("step")] if req.json("step") else [])
        res = G.set_steps(rid, ids, bool(req.json("done")))
        if req.json("advance") and req.json("region") and req.json("next_active"):
            G.set_region_prefs(rid, req.json("region"), active_step_id=req.json("next_active"))
        ctx.bus.publish("guides", {"run": rid, "steps": ids}, origin=req.q("origin"))
        return res

    def run_mark_through(req: Request) -> dict:
        rid = req.params["rid"]
        res = G.mark_through(rid, req.json("region"), req.json("step"), bool(req.json("preview")))
        if not req.json("preview"):
            ctx.bus.publish("guides", {"run": rid})
        return res

    def run_undo(req: Request) -> dict:
        res = G.undo(req.params["rid"])
        ctx.bus.publish("guides", {"run": req.params["rid"]})
        return res

    def run_ack(req: Request) -> dict:
        n = G.acknowledge_changes(req.params["rid"], req.json("steps", []))
        ctx.bus.publish("guides", {"run": req.params["rid"]})
        return {"acknowledged": n}
    r.add("GET", "/api/guides/runs", runs_list)
    r.add("POST", "/api/guides/runs", run_create)
    r.add("PATCH", "/api/guides/runs/<rid>", run_patch)
    r.add("DELETE", "/api/guides/runs/<rid>", run_delete)
    r.add("POST", "/api/guides/runs/<rid>/restore", run_restore)
    r.add("POST", "/api/guides/runs/<rid>/duplicate", run_duplicate)
    r.add("GET", "/api/guides/runs/<rid>/state", run_state)
    r.add("POST", "/api/guides/runs/<rid>/steps", run_steps)
    r.add("POST", "/api/guides/runs/<rid>/mark-through", run_mark_through)

    _recent_actions: dict[str, float] = {}

    def run_action(req: Request) -> dict:
        import time as _t
        nonce = str(req.json("nonce") or "")[:40]
        now = _t.monotonic()
        for k in [k for k, v in _recent_actions.items() if now - v > 10]:
            _recent_actions.pop(k, None)
        if nonce and nonce in _recent_actions:  # the same key press delivered twice (two windows / retries)
            return {"ok": False, "duplicate": True, "message": "Ignored a repeated key press."}
        if nonce:
            _recent_actions[nonce] = now
        try:
            res = G.step_action(req.params["rid"], req.json("region"), str(req.json("action")), req.json("expect_step"))
        except GuideError as exc:
            raise ApiError(400, str(exc))
        if res.get("ok"):
            ctx.bus.publish("guides", {"run": req.params["rid"], "action": req.json("action")}, origin=req.q("origin"))
        return res
    r.add("POST", "/api/guides/runs/<rid>/action", run_action)
    r.add("POST", "/api/guides/runs/<rid>/undo", run_undo)
    r.add("POST", "/api/guides/runs/<rid>/acknowledge", run_ack)
    r.add("GET", "/api/guides/runs/<rid>/overview", lambda req: G.overview(req.params["rid"]))
    r.add("GET", "/api/guides/sources/<region>", lambda req: {"sources": G.sources(req.params["region"])})

    # ------------------------------------------------------------ backup
    r.add("GET", "/api/backup/export", lambda req: backup.export_all(ctx.storage))

    def backup_import(req: Request) -> dict:
        try:
            res = backup.import_all(ctx.storage, req.json("payload"), req.json("mode", "merge"))
        except ValueError as exc:
            raise ApiError(400, str(exc))
        ctx.bus.publish("guides", {"imported": True})
        ctx.bus.publish("settings", {})
        ctx.bus.publish("favourites", {})
        return res
    r.add("POST", "/api/backup/import", backup_import)
    r.add("POST", "/api/backup/snapshot", lambda req: {"path": str(ctx.storage.backup("manual"))})

    # ------------------------------------------------------------- shell
    def shell_cmd(req: Request) -> dict:
        cmd = req.body or {}
        allowed = {"open_popout", "close_popout", "pin", "window_opacity", "mode", "lock", "focus_main",
                   "navigate_main", "minimize", "quit", "pick_folder", "toast_preview", "raise_popout", "toggle_popout"}
        if cmd.get("action") not in allowed:
            raise ApiError(400, "Unknown shell action")
        return ctx.shell.submit(cmd)
    r.add("POST", "/api/shell/command", shell_cmd)
    r.add("GET", "/api/shell/capabilities", lambda req: {"mode": ctx.shell.mode, **ctx.shell.capabilities})
    from . import routes_library
    routes_library.register(r, ctx, ApiError, Request)
    return r


def make_handler(ctx: AppContext, router: Router) -> type[BaseHTTPRequestHandler]:
    ui_root = UI_DIR.resolve()
    assets_root = ctx.paths.assets_dir

    class H(BaseHTTPRequestHandler):
        server_version = "PokeMMOCompanion"
        protocol_version = "HTTP/1.1"
        # Headers and body are written separately; without TCP_NODELAY every response on a reused
        # keep-alive connection waited ~40 ms for a delayed ACK (measured 2026-11-23: 100 sprites 4.3 s → see report 12).
        disable_nagle_algorithm = True

        def log_message(self, fmt: str, *args: Any) -> None:  # quiet
            log.debug("%s - %s", self.address_string(), fmt % args)

        # ---------------------------------------------------------- utils
        def _send(self, status: int, body: bytes, ctype: str, extra: dict | None = None) -> None:
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            if not (extra and "Cache-Control" in extra):
                self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _json(self, status: int, payload: Any) -> None:
            self._send(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

        def _host_ok(self) -> bool:
            host = (self.headers.get("Host") or "").split(":")[0]
            return host in ("127.0.0.1", "localhost")

        def _authed(self, query: dict) -> bool:
            tok = self.headers.get("X-Companion-Token") or (query.get("token") or [None])[0]
            return tok == ctx.token

        # -------------------------------------------------------- dispatch
        def do_GET(self) -> None:
            self._dispatch("GET")

        def do_POST(self) -> None:
            self._dispatch("POST")

        def do_PUT(self) -> None:
            self._dispatch("PUT")

        def do_PATCH(self) -> None:
            self._dispatch("PATCH")

        def do_DELETE(self) -> None:
            self._dispatch("DELETE")

        def _dispatch(self, method: str) -> None:
            if not self._host_ok():
                return self._send(403, b"Forbidden host", "text/plain")
            url = urlparse(self.path)
            query = parse_qs(url.query)
            path = url.path
            if path.startswith("/api/"):
                if not self._authed(query):
                    return self._json(401, {"error": "Missing or invalid session token"})
                if path == "/api/events/stream" and method == "GET":
                    return self._sse()
                return self._api(method, path, query)
            if method != "GET":
                return self._send(405, b"Method not allowed", "text/plain")
            if path.startswith("/media/"):
                found = ctx.media.path(path[len("/media/"):])
                if not found:
                    return self._send(404, b"Not found", "text/plain")
                return self._send(200, found[0].read_bytes(), found[1], {"Cache-Control": "private, max-age=3600"})
            if path.startswith("/assets/library/"):
                cache = "private, max-age=31536000, immutable" if query.get("v") else None
                return self._static(ctx.sprite_library.root, path[len("/assets/library/"):], image_only=True, cache=cache)
            if path.startswith("/assets/private/"):
                # Versioned URLs (?v=<install>) never change content, so the browser may keep them; others are not cached.
                cache = "private, max-age=31536000, immutable" if query.get("v") else None
                return self._static(assets_root, path[len("/assets/private/"):], png_only=True, cache=cache)
            if path in ("/", "/index.html", "/popout"):
                return self._static(ui_root, "index.html")
            return self._static(ui_root, path.lstrip("/"))

        def _api(self, method: str, path: str, query: dict) -> None:
            body: Any = None
            length = int(self.headers.get("Content-Length") or 0)
            if length > 20_000_000:
                return self._json(413, {"error": "Request too large"})
            if length:
                try:
                    body = json.loads(self.rfile.read(length).decode("utf-8"))
                except ValueError:
                    return self._json(400, {"error": "Invalid JSON"})
            m = router.match(method, path)
            if not m:
                return self._json(404, {"error": f"No route {method} {path}"})
            fn, params = m
            try:
                result = fn(Request(method, path, query, body, params))
                self._json(200, result if result is not None else {"ok": True})
            except ApiError as exc:
                self._json(exc.status, {"error": str(exc)})
            except (GuideError, SettingsError, importer.ImportError_) as exc:
                self._json(400, {"error": str(exc)})
            except Exception as exc:
                log.error("API error %s %s\n%s", method, path, traceback.format_exc())
                self._json(500, {"error": f"Internal error: {type(exc).__name__}"})

        def _static(self, root: Path, rel: str, png_only: bool = False, cache: str | None = None, image_only: bool = False) -> None:
            try:
                target = (root / rel).resolve()
                target.relative_to(root.resolve())
            except (ValueError, OSError):
                return self._send(404, b"Not found", "text/plain")
            if png_only and target.suffix.lower() != ".png":
                return self._send(404, b"Not found", "text/plain")
            if image_only and target.suffix.lower() not in (".png", ".gif"):
                return self._send(404, b"Not found", "text/plain")
            if not target.is_file():
                return self._send(404, b"Not found", "text/plain")
            ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
            if ctype.startswith("text/") or ctype in ("application/javascript",):
                ctype += "; charset=utf-8"
            if target.suffix == ".js":
                ctype = "text/javascript; charset=utf-8"
            extra = {"Cache-Control": cache} if cache else {}
            if target.name == "index.html":
                extra["Content-Security-Policy"] = (
                    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
                    "script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
            self._send(200, target.read_bytes(), ctype, extra)

        def _sse(self) -> None:
            sid, q = ctx.bus.subscribe()
            try:
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Connection", "keep-alive")
                self.end_headers()
                self.wfile.write(b"retry: 2000\n\n")
                self.wfile.flush()
                while True:
                    try:
                        ev = q.get(timeout=15)
                        data = json.dumps(ev, ensure_ascii=False)
                        self.wfile.write(f"data: {data}\n\n".encode("utf-8"))
                    except queue.Empty:
                        self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            finally:
                ctx.bus.unsubscribe(sid)
                self.close_connection = True

    return H


class CompanionServer:
    def __init__(self, ctx: AppContext, port: int = 0):
        self.ctx = ctx
        self.router = build_router(ctx)
        self.httpd = ThreadingHTTPServer(("127.0.0.1", port), make_handler(ctx, self.router))
        self.httpd.daemon_threads = True
        self.thread: threading.Thread | None = None

    @property
    def port(self) -> int:
        return self.httpd.server_address[1]

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}/"

    def url(self, route: str = "#/home", popout: str | None = None, mode: str | None = None) -> str:
        q = f"?token={self.ctx.token}"
        if popout:
            q += f"&popout={popout}&mode={mode or 'standard'}&shell={self.ctx.shell.mode}"
        else:
            q += f"&shell={self.ctx.shell.mode}"
        return f"{self.base_url}{q}{route}"

    def start(self) -> "CompanionServer":
        self.thread = threading.Thread(target=self.httpd.serve_forever, name="http", daemon=True)
        self.thread.start()
        return self

    def stop(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()

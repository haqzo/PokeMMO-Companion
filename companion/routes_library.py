"""HTTP routes for the connected tools: Item Library, Notes, Box, Showcase, custom Guides,
media, location explorer and in-game counter observations. Registered by server.build_router."""
from __future__ import annotations

import base64
import html
import io
import json
import re
import uuid
import xml.etree.ElementTree as ET
import zipfile
from typing import Any
from urllib.parse import unquote

from .services import importer
from .services.library import LibraryError, parse_guide_text, validate_observation
from .storage import utcnow


def doc_to_text(filename: str, data: bytes) -> tuple[str, list[str]]:
    """Text from a user-chosen document for guide import. Returns (markdown-ish text, warnings).
    Nothing is executed: ODT/DOCX are read as XML, HTML is stripped to text."""
    name = filename.lower()
    warnings: list[str] = []
    if name.endswith((".txt", ".md", ".markdown")):
        return data.decode("utf-8", "replace"), warnings
    if name.endswith((".html", ".htm")):
        raw = data.decode("utf-8", "replace")
        raw = re.sub(r"(?is)<(script|style).*?</\1>", "", raw)
        raw = re.sub(r"(?i)<h[1-6][^>]*>", "\n# ", raw)
        raw = re.sub(r"(?i)<li[^>]*>", "\n- ", raw)
        raw = re.sub(r"(?i)<(br|/p|/div|/h[1-6])[^>]*>", "\n", raw)
        warnings.append("HTML was converted to plain text; scripts, styles and images were removed.")
        return html.unescape(re.sub(r"<[^>]+>", "", raw)), warnings
    if name.endswith(".odt"):
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            root = ET.fromstring(z.read("content.xml"))
        T = "{urn:oasis:names:tc:opendocument:xmlns:text:1.0}"
        lines = []
        for p in root.iter():
            if p.tag in (T + "p", T + "h"):
                t = importer._para_text(p).replace("\xa0", " ").strip()
                if not t:
                    continue
                if p.tag == T + "h" or importer._is_heading(t):
                    lines.append("# " + t.title())
                else:
                    lines.extend("- " + s for s in t.split("\n") if s.strip())
        warnings.append("Embedded pictures in the document are not imported; attach your own images to steps.")
        return "\n".join(lines), warnings
    if name.endswith(".docx"):
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            root = ET.fromstring(z.read("word/document.xml"))
        W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
        lines = []
        for p in root.iter(W + "p"):
            t = "".join(x.text or "" for x in p.iter(W + "t")).strip()
            if not t:
                continue
            style = p.find(f"{W}pPr/{W}pStyle")
            sv = style.get(W + "val", "") if style is not None else ""
            lines.append(("# " if sv.lower().startswith(("heading", "title")) else "- ") + t)
        warnings.append("Only paragraph text is imported from .docx (tables and pictures are skipped).")
        return "\n".join(lines), warnings
    if name.endswith(".pdf"):
        raise LibraryError("PDF import is not supported yet — copy the text into a .txt/.md file, or paste it into the editor.")
    raise LibraryError("Supported guide files: .txt, .md, .odt, .docx, .html")


def register(r, ctx, ApiError, Request) -> None:
    bus = ctx.bus

    def lang() -> str:
        return ctx.settings.get("app.language") or "en"

    def nf(fn):
        def wrap(req):
            try:
                return fn(req)
            except KeyError:
                raise ApiError(404, "Not found")
            except LibraryError as exc:
                raise ApiError(400, str(exc))
        return wrap

    def add(method: str, pattern: str, fn) -> None:
        r.add(method, pattern, nf(fn))

    # ------------------------------------------------------------- items
    def items_list(req):
        res = ctx.items.listing(req.q("lang") or lang())
        if not res["available"]:
            sync = ctx.data_sync or {}
            if not ctx.dex.imported:
                res["reason"] = "The built-in PokeMMO item data could not be loaded. Restart Companion; if this stays, see Settings › About & diagnostics."
            elif sync.get("state") in ("pending", "running"):
                res["reason"] = "Updating your installed PokeMMO data for the Item Library… this takes a few seconds and needs no action."
                res["syncing"] = True
            elif sync.get("reason"):
                res["reason"] = sync["reason"]
                res["sync_state"] = sync.get("state")
        return res
    add("GET", "/api/items", items_list)

    def item_detail(req):
        d = ctx.items.detail(int(req.params["iid"]), ctx.dex, req.q("lang") or lang())
        if not d:
            raise KeyError(req.params["iid"])
        d["notes"] = ctx.notes.list(state="active", kind="item", ref_=str(d["id"]))["notes"]
        return d
    add("GET", "/api/items/<iid>", item_detail)

    def item_user(req):
        body = req.body or {}
        try:
            res = ctx.items.set_user(int(req.params["iid"]), body.get("favourite"), body["qty"] if "qty" in body else "keep")
        except ValueError as exc:
            raise ApiError(400, str(exc))
        bus.publish("items", {"id": res["id"]}, origin=req.q("origin"))
        return res
    add("PUT", "/api/items/<iid>/user", item_user)

    # ------------------------------------------------------------- notes
    def notes_list(req):
        return ctx.notes.list(req.q("q") or "", req.q("tag") or "", req.q("state") or "active", req.q("kind") or "", req.q("ref") or "")
    add("GET", "/api/notes", notes_list)

    def notes_create(req):
        n = ctx.notes.create(req.body or {})
        bus.publish("notes", {"id": n["id"]}, origin=req.q("origin"))
        return n
    add("POST", "/api/notes", notes_create)

    def notes_export(req):
        ids = [x for x in (req.q("ids") or "").split(",") if x]
        return {"markdown": ctx.notes.export_markdown(ids or None),
                "json": {"format": "pokemmo-companion-notes", "exported_at": utcnow(),
                         "notes": [ctx.notes.get(i) for i in ids] if ids else ctx.notes.list(state="all")["notes"]}}
    add("GET", "/api/notes/export", notes_export)

    def species_notes(req):
        rows = ctx.storage.query("SELECT species_id, body, updated_at FROM notes ORDER BY updated_at DESC")
        return {"notes": [{**r, "name": ctx.dex.name(r["species_id"]), "icon": ctx.dex.sprite_url(r["species_id"])} for r in rows if r["body"].strip()]}
    add("GET", "/api/notes/species", species_notes)
    add("GET", "/api/notes/<nid>", lambda req: ctx.notes.get(req.params["nid"]))

    def notes_patch(req):
        n = ctx.notes.update(req.params["nid"], req.body or {})
        bus.publish("notes", {"id": n["id"]}, origin=req.q("origin"))
        return n
    add("PATCH", "/api/notes/<nid>", notes_patch)

    def note_link_add(req):
        n = ctx.notes.add_link(req.params["nid"], req.body or {})
        bus.publish("notes", {"id": n["id"]}, origin=req.q("origin"))
        return n
    add("POST", "/api/notes/<nid>/links", note_link_add)

    def note_link_del(req):
        n = ctx.notes.remove_link(req.params["nid"], req.params["kind"], unquote(req.params["ref"]))
        bus.publish("notes", {"id": n["id"]}, origin=req.q("origin"))
        return n
    add("DELETE", "/api/notes/<nid>/links/<kind>/<ref>", note_link_del)

    def notes_action(req):
        a = req.params["action"]
        n = ctx.notes.duplicate(req.params["nid"]) if a == "duplicate" else ctx.notes.set_state(req.params["nid"], a)
        bus.publish("notes", {"id": n["id"], "action": a}, origin=req.q("origin"))
        return n
    add("POST", "/api/notes/<nid>/<action>", notes_action)

    def notes_purge(req):
        ctx.notes.purge(req.params["nid"])
        bus.publish("notes", {"id": req.params["nid"], "action": "purge"}, origin=req.q("origin"))
        return {"deleted": True}
    add("DELETE", "/api/notes/<nid>", notes_purge)

    # --------------------------------------------------------------- box
    add("GET", "/api/box", lambda req: {"entries": ctx.box.list(req.q("run") or None, req.q("deleted") == "1"),
                                        "runs": ctx.guides.list_runs()})
    add("GET", "/api/box/<oid>", lambda req: ctx.box.get(req.params["oid"]))

    def box_save(req):
        e = ctx.box.save(req.body or {}, req.params.get("oid"))
        bus.publish("box", {"id": e["id"]}, origin=req.q("origin"))
        return e
    add("POST", "/api/box", box_save)
    add("PUT", "/api/box/<oid>", box_save)

    def box_del(req):
        e = ctx.box.delete(req.params["oid"])
        bus.publish("box", {"id": e["id"]}, origin=req.q("origin"))
        return e
    add("DELETE", "/api/box/<oid>", box_del)

    def box_restore(req):
        e = ctx.box.restore(req.params["oid"])
        bus.publish("box", {"id": e["id"]}, origin=req.q("origin"))
        return e
    add("POST", "/api/box/<oid>/restore", box_restore)

    def box_sync(req):
        res = ctx.box.sync_dex(req.params["oid"], req.json("run_id"), req.json("status"))
        bus.publish("dex.progress", {"run": req.json("run_id")}, origin=req.q("origin"))
        return res
    add("POST", "/api/box/<oid>/sync-dex", box_sync)

    # ---------------------------------------------------------- showcase
    add("GET", "/api/showcases", lambda req: {"showcases": ctx.showcases.list(), "active": ctx.settings.get("showcase.active")})
    add("GET", "/api/showcases/<sid>", lambda req: ctx.showcases.get(req.params["sid"]))

    def sc_save(req):
        sc = ctx.showcases.save(req.body or {}, req.params.get("sid"))
        bus.publish("showcase", {"id": sc["id"]}, origin=req.q("origin"))
        return sc
    add("POST", "/api/showcases", sc_save)
    add("PUT", "/api/showcases/<sid>", sc_save)

    def sc_del(req):
        ok = ctx.showcases.delete(req.params["sid"])
        bus.publish("showcase", {"id": req.params["sid"], "deleted": True}, origin=req.q("origin"))
        return {"deleted": ok}
    add("DELETE", "/api/showcases/<sid>", sc_del)

    # ------------------------------------------------------ custom guides
    add("GET", "/api/cguides", lambda req: {"guides": ctx.cguides.list(req.q("archived") == "1")})
    add("GET", "/api/cguides/<gid>", lambda req: ctx.cguides.get(req.params["gid"]))

    def cg_pub(req, g):
        bus.publish("cguides", {"id": g["id"]}, origin=req.q("origin"))
        return g
    add("POST", "/api/cguides", lambda req: cg_pub(req, ctx.cguides.create(req.body or {})))
    add("PATCH", "/api/cguides/<gid>", lambda req: cg_pub(req, ctx.cguides.update(req.params["gid"], req.body or {})))
    add("PUT", "/api/cguides/<gid>/steps", lambda req: cg_pub(req, ctx.cguides.put_steps(req.params["gid"], req.json("steps", []))))
    add("POST", "/api/cguides/<gid>/mark", lambda req: cg_pub(req, ctx.cguides.mark(req.params["gid"], str(req.json("step_id")), bool(req.json("done")))))
    add("POST", "/api/cguides/<gid>/complete", lambda req: cg_pub(req, ctx.cguides.complete_cycle(req.params["gid"], req.json("note", ""))))
    add("POST", "/api/cguides/<gid>/archive", lambda req: cg_pub(req, ctx.cguides.archive(req.params["gid"], bool(req.json("archived", True)))))
    add("GET", "/api/cguides/<gid>/export", lambda req: {"markdown": ctx.cguides.export_markdown(req.params["gid"])})

    def cg_delete(req):
        ok = ctx.cguides.delete(req.params["gid"])
        bus.publish("cguides", {"id": req.params["gid"], "deleted": True}, origin=req.q("origin"))
        return {"deleted": ok}
    add("DELETE", "/api/cguides/<gid>", cg_delete)

    def cg_preview(req):
        body = req.body or {}
        warnings: list[str] = []
        if body.get("content_b64"):
            try:
                data = base64.b64decode(body["content_b64"], validate=True)
            except (ValueError, TypeError):
                raise LibraryError("File data is not valid base64")
            if len(data) > 8_000_000:
                raise LibraryError("Guide files can be at most 8 MB")
            try:
                text, warnings = doc_to_text(body.get("filename") or "guide.txt", data)
            except (zipfile.BadZipFile, KeyError, ET.ParseError):
                raise LibraryError("The file could not be read as a document")
        else:
            text = str(body.get("text") or "")
        steps = parse_guide_text(text)
        return {"steps": steps, "warnings": warnings, "count": len(steps),
                "title": re.sub(r"\.[a-z]+$", "", body.get("filename") or "") or "Imported guide"}
    add("POST", "/api/cguides/import/preview", cg_preview)

    # ------------------------------------------------------------- media
    def media_add(req):
        return ctx.media.add(req.json("filename", ""), req.json("data_b64", ""), req.json("label", ""))
    add("POST", "/api/media", media_add)
    add("DELETE", "/api/media/<mid>", lambda req: {"deleted": ctx.media.delete(req.params["mid"])})

    # --------------------------------------------------------- locations
    def loc_list(req):
        locs = ctx.dex.locations()
        linked: dict[str, int] = {}
        for l in ctx.storage.query("SELECT ref, COUNT(*) n FROM note_links nl JOIN lib_notes n ON n.id = nl.note_id "
                                   "WHERE nl.kind='location' AND n.deleted_at IS NULL GROUP BY ref"):
            linked[l["ref"]] = l["n"]
        for l in locs:
            l["notes"] = linked.get(l["id"], 0)
        return {"locations": locs, "imported": ctx.dex.imported, "dump_date": (ctx.dex.manifest or {}).get("dump_date")}
    add("GET", "/api/locations", loc_list)

    def loc_detail(req):
        key = unquote(req.params["lid"])
        d = ctx.dex.location(key)
        if not d:
            raise KeyError(key)
        d["notes"] = ctx.notes.list(state="active", kind="location", ref_=key)["notes"]
        d["guides"] = [g for g in ctx.cguides.list() if g.get("location") and g["location"].lower() == d["name"].lower()]
        return d
    add("GET", "/api/locations/<lid>", loc_detail)

    def loc_encounters(req):
        """Compact encounter rows for one region, for the Location Explorer's filters and Pokémon highlighting.
        Row: [location_id, species_id, method, horde (0/3/5), season, times bitmask (1 morning, 2 day, 4 night), min, max]."""
        region = (req.query.get("region") or [""])[0]
        if not hasattr(ctx.dex, "_locations"):
            ctx.dex._build_locations()
        out = []
        for key, v in ctx.dex._locations.items():
            if region and v["region"] != region:
                continue
            for r in v["rows"]:
                on = lambda x: bool(x) and x.get("kind") != "none"  # "Not in this period" is not an encounter
                times = (1 if on(r.get("morning")) else 0) | (2 if on(r.get("day")) else 0) | (4 if on(r.get("night")) else 0)
                out.append([key, r["species_id"], r["method"], 5 if r.get("horde5") else 3 if r.get("horde3") else 0,
                            r.get("season") or "", times, r.get("min"), r.get("max")])
        return {"region": region, "rows": out, "imported": ctx.dex.imported}
    add("GET", "/api/locations-encounters", loc_encounters)

    # -------------------------------------------------- dex observations
    def obs_list(req):
        rows = ctx.storage.query("SELECT * FROM dex_observations ORDER BY observed_at DESC, created_at DESC")
        return {"observations": [{**o, "counters": json.loads(o["counters"])} for o in rows]}
    add("GET", "/api/dex/observations", obs_list)

    def obs_add(req):
        v = validate_observation(req.body or {})
        oid = uuid.uuid4().hex[:12]
        ctx.storage.execute("INSERT INTO dex_observations(id, run_id, observed_at, counters, client_note, created_at) VALUES(?,?,?,?,?,?)",
                            (oid, req.json("run_id"), v["observed_at"], json.dumps(v["counters"]), v["client_note"], utcnow()))
        bus.publish("dex.roster", {"observation": oid}, origin=req.q("origin"))
        return {"id": oid, **v}
    add("POST", "/api/dex/observations", obs_add)

    def obs_del(req):
        n = ctx.storage.execute("DELETE FROM dex_observations WHERE id=?", (req.params["oid"],))
        bus.publish("dex.roster", {}, origin=req.q("origin"))
        return {"deleted": n > 0}
    add("DELETE", "/api/dex/observations/<oid>", obs_del)

    # ---------------------------------------------------------- bookmarks
    from .services.bookmarks import BookmarkError

    def bm(fn):
        def wrap(req):
            try:
                return fn(req)
            except BookmarkError as exc:
                raise ApiError(400, str(exc))
        return wrap

    def bm_pub(req, res):
        bus.publish("bookmarks", {}, origin=req.q("origin"))
        return res
    add("GET", "/api/bookmarks", lambda req: ctx.bookmarks.list(req.q("q") or "", req.q("category") or "", req.q("fav") == "1"))
    add("POST", "/api/bookmarks", bm(lambda req: bm_pub(req, ctx.bookmarks.create(req.body or {}))))
    add("POST", "/api/bookmarks/order", bm(lambda req: bm_pub(req, ctx.bookmarks.reorder(req.json("ids", [])))))
    add("POST", "/api/bookmarks/restore-defaults", lambda req: bm_pub(req, ctx.bookmarks.restore_defaults()))
    add("PATCH", "/api/bookmarks/<bid>", bm(lambda req: bm_pub(req, ctx.bookmarks.update(req.params["bid"], req.body or {}))))
    add("DELETE", "/api/bookmarks/<bid>", lambda req: bm_pub(req, ctx.bookmarks.delete(req.params["bid"])))
    add("POST", "/api/bookmarks/<bid>/restore", lambda req: bm_pub(req, ctx.bookmarks.restore(req.params["bid"])))

    def bm_open(req):
        """Open in the user's default browser. The URL is re-validated from the stored record (never from the request)."""
        from .services.bookmarks import normalize_url
        b = ctx.bookmarks.get(req.params["bid"])
        url = normalize_url(b["url"])
        if ctx.shell.mode == "qt":
            ctx.shell.submit({"action": "open_url", "url": url})
            return {"ok": True, "via": "native", "url": url}
        import webbrowser
        try:
            ok = bool(webbrowser.open(url, new=2))
        except Exception as exc:  # noqa: BLE001 — report, never pretend success
            return {"ok": False, "url": url, "message": f"Could not start your browser: {exc}"}
        return {"ok": ok, "via": "system", "url": url,
                "message": None if ok else "No default browser could be started. Copy the address instead."}
    add("POST", "/api/bookmarks/<bid>/open", bm(bm_open))

    # ---------------------------------------------------------- shortcuts
    from .data import shortcuts as sc

    def sc_list(req):
        cur = ctx.settings.get("shortcuts.bindings")
        eff = {**sc.defaults(), **(cur or {})}
        return {"actions": [{"id": k, "group": v[0], "label": v[1], "default": v[2], "scope": v[3], "binding": eff.get(k)} for k, v in sc.ACTIONS.items()],
                "reserved": sorted(sc.RESERVED), "enabled": ctx.settings.get("shortcuts.enabled"), "global": False,
                "global_note": ("System-wide hotkeys are not implemented: on KDE Wayland applications cannot reliably register them, and the "
                                "Companion never intercepts keys meant for PokeMMO. Shortcuts work while a Companion window (main or popout) has focus.")}
    add("GET", "/api/shortcuts", sc_list)

    def sc_set(req):
        aid = req.params["aid"]
        if aid not in sc.ACTIONS:
            raise KeyError(aid)
        cur = {**sc.defaults(), **(ctx.settings.get("shortcuts.bindings") or {})}
        body = req.body or {}
        if body.get("reset"):
            combo = sc.defaults()[aid]
        else:
            try:
                combo = sc.normalize(body.get("binding"))
            except ValueError as exc:
                raise ApiError(400, str(exc))
        if True:
            clash = next((k for k, v in cur.items() if v and v == combo and k != aid), None)
            if clash and not body.get("replace"):
                raise ApiError(409, f"{combo} is already used by “{sc.ACTIONS[clash][1]}”. Choose another key or replace it.")
            if clash:
                cur[clash] = None
            cur[aid] = combo
        from .settings import SettingsError
        try:
            ctx.settings.update({"shortcuts.bindings": cur})
        except SettingsError as exc:
            raise ApiError(400, str(exc))
        bus.publish("settings", {"keys": ["shortcuts.bindings"]})
        return sc_list(req)
    add("PUT", "/api/shortcuts/<aid>", sc_set)

    def sc_reset_all(req):
        ctx.settings.update({"shortcuts.bindings": None})
        bus.publish("settings", {"keys": ["shortcuts.bindings"]})
        return sc_list(req)
    add("POST", "/api/shortcuts/reset", sc_reset_all)

    _ = Any

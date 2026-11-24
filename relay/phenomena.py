"""Read-only Discord-to-Phenomena relay. Run with python -m relay.phenomena."""
import argparse
import http.client
import json
import math
import os
import re
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request

from companion.phenomenon_protocol import (
    AUTHOR_ID, CHANNEL_ID, FEED_PATH, MAX_REPORTS, REGIONS, merge_report, opener,
    plain, read_json, snowflake, validate_report,
)

DISCORD_URL = f"https://discord.com/api/v10/channels/{CHANNEL_ID}/messages?limit=100"
POLL_SECONDS = 60
TITLE = re.compile(r"(.+?)\s+Pheno\s+at\s+(.+)", re.I)
POSSIBLE = re.compile(r"^Possibly found here:\s*(.+)$", re.I)


def normalize(message, guild_id=None):
    if not isinstance(message, dict) or message.get("channel_id") != CHANNEL_ID:
        return None
    author = message.get("author")
    if not isinstance(author, dict) or author.get("id") != AUTHOR_ID or author.get("bot") is not True:
        return None
    embeds = message.get("embeds")
    if not isinstance(embeds, list):
        return None
    for embed in embeds:
        if not isinstance(embed, dict) or not (match := TITLE.fullmatch(plain(embed.get("title"), 260) or "")):
            continue
        fields = embed.get("fields")
        fields = {plain(f.get("name"), 50).lower(): f.get("value")
                  for f in fields if isinstance(f, dict) and plain(f.get("name"), 50)} if isinstance(fields, list) else {}
        description = plain(embed.get("description"))
        possible = POSSIBLE.search(description.splitlines()[0]) if description else None
        image = embed.get("image")
        image = image if isinstance(image, dict) else {}
        kind, location = match.groups()
        region = plain(fields.get("region"), 20)
        if region:
            region = region.lower()
        elif location.casefold() == "village bridge":
            region = "unova"
        report = validate_report({
            "message_id": message.get("id"), "reported_at": message.get("timestamp"),
            "edited_at": message.get("edited_timestamp"), "type": kind, "location": location,
            "region": region if region in REGIONS else None, "description": description,
            "possible_pokemon": (re.split(r"\s*[,/]\s*", possible[1]) if possible else None),
            "notes": fields.get("notes"), "required_hms": fields.get("hms required"),
            "image_url": image.get("url"), "image_width": image.get("width"),
            "image_height": image.get("height"), "guild_id": guild_id,
        })
        if report:
            return report
    return None


def seconds(value):
    try:
        n = float(value)
        return n if math.isfinite(n) and n >= 0 else 0
    except (TypeError, ValueError, OverflowError):
        return 0


class Relay:
    def __init__(self, token, guild_id=None, fetch=opener.open):
        self.token = token
        self.guild_id = guild_id
        self.fetch = fetch
        self.stop = threading.Event()
        self._lock = threading.Lock()
        self._reports = {}
        self._status = "starting"
        self._last_success = None

    def snapshot(self):
        with self._lock:
            return {"version": 1, "source": {"name": "Alphapedia", "status": self._status,
                                             "last_success_at": self._last_success},
                    "reports": list(self._reports.values())}

    def _failed(self, status, delay=POLL_SECONDS):
        with self._lock:
            self._status = status
        return delay

    def refresh(self):
        req = Request(DISCORD_URL, headers={"Authorization": f"Bot {self.token}",
                      "User-Agent": "DiscordBot (https://github.com/haqzo/PokeMMO-Companion, 1.0)"})
        try:
            with self.fetch(req, timeout=10) as response:
                delay = max(POLL_SECONDS, seconds(response.headers.get("X-RateLimit-Reset-After"))
                            if response.headers.get("X-RateLimit-Remaining") == "0" else 0)
                try:
                    payload = read_json(response)
                except (ValueError, RecursionError):
                    return self._failed("invalid_response", delay)
            if not isinstance(payload, list) or any(not isinstance(m, dict) for m in payload):
                return self._failed("invalid_response", delay)
        except HTTPError as exc:
            with exc:
                delay = max(POLL_SECONDS, seconds(exc.headers.get("Retry-After")))
                if exc.code == 429:
                    try:
                        body = read_json(exc)
                        if isinstance(body, dict):
                            delay = max(delay, seconds(body.get("retry_after")))
                    except (ValueError, RecursionError, OSError, http.client.HTTPException):
                        pass
                    return self._failed("rate_limited", delay)
                if exc.code in (401, 403, 404):
                    return self._failed("access_denied", max(delay, 300))
                return self._failed("offline", delay)
        except (OSError, AttributeError, ValueError, http.client.HTTPException):
            return self._failed("offline")
        with self._lock:
            for message in payload:
                report = normalize(message, self.guild_id)
                if report:
                    mid = report["message_id"]
                    self._reports[mid] = merge_report(self._reports.get(mid), report)
            ordered = sorted(self._reports.values(), key=lambda r: (r["reported_at"], r["message_id"]), reverse=True)
            self._reports = {report["message_id"]: report for report in ordered[:MAX_REPORTS]}
            self._last_success = datetime.now(timezone.utc).isoformat()
            self._status = "connected"
        return delay

    def run(self):
        while not self.stop.is_set():
            # Event.wait has a platform-specific maximum timeout.
            delay = self.refresh()
            until = min(delay, threading.TIMEOUT_MAX)
            if self.stop.wait(until):
                break


def handler(relay):
    class FeedHandler(BaseHTTPRequestHandler):
        def do_HEAD(self):
            self.send_feed(False)

        def do_GET(self):
            self.send_feed(True)

        def send_feed(self, send_body):
            if self.path != FEED_PATH:
                self.send_error(404)
                return
            body = json.dumps(relay.snapshot(), separators=(",", ":"), ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if send_body:
                self.wfile.write(body)

        def log_message(self, *args):
            pass

    return FeedHandler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8767)
    args = parser.parse_args()
    token = os.environ.get("COMPANION_LIVE_DISCORD_TOKEN", "").strip()
    if not token or not re.fullmatch(r"[A-Za-z0-9_.-]+", token):
        parser.error("Set COMPANION_LIVE_DISCORD_TOKEN privately in the relay environment.")
    guild = os.environ.get("COMPANION_LIVE_DISCORD_GUILD_ID") or None
    if guild is not None and not snowflake(guild):
        parser.error("COMPANION_LIVE_DISCORD_GUILD_ID must be a Discord server ID.")
    relay = Relay(token, guild)
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler(relay)) as server:
        worker = threading.Thread(target=relay.run, name="discord-poll", daemon=True)
        worker.start()
        try:
            print(f"Phenomena feed: http://127.0.0.1:{args.port}{FEED_PATH}", flush=True)
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            relay.stop.set()


if __name__ == "__main__":
    main()

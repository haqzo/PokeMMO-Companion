"""Version 1 of the normalized Phenomenon feed, shared by the relay and client."""
import json
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, build_opener

CHANNEL_ID = "1574857618701422602"
AUTHOR_ID = "1499786261118845050"
FEED_PATH = "/v1/phenomena"
IMAGE_HOST = "i.imgur.com"
MAX_FEED_BYTES = 2_000_000
MAX_REPORTS = 200
REGIONS = {"kanto", "johto", "hoenn", "sinnoh", "unova"}
SNOWFLAKE = re.compile(r"[0-9]{17,20}")
IMAGE_URL = re.compile(r"https://i\.imgur\.com/[A-Za-z0-9]{1,64}\.(?:png|jpe?g|webp)", re.I | re.ASCII)


def snowflake(value):
    return value if isinstance(value, str) and SNOWFLAKE.fullmatch(value) else None


def timestamp(value):
    if not isinstance(value, str) or len(value) > 40:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            return dt.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
    except (ValueError, OverflowError):
        pass
    return None


def plain(value, limit=1000):
    if not isinstance(value, str):
        return None
    # Discard messages' Discord user/role mentions and control characters.
    value = re.sub(r"<@(?:[!&])?[0-9]+>", "", value)
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value)
    return value.strip()[:limit] or None


def image_url(value):
    return value if isinstance(value, str) and IMAGE_URL.fullmatch(value) else None


def dimension(value):
    return value if type(value) is int and 0 < value <= 16384 else None


def endpoint_url(value):
    """An explicit HTTPS endpoint or a loopback HTTP endpoint for local testing."""
    if not isinstance(value, str) or len(value) > 500:
        raise ValueError("Enter the relay’s HTTPS URL or a local HTTP URL ending in " + FEED_PATH)
    value = value.strip()
    if not value:
        return ""
    try:
        url = urlsplit(value)
        if (re.fullmatch(r"[a-zA-Z0-9.:[\]/_-]+", value) and url.hostname
                and not url.username and not url.password and not url.query and not url.fragment
                and (url.port is None or 0 < url.port <= 65535)
                and url.path == FEED_PATH
                and (url.scheme == "https" or (url.scheme == "http" and url.hostname in ("127.0.0.1", "::1")))):
            return value
    except ValueError:
        pass
    raise ValueError("Enter the relay’s HTTPS URL or a loopback HTTP URL ending in " + FEED_PATH)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


# Direct connections, without ambient proxy settings or redirect targets.
opener = build_opener(ProxyHandler({}), NoRedirect())


def read_json(stream):
    body = stream.read(MAX_FEED_BYTES + 1)
    if len(body) > MAX_FEED_BYTES:
        raise ValueError("Response exceeds feed size limit")
    return json.loads(body)


def validate_report(raw):
    if not isinstance(raw, dict):
        return None
    mid, created = snowflake(raw.get("message_id")), timestamp(raw.get("reported_at"))
    if not mid or not created:
        return None
    edited = timestamp(raw.get("edited_at"))
    region = plain(raw.get("region"), 20)
    possible = raw.get("possible_pokemon")
    possible = [name for v in possible[:20] if (name := plain(v, 80))] if isinstance(possible, list) else None
    guild = snowflake(raw.get("guild_id"))
    url = image_url(raw.get("image_url"))
    report = {
        "message_id": mid, "reported_at": created, "edited_at": edited if edited and edited >= created else None,
        "type": plain(raw.get("type"), 60), "location": plain(raw.get("location"), 160),
        "region": region if region in REGIONS else None,
        "description": plain(raw.get("description")), "possible_pokemon": possible or None,
        "notes": plain(raw.get("notes"), 500), "required_hms": plain(raw.get("required_hms"), 200),
        "image_url": url, "image_width": dimension(raw.get("image_width")) if url else None,
        "image_height": dimension(raw.get("image_height")) if url else None,
        "source": "Alphapedia", "guild_id": guild,
        "source_url": f"https://discord.com/channels/{guild}/{CHANNEL_ID}/{mid}" if guild else None,
    }
    return report if (report["type"] and report["location"]) or report["description"] or url else None


def merge_report(previous, incoming):
    """Keep the newest edit even if Discord returns repeated or out-of-order rows."""
    if previous is None:
        return incoming
    if (incoming["edited_at"] or "") < (previous["edited_at"] or ""):
        return previous
    return {**incoming, "reported_at": previous["reported_at"]}

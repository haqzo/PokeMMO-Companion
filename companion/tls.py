"""Verified HTTPS contexts for the read-only live provider."""
import ssl
import sys
import urllib.request

from . import __version__


def live_https_context():
    """Use native chain validation on Windows, otherwise preserve OpenSSL defaults."""
    if sys.platform == "win32":
        import truststore

        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    # urllib applies its normal defaults when it owns the OpenSSL context.
    return None


def open_live_feed(url: str, *, timeout: float):
    request = urllib.request.Request(
        url, headers={"User-Agent": f"PokeMMO-Companion/{__version__} (read-only)"}
    )
    return urllib.request.urlopen(request, timeout=timeout, context=live_https_context())

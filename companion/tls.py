"""Verified HTTPS contexts for the read-only live provider."""
import ssl
import sys


def live_https_context():
    """Use native chain validation on Windows, otherwise preserve OpenSSL defaults."""
    if sys.platform == "win32":
        import truststore

        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    return ssl.create_default_context()

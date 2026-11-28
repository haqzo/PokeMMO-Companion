"""Live provider TLS selection; no external network required."""
import ssl
import sys
from types import SimpleNamespace

import pytest

from companion import tls


def test_linux_keeps_default_verification(monkeypatch):
    monkeypatch.setattr(tls, "sys", SimpleNamespace(platform="linux"))
    assert tls.live_https_context() is None


def test_windows_selects_native_verification(monkeypatch):
    calls = []

    class NativeContext:
        verify_mode = ssl.CERT_REQUIRED
        check_hostname = True
        post_handshake_auth = False

        def __init__(self, protocol):
            calls.append(protocol)

        def set_alpn_protocols(self, protocols):
            calls.append(protocols)

    monkeypatch.setattr(tls, "sys", SimpleNamespace(platform="win32"))
    monkeypatch.setitem(sys.modules, "truststore", SimpleNamespace(SSLContext=NativeContext))
    context = tls.live_https_context()
    assert calls == [ssl.PROTOCOL_TLS_CLIENT, ["http/1.1"]]
    assert context.post_handshake_auth
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname


@pytest.mark.skipif(sys.platform != "win32", reason="requires native Windows trust")
def test_real_windows_context():
    import truststore

    context = tls.live_https_context()
    assert isinstance(context, truststore.SSLContext)
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname

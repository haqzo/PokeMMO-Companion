"""Live provider TLS selection; no external network required."""
import ssl
import sys
from types import SimpleNamespace

import pytest

from companion import tls


def test_linux_keeps_default_verification(monkeypatch):
    monkeypatch.setattr(tls, "sys", SimpleNamespace(platform="linux"))
    context = tls.live_https_context()
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname


def test_windows_selects_native_verification(monkeypatch):
    calls = []

    def native_context(protocol):
        calls.append(protocol)
        return ssl.SSLContext(protocol)

    monkeypatch.setattr(tls, "sys", SimpleNamespace(platform="win32"))
    monkeypatch.setitem(sys.modules, "truststore", SimpleNamespace(SSLContext=native_context))
    context = tls.live_https_context()
    assert calls == [ssl.PROTOCOL_TLS_CLIENT]
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname


@pytest.mark.skipif(sys.platform != "win32", reason="requires native Windows trust")
def test_real_windows_context():
    import truststore

    context = tls.live_https_context()
    assert isinstance(context, truststore.SSLContext)
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname

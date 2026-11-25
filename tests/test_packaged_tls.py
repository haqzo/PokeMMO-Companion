"""Packaged entry point must find host trust roots without weakening verification."""
import os
import runpy
import sys
from pathlib import Path

import pytest


@pytest.fixture
def entry(monkeypatch):
    module = runpy.run_path(str(Path(__file__).resolve().parents[1] / "packaging/entry.py"))
    monkeypatch.setattr(os, "environ", dict(os.environ))
    monkeypatch.delenv("SSL_CERT_FILE", raising=False)
    monkeypatch.delenv("SSL_CERT_DIR", raising=False)
    return module["configure_linux_ca_store"]


def test_linux_uses_host_bundle(entry, monkeypatch, tmp_path):
    bundle = tmp_path / "ca.pem"
    bundle.write_text("test")
    monkeypatch.setattr(sys, "platform", "linux")
    monkeypatch.setitem(entry.__globals__, "LINUX_CA_BUNDLES", (str(tmp_path / "missing"), str(bundle)))
    entry()
    assert os.environ["SSL_CERT_FILE"] == str(bundle)


@pytest.mark.parametrize("key", ["SSL_CERT_FILE", "SSL_CERT_DIR"])
def test_explicit_override_preserved(entry, monkeypatch, key):
    monkeypatch.setattr(sys, "platform", "linux")
    monkeypatch.setenv(key, "/custom/trust")
    entry()
    assert os.environ[key] == "/custom/trust"
    assert ("SSL_CERT_DIR" if key == "SSL_CERT_FILE" else "SSL_CERT_FILE") not in os.environ


def test_windows_keeps_native_trust(entry, monkeypatch):
    monkeypatch.setattr(sys, "platform", "win32")
    entry()
    assert "SSL_CERT_FILE" not in os.environ
    assert "SSL_CERT_DIR" not in os.environ


def test_missing_bundle_leaves_defaults(entry, monkeypatch, tmp_path):
    monkeypatch.setattr(sys, "platform", "linux")
    monkeypatch.setitem(entry.__globals__, "LINUX_CA_BUNDLES", (str(tmp_path / "missing"),))
    entry()
    assert "SSL_CERT_FILE" not in os.environ
    assert "SSL_CERT_DIR" not in os.environ

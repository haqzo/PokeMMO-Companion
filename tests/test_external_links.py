import json
import os
import sys
from threading import Event

import pytest

from companion.services import external_links


@pytest.mark.skipif(os.name != "posix", reason="POSIX launcher subprocess")
@pytest.mark.parametrize("frozen", [False, True], ids=["source", "frozen"])
def test_linux_external_process_gets_host_environment(monkeypatch, tmp_path, frozen):
    host_tools = tmp_path / "bin"
    host_tools.mkdir()
    capture = tmp_path / "browser-env.json"
    opener = host_tools / "xdg-open"
    opener.write_text(
        f"#!{sys.executable}\n"
        "import json, os, sys\n"
        "from pathlib import Path\n"
        "Path(os.environ['TEST_BROWSER_CAPTURE']).write_text(json.dumps([sys.argv[1:], dict(os.environ)]))\n"
    )
    opener.chmod(0o755)

    appdir = tmp_path / "AppDir"
    bundle = appdir / "usr/lib/pokemmo-companion/_internal"
    bundle_bin = appdir / "usr/bin"
    bundle_bin.mkdir(parents=True)
    bundle.mkdir(parents=True)
    (bundle_bin / "xdg-open").write_text("#!/bin/sh\nexit 1\n")
    (bundle_bin / "xdg-open").chmod(0o755)
    host_lib = tmp_path / "AppDir-sibling" / "lib"
    lib = os.pathsep.join((str(bundle), str(host_lib))) if frozen else str(host_lib)
    path = os.pathsep.join((str(bundle_bin), str(host_tools))) if frozen else str(host_tools)
    monkeypatch.setattr(sys, "platform", "linux")
    monkeypatch.setenv("PATH", path)
    monkeypatch.setenv("LD_LIBRARY_PATH", lib)
    monkeypatch.setenv("QT_PLUGIN_PATH", str(bundle / "plugins") if frozen else "/host/qt/plugins")
    monkeypatch.setenv("QML2_IMPORT_PATH", f"{bundle}/qml:/host/qml" if frozen else "/host/qml")
    monkeypatch.setenv("XDG_DATA_DIRS", f"{appdir}/usr/share:/usr/share" if frozen else "/usr/share")
    monkeypatch.setenv("XDG_CURRENT_DESKTOP", "KDE")
    monkeypatch.setenv("TEST_BROWSER_CAPTURE", str(capture))
    if frozen:
        monkeypatch.setattr(sys, "frozen", True, raising=False)
        monkeypatch.setattr(sys, "_MEIPASS", str(bundle), raising=False)
        monkeypatch.setenv("APPDIR", str(appdir))
        monkeypatch.setenv("APPIMAGE", "/path/to/Companion.AppImage")
        # The original path may already include an AppImage path.
        monkeypatch.setenv("LD_LIBRARY_PATH_ORIG", os.pathsep.join((str(host_lib), str(appdir / "usr/lib"))))
    else:
        for key in ("APPDIR", "APPIMAGE", "LD_LIBRARY_PATH_ORIG"):
            monkeypatch.delenv(key, raising=False)
    before = dict(os.environ)
    # Use a real subprocess, while waiting for it deterministically in the test.
    popen = external_links.subprocess.Popen
    processes = []

    def capture_process(*args, **kwargs):
        process = popen(*args, **kwargs)
        processes.append(process)
        return process

    monkeypatch.setattr(external_links.subprocess, "Popen", capture_process)
    url = "https://example.org/news?item=1&next=%3Btest#section"
    assert external_links.open_external_url(url)
    assert processes[0].wait(timeout=5) == 0
    args, child = json.loads(capture.read_text())
    assert args == [url]
    assert child["LD_LIBRARY_PATH"] == str(host_lib)
    assert child["PATH"] == str(host_tools)
    assert child["QML2_IMPORT_PATH"] == "/host/qml"
    assert child["XDG_DATA_DIRS"] == "/usr/share"
    assert child["XDG_CURRENT_DESKTOP"] == "KDE"
    assert child.get("QT_PLUGIN_PATH") == (None if frozen else "/host/qt/plugins")
    assert {"APPDIR", "APPIMAGE", "LD_LIBRARY_PATH_ORIG"}.isdisjoint(child)
    assert dict(os.environ) == before


def test_frozen_linux_clears_library_path_without_original(monkeypatch, tmp_path):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path / "_internal"), raising=False)
    monkeypatch.delenv("LD_LIBRARY_PATH_ORIG", raising=False)
    monkeypatch.setenv("LD_LIBRARY_PATH", str(tmp_path / "_internal"))
    assert "LD_LIBRARY_PATH" not in external_links.linux_browser_environment()
    assert os.environ["LD_LIBRARY_PATH"] == str(tmp_path / "_internal")


@pytest.mark.parametrize("url", ["file:///etc/passwd", "data:text/plain,hi", "javascript:alert(1)",
                                  "https://", "https://[broken", "https://user:pass@example.org/",
                                  "https://example.org/\n"])
def test_external_launcher_rejects_invalid_urls(url, monkeypatch):
    monkeypatch.setattr(sys, "platform", "win32")
    assert not external_links.open_external_url(url, desktop_open=lambda _: pytest.fail("URL passed validation"))


def test_windows_uses_desktop_handler(monkeypatch):
    monkeypatch.setattr(sys, "platform", "win32")
    opened = []
    url = "https://example.org/"
    assert external_links.open_external_url(url, desktop_open=lambda address: opened.append(address) or True)
    assert opened == [url]


@pytest.mark.skipif(os.name != "posix", reason="POSIX launcher subprocess")
def test_linux_launcher_missing_and_nonzero_exit(monkeypatch, tmp_path):
    monkeypatch.setattr(sys, "platform", "linux")
    monkeypatch.delenv("APPDIR", raising=False)
    monkeypatch.setenv("PATH", str(tmp_path))
    url = "https://example.org/"
    assert not external_links.open_external_url(url)
    gio = tmp_path / "gio"
    gio.write_text('#!/bin/sh\n[ "$1" = "open" ] && [ "$2" = "https://example.org/" ] && exit 8\nexit 0\n')
    gio.chmod(0o755)
    failed = Event()
    assert external_links.open_external_url(url, on_failure=failed.set)
    assert failed.wait(5)

import os

from companion.__main__ import choose_qt_platform, main


def test_self_check_passes(tmp_path, capsys):
    assert main(["--check", "--data-dir", str(tmp_path)]) == 0
    assert '"ok": true' in capsys.readouterr().out


def test_platform_choice(monkeypatch):
    for k in ("QT_QPA_PLATFORM", "WAYLAND_DISPLAY", "DISPLAY", "XDG_CURRENT_DESKTOP"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr("sys.platform", "linux")
    monkeypatch.setenv("WAYLAND_DISPLAY", "wayland-0")
    monkeypatch.setenv("DISPLAY", ":0")
    monkeypatch.setenv("XDG_CURRENT_DESKTOP", "KDE")
    assert choose_qt_platform("auto", None) == "xcb;wayland"
    assert "QT_QPA_PLATFORM" not in os.environ
    assert choose_qt_platform("auto", "wayland") == "wayland"
    monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")
    assert choose_qt_platform("auto", "xwayland") == "offscreen"  # user's explicit env wins

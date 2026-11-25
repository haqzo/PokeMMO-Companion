"""Native window shell: PySide6 + QtWebEngine hosting the same local UI.

Only window-management lives here (main window, frameless popouts, custom
toasts, tray, OS notifications). All data and logic stay in the backend so the
browser fallback behaves the same.

Platform honesty (docs/design/00, research phase-3/07):
  * On native Wayland, compositors decide window position and usually ignore
    "always on top"; capabilities are reported as unavailable instead of faked.
    The launcher defaults to XWayland on KDE so pinning and placement work.
  * Toasts never take keyboard focus (WindowDoesNotAcceptFocus +
    WA_ShowWithoutActivating) and only cover their own small rectangle.
"""
from __future__ import annotations

import json
import logging
import os
import queue
import sys
import time
from pathlib import Path

from PySide6.QtCore import QCoreApplication, QPoint, QRect, QSize, Qt, QTimer, QUrl
from PySide6.QtGui import QAction, QCursor, QDesktopServices, QGuiApplication, QIcon, QPixmap
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import (QApplication, QFileDialog, QFrame, QHBoxLayout, QLabel, QMainWindow, QMenu,
                               QPushButton, QSizeGrip, QSlider, QSystemTrayIcon, QToolButton, QVBoxLayout,
                               QWidget, QWidgetAction)

from .. import APP_NAME, __version__
from ..config import UI_DIR
from ..localization import native_text
from ..data.window_presets import clamp, target_size
from ..services.external_links import open_external_url

log = logging.getLogger("companion.qt")

TOOL_TITLES = {"storyline": "Storyline", "pokedex": "Pokédex", "reports": "Alpha & Swarm reports",
               "typechart": "Type matchups", "breeding": "Breeding", "legendaries": "Legendaries",
               "phenomena": "Phenomena", "cave": "Altering Cave", "natures": "Natures", "notes": "Notes", "items": "Item Library",
               "showcase": "Showcase", "customguide": "My guide", "locations": "Locations", "timers": "Timers", "box": "My Box",
               "calculator": "Calculator"}

QSS = """
QWidget#bar { background: rgba(30, 36, 55, 242); border-top-left-radius: 10px; border-top-right-radius: 10px;
              border: 1px solid #4f525d; border-bottom: 1px solid #2b2d3b; }
QLabel#title { color: #ebecf1; font-weight: 600; padding-left: 6px; }
QToolButton { color: #b6b9c4; background: transparent; border: 1px solid transparent; border-radius: 5px;
              padding: 2px 6px; min-width: 22px; min-height: 22px; }
QToolButton:hover { background: #30344a; color: #ffffff; }
QToolButton:checked { background: #2c2f44; border-color: #4f525d; color: #ffffff; }
QToolButton::menu-indicator { image: none; width: 0; }
QMenu { background: #161924; color: #ebecf1; border: 1px solid #4f525d; padding: 4px; }
QMenu::item { padding: 5px 18px; border-radius: 4px; }
QMenu::item:selected { background: #30344a; }
QFrame#toast { background: rgba(22, 25, 36, 250); border: 1px solid #4f525d; border-radius: 10px; }
QFrame#toast[test="true"] { border-color: #4fb3b8; }
QLabel#tkind { color: #e8b04b; font-size: 10px; font-weight: 700; letter-spacing: 1px; }
QLabel#tkind[test="true"] { color: #4fb3b8; }
QLabel#ttitle { color: #ebecf1; font-weight: 600; }
QLabel#tline { color: #b6b9c4; }
QLabel#tmeta { color: #8d909b; font-size: 11px; }
QPushButton { background: #383a48; color: #ebecf1; border: 1px solid #2b2d3b; border-radius: 5px; padding: 3px 10px; }
QPushButton:hover { background: #42455a; }
QSlider::groove:horizontal { height: 4px; background: #0b0c13; border-radius: 2px; }
QSlider::handle:horizontal { background: #eef1f4; width: 12px; margin: -5px 0; border-radius: 6px; }
"""


def _settings_set(ctx, values: dict) -> None:
    try:
        clean = ctx.settings.update(values)
        ctx.bus.publish("settings", clean, origin="qt-shell")
    except Exception:  # pragma: no cover
        log.exception("could not save settings %s", values)


# ----------------------------------------------------------------- web pages
class CompanionPage(QWebEnginePage):
    """Keeps navigation inside the local UI; external links open in the system browser."""

    def __init__(self, profile, parent, base: str, open_external):
        super().__init__(profile, parent)
        self._base = base
        self._open_external = open_external

    def acceptNavigationRequest(self, url, nav_type, is_main_frame):  # noqa: N802 (Qt API)
        if url.toString().startswith(self._base) or url.scheme() in ("data", "blob", "about"):
            return True
        if is_main_frame and url.scheme() in ("http", "https"):
            self._open_external(url)
        return False

    def createWindow(self, _type):  # noqa: N802 - target=_blank → external browser
        return _ExternalOpener(self.profile(), self, self._open_external)


class _ExternalOpener(QWebEnginePage):
    def __init__(self, profile, parent, open_external):
        super().__init__(profile, parent)
        self._open_external = open_external

    def acceptNavigationRequest(self, url, nav_type, is_main_frame):  # noqa: N802 (Qt API)
        if url.toString() == "about:blank":
            return True
        if is_main_frame:
            if url.scheme() in ("http", "https"):
                self._open_external(url)
            self.deleteLater()
        return False


def _make_view(shell, url: str, transparent: bool) -> QWebEngineView:
    view = QWebEngineView()
    page = CompanionPage(shell.profile, view, shell.server.base_url, shell.open_external)
    if transparent:
        page.setBackgroundColor(Qt.transparent)
    view.setPage(page)
    view.setContextMenuPolicy(Qt.NoContextMenu)
    view.load(QUrl(url))
    return view


# ------------------------------------------------------------------- popouts
class TitleBar(QWidget):
    def __init__(self, popout: "Popout"):
        super().__init__(popout)
        self.p = popout
        self.setObjectName("bar")
        self.setAttribute(Qt.WA_StyledBackground, True)
        lay = QHBoxLayout(self)
        lay.setContentsMargins(6, 3, 4, 3)
        lay.setSpacing(2)
        self.title = QLabel(popout.shell.tr_ui(TOOL_TITLES.get(popout.tool, popout.tool)))
        self.title.setObjectName("title")
        lay.addWidget(self.title, 1)

        self._button_labels = []
        self._action_labels = []
        self._text_labels = []
        caps = popout.shell.caps
        self.pin = self._btn("📌", "Pin: keep above other windows" if caps["pin"] else
                             "Pin is not supported on native Wayland — relaunch with --xwayland", checkable=True)
        self.pin.setEnabled(caps["pin"])
        self.pin.toggled.connect(lambda on: popout.set_pinned(on, save=True))
        self.mode = self._btn("S", "Display mode")
        self.mode.setPopupMode(QToolButton.ToolButtonPopupMode.InstantPopup)
        menu = QMenu(self)
        for m, label in (("compact", "Compact"), ("standard", "Standard"), ("expanded", "Expanded")):
            act = self._menu_action(label, menu)
            act.triggered.connect(lambda _=False, mm=m: popout.set_mode(mm, save=True))
            menu.addAction(act)
        menu.addSeparator()
        reset = self._menu_action("Reset this mode to its preset size", menu)
        reset.triggered.connect(popout.reset_mode_size)
        keep = self._menu_action("Keep my size when switching modes", menu)
        keep.setCheckable(True)
        keep.setChecked(bool(popout.pref("keep_size")))
        keep.toggled.connect(lambda on: _settings_set(popout.shell.ctx, {f"window.{popout.tool}.keep_size": on}))
        menu.addAction(reset)
        menu.addAction(keep)
        self.keep_action = keep
        self.mode.setMenu(menu)
        self.opacity = self._btn("◐", "Window opacity" if caps["window_opacity"] else "Window opacity not supported here")
        self.opacity.setEnabled(caps["window_opacity"])
        self.opacity.setPopupMode(QToolButton.ToolButtonPopupMode.InstantPopup)
        omenu = QMenu(self)
        slider = QSlider(Qt.Horizontal)
        slider.setRange(40, 100)
        slider.setSingleStep(5)
        slider.setFixedWidth(160)
        slider.setValue(int(popout.pref("window_opacity") or 100))
        slider.valueChanged.connect(lambda v: popout.setWindowOpacity(v / 100))
        slider.sliderReleased.connect(lambda: _settings_set(popout.shell.ctx, {f"window.{popout.tool}.window_opacity": slider.value()}))
        wa = QWidgetAction(omenu)
        holder = QWidget()
        hl = QHBoxLayout(holder)
        hl.setContentsMargins(10, 6, 10, 6)
        window_label = QLabel(popout.shell.tr_ui("Window"))
        self._text_labels.append((window_label, "Window"))
        hl.addWidget(window_label)
        hl.addWidget(slider)
        wa.setDefaultWidget(holder)
        omenu.addAction(wa)
        self.opacity.setMenu(omenu)
        self.slider = slider
        self.lock = self._btn("🔒", "Lock position (prevents accidental dragging)", checkable=True)
        self.lock.toggled.connect(lambda on: popout.set_locked(on, save=True))
        mini = self._btn("–", "Minimise")
        mini.clicked.connect(popout.showMinimized)
        close = self._btn("✕", "Close popout (data is kept)")
        close.clicked.connect(popout.close)
        for b in (self.pin, self.mode, self.opacity, self.lock, mini, close):
            lay.addWidget(b)

    def _btn(self, text: str, tip: str, checkable: bool = False) -> QToolButton:
        b = QToolButton(self)
        b.setText(text)
        self._button_labels.append((b, tip))
        tip = self.p.shell.tr_ui(tip)
        b.setToolTip(tip)
        b.setAccessibleName(tip)
        b.setCheckable(checkable)
        b.setFocusPolicy(Qt.NoFocus)
        return b

    def _menu_action(self, label: str, menu: QMenu) -> QAction:
        action = QAction(self.p.shell.tr_ui(label), menu)
        self._action_labels.append((action, label))
        return action

    def retranslate(self) -> None:
        tr = self.p.shell.tr_ui
        for button, label in self._button_labels:
            button.setToolTip(tr(label))
            button.setAccessibleName(tr(label))
        for widget, label in self._action_labels + self._text_labels:
            widget.setText(tr(label))

    def mousePressEvent(self, e):  # noqa: N802
        if e.button() == Qt.LeftButton and not self.p.locked:
            handle = self.window().windowHandle()
            if handle is not None and handle.startSystemMove():
                return
            self._drag = e.globalPosition().toPoint() - self.window().frameGeometry().topLeft()
        super().mousePressEvent(e)

    def mouseMoveEvent(self, e):  # noqa: N802 - fallback manual drag
        drag = getattr(self, "_drag", None)
        if drag is not None and e.buttons() & Qt.LeftButton and not self.p.locked:
            self.window().move(e.globalPosition().toPoint() - drag)
        super().mouseMoveEvent(e)

    def mouseReleaseEvent(self, e):  # noqa: N802
        self._drag = None
        super().mouseReleaseEvent(e)


class Popout(QWidget):
    EDGE = 6

    def __init__(self, shell: "QtShell", tool: str, mode: str, hash_: str = ""):
        super().__init__(None, Qt.Window | Qt.FramelessWindowHint)
        self.shell, self.tool = shell, tool
        self.mode = mode if mode in ("compact", "standard", "expanded") else "standard"
        self._programmatic_resize = False
        self.locked = bool(self.pref("locked"))
        self.setAttribute(Qt.WA_TranslucentBackground, True)
        self.setAttribute(Qt.WA_DeleteOnClose, True)
        self.setWindowTitle(f"{shell.tr_ui(TOOL_TITLES.get(tool, tool))} — {APP_NAME}")
        self.setMinimumSize(260, 180)
        self.setMouseTracking(True)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(self.EDGE, self.EDGE, self.EDGE, self.EDGE)
        lay.setSpacing(0)
        self.bar = TitleBar(self)
        url = shell.server.url(hash_ or "#/", popout=tool, mode=mode)
        self.view = _make_view(shell, url, transparent=True)
        self.view.titleChanged.connect(self._localized_title)
        lay.addWidget(self.bar)
        lay.addWidget(self.view, 1)
        self.grip = QSizeGrip(self)
        self.grip.resize(16, 16)
        self._save_timer = QTimer(self)
        self._save_timer.setSingleShot(True)
        self._save_timer.timeout.connect(self._save_geometry)
        self.restore_geometry()
        self.apply_prefs(initial=True)

    # -------------------------------------------------------------- prefs
    def _localized_title(self, title: str) -> None:
        suffix = f" — {APP_NAME}"
        if title.endswith(suffix):
            self.setWindowTitle(title)
            self.bar.title.setText(title.removesuffix(suffix))

    def pref(self, key: str):
        return self.shell.ctx.settings.get(f"window.{self.tool}.{key}")

    def apply_prefs(self, initial: bool = False) -> None:
        caps = self.shell.caps
        mode = self.pref("mode") or "standard"
        if not initial and mode != self.mode:
            self.set_mode(mode, save=False)  # changed from a web control (footer buttons / Settings)
        self.bar.mode.setText({"compact": "C", "standard": "S", "expanded": "E"}.get(self.mode, "S"))
        if caps["window_opacity"]:
            self.setWindowOpacity((self.pref("window_opacity") or 100) / 100)
            self.bar.slider.blockSignals(True)
            self.bar.slider.setValue(int(self.pref("window_opacity") or 100))
            self.bar.slider.blockSignals(False)
        pinned = bool(self.pref("pinned")) and caps["pin"]
        if pinned != bool(self.windowFlags() & Qt.WindowStaysOnTopHint) or initial:
            self.bar.pin.blockSignals(True)
            self.bar.pin.setChecked(pinned)
            self.bar.pin.blockSignals(False)
            self.set_pinned(pinned, save=False)
        self.bar.keep_action.blockSignals(True)
        self.bar.keep_action.setChecked(bool(self.pref("keep_size")))
        self.bar.keep_action.blockSignals(False)
        self.locked = bool(self.pref("locked"))
        self.bar.lock.blockSignals(True)
        self.bar.lock.setChecked(self.locked)
        self.bar.lock.blockSignals(False)
        self.grip.setVisible(not self.locked)

    def set_pinned(self, on: bool, save: bool) -> None:
        geo = self.geometry()
        visible = self.isVisible()
        self.setWindowFlag(Qt.WindowStaysOnTopHint, on)
        if visible:
            self.setGeometry(geo)
            self.show()
        if save:
            _settings_set(self.shell.ctx, {f"window.{self.tool}.pinned": on})

    def set_mode(self, mode: str, save: bool) -> None:
        """Switch display mode. Resizes ONCE to the mode's size (your remembered size for that mode,
        else the tool preset) unless 'keep my size' is on; free resizing continues afterwards."""
        changed = mode != self.mode
        self.mode = mode
        self.bar.mode.setText(mode[0].upper())
        if changed and not self.pref("keep_size"):
            self.apply_mode_size()
        if save:
            _settings_set(self.shell.ctx, {f"window.{self.tool}.mode": mode})  # page re-renders via SSE

    def apply_mode_size(self) -> None:
        w, h = target_size(self.tool, self.mode, self.pref("sizes"))
        screen = (self.windowHandle().screen() if self.windowHandle() else None) or QGuiApplication.primaryScreen()
        if screen is not None:
            avail = screen.availableGeometry()
            w, h = clamp(w, h, avail.width(), avail.height())
        self._programmatic_resize = True
        self.resize(w, h)
        QTimer.singleShot(1000, self._end_programmatic)  # longer than the 600 ms save debounce
        if self.shell.caps["position"] and screen is not None:  # keep the whole window on its screen
            avail = screen.availableGeometry()
            x = min(max(self.x(), avail.left()), avail.right() - w)
            y = min(max(self.y(), avail.top()), avail.bottom() - h)
            if (x, y) != (self.x(), self.y()):
                self.move(x, y)

    def reset_mode_size(self) -> None:
        sizes = dict(self.pref("sizes") or {})
        sizes.pop(self.mode, None)
        _settings_set(self.shell.ctx, {f"window.{self.tool}.sizes": sizes})
        self.apply_mode_size()

    def _end_programmatic(self) -> None:
        self._programmatic_resize = False

    def set_locked(self, on: bool, save: bool) -> None:
        self.locked = on
        self.grip.setVisible(not on)
        if save:
            _settings_set(self.shell.ctx, {f"window.{self.tool}.locked": on})

    # ----------------------------------------------------------- geometry
    def restore_geometry(self) -> None:
        g = self.pref("geometry") or {}
        w, h = target_size(self.tool, self.mode, self.pref("sizes"))
        screen = QGuiApplication.primaryScreen()
        if self.shell.caps["position"] and "x" in g and "y" in g:
            from .geometry import fit_window
            screens = [(s.availableGeometry().x(), s.availableGeometry().y(), s.availableGeometry().width(), s.availableGeometry().height())
                       for s in QGuiApplication.screens()]
            x, y, _w, _h = fit_window((int(g["x"]), int(g["y"]), w, h), screens)   # title bar always reachable
            found = QGuiApplication.screenAt(QPoint(x + 40, y + 10))
            if found is not None:
                screen = found
            self.move(QPoint(x, y))
        if screen is not None:
            avail = screen.availableGeometry()
            w, h = clamp(w, h, avail.width(), avail.height())
        self.resize(w, h)

    def _save_geometry(self) -> None:
        g = {"w": self.width(), "h": self.height()}
        if self.shell.caps["position"]:
            g.update(x=self.x(), y=self.y())
        values = {f"window.{self.tool}.geometry": g}
        if not self._programmatic_resize:  # remember a size you chose by hand, per mode
            sizes = dict(self.pref("sizes") or {})
            if sizes.get(self.mode) != {"w": self.width(), "h": self.height()}:
                sizes[self.mode] = {"w": self.width(), "h": self.height()}
                values[f"window.{self.tool}.sizes"] = sizes
        _settings_set(self.shell.ctx, values)

    def moveEvent(self, e):  # noqa: N802
        self._save_timer.start(600)
        super().moveEvent(e)

    def resizeEvent(self, e):  # noqa: N802
        self.grip.move(self.width() - self.grip.width() - 2, self.height() - self.grip.height() - 2)
        self._save_timer.start(600)
        super().resizeEvent(e)

    # ------------------------------------------------- frameless edge resize
    def _edges(self, pos: QPoint):
        r = self.rect()
        e = Qt.Edge(0)
        if pos.x() <= self.EDGE:
            e |= Qt.LeftEdge
        if pos.x() >= r.width() - self.EDGE:
            e |= Qt.RightEdge
        if pos.y() <= self.EDGE:
            e |= Qt.TopEdge
        if pos.y() >= r.height() - self.EDGE:
            e |= Qt.BottomEdge
        return e

    def mouseMoveEvent(self, e):  # noqa: N802
        edges = self._edges(e.position().toPoint())
        shape = Qt.ArrowCursor
        if not self.locked and edges:
            if edges in (Qt.LeftEdge | Qt.TopEdge, Qt.RightEdge | Qt.BottomEdge):
                shape = Qt.SizeFDiagCursor
            elif edges in (Qt.RightEdge | Qt.TopEdge, Qt.LeftEdge | Qt.BottomEdge):
                shape = Qt.SizeBDiagCursor
            elif edges & (Qt.LeftEdge | Qt.RightEdge):
                shape = Qt.SizeHorCursor
            else:
                shape = Qt.SizeVerCursor
        self.setCursor(QCursor(shape))
        super().mouseMoveEvent(e)

    def mousePressEvent(self, e):  # noqa: N802
        edges = self._edges(e.position().toPoint())
        if e.button() == Qt.LeftButton and edges and not self.locked and self.windowHandle() is not None:
            self.windowHandle().startSystemResize(edges)
            return
        super().mousePressEvent(e)

    def closeEvent(self, e):  # noqa: N802
        self._save_geometry()
        self.shell.popouts.pop(self.tool, None)
        super().closeEvent(e)


# --------------------------------------------------------------------- toast
class Toast(QWidget):
    def __init__(self, shell: "QtShell", payload: dict):
        flags = Qt.Tool | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.WindowDoesNotAcceptFocus
        super().__init__(None, flags)
        self.shell, self.payload = shell, payload
        self.setAttribute(Qt.WA_ShowWithoutActivating, True)
        self.setAttribute(Qt.WA_TranslucentBackground, True)
        self.setAttribute(Qt.WA_DeleteOnClose, True)
        self.setFocusPolicy(Qt.NoFocus)
        frame = QFrame(self)
        frame.setObjectName("toast")
        test = "true" if payload.get("is_test") else "false"
        frame.setProperty("test", test)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(frame)
        row = QHBoxLayout(frame)
        row.setContentsMargins(12, 10, 10, 10)
        icon = QLabel()
        icon.setFixedSize(40, 40)
        pix = self._icon(payload.get("species_icon"))
        if pix is not None:
            icon.setPixmap(pix)
        row.addWidget(icon, 0, Qt.AlignTop)
        col = QVBoxLayout()
        col.setSpacing(2)
        kind = QLabel(shell.tr_ui("TEST · NOT A REAL REPORT") if payload.get("is_test") else shell.tr_ui(str(payload.get("kind", "report")).upper()))
        kind.setObjectName("tkind")
        kind.setProperty("test", test)
        title = QLabel(payload.get("title", ""))
        title.setObjectName("ttitle")
        title.setWordWrap(True)
        title.setTextFormat(Qt.PlainText)
        line = QLabel(payload.get("line", ""))
        line.setObjectName("tline")
        line.setWordWrap(True)
        line.setTextFormat(Qt.PlainText)
        meta = QLabel(payload.get("meta") or shell.tr_ui("Reported {time}").format(time=_rel(payload.get("reported"), shell.tr_ui)))
        meta.setObjectName("tmeta")
        btns = QHBoxLayout()
        open_b = QPushButton(payload.get("open_label") or shell.tr_ui("Open in Live"))
        open_b.setFocusPolicy(Qt.NoFocus)
        open_b.clicked.connect(self._open)
        btns.addWidget(open_b)
        btns.addStretch(1)
        for w in (kind, title, line, meta):
            col.addWidget(w)
        col.addLayout(btns)
        row.addLayout(col, 1)
        close = QToolButton()
        close.setText("✕")
        close.setAccessibleName(shell.tr_ui("Dismiss notification"))
        close.setToolTip(shell.tr_ui("Dismiss notification"))
        close.setFocusPolicy(Qt.NoFocus)
        close.clicked.connect(self.close)
        row.addWidget(close, 0, Qt.AlignTop)
        self.setFixedWidth(360)
        self.setWindowOpacity(max(0.6, min(1.0, (payload.get("opacity") or 94) / 100)))
        QTimer.singleShot(int(max(3, min(60, payload.get("duration") or 8)) * 1000), self.close)

    def _icon(self, url: str | None):
        if not url or not url.startswith("/assets/private/"):
            return None
        rel = url[len("/assets/private/"):].split("?", 1)[0]  # sprite URLs carry a ?v= cache version
        path = self.shell.ctx.paths.assets_dir / rel
        if not path.is_file():
            return None
        pix = QPixmap(str(path))
        return pix.scaled(QSize(40, 40), Qt.KeepAspectRatio, Qt.FastTransformation) if not pix.isNull() else None

    def _open(self):
        route = self.payload.get("route")
        self.shell.navigate_main(route if isinstance(route, str) and route.startswith("#/") else f"#/live/reports/{self.payload.get('id')}")
        self.close()

    def closeEvent(self, e):  # noqa: N802
        if self in self.shell.toasts:
            self.shell.toasts.remove(self)
        self.shell.layout_toasts()
        super().closeEvent(e)


def _rel(iso: str | None, tr) -> str:
    if not iso:
        return tr("at an unknown time")
    try:
        from datetime import datetime, timezone
        t = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        s = (datetime.now(timezone.utc) - t).total_seconds()
        if s < 60:
            return tr("just now")
        if s < 3600:
            return tr("{count} min ago").format(count=int(s // 60))
        if s < 86400:
            return tr("{count} h ago").format(count=int(s // 3600))
        return t.strftime("%Y-%m-%d")
    except ValueError:
        return iso


# ---------------------------------------------------------------- main window
def _ui_zoom(settings) -> float:
    """Interface scale for the main window (Settings › Layout & scaling). Qt's zoom factor works in CSS pixels on top
    of the desktop's own scaling, so the two multiply once — the page never sees a second device-pixel ratio."""
    try:
        return max(0.75, min(1.5, int(settings.get("appearance.ui_scale") or 100) / 100))
    except (TypeError, ValueError):
        return 1.0


class MainWindow(QMainWindow):
    def __init__(self, shell: "QtShell"):
        super().__init__()
        self.shell = shell
        self.setWindowTitle(f"{APP_NAME} {__version__}")
        icon_path = UI_DIR / "img" / "pokeball.svg"
        if icon_path.exists():
            self.setWindowIcon(QIcon(str(icon_path)))
        route = shell.ctx.settings.get("app.last_route") if shell.ctx.settings.get("app.restore_last_page") else "#/home"
        self.view = _make_view(shell, shell.server.url(route or "#/home"), transparent=False)
        self.setCentralWidget(self.view)
        self.apply_ui_scale()
        self.view.loadFinished.connect(lambda _ok: self.apply_ui_scale())   # Qt can drop the factor on reload
        self.setMinimumSize(800, 560)
        g = shell.ctx.settings.get("window.main.geometry") or {}
        w, h = int(g.get("w", 1180)), int(g.get("h", 780))
        primary = QGuiApplication.primaryScreen()
        if primary is not None:                      # never bigger than the screen it opens on
            av = primary.availableGeometry()
            w, h = min(w, av.width()), min(h, av.height())
        self.resize(w, h)
        if shell.caps["position"] and "x" in g and "y" in g:
            from .geometry import fit_window
            screens = [(s.availableGeometry().x(), s.availableGeometry().y(), s.availableGeometry().width(), s.availableGeometry().height())
                       for s in QGuiApplication.screens()]
            x, y, w, h = fit_window((int(g["x"]), int(g["y"]), int(g.get("w", w)), int(g.get("h", h))), screens)
            self.setGeometry(x, y, w, h)
        self._hint_shown = False

    def apply_ui_scale(self) -> None:
        z = _ui_zoom(self.shell.ctx.settings)
        if abs(self.view.zoomFactor() - z) > 0.001:
            self.view.setZoomFactor(z)

    def save_geometry(self) -> None:
        g = {"w": self.width(), "h": self.height()}
        if self.shell.caps["position"]:
            g.update(x=self.x(), y=self.y())
        _settings_set(self.shell.ctx, {"window.main.geometry": g})

    def closeEvent(self, e):  # noqa: N802
        self.save_geometry()
        if self.shell.ctx.settings.get("app.close_behavior") == "tray" and self.shell.tray is not None and not self.shell.quitting:
            e.ignore()
            self.hide()
            if not self._hint_shown:
                self.shell.tray.showMessage(APP_NAME, self.shell.tr_ui("Still running in the tray (popouts and alerts stay active). "
                                            "Use the tray menu → Quit to exit."), QSystemTrayIcon.MessageIcon.Information, 5000)
                self._hint_shown = True
            return
        e.accept()
        self.shell.quit()


# ----------------------------------------------------------------- the shell
class QtShell:
    def __init__(self, ctx, server, app: QApplication):
        self.ctx, self.server, self.app = ctx, server, app
        self.popouts: dict[str, Popout] = {}
        self.toasts: list[Toast] = []
        self.quitting = False
        platform = QGuiApplication.platformName()
        wayland = platform.startswith("wayland")
        tray_ok = QSystemTrayIcon.isSystemTrayAvailable()
        self.caps = {
            "native_windows": True, "platform": platform, "pin": not wayland, "position": not wayland,
            "window_opacity": not wayland, "toast_window": True, "toast_position": not wayland, "tray": tray_ok,
            "qt": __import__("PySide6").__version__,
            "notes": [n for n in [
                "Native Wayland: the compositor controls window position and stacking, so Pin and position "
                "restore are disabled. Relaunch with ./run.sh --xwayland (or Settings › Window backend) to enable them."
                if wayland else None,
                "Pin keeps a popout above normal windows. Exclusive-fullscreen games may still cover it — "
                "use windowed/borderless PokeMMO." if not wayland else None,
                None if tray_ok else "No system tray found: closing the main window quits the Companion.",
            ] if n]}
        ctx.shell.attach(self.caps)
        self.profile = QWebEngineProfile(app)  # off-the-record: state lives in the backend
        self.profile.downloadRequested.connect(self._download)
        self.tray = self._make_tray() if tray_ok else None
        if self.tray is not None:
            ctx.notifier.shell_backend = self._queue_os_notification
        ctx.live.toast_backend = self._queue_toast
        ctx.timers.toast_backend = self._queue_toast
        self.main = MainWindow(self)
        self.sid, self.events = ctx.bus.subscribe()
        self.timer = QTimer()
        self.timer.timeout.connect(self._pump)
        self.timer.start(50)

    # ---------------------------------------------------------- threading
    def _queue_toast(self, payload: dict) -> bool:
        self.ctx.shell.queue.put({"action": "_toast", "payload": payload})
        return True

    def _queue_os_notification(self, title: str, body: str) -> bool:
        self.ctx.shell.queue.put({"action": "_os_notify", "title": title, "body": body})
        return True

    def _pump(self) -> None:
        for _ in range(20):
            try:
                cmd = self.ctx.shell.queue.get_nowait()
            except queue.Empty:
                break
            try:
                self.handle(cmd)
            except Exception:  # pragma: no cover
                log.exception("shell command failed: %s", cmd)
        for _ in range(50):
            try:
                ev = self.events.get_nowait()
            except queue.Empty:
                break
            if ev.get("topic") == "settings":
                language_changed = "app.language" in (ev.get("data") or {})
                if self.tray is not None and language_changed:
                    for action, label in self._tray_labels:
                        action.setText(self.tr_ui(label))
                for p in list(self.popouts.values()):
                    if language_changed:
                        p.bar.retranslate()
                    p.apply_prefs()
                if "appearance.ui_scale" in (ev.get("data") or {}):
                    self.main.apply_ui_scale()

    def open_external(self, url: QUrl) -> None:
        def failed():
            self.ctx.bus.publish("external.open_failed")

        if not open_external_url(url.toString(QUrl.FullyEncoded),
                                 desktop_open=lambda address: QDesktopServices.openUrl(QUrl(address)),
                                 on_failure=failed):
            failed()

    def tr_ui(self, source: str) -> str:
        return native_text(source, self.ctx.settings.get("app.language"))

    # ----------------------------------------------------------- commands
    def handle(self, cmd: dict) -> None:
        a = cmd.get("action")
        tool = cmd.get("tool")
        if a == "open_popout" and tool in TOOL_TITLES:
            self.open_popout(tool, cmd.get("mode") or self.ctx.settings.get(f"window.{tool}.mode"), cmd.get("hash") or "")
        elif a == "close_popout" and tool in self.popouts:
            self.popouts[tool].close()
        elif a == "raise_popout" and tool in self.popouts:
            p = self.popouts[tool]
            p.showNormal()
            p.raise_()
        elif a == "toggle_popout" and tool in TOOL_TITLES:
            p = self.popouts.get(tool)
            if p is not None and p.isVisible() and not p.isMinimized():
                p.close()
            else:
                self.open_popout(tool, self.ctx.settings.get(f"window.{tool}.mode"), cmd.get("hash") or "")
        elif a == "open_url":
            from ..services.bookmarks import BookmarkError, normalize_url
            try:
                url = normalize_url(cmd.get("url", ""))
            except BookmarkError:
                return
            self.open_external(QUrl(url))
        elif a == "minimize" and tool in self.popouts:
            self.popouts[tool].showMinimized()
        elif a in ("focus_main", "navigate_main"):
            self.navigate_main(cmd.get("route"))
        elif a == "pick_folder":
            path = QFileDialog.getExistingDirectory(self.main, self.tr_ui("Choose folder"), str(Path.home() / "Documents"))
            self.ctx.bus.publish("shell.folder", {"purpose": cmd.get("purpose"), "path": path or None})
        elif a == "pick_file":
            path, _ = QFileDialog.getOpenFileName(self.main, self.tr_ui("Choose your ROM file (opened read-only)"), str(Path.home()),
                                                  self.tr_ui("Game Boy Advance / Nintendo DS ROMs") + " (*.gba *.nds);;" + self.tr_ui("All files") + " (*)")
            self.ctx.bus.publish("shell.file", {"purpose": cmd.get("purpose"), "path": path or None})
        elif a == "minimize_main":
            if self.tray is not None and self.ctx.settings.get("app.close_behavior") == "tray":
                self.main.hide()
            else:
                self.main.showMinimized()
        elif a == "pick_launcher":
            filt = "PokeMMO (PokeMMO.exe *.exe *.lnk *.bat *.cmd)" if sys.platform.startswith("win") else self.tr_ui("PokeMMO launcher") + " (*.sh PokeMMO*);;" + self.tr_ui("All files") + " (*)"
            path, _ = QFileDialog.getOpenFileName(self.main, self.tr_ui("Choose the PokeMMO launcher"), str(Path.home()), filt)
            self.ctx.bus.publish("shell.file", {"purpose": cmd.get("purpose") or "launcher", "path": path or None})
        elif a == "quit":
            self.quit()
        elif a == "_toast":
            self.show_toast(cmd["payload"])
        elif a == "_os_notify" and self.tray is not None:
            self.tray.showMessage(cmd["title"], cmd["body"], QSystemTrayIcon.MessageIcon.Information, 8000)

    def open_popout(self, tool: str, mode: str, hash_: str) -> Popout:
        p = self.popouts.get(tool)
        if p is None:
            p = Popout(self, tool, mode, hash_)
            self.popouts[tool] = p
            p.show()
        else:
            if hash_:
                p.view.page().runJavaScript(f"location.hash = {json.dumps(hash_)};")
            p.showNormal()
            p.raise_()
            p.activateWindow()
        return p

    def navigate_main(self, route: str | None) -> None:
        self.main.showNormal()
        self.main.raise_()
        self.main.activateWindow()
        if route and route.startswith("#/"):
            self.main.view.page().runJavaScript(f"location.hash = {json.dumps(route)};")

    # -------------------------------------------------------------- toasts
    def show_toast(self, payload: dict) -> None:
        t = Toast(self, payload)
        self.toasts.append(t)
        while len(self.toasts) > 4:  # stack limit; remove first so the loop never depends on closeEvent timing
            self.toasts.pop(0).close()
        t.adjustSize()
        self.layout_toasts()
        t.show()

    def layout_toasts(self) -> None:
        if not self.toasts:
            return
        p = self.toasts[-1].payload
        corner = p.get("corner") or "bottom-right"
        screen = QGuiApplication.primaryScreen()
        if p.get("screen") == "main-window" and self.main.windowHandle() is not None:
            screen = self.main.windowHandle().screen() or screen
        area: QRect = screen.availableGeometry()
        margin, gap = 16, 8
        y_cursor = area.top() + margin if corner.startswith("top") else area.bottom() - margin
        for t in reversed(self.toasts):
            t.adjustSize()
            w, h = t.width(), t.height()
            x = area.left() + margin if corner.endswith("left") else area.right() - margin - w
            if corner.startswith("top"):
                y = y_cursor
                y_cursor += h + gap
            else:
                y = y_cursor - h
                y_cursor -= h + gap
            t.move(x, y)

    # ---------------------------------------------------------------- tray
    def _make_tray(self) -> QSystemTrayIcon:
        icon = self.main_icon()
        tray = QSystemTrayIcon(icon, self.app)
        tray.setToolTip(f"{APP_NAME} {__version__}")
        menu = QMenu()
        show = QAction(self.tr_ui("Show Companion"), menu)
        show.triggered.connect(lambda: self.navigate_main(None))
        story = QAction(self.tr_ui("Open Storyline popout"), menu)
        story.triggered.connect(lambda: self.open_popout("storyline", self.ctx.settings.get("window.storyline.mode"), ""))
        quit_a = QAction(self.tr_ui("Quit (stops alerts)"), menu)
        quit_a.triggered.connect(self.quit)
        for a in (show, story):
            menu.addAction(a)
        menu.addSeparator()
        menu.addAction(quit_a)
        tray.setContextMenu(menu)
        tray.activated.connect(lambda reason: self.navigate_main(None) if reason == QSystemTrayIcon.ActivationReason.Trigger else None)
        tray.show()
        self._tray_menu = menu
        self._tray_labels = [(show, "Show Companion"), (story, "Open Storyline popout"), (quit_a, "Quit (stops alerts)")]
        return tray

    @staticmethod
    def main_icon() -> QIcon:
        p = UI_DIR / "img" / "pokeball.svg"
        icon = QIcon(str(p)) if p.exists() else QIcon()
        if icon.isNull():
            pix = QPixmap(32, 32)
            pix.fill(Qt.darkRed)
            icon = QIcon(pix)
        return icon

    # ------------------------------------------------------------ downloads
    def _download(self, req) -> None:
        name = req.downloadFileName() or "pokemmo-companion-export.json"
        target, _ = QFileDialog.getSaveFileName(self.main, self.tr_ui("Save file"), str(Path.home() / name), "JSON (*.json);;" + self.tr_ui("All files") + " (*)")
        if not target:
            req.cancel()
            return
        req.setDownloadDirectory(str(Path(target).parent))
        req.setDownloadFileName(Path(target).name)
        req.accept()

    # ----------------------------------------------------------------- quit
    def recover_windows(self) -> None:
        """After a monitor was removed or a resolution changed: move any window whose title bar is no longer on a
        screen back onto the nearest one, and shrink it to fit. Uses the pure helper in shell/geometry.py."""
        from .geometry import fit_window
        screens = [(s.availableGeometry().x(), s.availableGeometry().y(), s.availableGeometry().width(), s.availableGeometry().height())
                   for s in QGuiApplication.screens()]
        if not screens or not self.caps["position"]:
            return
        for w in [self.main, *self.popouts.values()]:
            if w is None or not w.isVisible():
                continue
            g = w.geometry()
            x, y, ww, hh = fit_window((g.x(), g.y(), g.width(), g.height()), screens)
            if (x, y, ww, hh) != (g.x(), g.y(), g.width(), g.height()):
                w.setGeometry(x, y, ww, hh)

    def quit(self) -> None:
        if self.quitting:
            return
        self.quitting = True
        try:
            self.main.save_geometry()
            # remember which floating tools were open (reopened at the next start when the player wants that)
            _settings_set(self.ctx, {"window.open_popouts": [t for t, p in self.popouts.items() if p.isVisible()]})
        except Exception:  # pragma: no cover
            pass
        for p in list(self.popouts.values()):
            p.close()
        for t in list(self.toasts):
            t.close()
        if self.tray is not None:
            self.tray.hide()
        self.ctx.bus.unsubscribe(self.sid)
        self.app.quit()


def run_qt(ctx, server, spike: bool = False, qpa: str | None = None, minimized: bool = False) -> int:
    QCoreApplication.setAttribute(Qt.AA_ShareOpenGLContexts, True)
    QGuiApplication.setHighDpiScaleFactorRoundingPolicy(Qt.HighDpiScaleFactorRoundingPolicy.PassThrough)
    qt_args = [sys.argv[0], "-platform", qpa] if qpa else sys.argv[:1]
    app = QApplication.instance() or QApplication(qt_args)
    app.setApplicationName(APP_NAME)
    app.setApplicationVersion(__version__)
    app.setDesktopFileName("pokemmo-companion")
    app.setQuitOnLastWindowClosed(False)  # explicit quit semantics (tray/quit policy)
    app.setStyleSheet(QSS)
    shell = QtShell(ctx, server, app)
    log.info("Native shell: Qt platform=%s caps=%s", shell.caps["platform"], shell.caps)
    start_hidden = (minimized or ctx.settings.get("app.start_minimized")) and shell.tray is not None
    if start_hidden:
        log.info("Started minimised to the tray")
    elif minimized or ctx.settings.get("app.start_minimized"):
        shell.main.showMinimized()          # no tray on this desktop: minimise instead of hiding
    else:
        shell.main.show()
    if ctx.settings.get("app.restore_popouts"):
        for tool in ctx.settings.get("window.open_popouts") or []:
            if tool in TOOL_TITLES:
                QTimer.singleShot(400, lambda t=tool: shell.open_popout(t, ctx.settings.get(f"window.{t}.mode"), ""))
    # monitors added/removed or resolution changes: bring every window back onto a screen
    app.screenRemoved.connect(lambda _s: QTimer.singleShot(300, shell.recover_windows))
    app.screenAdded.connect(lambda _s: QTimer.singleShot(300, shell.recover_windows))
    for s in app.screens():
        s.availableGeometryChanged.connect(lambda _g: QTimer.singleShot(300, shell.recover_windows))
    ctx.start_background()
    if spike:
        QTimer.singleShot(1500, lambda: _spike(shell))
    code = app.exec()
    server.stop()
    ctx.shutdown()
    return code


def _spike(shell: QtShell) -> None:
    """Feasibility test: opens a pinned popout, a TEST toast + OS notification, then writes a report."""
    ctx = shell.ctx
    report: dict = {"app": __version__, "time": time.strftime("%Y-%m-%d %H:%M:%S"), "caps": shell.caps,
                    "env": {k: os.environ.get(k) for k in ("XDG_SESSION_TYPE", "XDG_CURRENT_DESKTOP", "WAYLAND_DISPLAY",
                                                           "DISPLAY", "QT_QPA_PLATFORM")},
                    "screens": [{"name": s.name(), "geometry": [s.geometry().x(), s.geometry().y(), s.geometry().width(),
                                                                s.geometry().height()], "dpr": s.devicePixelRatio()}
                                for s in QGuiApplication.screens()], "checks": {}}
    pop = shell.open_popout("storyline", "standard", "")
    if shell.caps["pin"]:
        pop.set_pinned(True, save=False)
    target = QPoint(80, 80)
    pop.move(target)

    def finish() -> None:
        report["checks"]["popout_visible"] = pop.isVisible()
        report["checks"]["popout_stays_on_top_flag"] = bool(pop.windowFlags() & Qt.WindowStaysOnTopHint)
        report["checks"]["popout_moved_to_requested_xy"] = (pop.x(), pop.y()) == (target.x(), target.y())
        report["checks"]["popout_pos"] = [pop.x(), pop.y()]
        if shell.caps["window_opacity"]:
            pop.setWindowOpacity(0.85)
            report["checks"]["window_opacity_after_set"] = round(pop.windowOpacity(), 2)
        test = ctx.live.create_test("alpha")
        report["checks"]["test_delivery"] = test.get("delivery")
        QTimer.singleShot(900, lambda: write(report))

    def write(report: dict) -> None:
        report["checks"]["toast_windows_open"] = len(shell.toasts)
        report["checks"]["toast_has_focus"] = any(t.isActiveWindow() for t in shell.toasts)
        out = ctx.paths.root / "spike-report.json"
        out.write_text(json.dumps(report, indent=1), encoding="utf-8")
        print("\n=== PokeMMO Companion window feasibility spike ===")
        print(json.dumps(report, indent=1))
        print(f"\nReport saved to {out}")
        print("Now check by eye: (1) the Storyline popout stays above other windows when pinned, "
              "(2) the TEST toast appeared in the chosen corner without taking keyboard focus, "
              "(3) a desktop notification appeared. Close the main window to finish.\n")
    QTimer.singleShot(1200, finish)

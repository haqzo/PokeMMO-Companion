"""Window placement helpers without Qt, so they can be tested anywhere (2026-11-24)."""
from __future__ import annotations

Rect = tuple[int, int, int, int]   # x, y, width, height (logical pixels)
TITLE_H = 32                       # the strip that must stay grabbable


def _overlap(a: Rect, b: Rect) -> int:
    w = min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0])
    h = min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1])
    return max(0, w) * max(0, h)


def fit_window(win: Rect, screens: list[Rect], min_visible: int = 120) -> Rect:
    """Keep a window usable: its title bar must lie on a screen with at least `min_visible` px showing, and it may
    not be larger than that screen's available area. A window already fine is returned unchanged."""
    x, y, w, h = win
    if not screens:
        return win
    title = (x, y, w, TITLE_H)
    best = max(screens, key=lambda s: (_overlap(title, s), _overlap(win, s)))
    if _overlap(title, best) == 0:        # title bar on no screen at all: use the primary (first) screen
        best = screens[0]
    sx, sy, sw, sh = best
    w2, h2 = min(w, sw), min(h, sh)
    visible_w = min(x + w2, sx + sw) - max(x, sx)
    ok = sy <= y <= sy + sh - TITLE_H and visible_w >= min(min_visible, w2) and (w2, h2) == (w, h)
    if ok:
        return win
    nx = min(max(x, sx), sx + sw - w2)
    ny = min(max(y, sy), sy + sh - h2)
    return (nx, ny, w2, h2)

"""Starting window sizes per popout tool and display mode (logical px).

These are presets, not locks: switching mode resizes once (unless the user turned on
"keep my size"); afterwards the window is freely resizable and the custom size is
remembered per tool and mode (settings key window.<tool>.sizes).
"""
PRESETS: dict[str, dict[str, tuple[int, int]]] = {
    "pokedex":     {"compact": (320, 440), "standard": (460, 600), "expanded": (700, 720)},
    "storyline":   {"compact": (340, 190), "standard": (380, 460), "expanded": (460, 640)},
    "reports":     {"compact": (340, 230), "standard": (400, 480), "expanded": (560, 640)},
    "typechart":   {"compact": (360, 440), "standard": (600, 600), "expanded": (780, 740)},
    "breeding":    {"compact": (380, 440), "standard": (520, 660), "expanded": (920, 700)},
    "legendaries": {"compact": (320, 280), "standard": (420, 440), "expanded": (600, 640)},
    "cave":        {"compact": (320, 260), "standard": (420, 440), "expanded": (600, 660)},
    "natures":     {"compact": (300, 400), "standard": (380, 540), "expanded": (460, 660)},
    # connected tools (accuracy + foundations pass)
    "notes":       {"compact": (300, 320), "standard": (420, 520), "expanded": (780, 620)},
    "items":       {"compact": (320, 440), "standard": (460, 600), "expanded": (760, 680)},
    "showcase":    {"compact": (300, 260), "standard": (520, 420), "expanded": (820, 560)},
    "customguide": {"compact": (320, 240), "standard": (400, 520), "expanded": (520, 700)},
    "locations":   {"compact": (330, 440), "standard": (480, 620), "expanded": (820, 700)},
    "box":         {"compact": (320, 420), "standard": (480, 600), "expanded": (820, 700)},
}


def preset(tool: str, mode: str) -> tuple[int, int]:
    return PRESETS.get(tool, PRESETS["natures"]).get(mode, (400, 500))


def target_size(tool: str, mode: str, sizes: dict | None) -> tuple[int, int]:
    """Custom size for this mode if the user resized it before, otherwise the preset."""
    g = (sizes or {}).get(mode)
    if isinstance(g, dict) and "w" in g and "h" in g:
        return int(g["w"]), int(g["h"])
    return preset(tool, mode)


def clamp(w: int, h: int, avail_w: int, avail_h: int, margin: int = 24) -> tuple[int, int]:
    return max(220, min(w, avail_w - margin)), max(160, min(h, avail_h - margin))

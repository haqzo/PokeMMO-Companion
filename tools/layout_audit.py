"""Layout / scrolling audit (maintainer tool, also used by tests/ui/test_ui_layout.py).

For every page and a set of window sizes it reports:
  * whole-window horizontal overflow (the app must never scroll sideways as a whole),
  * controls that cannot be reached: each visible button/link/input is scrolled into view the way a keyboard user
    would (focus → scrollIntoView) and must then be the topmost element at its own centre, inside the viewport.

Usage:  python3 tools/layout_audit.py <base-url-with-token> [route ...]
"""
import json
import sys

SIZES = [(1600, 900), (1280, 720), (1024, 768), (800, 600), (600, 900), (420, 640)]
ROUTES = ["#/home", "#/pokedex", "#/pokedex/6", "#/tools", "#/tools/typechart", "#/tools/natures", "#/tools/stats",
          "#/tools/breeding", "#/tools/team", "#/tools/ev", "#/tools/catch", "#/tools/calculator", "#/tools/timers",
          "#/tools/items", "#/tools/notes", "#/tools/box", "#/tools/showcase", "#/tools/locations", "#/tools/links",
          "#/collection", "#/live", "#/live/legendaries", "#/live/cave", "#/guides", "#/guides/storyline", "#/guides/mine",
          "#/settings/appearance", "#/settings/language", "#/settings/windows", "#/settings/shortcuts",
          "#/settings/notifications", "#/settings/sources", "#/settings/guides", "#/settings/data", "#/settings/about"]

PROBE = r"""
(limit) => {
  const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [tabindex="0"]';
  const layer = [...document.querySelectorAll('.modal-back, .dex-summary-back')].pop() || document;
  const all = [...layer.querySelectorAll(sel)].filter((e) => {
    if (e.closest('[hidden], .sr-only, details:not([open]) > :not(summary)')) return false;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  });
  const pick = all.length > limit ? [...all.slice(0, limit - 40), ...all.slice(-40)] : all;
  const bad = [];
  for (const e of pick) {
    e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = e.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
    const inView = r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    const top = document.elementFromPoint(x, y);
    const ok = inView && top && (top === e || e.contains(top) || top.contains(e) || (top.closest('label') && top.closest('label').contains(e)));
    if (!ok) bad.push((e.getAttribute('aria-label') || e.textContent || e.name || e.tagName).trim().slice(0, 40) + ' <' + e.tagName.toLowerCase() + '.' + [...e.classList].slice(0, 2).join('.') + '>' + (top ? ' under ' + top.tagName.toLowerCase() + '.' + [...top.classList].slice(0, 2).join('.') : ''));
  }
  const se = document.scrollingElement;
  const pageEl = document.querySelector('.page, .popout-body') || se;
  return { checked: pick.length, bad, hOverflow: se.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1,
    pageHOverflow: pageEl.scrollWidth > pageEl.clientWidth + 1 };
}
"""


def audit(page, base, routes=ROUTES, sizes=SIZES, limit=220, settle=900):
    out = []
    for w, h in sizes:
        page.set_viewport_size({"width": w, "height": h})
        for r in routes:
            page.goto(base + r)
            page.wait_for_timeout(settle)
            res = page.evaluate(PROBE, limit)
            res.update(route=r, size=f"{w}x{h}")
            out.append(res)
            page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    return out


if __name__ == "__main__":
    from playwright.sync_api import sync_playwright
    base = sys.argv[1].split("#")[0]
    routes = sys.argv[2:] or ROUTES
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
        pg = b.new_page()
        res = audit(pg, base, routes)
        b.close()
    problems = [x for x in res if x["bad"] or x["hOverflow"] or x["pageHOverflow"]]
    for x in problems:
        print(f"{x['size']:9} {x['route']:24} hOverflow={x['hOverflow']} pageH={x['pageHOverflow']} unreachable={len(x['bad'])}/{x['checked']}")
        for b_ in x["bad"][:6]:
            print("      ·", b_)
    print(json.dumps({"pages": len(res), "with_problems": len(problems)}))

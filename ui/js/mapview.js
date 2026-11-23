// Zoomable / pannable pixel-art map with an SVG overlay of your own marks (points, rectangles, polygons).
// Coordinates are stored normalised (0..1 of the image), so they survive a re-import of the artwork.
// The image is drawn with nearest-neighbour scaling; its aspect ratio is never changed.
import { h } from './core.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, v); return e; };
export const MIN_SCALE = 0.25, MAX_SCALE = 16;

export function clampScale(s) { return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s)); }
/** Scale that fits an image of w×h into a box of bw×bh (never below MIN_SCALE). */
export function fitScale(w, h, bw, bh) { return clampScale(Math.min(bw / w, bh / h)); }
/** Zoom by factor k around the box point (px, py): returns the new {s, tx, ty}. */
export function zoomAround(v, k, px, py) {
  const s = clampScale(v.s * k);
  const r = s / v.s;
  return { s, tx: px - (px - v.tx) * r, ty: py - (py - v.ty) * r };
}

export function createMapView(opts) {
  const { image } = opts;
  const W = image.w, H = image.h;
  let marks = opts.marks || [];
  let show = { markers: true, labels: true, highlights: true, ...(opts.show || {}) };
  let hl = opts.highlight || null;          // Set of location ids, or null (no Pokémon focus)
  let selectedLoc = opts.selectedLoc || null;
  let selectedMark = null;
  let tool = 'select';
  let editable = !!opts.editable;
  let v = { s: 1, tx: 0, ty: 0 };
  let polyDraft = null;

  const img = h('img', { class: 'map-img', src: image.url, width: W, height: H, alt: opts.alt || 'Region map', draggable: 'false' });
  const svg = sv('svg', { class: 'map-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  const stage = h('div', { class: 'map-stage' }, img, svg);
  const box = h('div', { class: 'map-box', tabindex: '0', role: 'application', 'aria-label': (opts.alt || 'Region map') + '. Arrow keys pan, + and − zoom, 0 fits.' }, stage);
  const tip = h('div', { class: 'map-tip', role: 'tooltip' });
  box.append(tip);

  const apply = () => {
    stage.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`;
    box.dataset.scale = v.s.toFixed(3);
    drawMarks();
  };
  const boxSize = () => [box.clientWidth || 600, box.clientHeight || 400];
  function fit() {
    const [bw, bh] = boxSize();
    const s = fitScale(W, H, bw - 16, bh - 16);
    v = { s, tx: (bw - W * s) / 2, ty: (bh - H * s) / 2 };
    apply();
  }
  function zoomBy(k, px, py) {
    const [bw, bh] = boxSize();
    v = zoomAround(v, k, px ?? bw / 2, py ?? bh / 2);
    apply();
  }
  function toImage(ev) {
    const r = box.getBoundingClientRect();
    return [(ev.clientX - r.left - v.tx) / v.s / W, (ev.clientY - r.top - v.ty) / v.s / H];
  }
  function centerOn(m) {
    const [bw, bh] = boxSize();
    const c = centroid(m);
    if (v.s < 2) v.s = clampScale(Math.min(3, fitScale(W, H, bw, bh) * 2));
    v.tx = bw / 2 - c[0] * W * v.s; v.ty = bh / 2 - c[1] * H * v.s;
    apply();
  }

  // ---------------------------------------------------------- marks
  const locsOf = (m) => (m.location_ids && m.location_ids.length ? m.location_ids : m.location_id ? [m.location_id] : []);
  function centroid(m) {
    if (m.kind === 'line') { const pts = m.lines.flat(); const mid = pts[Math.floor(pts.length / 2)];
      if (m.lines[0].length === 2) { const [a, b] = m.lines[0]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; } return mid; }
    if (m.kind === 'rect') return [m.x + m.w / 2, m.y + m.h / 2];
    if (m.kind === 'poly') { const n = m.points.length; return [m.points.reduce((a, p) => a + p[0], 0) / n, m.points.reduce((a, p) => a + p[1], 0) / n]; }
    return [m.x, m.y];
  }
  function drawMarks() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const k = 1 / v.s;                      // keep strokes / dots a constant size on screen
    // routes underneath, then town tiles, then pins; your own marks on top — so a town is clickable where a route ends
    const order = (m) => (!m.builtin ? 4 : m.kind === 'line' ? 1 : m.kind === 'rect' ? 2 : 3);
    const mine = marks.filter((m) => m.map === opts.mapId).sort((a, b) => order(a) - order(b));
    for (const m of mine) {
      const ls = locsOf(m);
      const focus = hl ? ls.some((x) => hl.has(x)) : false;
      const isSel = selectedLoc && (m.id === selectedLoc || ls.includes(selectedLoc));
      const cls = ['mk', 'mk-' + m.tag, m.kind, m.builtin ? 'builtin' : 'personal', show.highlights && hl ? (focus ? 'hit' : 'dim') : '',
        isSel ? 'sel' : '', selectedMark === m.id ? 'editing' : '', m.unmatched ? 'unmatched' : '', ls.length ? '' : 'empty'].filter(Boolean).join(' ');
      if (!show.markers && !(show.highlights && focus) && !isSel) continue;
      const g = sv('g', { class: cls, 'data-id': m.id, 'data-loc': ls[0] || '', 'data-locs': ls.join(' '), 'data-feature': m.feature || '', tabindex: editable ? null : '-1' });
      if (m.kind === 'line') {
        for (const line of m.lines) {
          const pts = line.map((p) => `${p[0] * W},${p[1] * H}`).join(' ');
          g.append(sv('polyline', { class: 'hit-area', points: pts, 'stroke-width': Math.max(m.width || 30, 14 * k) }));
          g.append(sv('polyline', { class: 'line-mark', points: pts, 'stroke-width': Math.max((m.width || 30) * 0.45, 4 * k) }));
        }
      } else if (m.kind === "point") g.append(sv("circle", { cx: m.x * W, cy: m.y * H, r: m.builtin ? Math.max(20, 7 * k) : 6 * k, "stroke-width": 2 * k }));
      else if (m.kind === 'rect') g.append(sv('rect', { x: m.x * W, y: m.y * H, width: m.w * W, height: m.h * H, 'stroke-width': 1.6 * k }));
      else g.append(sv('polygon', { points: m.points.map((p) => `${p[0] * W},${p[1] * H}`).join(' '), 'stroke-width': 1.6 * k }));
      const labelHere = !m.builtin || m.tag === 'town' || v.s >= 0.9 || isSel || (show.highlights && focus);
      if (show.labels && labelHere && (m.label || opts.labelFor)) {
        const c = centroid(m);
        const t = sv('text', { x: c[0] * W, y: c[1] * H - 7 * k, 'font-size': 10 * k, 'stroke-width': 3 * k, 'text-anchor': 'middle' });
        t.textContent = m.label || opts.labelFor(m) || '';
        if (t.textContent) g.append(t);
      }
      g.addEventListener('pointerenter', () => { tip.textContent = (opts.labelFor && opts.labelFor(m)) || m.label || ''; tip.classList.toggle('on', !!tip.textContent); });
      g.addEventListener('pointerleave', () => tip.classList.remove('on'));
      svg.append(g);
    }
    if (polyDraft && polyDraft.length) {
      svg.append(sv('polyline', { class: 'mk-draft', points: polyDraft.map((p) => `${p[0] * W},${p[1] * H}`).join(' '), 'stroke-width': 1.5 * k }));
      for (const p of polyDraft) svg.append(sv('circle', { class: 'mk-draft', cx: p[0] * W, cy: p[1] * H, r: 2.5 * k }));
    }
  }

  // ---------------------------------------------------------- interaction
  let drag = null;
  box.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = box.getBoundingClientRect();
    zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  box.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const g = e.target.closest && e.target.closest('g[data-id]');
    const m = g && marks.find((x) => x.id === g.dataset.id);
    const [nx, ny] = toImage(e);
    if (editable && tool === 'select' && m && !m.builtin) {
      selectedMark = m.id; opts.onEditSelect && opts.onEditSelect(m);
      drag = { kind: 'move', m, start: [nx, ny], orig: JSON.parse(JSON.stringify(m)), moved: false };
    } else if (editable && tool === 'point' && inside(nx, ny)) {
      create({ kind: 'point', x: nx, y: ny });
      return;
    } else if (editable && tool === 'rect' && inside(nx, ny)) {
      drag = { kind: 'rect', start: [nx, ny], cur: [nx, ny] };
    } else if (editable && tool === 'poly' && inside(nx, ny)) {
      (polyDraft ||= []).push([nx, ny]);
      drawMarks();
      return;
    } else {
      drag = { kind: 'pan', x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty, moved: false, m };
    }
    box.setPointerCapture(e.pointerId);
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.kind === 'pan') {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      v.tx = drag.tx + dx; v.ty = drag.ty + dy;
      stage.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`;
    } else if (drag.kind === 'move') {
      const [nx, ny] = toImage(e);
      let dx = nx - drag.start[0], dy = ny - drag.start[1];
      if (Math.abs(dx) + Math.abs(dy) > 0.002) drag.moved = true;
      const o = drag.orig, m = drag.m;
      // keep the whole shape inside the image
      if (o.kind === 'line') return;
      const xs = o.kind === 'poly' ? o.points.map((p) => p[0]) : o.kind === 'rect' ? [o.x, o.x + o.w] : [o.x];
      const ys = o.kind === 'poly' ? o.points.map((p) => p[1]) : o.kind === 'rect' ? [o.y, o.y + o.h] : [o.y];
      dx = Math.max(-Math.min(...xs), Math.min(1 - Math.max(...xs), dx));
      dy = Math.max(-Math.min(...ys), Math.min(1 - Math.max(...ys), dy));
      if (o.kind === 'poly') m.points = o.points.map((p) => [r5(p[0] + dx), r5(p[1] + dy)]);
      else { m.x = r5(o.x + dx); m.y = r5(o.y + dy); }
      drawMarks();
    } else if (drag.kind === 'rect') {
      drag.cur = toImage(e).map((q) => Math.max(0, Math.min(1, q)));
      drawMarks();
      const [a, b] = [drag.start, drag.cur];
      svg.append(sv('rect', { class: 'mk-draft', x: Math.min(a[0], b[0]) * W, y: Math.min(a[1], b[1]) * H, width: Math.abs(a[0] - b[0]) * W, height: Math.abs(a[1] - b[1]) * H, 'stroke-width': 1.5 / v.s }));
    }
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === 'pan' && !d.moved) {
      if (d.m) {
        if (d.m.tag === 'transition' && d.m.target_map && opts.onTransition) opts.onTransition(d.m);
        else if (opts.onSelect) opts.onSelect(d.m);
      } else if (opts.onBackground) opts.onBackground();
    } else if (d.kind === 'move' && d.moved && opts.onChange) opts.onChange(marks, 'move');
    else if (d.kind === 'rect') {
      const [a, b] = [d.start, d.cur];
      const w = Math.abs(a[0] - b[0]), hh = Math.abs(a[1] - b[1]);
      if (w > 0.004 && hh > 0.004) create({ kind: 'rect', x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w, h: hh });
      else drawMarks();
    }
    try { box.releasePointerCapture(e.pointerId); } catch (_) { /* not captured */ }
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  box.addEventListener('dblclick', (e) => { if (editable && tool === 'poly') { e.preventDefault(); finishPoly(); } });
  box.addEventListener('keydown', (e) => {
    const step = 40;
    if (e.key === '+' || e.key === '=') { zoomBy(1.25); e.preventDefault(); }
    else if (e.key === '-' || e.key === '_') { zoomBy(0.8); e.preventDefault(); }
    else if (e.key === '0') { fit(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { v.tx += step; apply(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { v.tx -= step; apply(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { v.ty += step; apply(); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { v.ty -= step; apply(); e.preventDefault(); }
    else if (editable && tool === 'poly' && e.key === 'Enter') { finishPoly(); e.preventDefault(); }
    else if (editable && e.key === 'Escape' && polyDraft) { polyDraft = null; drawMarks(); e.stopPropagation(); }
  });
  function finishPoly() {
    const pts = polyDraft || [];
    polyDraft = null;
    if (pts.length >= 3) create({ kind: 'poly', points: pts.map((p) => [r5(p[0]), r5(p[1])]) });
    else drawMarks();
  }
  const inside = (x, y) => x >= 0 && y >= 0 && x <= 1 && y <= 1;
  const r5 = (x) => Math.round(x * 1e5) / 1e5;
  async function create(shape) {
    for (const k of ['x', 'y', 'w', 'h']) if (shape[k] !== undefined) shape[k] = r5(shape[k]);
    const fields = opts.onCreate ? await opts.onCreate(shape) : null;
    if (!fields) { drawMarks(); return; }
    const m = { id: Math.random().toString(36).slice(2, 12), map: opts.mapId, tag: 'other', label: '', note: '', location_id: null, target_map: null, ...shape, ...fields };
    marks = [...marks, m];
    selectedMark = m.id;
    drawMarks();
    opts.onChange && opts.onChange(marks, 'add');
  }

  const ro = new ResizeObserver(() => { if (!box.dataset.fitted && box.clientWidth) { box.dataset.fitted = '1'; fit(); } });
  ro.observe(box);
  img.addEventListener('load', () => { if (box.clientWidth) fit(); });

  return {
    el: box,
    get view() { return { ...v }; },
    fit, zoomBy, centerOn,
    reset() { v = { s: 1, tx: 0, ty: 0 }; apply(); },
    setMarks(m) { marks = m; if (selectedMark && !marks.some((x) => x.id === selectedMark)) selectedMark = null; drawMarks(); },
    setHighlight(set) { hl = set; drawMarks(); },
    setShow(s) { show = { ...show, ...s }; drawMarks(); },
    setSelectedLoc(id) { selectedLoc = id; drawMarks(); },
    setTool(t) { tool = t; polyDraft = null; box.dataset.tool = t; drawMarks(); },
    setEditable(on) { editable = on; box.classList.toggle('editing', on); if (!on) { selectedMark = null; polyDraft = null; } drawMarks(); },
    selectMark(id) { selectedMark = id; drawMarks(); },
    get selectedMark() { return selectedMark; },
    destroy() { ro.disconnect(); },
  };
}

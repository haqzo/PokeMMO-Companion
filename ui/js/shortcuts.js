// Keyboard shortcuts runtime (docs/design/20 §B). Works only while this Companion window has focus:
// nothing is registered system-wide and no key is ever sent to PokeMMO.
// Never fires while typing (inputs, textareas, selects, contenteditable, IME), while a dialog is
// open, while a binding is being recorded, or on key auto-repeat.
import { get, post, api, on, toast, setting, state, POPOUT, SHELL } from './core.js';
import { lang, t } from './i18n.js';
import { gameTerm } from './game-locale.js';
import { walkthroughReader } from './walkthrough-loader.js';

let bindings = {};       // action id -> combo
let byCombo = {};        // combo -> action id
let actions = [];
let recording = false;
export const guideContext = { run: null, region: null, step: null, source: null, refresh: null };

const KEYMAP = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Enter: 'Enter', NumpadEnter: 'Enter',
  Space: 'Space', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', Delete: 'Delete', Backspace: 'Backspace',
  Comma: 'Comma', Period: 'Period', Slash: 'Slash', Semicolon: 'Semicolon', Quote: 'Quote', BracketLeft: 'BracketLeft', BracketRight: 'BracketRight',
  Minus: 'Minus', Equal: 'Equal', Backquote: 'Backquote', Backslash: 'Backslash', Escape: 'Escape', Tab: 'Tab' };

/** Physical-key combo from a KeyboardEvent (layout independent: uses e.code). */
export function comboFromEvent(e) {
  let key = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^Numpad\d$/.test(e.code)) key = e.code.slice(6);
  else if (/^F([1-9]|1[0-2])$/.test(e.code)) key = e.code;
  else key = KEYMAP[e.code] || null;
  if (!key) return null;
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Meta');
  return [...mods, key].join('+');
}
export function displayCombo(c) {
  return c ? c.replace(/Arrow(Up|Down|Left|Right)/, (m, d) => ({ Up: '↑', Down: '↓', Left: '←', Right: '→' })[d]).replace(/\+/g, ' + ') : '—';
}

export async function loadShortcuts() {
  try {
    const r = await get('/api/shortcuts');
    actions = r.actions;
    bindings = Object.fromEntries(r.actions.map((a) => [a.id, a.binding]));
    byCombo = {};
    for (const [id, c] of Object.entries(bindings)) if (c) byCombo[c] = id;
    return r;
  } catch (_) { return null; }
}
export function setRecording(v) { recording = v; }
export function shortcutFor(id) { return bindings[id] || null; }

function typingTarget(t) {
  if (!t || t === document.body) return false;
  if (t.isContentEditable) return true;
  const tag = (t.tagName || '').toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') return !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'reset'].includes((t.type || 'text').toLowerCase());
  return false;
}
const route = () => location.hash.replace(/^#\/?/, '');
function inScope(scope) {
  if (scope === 'app') return true;
  if (POPOUT) return { guides: 'storyline', pokedex: 'pokedex', notes: 'notes', items: 'items', links: null }[scope] === POPOUT;
  const r = route();
  return { guides: r.startsWith('guides'), pokedex: r.startsWith('pokedex'), notes: r.startsWith('tools/notes'), items: r.startsWith('tools/items'), links: r.startsWith('tools/links') }[scope] || false;
}

// Localize the application-authored wrapper and the hash-matched bundled objective.
export async function guideActionMessage(result) {
  if (lang() === 'en') return result.message;
  const kind = result.message_kind;
  if (kind === 'no_steps' || kind === 'stale') return t('shortcutui.' + kind);
  if (kind === 'first' || kind === 'last') return t('shortcutui.' + kind, { region: gameTerm('region', result.message_region) });
  if (['step', 'ticked', 'unticked'].includes(kind) && result.message_step) {
    const read = await walkthroughReader(lang(), result.state?.source);
    const step = read(result.message_step);
    return t('shortcutui.' + kind, { step: [...String(step ?? '')].slice(0, 80).join(''), current: result.message_index, total: result.message_total });
  }
  return result.message;
}

let busy = false;
async function guideAction(action) {
  if (busy) return;  // one action at a time: a second press while the first is in flight is dropped
  busy = true;
  try {
    let { run, region, step, source, refresh } = guideContext;
    if (!run) { const r = await get('/api/guides/runs'); run = r.active || (r.runs[0] && r.runs[0].id); }
    if (!run) { toast(t('ui.b272_collection_029'), { kind: 'warn' }); return; }
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await post(`/api/guides/runs/${run}/action`, { action, region, expect_step: step || undefined, source, nonce });
    if (res.duplicate) return;
    toast(await guideActionMessage(res), { kind: res.ok ? 'info' : 'warn', timeout: 2200 });
    refresh?.();
  } catch (e) { toast(e.message, { kind: 'warn' }); } finally { busy = false; }
}
async function togglePopout(tool, hash) {
  if (SHELL === 'qt') { await post('/api/shell/command', { action: 'toggle_popout', tool, hash }); return; }
  const { openPopout } = await import('./shell.js');
  openPopout(tool, hash);
}
function focusInput(sel) { const el = document.querySelector(sel); if (el) { el.focus(); el.select && el.select(); return true; } return false; }
async function dexStep(d) {
  const m = location.hash.match(POPOUT ? /^#\/species\/(\d+)/ : /^#\/pokedex\/(\d+)/);
  if (!m) return;
  const next = Math.max(1, Math.min(649, Number(m[1]) + d));
  location.hash = (POPOUT ? '#/species/' : '#/pokedex/') + next;
}

export const HANDLERS = {
  'guide.next': () => guideAction('next'),
  'guide.prev': () => guideAction('prev'),
  'guide.toggle': () => guideAction('toggle'),
  'guide.popout': () => togglePopout('storyline'),
  'notes.new': () => togglePopout('notes', '#/new'),
  'notes.search': () => focusInput('#notes-search'),
  'pokedex.search': () => focusInput(POPOUT ? '.popout-body input[type=search]' : '#dex-search'),
  'pokedex.next': () => dexStep(1),
  'pokedex.prev': () => dexStep(-1),
  'items.search': () => focusInput(POPOUT ? '.popout-body input[type=search]' : '#item-search'),
  'links.search': () => focusInput('#links-search'),
  'app.home': () => { if (!POPOUT) location.hash = '#/home'; },
  'app.quick_notes': () => togglePopout('notes'),
};

export function handleKeydown(e) {
  if (recording || e.repeat || e.isComposing || e.keyCode === 229) return false;
  if (setting('shortcuts.enabled') === false) return false;
  const combo = comboFromEvent(e);
  const id = combo && byCombo[combo];
  if (!id) return false;
  if (typingTarget(e.target) || document.querySelector('.modal-back')) return false;
  const act = actions.find((a) => a.id === id);
  if (!act || !inScope(act.scope)) return false;
  e.preventDefault();
  e.stopPropagation();
  HANDLERS[id] && HANDLERS[id]();
  return true;
}

export function installShortcuts() {
  loadShortcuts();
  document.addEventListener('keydown', handleKeydown, true);
  on('settings', (d) => { if (!d || !d.keys || d.keys.includes('shortcuts.bindings')) loadShortcuts(); });
  void api; void state;
}

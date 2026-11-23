// General-purpose calculator (Tools › Calculator and its popout). Not a Pokémon calculator.
import { h, mount } from '../core.js';
import { createCalc, keyFor } from '../calcengine.js';

let keyHandler = null;
export function dispose() { if (keyHandler) document.removeEventListener('keydown', keyHandler); keyHandler = null; }

const KEYS = [
  ['C', 'clear', 'Clear (Esc)'], ['⌫', 'fn', 'Backspace'], ['%', 'fn', 'Percent'], ['/', 'op', 'Divide'],
  ['7'], ['8'], ['9'], ['*', 'op', 'Multiply'],
  ['4'], ['5'], ['6'], ['-', 'op', 'Subtract'],
  ['1'], ['2'], ['3'], ['+', 'op', 'Add'],
  ['±', 'fn', 'Change sign (F9)'], ['0'], ['.', '', 'Decimal point'], ['=', 'eq', 'Equals (Enter)'],
];
const SHOW = { '*': '×', '/': '÷', '-': '−' };

export function renderCalculator(el, { compact = false } = {}) {
  dispose();
  const calc = createCalc();
  const expr = h('div', { class: 'calc-expr', 'aria-hidden': 'true' });
  const out = h('output', { class: 'calc-out', 'aria-live': 'polite', 'aria-label': 'Result' }, '0');
  const draw = () => {
    out.textContent = calc.display();
    out.classList.toggle('err', !!calc.state.error);
    expr.textContent = calc.state.expr || ' ';
    pad.querySelectorAll('[data-op]').forEach((b) => b.classList.toggle('pending', calc.state.op === b.dataset.op && calc.state.fresh));
  };
  const press = (k) => { calc.input(k); draw(); };
  const pad = h('div', { class: 'calc-pad', role: 'group', 'aria-label': 'Calculator keys' }, KEYS.map(([k, kind = 'num', label]) =>
    h('button', { class: `calc-key ${kind}`, type: 'button', 'aria-label': label || k, title: label || null, dataset: kind === 'op' ? { op: k } : {},
      onclick: () => press(k) }, SHOW[k] || k)));
  const box = h('div', { class: 'calc' + (compact ? ' compact' : ''), tabindex: '-1' },
    h('div', { class: 'calc-screen' }, expr, out), pad,
    compact ? null : h('div', { class: 'tiny muted' }, 'Keyboard: digits, + − * /, Enter, Backspace, Esc clears, % percent, F9 change sign. Results are exact to 12 decimal places.'));
  mount(el, box);
  keyHandler = (e) => {
    if (!box.isConnected) { dispose(); return; }
    const t = e.target;
    if (t && t !== document.body && !box.contains(t) && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector('.modal-back')) return;
    const k = keyFor(e);
    if (!k) return;
    e.preventDefault();
    press(k);
    const btn = pad.querySelector(`[aria-label="${CSS.escape(KEYS.find((x) => x[0] === k || (k === 'CE' && x[0] === 'C'))?.[2] || k)}"]`);
    if (btn) { btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 90); }
  };
  document.addEventListener('keydown', keyHandler);
  draw();
  return box;
}

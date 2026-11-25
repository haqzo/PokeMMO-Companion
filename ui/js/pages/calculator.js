// General-purpose calculator (Tools › Calculator and its popout). Not a Pokémon calculator.
import { h, mount } from '../core.js';
import { t as translateUI } from '../i18n.js';
import { createCalc, keyFor } from '../calcengine.js';

let keyHandler = null;
export function dispose() { if (keyHandler) document.removeEventListener('keydown', keyHandler); keyHandler = null; }

const KEYS = [
  ['C', 'clear', 'ui.b272_calc_clear'], ['⌫', 'fn', 'ui.b272_calc_backspace'], ['%', 'fn', 'ui.b272_calc_percent'], ['/', 'op', 'ui.b272_calc_divide'],
  ['7'], ['8'], ['9'], ['*', 'op', 'ui.b272_calc_multiply'],
  ['4'], ['5'], ['6'], ['-', 'op', 'ui.b272_calc_subtract'],
  ['1'], ['2'], ['3'], ['+', 'op', 'ui.b272_calc_add'],
  ['±', 'fn', 'ui.b272_calc_sign'], ['0'], ['.', '', 'ui.b272_calc_decimal'], ['=', 'eq', 'ui.b272_calc_equals'],
];
const SHOW = { '*': '×', '/': '÷', '-': '−' };

export function renderCalculator(el, { compact = false } = {}) {
  dispose();
  const calc = createCalc();
  const expr = h('div', { class: 'calc-expr', 'aria-hidden': 'true' });
  const out = h('output', { class: 'calc-out', 'aria-live': 'polite', 'aria-label': translateUI('ui.b272_calc_result') }, '0');
  const draw = () => {
    out.textContent = calc.state.error ? translateUI('ui.b272_calc_div0') : calc.display();
    out.classList.toggle('err', !!calc.state.error);
    expr.textContent = calc.state.expr || ' ';
    pad.querySelectorAll('[data-op]').forEach((b) => b.classList.toggle('pending', calc.state.op === b.dataset.op && calc.state.fresh));
  };
  const press = (k) => { calc.input(k); draw(); };
  const pad = h('div', { class: 'calc-pad', role: 'group', 'aria-label': translateUI('ui.b272_calc_keys') }, KEYS.map(([k, kind = 'num', label]) =>
    h('button', { class: `calc-key ${kind}`, type: 'button', 'aria-label': label ? translateUI(label) : k, title: label ? translateUI(label) : null, dataset: kind === 'op' ? { op: k } : {},
      onclick: () => press(k) }, SHOW[k] || k)));
  const box = h('div', { class: 'calc' + (compact ? ' compact' : ''), tabindex: '-1' },
    h('div', { class: 'calc-screen' }, expr, out), pad,
    compact ? null : h('div', { class: 'tiny muted' }, translateUI('ui.b272_calc_help')));
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
    const btn = pad.querySelector(`[aria-label="${CSS.escape(translateUI(KEYS.find((x) => x[0] === k || (k === 'CE' && x[0] === 'C'))?.[2] || k))}"]`);
    if (btn) { btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 90); }
  };
  document.addEventListener('keydown', keyHandler);
  draw();
  return box;
}

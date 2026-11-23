// Basic calculator engine (no DOM). Numbers are exact fractions (BigInt numerator/denominator), so
// 0.1 + 0.2 is exactly 0.3; only the display is rounded (to 12 decimal places, trailing zeros removed).
// Chained operations work like a pocket calculator: each operator applies the previous one
// (2 + 3 × 4 = 20). "=" repeats the last operation. Division by zero gives an error state.

const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a || 1n; };
function frac(n, d = 1n) {
  if (d === 0n) throw new Error('div0');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
export function parse(str) {
  const s = String(str).trim();
  if (!/^-?\d*(\.\d*)?$/.test(s) || s === '' || s === '-' || s === '.' || s === '-.') return frac(0n);
  const neg = s.startsWith('-');
  const [i, f = ''] = s.replace('-', '').split('.');
  return frac((neg ? -1n : 1n) * BigInt((i || '0') + f), 10n ** BigInt(f.length));
}
const OPS = {
  '+': (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d),
  '-': (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d),
  '*': (a, b) => frac(a.n * b.n, a.d * b.d),
  '/': (a, b) => frac(a.n * b.d, a.d * b.n),
};
/** Decimal text of a fraction, rounded half away from zero to `places` decimals, without trailing zeros. */
export function format(x, places = 12) {
  const neg = x.n < 0n;
  const n = neg ? -x.n : x.n;
  const scale = 10n ** BigInt(places);
  let q = (n * scale) / x.d;
  if (((n * scale) % x.d) * 2n >= x.d) q += 1n;
  let int = (q / scale).toString();
  let dec = (q % scale).toString().padStart(places, '0').replace(/0+$/, '');
  if (int === '0' && !dec) return '0';
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');  // thin grouping for readability
  return (neg ? '-' : '') + int + (dec ? '.' + dec : '');
}
export const plain = (s) => s.replace(/ /g, '');

export function createCalc() {
  const st = { entry: '0', acc: null, op: null, fresh: true, last: null, error: null, expr: '' };
  const cur = () => parse(st.entry);
  const setEntry = (x) => { st.entry = plain(format(x)); };
  const fail = () => { st.error = "Can't divide by zero"; st.acc = null; st.op = null; st.last = null; st.entry = '0'; st.fresh = true; st.expr = ''; };
  const apply = (a, op, b) => { try { return OPS[op](a, b); } catch (e) { fail(); return null; } };
  const api = {
    state: st,
    display: () => (st.error ? st.error : format(parse(st.entry))),
    input(k) {
      if (st.error && k !== 'C') { st.error = null; }
      if (/^\d$/.test(k)) {
        if (st.fresh) { st.entry = k; st.fresh = false; } else if (st.entry.replace(/[-.]/g, '').length < 16) st.entry = st.entry === '0' ? k : st.entry === '-0' ? '-' + k : st.entry + k;
        if (st.op === null && st.last) { st.last = null; st.expr = ''; }
      } else if (k === '.') {
        if (st.fresh) { st.entry = '0.'; st.fresh = false; } else if (!st.entry.includes('.')) st.entry += '.';
      } else if (k in OPS) {
        if (st.op && !st.fresh) { const r = apply(st.acc, st.op, cur()); if (!r) return api; st.acc = r; setEntry(r); }
        else if (!st.op) st.acc = cur();
        st.op = k; st.fresh = true; st.last = null;
        st.expr = `${format(st.acc)} ${({ '*': '×', '/': '÷', '-': '−' })[k] || k}`;
      } else if (k === '=') {
        if (st.op) {
          const b = cur();  // "5 + =" uses 5 again, like a pocket calculator
          const r = apply(st.acc, st.op, b); if (!r) return api;
          st.expr = `${format(st.acc)} ${({ '*': '×', '/': '÷', '-': '−' })[st.op] || st.op} ${format(b)} =`;
          st.last = { op: st.op, b }; st.acc = null; st.op = null; setEntry(r); st.fresh = true;
        } else if (st.last) {
          const a = cur(); const r = apply(a, st.last.op, st.last.b); if (!r) return api;
          st.expr = `${format(a)} ${({ '*': '×', '/': '÷', '-': '−' })[st.last.op] || st.last.op} ${format(st.last.b)} =`;
          setEntry(r); st.fresh = true;
        }
      } else if (k === '%') {
        // a + b% → b% of a (likewise −); a × b% / a ÷ b% → b/100; on its own b% → b/100
        const b = cur();
        const pct = st.op && (st.op === '+' || st.op === '-') ? OPS['*'](st.acc, frac(b.n, b.d * 100n)) : frac(b.n, b.d * 100n);
        setEntry(pct); st.fresh = true;
      } else if (k === '±') {
        st.entry = st.entry.startsWith('-') ? st.entry.slice(1) : (st.entry === '0' ? '0' : '-' + st.entry);
        if (st.op === null && st.last) st.last = null;
      } else if (k === 'C') {
        Object.assign(st, { entry: '0', acc: null, op: null, fresh: true, last: null, error: null, expr: '' });
      } else if (k === 'CE') {
        st.entry = '0'; st.fresh = true;
      } else if (k === '⌫') {
        if (!st.fresh) { st.entry = st.entry.length > 1 && st.entry !== '-0' ? st.entry.slice(0, -1) : '0'; if (st.entry === '-' || st.entry === '') st.entry = '0'; }
      }
      return api;
    },
    run(keys) { for (const k of keys) api.input(k); return api.display(); },
  };
  return api;
}

/** Key from a keyboard event, or null. Typing into another field never reaches the calculator. */
export function keyFor(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const k = e.key;
  if (/^\d$/.test(k)) return k;
  return { '.': '.', ',': '.', '+': '+', '-': '-', '*': '*', x: '*', X: '*', '/': '/', '%': '%', Enter: '=', '=': '=',
    Backspace: '⌫', Escape: 'C', Delete: 'CE', F9: '±', n: '±', N: '±' }[k] || null;
}

// Timer completion chime. Every open Companion window listens, but the backend lets only the first window
// that asks play a given completion, so you never hear the same timer twice. No audio files: a short
// three-note chime is synthesised with Web Audio. Browsers only allow sound after you have clicked or typed
// in the window once; until then the toast / OS notification still appears.
import { on, post } from './core.js';

let ctx = null;
let installed = false;
function audio() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { ctx = null; } }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
export function chime() {
  const a = audio();
  if (!a) return false;
  const t0 = a.currentTime + 0.02;
  [[880, 0], [1175, 0.18], [1568, 0.36]].forEach(([f, dt]) => {
    const o = a.createOscillator(); const g = a.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(0.25, t0 + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.32);
    o.connect(g).connect(a.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.35);
  });
  window.__timerChimes = (window.__timerChimes || 0) + 1;  // observable in tests
  return true;
}
export function installTimerSound() {
  if (installed) return;
  installed = true;
  const unlock = () => { audio(); };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });
  on('timers.done', async (p) => {
    if (!p || !p.sound || !p.event) return;
    try { const r = await post('/api/timers/sound-claim', { event: p.event }); if (r.play) chime(); } catch (_) { /* offline */ }
  });
}

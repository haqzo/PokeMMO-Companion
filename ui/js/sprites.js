// Pokémon sprite display preferences (2026-11-24): where animations are used and how large sprites are,
// per context. One global switch ("Animations: system / on / off") overrides every context; "system" follows the
// operating system's reduced-motion setting.
import { setting } from './core.js';

export const CONTEXTS = [
  // id, label, default, has size control
  ['dex_grid', 'Pokédex grid', 'static', false],
  ['summary', 'Pokémon summary', 'animated', true],
  ['roamers', 'Roaming Legendaries', 'animated', true],
  ['report_active', 'Active Alpha & Swarm reports', 'animated', false],
  ['report_expired', 'Expired Alpha & Swarm reports', 'static', false],
  ['live_history', 'Live report history', 'static', false],
  ['locations', 'Location Explorer', 'static', true],
  ['team', 'Team Builder & guide teams', 'static', true],
  ['compare', 'Pokémon comparison', 'static', true],
];
const DEFAULTS = Object.fromEntries(CONTEXTS.map(([id, , d]) => [id, d]));

export function motionGlobal() {
  const g = setting('sprites.motion') || 'system';
  if (g === 'off') return false;
  if (g === 'on') return true;
  // legacy switch from before 2026-11-24 (Summary pause button) still honoured when explicitly set
  const reduce = (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.documentElement.classList.contains('reduced-motion');
  return !reduce;
}

/** Should sprites in this context animate? Global off / reduced motion always wins. */
export function animatedIn(ctx) {
  if (!motionGlobal()) return false;
  const pref = (setting('sprites.animation') || {})[ctx] || DEFAULTS[ctx] || 'static';
  if (ctx === 'summary' && setting('pokedex.animate') === false && !(setting('sprites.animation') || {}).summary) return false;
  return pref === 'animated';
}

/** Size multiplier (percent → factor) for a context. */
export function spriteScale(ctx) {
  const v = Number((setting('sprites.size') || {})[ctx]);
  return v >= 50 && v <= 200 ? v / 100 : 1;
}
export const scaled = (ctx, px) => Math.round(px * spriteScale(ctx));

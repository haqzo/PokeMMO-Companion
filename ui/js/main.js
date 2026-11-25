import { POPOUT, loadBoot, connectEvents, on, get, state, applyAppearance, h, mount, notice } from './core.js';
import { installShortcuts } from './shortcuts.js';

async function boot() {
  const root = document.getElementById('app');
  try {
    await loadBoot();
  } catch (e) {
    mount(root, h('div', { style: { padding: '40px', maxWidth: '640px' } },
      notice('bad', h('strong', null, 'Cannot reach the Companion backend. '),
        'Open the Companion from its launcher (./run.sh) — the page needs the session link it prints. ', String(e.message || e))));
    return;
  }
  connectEvents();
  on('settings', async (data) => {
    const keys = Object.keys(data || {});
    // Saved route/last selection and geometry are metadata, not visual preferences.
    // Apply those exact values without querying settings or redrawing every open window.
    if (keys.length && keys.every(k => k.endsWith('.geometry') || k === 'app.last_route' || k === 'pokedex.last_species')) {
      Object.assign(state.settings, data); return;
    }
    state.settings = await get('/api/settings');
    applyAppearance();
    document.dispatchEvent(new CustomEvent('settings-changed', { detail: data || {} }));
  });
  installShortcuts();
  wrapTables(root);
  if (POPOUT) { const { startPopout } = await import('./popouts.js'); startPopout(root); }
  else { const { startApp } = await import('./shell.js'); startApp(root); }
}
/** Every data table scrolls sideways inside its own box instead of widening the page (narrow windows, large text). */
function wrapTables(root) {
  const fix = (t) => {
    const p = t.parentElement;
    if (!p || t.dataset.wrapped || p.classList.contains('table-scroll')) return;
    const ox = getComputedStyle(p).overflowX;
    t.dataset.wrapped = '1';
    if (ox === 'auto' || ox === 'scroll') return;
    const w = document.createElement('div');
    w.className = 'table-scroll';
    p.insertBefore(w, t); w.appendChild(t);
  };
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'TABLE') fix(n); else n.querySelectorAll && n.querySelectorAll('table').forEach(fix);
    }
  }).observe(root, { childList: true, subtree: true });
}
boot();

import { POPOUT, loadBoot, connectEvents, on, get, state, applyAppearance, h, mount, notice } from './core.js';
import { startApp } from './shell.js';
import { startPopout } from './popouts.js';

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
    if (keys.length && keys.every((k) => k.endsWith('.geometry'))) return;  // window moves don't affect pages
    state.settings = await get('/api/settings');
    applyAppearance();
    document.dispatchEvent(new CustomEvent('settings-changed'));
  });
  if (POPOUT) startPopout(root); else startApp(root);
}
boot();

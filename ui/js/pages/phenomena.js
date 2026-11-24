import { h, mount, get, fmtDate, relTime, cap, extLink, modal, on, debounce, TOKEN } from '../core.js';
import { go } from '../shell.js';

const PROVIDER = 'https://forums.pokemmo.com/index.php?/topic/197731-alphapedia-real-time-alphaswarm-pok%C3%A9mon-notifications-and-history-for-pc-mobile/';
const labels = {
  disabled: 'Configure an approved relay in Settings → Live.',
  starting: 'Waiting for the first relay refresh.',
  connected: 'Phenomenon feed connected.',
  offline: 'Phenomenon feed offline.',
  stale: 'The relay’s last refresh is out of date.',
  access_denied: 'The relay cannot read the Discord channel.',
  rate_limited: 'Discord has rate-limited the relay.',
  invalid_response: 'The relay received an invalid response.',
};
const titleFor = (r) => [r.type, r.location].filter(Boolean).join(' at ') || 'Phenomenon report';

function sourceLine(source) {
  return h('div', { class: 'small muted' }, labels[source.status] || labels.offline,
    source.last_success_at ? ' Last Discord refresh ' + fmtDate(source.last_success_at, true) + '.' : '',
    source.status === 'disabled' ? [' ', h('a', { href: '#/settings/sources' }, 'Live settings')] : null);
}

function screenshot(r, enlarged = false) {
  const fallback = () => h('span', { class: 'tiny muted' }, 'Location screenshot unavailable');
  if (!r.image_url) return fallback();
  const img = h('img', { loading: enlarged ? 'eager' : 'lazy', alt: `Location screenshot for ${titleFor(r)}`,
    onerror: () => img.parentElement?.replaceWith(fallback()) });
  if (r.image_width && r.image_height) {
    img.width = r.image_width;
    img.height = r.image_height;
  }
  const box = h('div', { class: enlarged ? 'phenomenon-enlarged' : 'phenomenon-preview' });
  if (enlarged) box.append(h('label', { class: 'row small' },
    h('input', { type: 'checkbox', onchange: (e) => box.classList.toggle('original-size', e.target.checked) }), 'Original size'));
  box.append(enlarged ? h('div', { class: 'phenomenon-image-scroll' }, img) :
    h('button', { type: 'button', class: 'phenomenon-image-button', 'aria-label': 'Enlarge location screenshot',
      onclick: () => modal({ title: titleFor(r), body: screenshot(r, true), wide: true }) }, img));
  img.src = `/api/live/phenomena/${r.message_id}/image?token=${encodeURIComponent(TOKEN || '')}&v=${encodeURIComponent(r.edited_at || r.reported_at)}`;
  return box;
}

function card(r, { compact = false, image = true } = {}) {
  return h('article', { class: 'card stack tight phenomenon-card', dataset: { phenomenon: r.message_id } },
    h('strong', null, titleFor(r)),
    h('div', { class: 'tiny muted' }, 'Reported ', h('time', { datetime: r.reported_at, title: fmtDate(r.reported_at, true) },
      relTime(r.reported_at)), r.region ? ' · ' + cap(r.region) : '', r.edited_at ? ' · edited' : ''),
    r.notes ? h('div', { class: 'small' }, 'Notes · ', r.notes) : null,
    h('div', { class: 'small' }, 'HMs · ', r.required_hms || 'Unknown'),
    !compact && r.description ? h('div', { class: 'small' }, r.description) : null,
    !compact && r.possible_pokemon ? h('div', { class: 'small' }, 'Possible Pokémon · ', r.possible_pokemon.join(', ')) : null,
    image ? screenshot(r) : null,
    h('div', { class: 'small' }, extLink(PROVIDER, 'Alphapedia'), r.source_url ? [' · ', extLink(r.source_url, 'Discord report')] : null));
}

export function homePhenomena(el, data) {
  const reports = data.recent.slice(0, 2);
  mount(el, h('div', { class: 'row wrap' }, h('strong', null, 'Phenomena'), h('span', { class: 'grow' }),
    h('button', { class: 'btn ghost small', onclick: () => go('#/live/phenomena') }, 'Reports')),
    sourceLine(data.source),
    h('div', { class: 'tiny muted' }, reports.length
      ? `Reported in the past ${data.recent_minutes} minutes. Activity unverified.`
      : `No Phenomenon reports in the past ${data.recent_minutes} minutes.`),
    reports.length ? h('div', { class: 'phenomenon-grid' }, reports.map((r) => card(r, { compact: true }))) : null);
}

const filters = {
  workspace: { view: 'recent', type: '', region: '', q: '' },
  expanded: { view: 'recent', type: '', region: '', q: '' },
};

// Mounted once per Live route. Popouts use their own existing event refresh.
export async function renderPhenomena(el, { variant = 'workspace', selected = '', subscribe = false } = {}) {
  const view = filters[variant];
  const box = h('div', { class: 'stack tight' });
  const content = h('div', { class: 'phenomenon-grid' });
  const status = h('div', { class: 'stack tight' });
  const selectedBox = h('div');
  const select = (key, label) => h('select', { class: 'input', 'aria-label': label,
    onchange: (e) => { view[key] = e.target.value; draw(); } });
  let data;
  const type = view ? select('type', 'Phenomenon type') : null;
  const region = view ? select('region', 'Phenomenon region') : null;
  const period = view ? select('view', 'Report period') : null;
  const search = view ? h('input', { class: 'input', type: 'search', 'aria-label': 'Search Phenomena',
    placeholder: 'Search reports', value: view.q, oninput: (e) => { view.q = e.target.value; draw(); } }) : null;

  function options(node, key, values) {
    const choices = [...values];
    if (view[key] && !choices.some(([value]) => value === view[key])) view[key] = '';
    mount(node, choices.map(([value, label]) => h('option', { value }, label)));
    node.value = view[key];
  }
  function draw() {
    let list = view ? data[view.view] : data.recent;
    if (view) {
      const q = view.q.trim().toLowerCase();
      list = list.filter((r) => (!view.type || r.type === view.type) && (!view.region || (r.region || 'unknown') === view.region)
        && (!q || [r.type, r.location, r.description, r.notes, r.required_hms, ...(r.possible_pokemon || [])]
          .some((v) => v?.toLowerCase().includes(q))));
    } else if (variant === 'compact') {
      list = list.slice(0, 1);
    }
    mount(content, list.length ? list.map((r) => card(r, { compact: variant === 'compact', image: !view || view.view === 'recent' || r.message_id === selected }))
      : h('div', { class: 'small muted' }, view?.view === 'history' ? 'No saved reports match.' : 'No recent reports match.'));
    // In history, screenshots load on demand as a report is opened.
    if (view?.view === 'history') {
      [...content.querySelectorAll('article')].forEach((el, i) => {
        const r = list[i];
        if (r.message_id !== selected && r.image_url) {
          el.append(h('button', { class: 'btn small', onclick: () => modal({ title: titleFor(r), body: screenshot(r, true), wide: true }) }, 'View location screenshot'));
        }
      });
    }
  }

  const refresh = async () => {
    data = await get('/api/live/phenomena' + (selected ? '?id=' + encodeURIComponent(selected) : ''));
    if (!box.isConnected) return;
    mount(status, sourceLine(data.source),
      h('div', { class: 'tiny muted' }, `Recent covers the past ${data.recent_minutes} minutes. Report age cannot verify activity.`));
    mount(selectedBox, selected ? (data.selected ? card(data.selected) : h('div', { class: 'small muted' }, 'This report is unavailable.')) : null);
    if (view) {
      options(period, 'view', [['recent', 'Recent reports'], ['history', 'Report history']]);
      options(type, 'type', [['', 'All types'], ...[...new Set(data.history.map((r) => r.type).filter(Boolean))].sort().map((t) => [t, t])]);
      options(region, 'region', [['', 'All regions'], ...[...new Set(data.history.map((r) => r.region || 'unknown'))].sort().map((v) => [v, cap(v)])]);
    }
    draw();
  };
  mount(box, status, selectedBox, view ? h('div', { class: 'row wrap' }, period, type, region, search) : null, content);
  mount(el, box);
  const update = debounce(() => { if (box.isConnected) refresh().catch(() => {}); }, 120);
  const unsubscribe = subscribe ? on('live.phenomena', update) : () => {};
  await refresh();
  return unsubscribe;
}

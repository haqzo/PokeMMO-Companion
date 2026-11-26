import { h, mount, get, post, setting, saveSettings, modal, confirmDialog, toast, fmtDate } from '../core.js';
import { reportSpeciesPicker } from '../components.js';
import { compareLabels, gameTerm, searchText } from '../game-locale.js';
import { t } from '../i18n.js';

const ROOT = '/api/live/community';
const ENABLED = 'live.community.enabled';
const REGIONS = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova'];
const KINDS = { alpha: 'ui.live_alpha', swarm: 'ui.live_swarm', phenomena: 'ui.phenomena' };
const PHENOMENA = { grass: 'ui.grass_rustling', water: 'ui.water_rippling', dust: 'ui.dust_cloud', shadow: 'ui.shadow_moving' };
const errorText = (e) => e.rawMessage?.startsWith('community.') ? t(e.rawMessage) : e.message;

export const phenomenonType = (value) => PHENOMENA[value] ? t(PHENOMENA[value]) : value;
export const communityEnabled = () => setting(ENABLED) === true;

function select(name, options, value) {
  return h('select', { class: 'input', 'aria-label': name },
    h('option', { value: '' }, name), options.map(([key, label]) =>
      h('option', { value: key, selected: key === value ? true : null }, label)));
}
const field = (label, control) => h('label', { class: 'field' }, h('span', { class: 'label' }, label), control);

export function communitySourceText(source = {}) {
  if (!(source.enabled ?? communityEnabled())) return t('community.source_off');
  if (!source.receive_enabled) return t('community.source_local');
  const states = { connecting: 'community.source_connecting', connected: 'community.source_connected',
    disconnected: 'community.source_disconnected', unavailable: 'community.source_unavailable' };
  return t(states[source.connection] || states.unavailable);
}

export function communityBar(kind, onSaved, initialSource) {
  const box = h('div', { class: 'community-source' });
  let source = initialSource;
  const draw = () => mount(box, h('div', { class: 'grow' }, h('strong', null, t('community.name')),
    h('div', { class: 'small muted' }, communitySourceText(source))),
  communityEnabled()
    ? h('button', { class: 'btn primary small', onclick: async () => {
      const saved = await reportDialog(kind);
      if (saved && box.isConnected) onSaved?.(saved);
    } }, t('community.new'))
    : h('button', { class: 'btn small', onclick: async (event) => {
      event.currentTarget.disabled = true;
      try {
        await saveSettings({ [ENABLED]: true });
        source = await get(ROOT + '/source');
        draw();
      } catch (e) { toast(errorText(e), { kind: 'warn' }); draw(); }
    } }, t('community.enable')));
  draw();
  if (!source) get(ROOT + '/source').then((value) => { source = value; if (box.isConnected) draw(); }).catch(() => {});
  return box;
}

let dialogOpen = false;

export const reportPhenomenon = (defaults) => reportDialog('phenomena', null, defaults);
export const locationSearchTerms = (name) => ['en', 'es', 'zh'].map(id => gameTerm('location', name, id));
export const spotLabel = (id) => t('phenomena.spot.' + id);

async function reportDialog(kind, report, defaults) {
  if (dialogOpen) return null;
  dialogOpen = true;
  try {
    const observed = new Date().toISOString();
    const [options, reference] = await Promise.all([get(ROOT + '/options'),
      get('/api/live/phenomena/reference')]);
    const meta = report?.community;
    const shareCorrection = Boolean(report?.is_own && report.publication?.state === 'shared');
    const share = h('input', { type: 'checkbox', class: 'check' });
    const category = select(t('ui.live_report_type'), options.kinds.map(k => [k, t(KINDS[k])]), kind);
    category.disabled = Boolean(report);
    const region = select(t('ui.region'), REGIONS.map(r => [r.toLowerCase(), gameTerm('region', r)]), report?.region || defaults?.region);
    const placeModes = [['catalog', t('community.location_catalog')], ['unlisted', t('community.location_unlisted')]];
    const mode = select(t('community.location_mode'), [...placeModes, ['unknown', t('community.location_unknown')]],
      meta?.location_id || !report ? 'catalog' : report.location ? 'unlisted' : 'unknown');
    const unknownMode = mode.querySelector('[value="unknown"]');
    const search = h('input', { class: 'input', type: 'search', 'aria-label': t('community.search_location'), placeholder: t('community.search_location') });
    const place = select(t('community.choose_location'), [], '');
    const unlisted = h('input', { class: 'input', 'aria-label': t('community.location_unlisted'), maxlength: 100,
      value: meta && !meta.location_id ? report.location || '' : '' });
    const catalog = h('div', { class: 'stack tight' }, h('div', { class: 'community-fields' },
      field(t('community.search_location'), search), field(t('community.choose_location'), place)),
      h('div', { class: 'small muted' }, t('community.location_hint')));
    const unlistedField = field(t('community.location_unlisted'), unlisted);
    let speciesId = report?.species_id ?? null;
    const species = reportSpeciesPicker({ value: speciesId, onChange: (id) => { speciesId = id; } });
    const type = select(t('community.choose_phenomenon'), options.phenomenon_types.map(p => [p, phenomenonType(p)]), meta?.phenomenon_type || defaults?.type);
    const typeField = field(t('community.choose_phenomenon'), type);
    const spot = select(t('phenomena.exact_spot'), [], '');
    const spotField = field(t('phenomena.exact_spot'), spot);
    const spotsByLocation = new Map();
    const spotKey = () => place.value + ':' + type.value;
    const drawSpots = (selected = spotsByLocation.get(spotKey())) => {
      const matches = reference.entries.filter(item => item.spot && item.area.id === place.value && item.type === type.value);
      spotField.hidden = !matches.length || mode.value !== 'catalog' || category.value !== 'phenomena';
      mount(spot, h('option', { value: '' }, t('phenomena.area_only')), matches.map(item =>
        h('option', { value: item.spot }, spotLabel(item.spot))));
      if (!spotField.hidden && matches.some(item => item.spot === selected)) spot.value = selected;
    };
    const onset = select(t('community.choose_onset'),
      [['just_appeared', t('community.just_appeared')], ['already_active', t('community.already_active')]], meta?.onset);
    const provenance = select(t('community.choose_provenance'),
      [['firsthand', t('community.firsthand')], ['relayed', t('community.relayed')]], meta?.provenance);
    const details = h('textarea', { class: 'input', rows: 2, maxlength: 240, 'aria-label': t('community.details') }, report?.body || '');
    const error = h('div', { role: 'alert', class: 'small', style: { color: 'var(--bad)' } });
    const placesByRegion = new Map();
    const drawPlaces = (selected = '') => {
      const names = options.locations.filter(p => p.region === region.value)
        .map(p => ({ ...p, localized: gameTerm('location', p.name) }));
      const counts = new Map();
      names.forEach(p => counts.set(p.localized, (counts.get(p.localized) || 0) + 1));
      const q = searchText(search.value);
      const matches = names.filter(p => p.id === selected || !q || locationSearchTerms(p.name).some(name => searchText(name).includes(q)));
      matches.sort((a, b) => compareLabels(a.localized, b.localized));
      mount(place, h('option', { value: '' }, t('community.choose_location')), matches.map(p =>
        h('option', { value: p.id }, counts.get(p.localized) > 1 ? p.localized + ' · ' + p.id.split(':').slice(1).join(':') : p.localized)));
      if (matches.some(p => p.id === selected)) place.value = selected;
      drawSpots();
    };
    const draw = () => {
      const pheno = category.value === 'phenomena';
      unknownMode.hidden = !pheno;
      unknownMode.disabled = !pheno;
      if (!pheno && mode.value === 'unknown') mode.value = 'catalog';
      catalog.hidden = mode.value !== 'catalog';
      unlistedField.hidden = mode.value !== 'unlisted';
      species.hidden = pheno;
      typeField.hidden = !pheno;
      drawSpots();
    };
    category.addEventListener('change', draw);
    mode.addEventListener('change', draw);
    region.addEventListener('change', () => { search.value = ''; drawPlaces(placesByRegion.get(region.value)); });
    search.addEventListener('input', () => drawPlaces(place.value));
    place.addEventListener('change', () => { placesByRegion.set(region.value, place.value); drawSpots(); });
    type.addEventListener('change', () => drawSpots());
    spot.addEventListener('change', () => spotsByLocation.set(spotKey(), spot.value));
    drawPlaces(meta?.location_id || defaults?.locationId);
    if (place.value) placesByRegion.set(region.value, place.value);
    draw();
    drawSpots(meta?.spot_id || defaults?.spot);
    if (spot.value) spotsByLocation.set(spotKey(), spot.value);
    const observationId = crypto.randomUUID();
    let saving = false;
    return await modal({
      title: t(report ? 'community.correct' : 'community.new'),
      body: h('div', { class: 'stack community-form', oninput: () => { error.textContent = ''; } },
        h('div', { class: 'small muted' }, t(shareCorrection ? 'community.shared_correction' : 'community.local_only')),
        h('div', { class: 'community-fields' }, field(t('ui.live_report_type'), category), field(t('ui.region'), region)),
        field(t('community.location_mode'), mode), catalog, unlistedField,
        species, h('div', { class: 'community-fields' }, typeField, field(t('community.choose_onset'), onset),
          field(t('community.choose_provenance'), provenance)), spotField,
        field(t('community.details'), details),
        !report && options.source.can_share
          ? h('label', { class: 'row small' }, share, t('community.share_report')) : null, error),
      actions: [{ label: t('ui.cancel'), kind: 'ghost' }, { label: t('community.save'), kind: 'primary', handler: async () => {
        if (saving) return false;
        saving = true;
        error.textContent = '';
        try {
          const url = ROOT + '/reports' + (report ? '/' + report.id + '/correct' : '');
          return await post(url, {
            observation_id: observationId, kind: category.value, region: region.value, observed_at: observed,
            location_id: mode.value === 'catalog' ? place.value || null : null,
            location_text: mode.value === 'unlisted' ? unlisted.value : '',
            location_unknown: mode.value === 'unknown',
            species_id: category.value !== 'phenomena' ? speciesId : null,
            phenomenon_type: category.value === 'phenomena' ? type.value || null : null,
            spot_id: spotField.hidden ? null : spot.value || null,
            onset: onset.value, provenance: provenance.value, details: details.value, share: shareCorrection || share.checked,
          });
        } catch (e) {
          error.textContent = e.rawMessage === 'community.choose_species' ? t('community.species_choose_result') : errorText(e);
          return false;
        } finally { saving = false; }
      } }],
    });
  } catch (e) { toast(errorText(e), { kind: 'warn' }); return null; }
  finally { dialogOpen = false; }
}

export const communitySavedRoute = (report) => report.kind === 'phenomena'
  ? '#/live/phenomena/' + report.id : '#/live/reports/' + report.id;

export function localFeedback(report) {
  const seen = report.local_feedback?.sighting;
  const completed = report.local_feedback?.personal?.action === 'complete';
  if (!seen && !completed) return null;
  return h('div', { class: 'tiny muted community-feedback' },
    [seen && t('community.local_result', { action: t('community.' + seen.action) }), completed && t('community.personal_completed')]
      .filter(Boolean).join(' · '));
}

export function communityEvidence(report) {
  const meta = report.community;
  if (!meta) return null;
  const publication = report.publication;
  const label = !report.is_own ? t('community.shared_label', { contributor: meta.contributor })
    : publication ? t('community.publication_' + publication.state) : t('community.local_label');
  return h('div', { class: 'small muted community-evidence' },
    [label, t('community.' + meta.provenance), t('community.' + meta.onset),
      report.withdrawn_at && t('community.inactive_label'), publication?.error && t(publication.error)].filter(Boolean).join(' · '));
}

export function sharedSources(report) {
  if (!report.sources?.includes('companion-shared')) return null;
  const labels = { ntfy: 'Alphapedia', 'companion-local': t('community.local_label'),
    'companion-shared': t('community.name') };
  const sources = report.sources.map(source => labels[source] || source);
  return h('div', { class: 'tiny muted community-sources' }, sources.join(' · '));
}

export function communityHistory(report) {
  const list = report.local_history || [];
  if (!list.length && !report.community?.corrects) return null;
  const ref = (id, label) => h('a', { href: communitySavedRoute({ kind: report.kind, id }) }, t(label));
  return h('details', { class: 'small community-history' }, h('summary', null, t('community.history')),
    report.community?.corrects ? ref(report.community.corrects, 'community.previous_report') : null,
    h('ul', null, list.map(a => h('li', null, t('community.' + a.action), ' · ', fmtDate(a.created_at, true),
      a.related_id ? [' · ', ref(a.related_id, 'community.replacement_report')] : null))));
}

export function communityActions(report, { compact = false, onSaved, correct } = {}) {
  if (!communityEnabled() || report.is_test || !(Object.hasOwn(KINDS, report.kind) || report.kind === 'seasonal')) return null;
  const own = report.is_own ? report.id : report.own_report_id;
  let running = false;
  const run = async (fn) => {
    if (running) return;
    running = true;
    try { await fn(); }
    catch (e) { toast(errorText(e), { kind: 'warn' }); }
    finally { running = false; }
  };
  const act = (id, action) => run(async () => {
    const info = id === report.id ? report : await get('/api/live/reports/' + id);
    if (action === 'withdraw' && !await confirmDialog(t('community.withdraw'),
      t(info.publication ? 'community.shared_withdrawal' : 'community.withdraw_hint'), t('community.withdraw'), true)) return;
    await post(ROOT + '/reports/' + id + '/actions', { action });
  });
  const buttons = (action, id = report.id) => h('button', { class: 'btn ghost small', onclick: () => act(id, action) }, t('community.' + action));
  const retry = report.is_own && ['pending', 'failed'].includes(report.publication?.state)
    ? h('button', { class: 'btn ghost small', onclick: () => run(() => post(ROOT + '/reports/' + report.id + '/retry-share', {})) },
      t('community.retry_share')) : null;
  if (report.withdrawn_at) return retry;
  const controls = h('div', { class: 'row wrap community-actions' },
    retry, buttons('still_here'), buttons('not_found'),
    buttons(report.local_feedback?.personal?.action === 'complete' ? 'reopen' : 'complete'),
    own ? h('button', { class: 'btn ghost small', onclick: () => run(async () => {
      const original = own === report.id && report.is_own ? report : await get('/api/live/reports/' + own);
      const saved = correct ? await correct(original) : await reportDialog(report.kind, original);
      if (saved) onSaved?.(saved);
    }) }, t('community.correct')) : null,
    own ? buttons('withdraw', own) : null);
  return compact ? h('details', { class: 'small community-actions-wrap' },
    h('summary', null, t('community.actions')), controls) : controls;
}

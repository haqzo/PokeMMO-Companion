// Collection: My Pokémon (manually recorded Box entries) and Showcases, one workspace.
//   #/collection                       My Pokémon
//   #/collection/pokemon/<id|new>      an entry (new: ?species=<id>)
//   #/collection/showcases[/<id>]      Showcases
// Former routes #/tools/box/… and #/tools/showcase/… redirect here (pages/tools.js).
import * as box from './box.js';

let current = null;
export function dispose() { if (current && current.dispose) current.dispose(); box.dispose && box.dispose(); current = null; }

export async function render(el, route) {
  const view = route.parts[0] === 'showcases' ? 'showcases' : 'pokemon';
  // box.js reads the entry / showcase id from parts[1]
  const r = { ...route, parts: [view, ...(route.parts[0] === 'pokemon' || route.parts[0] === 'showcases' ? route.parts.slice(1) : [])] };
  if (view === 'showcases') await box.renderShowcasePage(el, r);
  else await box.render(el, r);
}

/** Map a legacy #/tools/box|showcase route to its Collection route (query string kept). */
export function legacyRoute(tool, rest, query) {
  const q = query && String(query) ? '?' + query : '';
  if (tool === 'box') return '#/collection' + (rest.length ? '/pokemon/' + rest.map(encodeURIComponent).join('/') : '') + q;
  return '#/collection/showcases' + (rest.length ? '/' + rest.map(encodeURIComponent).join('/') : '') + q;
}

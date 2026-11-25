// Display-only terminology. Canonical values and IDs are kept in API responses and saved documents.
import { lang, locale } from './i18n.js';
import { GAME_TERMS } from './game-terms.js';

const glossary = {
  es: {
    region: { unova: 'Teselia' },
    egg: { plant: 'Planta', field: 'Campo', chaos: 'Amorfo', humanoid: 'Humanoide', cannotbreed: 'No puede criar',
      genderless: 'Sin género', watera: 'Agua 1', waterb: 'Agua 2', waterc: 'Agua 3' },
    growth: { mediumfast: 'Medio rápido', mediumslow: 'Medio lento' },
    encounter: { grass: 'Hierba', cave: 'Cueva', surf: 'Surf', fishing: 'Pesca', special: 'Especial', lure: 'Señuelo',
      superrod: 'Supercaña', goodrod: 'Caña Buena', oldrod: 'Caña Vieja' },
  },
  zh: {
    egg: { plant: '植物群', field: '陆上群', chaos: '不定形群', humanoid: '人型群', cannotbreed: '无法孵蛋',
      genderless: '无性别', watera: '水中1群', waterb: '水中2群', waterc: '水中3群' },
    growth: { mediumfast: '中快', mediumslow: '中慢' },
    encounter: { grass: '草丛', cave: '洞窟', surf: '冲浪', fishing: '钓鱼', special: '特殊', lure: '引诱香水',
      superrod: '厉害钓竿', goodrod: '好钓竿', oldrod: '破旧钓竿' },
  },
};

export function searchText(text) {
  return String(text ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
}
const keyFor = (value) => searchText(value).replace(/[^\p{L}\p{N}]/gu, '');
const compare = new Map();

export function compareLabels(a, b) {
  const id = locale();
  if (!compare.has(id)) compare.set(id, new Intl.Collator(id, { sensitivity: 'base', numeric: true }));
  return compare.get(id).compare(a, b);
}

export function gameTerm(domain, value) {
  const id = lang();
  if (!value || id === 'en') return value;
  const key = keyFor(value);
  const name = glossary[id]?.[domain]?.[key] ?? GAME_TERMS[id]?.[domain]?.[key];
  if (name) return name;
  if (domain === 'location') {
    const route = /^Route\s+(\d+)$/i.exec(value);
    if (route) return id === 'es' ? `Ruta ${route[1]}` : `${route[1]}号道路`;
  }
  return value;
}

export function formLabel(id, canonical) {
  if (!canonical || lang() === 'en') return canonical;
  return GAME_TERMS[lang()]?.form[`${id}:${keyFor(canonical)}`] || canonical;
}

export function speciesLabel(id, canonical = '') {
  if (lang() === 'en' && canonical) return canonical;
  return GAME_TERMS[lang()]?.species[id] || canonical || GAME_TERMS.en.species[id] || '';
}

export function speciesCategory(id) {
  return GAME_TERMS[lang()]?.category[id] || GAME_TERMS.en.category[id];
}

export function speciesMatches(species, query) {
  const term = searchText(query).replace(/^#\s*/, '');
  if (/^\d+$/.test(term)) return species.id === Number(term);
  return [species.name, speciesLabel(species.id, species.name)].some((name) => searchText(name).includes(term));
}

export function findSpecies(list, query) {
  const term = searchText(query);
  const exact = list.find((s) => [s.name, speciesLabel(s.id, s.name)].some((name) => searchText(name) === term));
  if (exact || !term) return exact;
  const matches = list.filter((s) => speciesMatches(s, term));
  return matches.length === 1 ? matches[0] : undefined;
}

export function matchesTerm(domain, value, query) {
  const term = searchText(query);
  return [value, gameTerm(domain, value)].some((name) => searchText(name).includes(term));
}

export const itemLabel = (item) => item.label && item.label !== item.name ? item.label : gameTerm('item', item.name);

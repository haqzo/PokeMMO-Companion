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

// Canonical chapter labels that are absent from the location glossary or use a different spelling.
const WALKTHROUGH_CHAPTERS = {
  'Mirage Tower': ['Torre Espejismo', '幻影之塔'],
  'Magma Hideout': ['Guarida Magma', '熔岩队基地'],
  'Aqua Hideout': ['Guarida Aqua', '海洋队基地'],
  'Low Tide (3:00Am To 8:59Am)(3:00Pm To 8:59Pm)': [
    'Marea baja (3:00–8:59 a. m. y 3:00–8:59 p. m.)', '退潮（上午 3:00 至 8:59，下午 3:00 至 8:59）',
  ],
  'High Tide (9:00Am To 2:59Pm)(9:00Pm To 2:59Am)': [
    'Marea alta (9:00 a. m.–2:59 p. m. y 9:00 p. m.–2:59 a. m.)', '涨潮（上午 9:00 至下午 2:59，晚上 9:00 至次日凌晨 2:59）',
  ],
  'Desert Underpass': ['Gruta Desértica', '沙漠的地下道'],
  'Abandoned Ship': ['Nao Abandonada', '废弃船'],
  'Burned Tower': ['Torre Quemada', '烧焦塔'],
  'Lighthouse': ['Faro de Olivo', '光辉灯塔'],
  'Safari Zone Gate': ['Entrada a la Zona Safari', '狩猎地带入口'],
  'Lake Of Rage': ['Lago de la Furia', '愤怒之湖'],
  'Team Rocket Hq': ['Guarida del Equipo Rocket', '火箭队基地'],
  'Radio Tower': ['Torre Radio', '播音塔'],
  'Frontier Access': ['Acceso al Frente Batalla', '开拓区入口'],
  'Mt. Silver': ['Monte Plateado', '白银山'],
  'Mt. Silver Cave': ['Cueva del Monte Plateado', '白银山洞窟'],
  'Rocket Hideout': ['Guarida del Equipo Rocket', '火箭队基地'],
  'One Island': ['Isla Prima', '第一岛'],
  'Two Island': ['Isla Secunda', '第二岛'],
  'Cape Brink': ['Cabo Extremo', '边缘海岬'],
  'Three Island': ['Isla Tera', '第三岛'],
  'Bond Bridge': ['Puente Unión', '牵绊桥'],
  'Four Island': ['Isla Quarta', '第四岛'],
  'Six Island': ['Isla Exta', '第六岛'],
  'Seven Island': ['Isla Sete', '第七岛'],
  'Jubilife City': ['Ciudad Jubileo', '祝庆市'],
  'Oreburgh City': ['Ciudad Pirita', '黑金市'],
  'Northern Gate': ['Acceso norte', '北侧关卡'],
  'Mt. Coronet': ['Monte Corona', '天冠山'],
  'Ruin Maniac Cave': ['Cueva del Ruinamaníaco', '遗迹迷洞穴'],
  'Distortion World': ['Mundo Distorsión', '毁坏的世界'],
  'Fight Arena': ['Zona Combate', '对战区'],
  'Winter': ['Invierno', '冬季'],
  'Spring Summer Autumn': ['Primavera, verano y otoño', '春季、夏季和秋季'],
  'N Castle': ['Palacio de N', 'N的城堡'],
};

export function walkthroughChapter(name) {
  const language = lang();
  const index = { es: 0, zh: 1 }[language];
  const labels = Object.hasOwn(WALKTHROUGH_CHAPTERS, name) ? WALKTHROUGH_CHAPTERS[name] : null;
  return labels?.[index] ?? gameTerm('location', name);
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

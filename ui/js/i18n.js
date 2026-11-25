// English is the source and safe fallback. Spanish and Simplified Chinese await community review.
import { state } from './core.js';
import { UI_STRINGS } from './ui-strings.js';

export const LANGS = [
  { id: 'en', label: 'English', native: 'English', status: 'primary' },
  { id: 'es', label: 'Spanish', native: 'Español', status: 'beta' },
  { id: 'zh', label: 'Chinese (Simplified)', native: '简体中文', status: 'beta' },
];

const ES = {
  'nav.home': 'Inicio', 'nav.pokedex': 'Pokédex', 'nav.tools': 'Herramientas', 'nav.live': 'En vivo', 'nav.guides': 'Guías', 'nav.settings': 'Ajustes',
  'nav.quick': 'Acceso rápido', 'nav.quick_empty': 'Arrastra herramientas aquí desde Herramientas o usa «Fijar en la barra».',
  'lang.menu': 'Idioma', 'lang.beta': 'beta · traducción sin revisar', 'lang.game_names': 'Se muestran nombres localizados cuando están disponibles.',
  'common.search': 'Buscar', 'common.save': 'Guardar', 'common.saved': 'Guardado', 'common.saving': 'Guardando…', 'common.cancel': 'Cancelar', 'common.delete': 'Eliminar',
  'common.edit': 'Editar', 'common.new': 'Nuevo', 'common.close': 'Cerrar', 'common.open': 'Abrir', 'common.restore': 'Restaurar', 'common.archive': 'Archivar',
  'common.unarchive': 'Desarchivar', 'common.duplicate': 'Duplicar', 'common.export': 'Exportar', 'common.import': 'Importar', 'common.all': 'Todo',
  'common.none': 'Ninguno', 'common.tags': 'Etiquetas', 'common.links': 'Enlaces', 'common.popout': 'Ventana aparte', 'common.back': 'Volver',
  'common.add': 'Añadir', 'common.remove': 'Quitar', 'common.empty': 'Nada por aquí todavía.', 'common.loading': 'Cargando…', 'common.favourite': 'Favorito',
  'common.reset': 'Restablecer', 'common.text_size': 'Tamaño del texto', 'common.background': 'Fondo', 'common.open_main': 'Abrir en la ventana principal',
  'common.reset_size': 'Restablecer tamaño',
  'tools.title': 'Herramientas', 'tools.group.collection': 'Colección y notas', 'tools.group.collection_sub': 'Objetos, notas, tu caja, vitrina, guías propias y lugares',
  'items.title': 'Biblioteca de objetos', 'items.desc': 'Todos los objetos de tus datos locales de PokeMMO, con iconos',
  'items.category': 'Categoría', 'items.held_by': 'Lo llevan Pokémon salvajes', 'items.evolution': 'Se usa para evolucionar', 'items.owned_qty': 'Cantidad que tengo (manual)',
  'items.not_installed': 'Instala (o reinstala) tus datos de PokeMMO para crear la biblioteca de objetos.',
  'notes.title': 'Notas', 'notes.desc': 'Notas con etiquetas, enlaces y ventanas flotantes', 'notes.new': 'Nueva nota', 'notes.untitled': 'Sin título',
  'notes.active': 'Activas', 'notes.archived': 'Archivadas', 'notes.trash': 'Papelera', 'notes.pinned': 'Fijada', 'notes.purge': 'Eliminar para siempre',
  'notes.title_ph': 'Título', 'notes.body_ph': 'Escribe aquí… (se guarda solo)', 'notes.link_add': 'Enlazar a…', 'notes.species_notes': 'Notas del Pokédex',
  'box.title': 'Mi caja', 'box.desc': 'Pokémon individuales que decides registrar', 'box.add': 'Añadir Pokémon',
  'showcase.title': 'Vitrina', 'showcase.desc': 'Muestra tus capturas en una ventana para directos',
  'cguide.title': 'Mis guías', 'cguide.desc': 'Guías propias con pasos y ciclos repetibles', 'cguide.new': 'Nueva guía',
  'loc.title': 'Explorador de lugares', 'loc.desc': 'Lugares y encuentros de tus datos, enlazados al Pokédex',
  'dex.availability': 'Disponibilidad', 'dex.report': 'Informe de disponibilidad', 'dex.listed': 'Aparece', 'dex.not_listed': 'No aparece',
  'popout.text_size_hint': 'Tamaño del texto de esta ventana (60–200 %)',
  'links.title': 'Webs y enlaces', 'links.desc': 'Tus marcadores de PokeMMO, abiertos en tu navegador', 'shortcuts.title': 'Atajos de teclado',
  'calc.title': 'Calculadora', 'nav.typechart': 'Tabla de tipos', 'nav.notes': 'Notas', 'nav.collection': 'Colección',
  'collection.title': 'Colección', 'collection.desc': 'Tus Pokémon registrados y tus vitrinas', 'collection.mine': 'Mis Pokémon', 'collection.showcases': 'Vitrinas',
};

const ZH = {
  'nav.home': '主页', 'nav.pokedex': '图鉴', 'nav.tools': '工具', 'nav.live': '实时', 'nav.guides': '攻略', 'nav.settings': '设置',
  'nav.quick': '快速访问', 'nav.quick_empty': '从“工具”页拖动工具到这里，或使用“固定到侧栏”。',
  'lang.menu': '语言', 'lang.beta': '测试版 · 译文未经审校', 'lang.game_names': '有已核实的本地化名称时，将显示该名称。',
  'common.search': '搜索', 'common.save': '保存', 'common.saved': '已保存', 'common.saving': '正在保存…', 'common.cancel': '取消', 'common.delete': '删除',
  'common.edit': '编辑', 'common.new': '新建', 'common.close': '关闭', 'common.open': '打开', 'common.restore': '恢复', 'common.archive': '归档',
  'common.unarchive': '取消归档', 'common.duplicate': '复制', 'common.export': '导出', 'common.import': '导入', 'common.all': '全部',
  'common.none': '无', 'common.tags': '标签', 'common.links': '链接', 'common.popout': '弹出窗口', 'common.back': '返回',
  'common.add': '添加', 'common.remove': '移除', 'common.empty': '这里还没有内容。', 'common.loading': '加载中…', 'common.favourite': '收藏',
  'common.reset': '重置', 'common.text_size': '文字大小', 'common.background': '背景', 'common.open_main': '在主窗口中打开',
  'common.reset_size': '重置尺寸',
  'tools.title': '工具', 'tools.group.collection': '收藏与笔记', 'tools.group.collection_sub': '道具、笔记、你的盒子、展示柜、自定义攻略和地点',
  'items.title': '道具库', 'items.desc': '来自你本地 PokeMMO 数据的全部道具及图标',
  'items.category': '分类', 'items.held_by': '野生宝可梦携带', 'items.evolution': '用于进化', 'items.owned_qty': '我拥有的数量（手动）',
  'items.not_installed': '请安装（或重新安装）你的 PokeMMO 数据以建立道具库。',
  'notes.title': '笔记', 'notes.desc': '带标签、链接和浮动窗口的笔记', 'notes.new': '新建笔记', 'notes.untitled': '无标题',
  'notes.active': '使用中', 'notes.archived': '已归档', 'notes.trash': '回收站', 'notes.pinned': '已置顶', 'notes.purge': '永久删除',
  'notes.title_ph': '标题', 'notes.body_ph': '在这里输入…（自动保存）', 'notes.link_add': '链接到…', 'notes.species_notes': '图鉴笔记',
  'box.title': '我的盒子', 'box.desc': '你选择记录的单只宝可梦', 'box.add': '添加宝可梦',
  'showcase.title': '展示柜', 'showcase.desc': '在直播窗口中展示你的收获',
  'cguide.title': '我的攻略', 'cguide.desc': '带步骤和可重复周期的自定义攻略', 'cguide.new': '新建攻略',
  'loc.title': '地点浏览', 'loc.desc': '来自你数据的地点与遭遇，并链接到图鉴',
  'dex.availability': '获取方式', 'dex.report': '获取方式报告', 'dex.listed': '已列出', 'dex.not_listed': '未列出',
  'popout.text_size_hint': '此窗口的文字大小（60–200%）',
  'links.title': '网站与链接', 'links.desc': '你的 PokeMMO 书签，在浏览器中打开', 'shortcuts.title': '键盘快捷键',
  'calc.title': '计算器', 'nav.typechart': '属性相克', 'nav.notes': '笔记', 'nav.collection': '收藏',
  'collection.title': '收藏', 'collection.desc': '你记录的宝可梦和展示柜', 'collection.mine': '我的宝可梦', 'collection.showcases': '展示柜',
};

const EN = {
  'nav.home': 'Home', 'nav.pokedex': 'Pokédex', 'nav.tools': 'Tools', 'nav.live': 'Live', 'nav.guides': 'Guides', 'nav.settings': 'Settings',
  'nav.quick': 'Quick access', 'nav.quick_empty': 'Drag tools here from the Tools page, or use “Pin to sidebar”.',
  'lang.menu': 'Language', 'lang.beta': 'beta · translation not reviewed', 'lang.game_names': 'Verified localized game names are shown where available.',
  'common.search': 'Search', 'common.save': 'Save', 'common.saved': 'Saved', 'common.saving': 'Saving…', 'common.cancel': 'Cancel', 'common.delete': 'Delete',
  'common.edit': 'Edit', 'common.new': 'New', 'common.close': 'Close', 'common.open': 'Open', 'common.restore': 'Restore', 'common.archive': 'Archive',
  'common.unarchive': 'Unarchive', 'common.duplicate': 'Duplicate', 'common.export': 'Export', 'common.import': 'Import', 'common.all': 'All',
  'common.none': 'None', 'common.tags': 'Tags', 'common.links': 'Links', 'common.popout': 'Pop out', 'common.back': 'Back',
  'common.add': 'Add', 'common.remove': 'Remove', 'common.empty': 'Nothing here yet.', 'common.loading': 'Loading…', 'common.favourite': 'Favourite',
  'common.reset': 'Reset', 'common.text_size': 'Text size', 'common.background': 'Background', 'common.open_main': 'Open in main',
  'common.reset_size': 'Reset size',
  'tools.title': 'Tools', 'tools.group.collection': 'Collection & notes', 'tools.group.collection_sub': 'Items, notes, your Box, Showcase, your own guides and locations',
  'items.title': 'Item Library', 'items.desc': 'Every item in the PokeMMO data',
  'items.category': 'Category', 'items.held_by': 'Held by wild Pokémon', 'items.evolution': 'Used for evolution', 'items.owned_qty': 'How many I have (manual)',
  'items.not_installed': 'Install (or re-install) your PokeMMO data to build the Item Library.',
  'notes.title': 'Notes', 'notes.desc': 'Tagged, linked notes with floating note windows', 'notes.new': 'New note', 'notes.untitled': 'Untitled',
  'notes.active': 'Active', 'notes.archived': 'Archived', 'notes.trash': 'Trash', 'notes.pinned': 'Pinned', 'notes.purge': 'Delete forever',
  'notes.title_ph': 'Title', 'notes.body_ph': 'Write here… (saves automatically)', 'notes.link_add': 'Link to…', 'notes.species_notes': 'Pokédex species notes',
  'box.title': 'My Box', 'box.desc': 'Individual Pokémon you choose to record', 'box.add': 'Add Pokémon',
  'showcase.title': 'Showcase', 'showcase.desc': 'Show your catches in a stream-friendly window',
  'cguide.title': 'My guides', 'cguide.desc': 'Your own guides with steps and repeatable cycles', 'cguide.new': 'New guide',
  'loc.title': 'Location explorer', 'loc.desc': 'Locations and encounters from your data, linked to the Pokédex',
  'dex.availability': 'Availability', 'dex.report': 'Availability report', 'dex.listed': 'It’s listed', 'dex.not_listed': 'Not listed',
  'popout.text_size_hint': 'Text size for this window (60–200%)',
  'links.title': 'Websites & links', 'links.desc': 'Your PokeMMO bookmarks, opened in your browser', 'shortcuts.title': 'Keyboard shortcuts',
  'calc.title': 'Calculator', 'nav.typechart': 'Type matchups', 'nav.notes': 'Notes', 'nav.collection': 'Collection',
  'collection.title': 'Collection', 'collection.desc': 'Pokémon you chose to record, and your Showcases', 'collection.mine': 'My Pokémon', 'collection.showcases': 'Showcases',
};

const DICTS = { en: EN, es: ES, zh: ZH };

for (const [key, [en, es, zh]] of Object.entries(UI_STRINGS)) {
  EN[key] = en; ES[key] = es; ZH[key] = zh;
}

// Context-specific keys use explicit t() calls; they must not override registry labels.
const labelKeys = new Map(Object.entries(UI_STRINGS).filter(([key]) => !/^(theme|settings|advanced|system|itemui|noteui|shared|breedui|toolui|boxui)\./.test(key)).map(([key, [source]]) => [source, key]));

// The calculator uses a context-specific translation for Add; registry actions use the generic one.
labelKeys.set('Add', 'ui.add');

/** Render a controlled, application-authored label supplied by a registry or backend. */
export function uiLabel(source) {
  return labelKeys.has(source) ? t(labelKeys.get(source)) : source;
}

export const locale = () => ({ en: 'en', es: 'es', zh: 'zh-Hans' })[lang()] || 'en';
export const number = (value, options) => new Intl.NumberFormat(locale(), options).format(value);

export function lang() { return (state.settings && state.settings['app.language']) || 'en'; }

/** Translate a key with {name} placeholders. Missing keys fall back to English, then to the key itself. */
export function t(key, vars) {
  const language = lang();
  const d = Object.hasOwn(DICTS, language) ? DICTS[language] : EN;
  const s = Object.hasOwn(d, key) ? d[key] : Object.hasOwn(EN, key) ? EN[key] : key;
  return vars ? s.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => Object.hasOwn(vars, name) ? String(vars[name]) : match) : s;
}

// Use the unsuffixed source when a language has no dedicated plural-category message.
export function plural(key, count, vars) {
  const category = new Intl.PluralRules(locale()).select(count);
  const variant = `${key}_${category}`;
  return t(Object.hasOwn(EN, variant) ? variant : key, { ...vars, count: number(count) });
}

export function catalogEntries() {
  return Object.keys(EN).map((key) => [key, ...LANGS.map(({ id }) => DICTS[id][key])]);
}

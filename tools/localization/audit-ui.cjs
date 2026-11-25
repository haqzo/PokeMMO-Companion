// Run from the repository root with acorn and acorn-walk on NODE_PATH.
// Reports candidate UI text. Review context before translating a candidate.
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const walk = require('acorn-walk');

const catalog = 'ui/js/ui-strings.js';
const sources = new Map();
const declarations = new Set();
const used = new Set();
const candidates = [];
const known = new Set(['aria-label', 'placeholder', 'alt', 'title']);
const parse = (source) => acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true});

walk.simple(parse(fs.readFileSync(catalog, 'utf8')), {
  Property(node) {
    const key = node.key.value;
    if (declarations.has(key)) {
      throw new Error(`Duplicate translation key ${key} at ${catalog}:${node.loc.start.line}`);
    }
    declarations.add(key);
    sources.set(node.value.elements[0].value, node.key.value);
  },
});
for (const folder of ['ui/js', 'ui/js/pages']) {
  for (const file of fs.readdirSync(folder).filter((file) => file.endsWith('.js')).sort()) {
    const name = path.join(folder, file);
    if (name === catalog || ['game-terms.js', 'walkthrough-locales.js'].includes(file)) continue;
    const source = fs.readFileSync(name, 'utf8');
    function inspect(node, ancestors, value) {
      if (typeof value !== 'string' || !/[A-Za-z]{2}/.test(value)) return;
      if (declarations.has(value)) used.add(value);
      const parent = ancestors.at(-2);
      if (parent?.type === 'CallExpression') {
        const index = parent.arguments.indexOf(node);
        const fn = parent.callee.name;
        if (!((fn === 'h' && index >= 2) ||
            (['toast', 'confirmDialog', 'row'].includes(fn) && index === 0) ||
            (['notice', 'extLink', 'row'].includes(fn) && index === 1))) return;
      } else if (!(parent?.type === 'Property' && parent.value === node &&
                   known.has(parent.key.name ?? parent.key.value))) return;
      candidates.push({ file: name, line: node.loc.start.line, text: value, catalog: sources.get(value) });
    }
    walk.ancestor(parse(source), {
      Literal(node, ancestors) { inspect(node, ancestors, node.value); },
      TemplateLiteral(node, ancestors) { inspect(node, ancestors, node.quasis.map((q) => q.value.cooked).join('{…}')); },
    });
  }
}
const inventory = {
  note: 'Direct UI candidates include branding and legitimate fallbacks. Indirect labels, server messages, HTML, and guide and bundled reference prose require separate review. Keys without a direct call may be resolved through a registry.',
  catalogKeys: declarations.size,
  keysWithoutDirectUse: [...declarations].filter((key) => !used.has(key)).sort(),
  candidates,
};
console.log(JSON.stringify(inventory, null, 2));

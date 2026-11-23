import { readFile, writeFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';

const IMPORT_PATTERN = /^\s*import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]\s*;\s*$/gm;
const DECLARATION_PATTERN = /\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g;

function parseBindings(text) {
  return text.split(',').map(value => value.trim()).filter(Boolean).map(value => {
    const [imported, local = imported] = value.split(/\s+as\s+/);
    if (!/^[A-Za-z_$][\w$]*$/.test(imported) || !/^[A-Za-z_$][\w$]*$/.test(local)) {
      throw new Error(`Unsupported module binding: ${value}`);
    }
    return { imported, local };
  });
}

/** Bundle our local named-export ES modules without sharing their lexical scopes. */
async function bundleModules(root, entry, replaceAssets) {
  const ordered = [];
  const visited = new Set();
  const visiting = new Set();
  async function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Circular standalone module: ${id}`);
    visiting.add(id);
    const source = replaceAssets(await readFile(resolve(root, id), 'utf8'));
    const imports = [...source.matchAll(IMPORT_PATTERN)].map(match => {
      if (!match[2].startsWith('.')) throw new Error(`Standalone imports must be local: ${match[2]}`);
      const dependency = posix.normalize(posix.join(posix.dirname(id), match[2]));
      if (dependency.startsWith('../')) throw new Error('Standalone import leaves the project.');
      return { dependency, bindings: parseBindings(match[1]) };
    });
    for (const item of imports) await visit(item.dependency);
    const exported = [...source.matchAll(DECLARATION_PATTERN)].map(match => ({ imported: match[1], local: match[1] }));
    let body = source.replace(IMPORT_PATTERN, '');
    body = body.replace(/\bexport\s*\{([^}]+)\}\s*;?/g, (_match, names) => {
      for (const { imported, local } of parseBindings(names)) exported.push({ imported, local });
      return '';
    });
    body = body.replace(/\bexport\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/g, '');
    if (/^\s*(?:import|export)\b/m.test(body)) throw new Error(`Unsupported standalone module syntax in ${id}`);
    const declarations = imports.map(({ dependency, bindings }) =>
      `const { ${bindings.map(({ imported, local }) => imported === local ? imported : `${imported}: ${local}`).join(', ')} } = __modules[${JSON.stringify(dependency)}];`
    ).join('\n');
    // Export aliases are written `local as publicName` in an export list.
    const values = exported.map(({ imported, local }) => `${JSON.stringify(local)}: ${imported}`).join(', ');
    ordered.push(`__modules[${JSON.stringify(id)}] = (() => {\n${declarations}\n${body}\nreturn { ${values} };\n})();`);
    visiting.delete(id);
    visited.add(id);
  }
  await visit(entry);
  return `const __modules = Object.create(null);\n${ordered.join('\n\n')}`;
}

/** Portable offline editor: modules, fonts, and styles are embedded. */
export async function buildStandalone(root, output) {
  const embeddedAssets = [
    ['assets/Aeonik Pro TRIAL/AeonikProTRIAL-Regular.otf', 'font/otf'],
    ['assets/Signifier/Signifier-Light.ttf', 'font/ttf'],
    ['assets/examples/portrait-light.jpg', 'image/jpeg'],
    ['assets/examples/portrait-pink.jpg', 'image/jpeg'],
    ['assets/examples/portrait-smile.jpg', 'image/jpeg'],
    ['assets/examples/portrait-grey.jpg', 'image/jpeg'],
    ['assets/foundations/strengthen.svg', 'image/svg+xml'],
    ['assets/foundations/reshape.svg', 'image/svg+xml'],
    ['assets/foundations/reorganize.svg', 'image/svg+xml'],
    ['assets/foundations/optimize.svg', 'image/svg+xml'],
  ];
  const [html, stylesheet, favicon, iconLicense] = await Promise.all([
    readFile(resolve(root, 'index.html'), 'utf8'),
    readFile(resolve(root, 'src/style.css'), 'utf8'),
    readFile(resolve(root, 'src/favicon.svg'), 'utf8'),
    readFile(resolve(root, 'assets/phosphor-LICENSE'), 'utf8'),
  ]);
  const assets = await Promise.all(embeddedAssets.map(async ([path, mime]) => [
    path, `data:${mime};base64,${(await readFile(resolve(root, path))).toString('base64')}`,
  ]));
  const replaceAssets = value => {
    let result = value;
    for (const [path, data] of assets) {
      // Longest prefixes first: replacing /assets first would leave a leading
      // dot on ./assets and make an invalid .data: URL in the offline editor.
      result = result.replaceAll(`../${path}`, data).replaceAll(`./${path}`, data).replaceAll(`/${path}`, data);
    }
    return result;
  };
  const css = replaceAssets(stylesheet);
  const code = (await bundleModules(root, 'src/main.js', replaceAssets)).replaceAll('</script', '<\\/script');
  const standalone = html
    .replace(/<link rel="stylesheet" href="(?:\.\/|\/)?src\/style\.css"\s*\/>/, () => `<style>${css}</style>`)
    .replace(/<script type="module" src="(?:\.\/|\/)?src\/main\.js"><\/script>/, '')
    .replace(/href="(?:\.\/|\/)?src\/favicon\.svg"/, () => `href="data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}"`)
    .replace('</body>', () => `<!-- Phosphor Icons license:\n${iconLicense.replaceAll('--', '—')}\n-->\n<script type="module">${code}</script>\n</body>`);
  await writeFile(resolve(output, 'OI-KV-Studio.html'), standalone);
}

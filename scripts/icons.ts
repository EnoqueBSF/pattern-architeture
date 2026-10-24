/**
 * CLI para manter o catalogo local de icones (assets/icons/catalog.json), curado a partir
 * do conjunto "logos" do Iconify (CC0, pacote @iconify-json/logos) ou de arquivos SVG locais.
 *
 * uso:
 *   npm run icons -- search <termo>
 *   npm run icons -- add <chave>[=<nome-iconify>] [<chave2>[=<nome>] ...] [--alias a,b]
 *   npm run icons -- add <chave> --file <caminho.svg>
 *   npm run icons -- list
 *   npm run icons -- check
 *   npm run icons -- preview
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toPng } from '../src/export/png.js';

interface SourceIconDef {
  body: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}
interface SourceData {
  prefix: string;
  width?: number;
  height?: number;
  icons: Record<string, SourceIconDef>;
  aliases?: Record<string, { parent: string }>;
}

interface CatalogIconDef {
  source: string;
  width: number;
  height: number;
  left: number;
  top: number;
  body: string;
}
interface Catalog {
  set: string;
  version: string;
  license: string;
  icons: Record<string, CatalogIconDef>;
  aliases: Record<string, string>;
}

const CATALOG_PATH = fileURLToPath(new URL('../assets/icons/catalog.json', import.meta.url));
const SOURCE_PATH = fileURLToPath(new URL('../node_modules/@iconify-json/logos/icons.json', import.meta.url));
const SOURCE_PACKAGE_JSON = fileURLToPath(new URL('../node_modules/@iconify-json/logos/package.json', import.meta.url));

function loadSource(): SourceData {
  if (!existsSync(SOURCE_PATH)) {
    throw new Error(`pacote @iconify-json/logos nao encontrado em node_modules (${SOURCE_PATH}). Rode "npm install" com rede.`);
  }
  return JSON.parse(readFileSync(SOURCE_PATH, 'utf-8')) as SourceData;
}

function sourceVersion(): string {
  const pkg = JSON.parse(readFileSync(SOURCE_PACKAGE_JSON, 'utf-8')) as { version: string };
  return pkg.version;
}

function loadCatalog(): Catalog {
  if (!existsSync(CATALOG_PATH)) {
    return { set: 'logos', version: sourceVersion(), license: 'CC0-1.0', icons: {}, aliases: {} };
  }
  return JSON.parse(readFileSync(CATALOG_PATH, 'utf-8')) as Catalog;
}

function saveCatalog(catalog: Catalog): void {
  const sortedIcons = Object.fromEntries(Object.entries(catalog.icons).sort(([a], [b]) => a.localeCompare(b)));
  const sortedAliases = Object.fromEntries(Object.entries(catalog.aliases).sort(([a], [b]) => a.localeCompare(b)));
  const out: Catalog = { ...catalog, icons: sortedIcons, aliases: sortedAliases };
  writeFileSync(CATALOG_PATH, JSON.stringify(out, null, 2) + '\n', 'utf-8');
}

const FORBIDDEN_TAG = /<\s*(script|foreignObject|image|style|text)\b/i;
const EVENT_ATTR = /\son[a-z]+\s*=/i;

/** Normaliza um fragmento de SVG: rejeita conteudo perigoso, renomeia ids para __ID__n deterministicamente. */
function normalizeBody(rawBody: string): string {
  if (FORBIDDEN_TAG.test(rawBody)) {
    throw new Error('corpo do icone contem elemento nao permitido (script/foreignObject/image/style/text)');
  }
  if (EVENT_ATTR.test(rawBody)) {
    throw new Error('corpo do icone contem atributo de evento (on*=)');
  }

  let out = rawBody.replace(/xlink:href=/g, 'href=');

  const ids: string[] = [];
  out.replace(/\bid="([^"]+)"/g, (match, id: string) => {
    if (!ids.includes(id)) ids.push(id);
    return match;
  });
  const idMap = new Map(ids.map((id, i) => [id, `__ID__${i}`]));

  out = out.replace(/\bid="([^"]+)"/g, (_m, id: string) => `id="${idMap.get(id) ?? id}"`);
  out = out.replace(/url\(#([^)]+)\)/g, (_m, id: string) => {
    const mapped = idMap.get(id);
    if (!mapped) throw new Error(`referencia a id inexistente em url(#${id})`);
    return `url(#${mapped})`;
  });
  out = out.replace(/href="#([^"]+)"/g, (_m, id: string) => {
    const mapped = idMap.get(id);
    if (!mapped) throw new Error(`referencia a id inexistente em href="#${id}"`);
    return `href="#${mapped}"`;
  });

  return out;
}

function resolveSourceIcon(source: SourceData, name: string, seen = new Set<string>()): SourceIconDef | undefined {
  if (source.icons[name]) return source.icons[name];
  const alias = source.aliases?.[name];
  if (alias && !seen.has(name)) {
    seen.add(name);
    return resolveSourceIcon(source, alias.parent, seen);
  }
  return undefined;
}

function addFromIconify(catalog: Catalog, source: SourceData, key: string, iconifyName?: string): void {
  const candidates = iconifyName ? [iconifyName] : [`${key}-icon`, key];
  for (const name of candidates) {
    const def = resolveSourceIcon(source, name);
    if (!def) continue;
    const width = def.width ?? source.width ?? 256;
    const height = def.height ?? source.height ?? 256;
    const left = def.left ?? 0;
    const top = def.top ?? 0;
    const body = normalizeBody(def.body);
    const ratio = width / height;
    if (ratio > 2.2 || ratio < 0.45) {
      console.warn(`  aviso: "${name}" tem proporcao ${ratio.toFixed(2)} (pode ser um logo com texto -- considere a variante "-icon" ou --file)`);
    }
    catalog.icons[key] = { source: `logos:${name}`, width, height, left, top, body };
    console.log(`adicionado "${key}" <- logos:${name} (${width}x${height})`);
    return;
  }
  throw new Error(`icone nao encontrado no pacote @iconify-json/logos (tentei: ${candidates.join(', ')})`);
}

function addFromFile(catalog: Catalog, key: string, filePath: string): void {
  const absolute = resolve(process.cwd(), filePath);
  if (!existsSync(absolute)) throw new Error(`arquivo nao encontrado: ${absolute}`);
  const raw = readFileSync(absolute, 'utf-8');

  const viewBoxMatch = raw.match(/viewBox="([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)"/);
  const [left, top, width, height] = viewBoxMatch ? viewBoxMatch.slice(1).map(Number) : [0, 0, 256, 256];

  let inner = raw.replace(/^[\s\S]*?<svg\b[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
  inner = inner
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title\b[\s\S]*?<\/title>/gi, '')
    .replace(/<desc\b[\s\S]*?<\/desc>/gi, '')
    .replace(/<metadata\b[\s\S]*?<\/metadata>/gi, '')
    .trim();

  const body = normalizeBody(inner);
  catalog.icons[key] = { source: `file:${basename(filePath)}`, width: width!, height: height!, left: left!, top: top!, body };
  console.log(`adicionado "${key}" <- ${filePath} (${width}x${height})`);
}

function cmdSearch(term: string): void {
  if (!term) throw new Error('uso: search <termo>');
  const source = loadSource();
  const catalog = loadCatalog();
  const inCatalogSources = new Set(Object.values(catalog.icons).map((d) => d.source));
  const lower = term.toLowerCase();
  const names = Object.keys(source.icons)
    .filter((n) => n.includes(lower))
    .sort();
  for (const n of names.slice(0, 80)) {
    const mark = inCatalogSources.has(`logos:${n}`) ? '  [no catalogo]' : '';
    console.log(n + mark);
  }
  console.log(`\n${names.length} resultado(s)${names.length > 80 ? ' (mostrando 80)' : ''}`);
}

function cmdAdd(rest: string[]): void {
  const catalog = loadCatalog();
  const fileIdx = rest.indexOf('--file');
  const aliasIdx = rest.indexOf('--alias');

  if (fileIdx !== -1) {
    const key = rest[0];
    const filePath = rest[fileIdx + 1];
    if (!key || !filePath) throw new Error('uso: add <chave> --file <caminho.svg>');
    addFromFile(catalog, key, filePath);
  } else {
    const source = loadSource();
    const specs = rest.filter((a, i) => a !== '--alias' && rest[i - 1] !== '--alias' && !a.startsWith('--'));
    if (specs.length === 0) throw new Error('uso: add <chave>[=<nome-iconify>] [...] [--alias a,b]');
    let lastKey = '';
    for (const spec of specs) {
      const [key, iconifyName] = spec.split('=');
      if (!key) continue;
      addFromIconify(catalog, source, key, iconifyName);
      lastKey = key;
    }
    if (aliasIdx !== -1 && lastKey) {
      const names = (rest[aliasIdx + 1] ?? '').split(',').filter(Boolean);
      for (const alias of names) {
        catalog.aliases[alias] = lastKey;
        console.log(`alias "${alias}" -> "${lastKey}"`);
      }
    }
  }

  catalog.version = sourceVersion();
  saveCatalog(catalog);
}

function cmdList(): void {
  const catalog = loadCatalog();
  for (const key of Object.keys(catalog.icons).sort()) {
    console.log(`${key}  <-  ${catalog.icons[key]!.source}`);
  }
  if (Object.keys(catalog.aliases).length > 0) {
    console.log('\naliases:');
    for (const [alias, target] of Object.entries(catalog.aliases).sort()) {
      console.log(`${alias}  ->  ${target}`);
    }
  }
  console.log(`\n${Object.keys(catalog.icons).length} icone(s), ${Object.keys(catalog.aliases).length} alias(es)`);
}

function cmdCheck(): void {
  const catalog = loadCatalog();
  let errors = 0;

  for (const [key, def] of Object.entries(catalog.icons)) {
    try {
      normalizeBody(def.body);
    } catch (err) {
      console.error(`ERRO em "${key}": ${(err as Error).message}`);
      errors++;
    }
    if (!(def.width > 0) || !(def.height > 0)) {
      console.error(`ERRO em "${key}": width/height invalido (${def.width}x${def.height})`);
      errors++;
    }
  }

  for (const [alias, target] of Object.entries(catalog.aliases)) {
    if (!catalog.icons[target] && !catalog.aliases[target]) {
      console.error(`ERRO: alias "${alias}" aponta para "${target}", que nao existe no catalogo`);
      errors++;
    }
  }

  if (errors > 0) {
    console.error(`\n${errors} erro(s)`);
    process.exit(1);
  }
  console.log(`OK: ${Object.keys(catalog.icons).length} icone(s), ${Object.keys(catalog.aliases).length} alias(es), sem erros`);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const PREVIEW_SVG_PATH = fileURLToPath(new URL('../assets/icons/preview.svg', import.meta.url));
const PREVIEW_PNG_PATH = fileURLToPath(new URL('../assets/icons/preview.png', import.meta.url));

/** Gera uma grade com todos os icones do catalogo + suas chaves, para conferencia visual. */
function cmdPreview(): void {
  const catalog = loadCatalog();
  const keys = Object.keys(catalog.icons).sort();
  const cols = 8;
  const cellW = 110;
  const cellH = 110;
  const iconSize = 48;
  const rows = Math.ceil(keys.length / cols);
  const width = cols * cellW;
  const height = rows * cellH;

  let body = '';
  keys.forEach((key, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const def = catalog.icons[key]!;
    const x = col * cellW + (cellW - iconSize) / 2;
    const y = row * cellH + 16;
    const viewBox = `${def.left} ${def.top} ${def.width} ${def.height}`;
    const iconBody = def.body.replaceAll('__ID__', `ic-${key}-`);
    body += `<svg x="${x}" y="${y}" width="${iconSize}" height="${iconSize}" viewBox="${viewBox}">${iconBody}</svg>`;
    const labelX = col * cellW + cellW / 2;
    const labelY = row * cellH + iconSize + 16 + 14;
    body += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="9" font-family="sans-serif" fill="#334155">${escapeXml(key)}</text>`;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#FFFFFF"/>${body}</svg>`;
  writeFileSync(PREVIEW_SVG_PATH, svg, 'utf-8');
  const png = toPng(svg, 2);
  writeFileSync(PREVIEW_PNG_PATH, png);
  console.log(`gerado: ${PREVIEW_SVG_PATH}`);
  console.log(`gerado: ${PREVIEW_PNG_PATH} (${keys.length} icones, ${cols}x${rows} grade)`);
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    switch (cmd) {
      case 'search':
        cmdSearch(rest[0] ?? '');
        break;
      case 'add':
        cmdAdd(rest);
        break;
      case 'list':
        cmdList();
        break;
      case 'check':
        cmdCheck();
        break;
      case 'preview':
        cmdPreview();
        break;
      default:
        console.error('uso: icons <search|add|list|check|preview> ...');
        process.exit(1);
    }
  } catch (err) {
    console.error(`ERRO: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();

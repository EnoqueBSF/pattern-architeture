import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { closestSuggestion } from '../text/similarity.js';

export interface IconDef {
  source: string;
  width: number;
  height: number;
  left: number;
  top: number;
  body: string;
}

interface CatalogFile {
  set: string;
  version: string;
  license: string;
  icons: Record<string, IconDef>;
  aliases: Record<string, string>;
}

const CATALOG_PATH = fileURLToPath(new URL('../../assets/icons/catalog.json', import.meta.url));

let cache: CatalogFile | undefined;

function loadCatalog(): CatalogFile {
  cache ??= JSON.parse(readFileSync(CATALOG_PATH, 'utf-8')) as CatalogFile;
  return cache;
}

export interface ResolveResult {
  key?: string;
  suggestion?: string;
}

/** Resolve um nome de icone (campo `icon` do YAML) contra o catalogo local. */
export function resolveIcon(name: string): ResolveResult {
  const catalog = loadCatalog();
  const normalized = name.trim().toLowerCase().replace(/^logos:/, '');

  if (catalog.icons[normalized]) return { key: normalized };

  const aliasTarget = catalog.aliases[normalized];
  if (aliasTarget && catalog.icons[aliasTarget]) return { key: aliasTarget };

  const withoutIconSuffix = normalized.replace(/-icon$/, '');
  if (withoutIconSuffix !== normalized && catalog.icons[withoutIconSuffix]) return { key: withoutIconSuffix };

  const allNames = [...Object.keys(catalog.icons), ...Object.keys(catalog.aliases)];
  return { suggestion: closestSuggestion(normalized, allNames) };
}

/** Busca a definicao de um icone ja resolvido (chave valida garantida pelo chamador). */
export function getIcon(key: string): IconDef {
  const catalog = loadCatalog();
  const def = catalog.icons[key] ?? (catalog.aliases[key] ? catalog.icons[catalog.aliases[key]!] : undefined);
  if (!def) throw new Error(`icone "${key}" nao existe no catalogo (bug interno: deveria ter sido validado por resolveIcon)`);
  return def;
}

export function iconKeys(): string[] {
  return Object.keys(loadCatalog().icons).sort();
}

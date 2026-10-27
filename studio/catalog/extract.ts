import { existsSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { renderDiagramSource } from '../../src/index.js';
import { sha256 } from '../server/files.js';
import { normalizeText } from './text.js';

export interface CatalogRecord {
  path: string;
  root: string;
  relPath: string;
  project: string;
  title: string;
  description: string | null;
  tags: string[];
  direction: 'LR' | 'TB';
  nodeCount: number;
  edgeCount: number;
  groupCount: number;
  yamlSha256: string;
  yamlSnapshot: string;
  searchText: string;
}

/**
 * Deriva o "projeto" de um diagrama a partir do caminho absoluto: `diagrams/<projeto>/...` vira
 * `<projeto>`; `examples/...` vira `examples`; `templates/...` nao e indexado (null); um arquivo
 * fora do repoRoot (veio de um --root externo) usa o nome do diretorio ancestral mais proximo que
 * tem `.git` (ou, sem achar nenhum, o diretorio pai direto, como ultimo recurso).
 */
export function deriveProject(absPath: string, repoRoot: string): string | null {
  const rel = relative(repoRoot, absPath);
  const isInsideRepo = !rel.startsWith('..') && rel !== '';

  if (isInsideRepo) {
    const parts = rel.split(sep);
    const top = parts[0];
    if (top === 'templates') return null;
    if (top === 'examples') return 'examples';
    if (top === 'diagrams' && parts.length > 1) return parts[1]!;
    return top ?? 'root';
  }

  let dir = dirname(absPath);
  let prev: string | undefined;
  while (dir !== prev) {
    if (existsSync(join(dir, '.git'))) return basename(dir);
    prev = dir;
    dir = dirname(dir);
  }
  return basename(dirname(absPath));
}

/**
 * Extrai o registro de catalogo de um diagrama ja validado (`renderDiagramSource` nao lanca). Puro
 * em relacao ao Postgres -- nao toca o banco; so le `.git` do disco para `deriveProject` fora do
 * repoRoot. Retorna `null` quando o diagrama nao deve ser indexado (ex.: dentro de templates/).
 */
export function extractCatalogRecord(source: string, absPath: string, root: string, repoRoot: string): CatalogRecord | null {
  const project = deriveProject(absPath, repoRoot);
  if (project === null) return null;

  const result = renderDiagramSource(source); // lanca DiagramValidationError se invalido -- o chamador decide como tratar
  const { model, report } = result;

  // tags nao faz parte do DiagramModel (o motor de layout/render nunca precisa dele) -- le do
  // YAML bruto direto, que ja sabemos ser valido pois renderDiagramSource acima nao lancou.
  const rawRoot = parseYaml(source) as { tags?: unknown };
  const tags = Array.isArray(rawRoot.tags) ? rawRoot.tags.filter((t): t is string => typeof t === 'string') : [];

  const searchParts: string[] = [model.title, model.description ?? '', project, ...tags];
  for (const n of model.nodes) searchParts.push(n.id, n.label, n.tech ?? '', n.slug ?? '', n.subtitle ?? '');
  for (const g of model.groups) searchParts.push(g.label);

  return {
    path: absPath,
    root,
    relPath: relative(root, absPath),
    project,
    title: model.title,
    description: model.description ?? null,
    tags,
    direction: model.direction,
    nodeCount: report.nodeCount,
    edgeCount: report.edgeCount,
    groupCount: report.groupCount,
    yamlSha256: sha256(source),
    yamlSnapshot: source,
    searchText: normalizeText(searchParts.filter(Boolean).join(' ')),
  };
}

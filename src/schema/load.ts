import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { z } from 'zod';
import { resolveIcon } from '../icons/catalog.js';
import { ASYNC_PROTOCOLS } from './enums.js';
import { DiagramSchema } from './schema.js';
import type { DiagramModel, EdgeModel, GroupModel, NodeModel } from './model.js';

export class DiagramValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Definicao de diagrama invalida:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'DiagramValidationError';
  }
}

function formatZodError(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(raiz)';
    return `${path}: ${issue.message}`;
  });
}

function joinTech(tech: string | string[] | undefined): string | undefined {
  if (tech === undefined) return undefined;
  return Array.isArray(tech) ? tech.join(' · ') : tech;
}

/** Le e valida uma definicao de diagrama a partir de texto YAML/JSON. */
export function parseDiagram(source: string): DiagramModel {
  let raw: unknown;
  try {
    raw = YAML.parse(source);
  } catch (err) {
    throw new DiagramValidationError([`YAML malformado: ${(err as Error).message}`]);
  }

  const result = DiagramSchema.safeParse(raw);
  if (!result.success) {
    throw new DiagramValidationError(formatZodError(result.error));
  }
  const data = result.data;

  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
  const warnings: string[] = [];

  const nodes: NodeModel[] = data.nodes.map((n, declIndex) => {
    let icon: string | undefined;
    if (n.icon) {
      const resolved = resolveIcon(n.icon);
      if (resolved.key) {
        icon = resolved.key;
      } else {
        const suggestionText = resolved.suggestion ? ` Voce quis dizer "${resolved.suggestion}"?` : '';
        warnings.push(
          `node "${n.id}": icone "${n.icon}" nao esta no catalogo local -- usando a forma de "${n.type}".${suggestionText} (npm run icons -- search <termo> / add <nome>)`,
        );
      }
    }
    return {
      id: n.id,
      label: n.label,
      type: n.type,
      status: n.status,
      tech: joinTech(n.tech),
      group: n.group,
      description: n.description,
      icon,
      slug: n.slug,
      subtitle: n.subtitle,
      badge: n.badge,
      rank: n.rank,
      order: n.order,
      declIndex,
    };
  });

  const edges: EdgeModel[] = data.edges.map((e, declIndex) => {
    const from = nodeById.get(e.from)!;
    const to = nodeById.get(e.to)!;
    const status = e.status ?? (from.status === 'new' || to.status === 'new' ? 'new' : 'unchanged');
    const async = e.async ?? ASYNC_PROTOCOLS.has(e.protocol);
    if (e.status === 'unchanged' && (from.status === 'new' || to.status === 'new')) {
      warnings.push(
        `edges[${declIndex}] (${e.from} -> ${e.to}): marcada "unchanged" mas conecta a um node "new" -- confira se nao deveria ser "new"`,
      );
    }
    return {
      id: e.id ?? `e${declIndex + 1}`,
      from: e.from,
      to: e.to,
      protocol: e.protocol,
      label: e.label,
      status,
      async,
      bidirectional: e.bidirectional,
      declIndex,
    };
  });

  // declIndex de grupo = menor declIndex entre os nos descendentes (direta ou via subgrupo)
  const groupDeclIndex = new Map<string, number>();
  const childGroupsOf = new Map<string, string[]>();
  for (const g of data.groups) {
    if (g.parent) childGroupsOf.set(g.parent, [...(childGroupsOf.get(g.parent) ?? []), g.id]);
  }
  function minDeclIndexFor(groupId: string, seen = new Set<string>()): number {
    if (seen.has(groupId)) return Number.MAX_SAFE_INTEGER;
    seen.add(groupId);
    const direct = nodes.filter((n) => n.group === groupId).map((n) => n.declIndex);
    const nested = (childGroupsOf.get(groupId) ?? []).map((childId) => minDeclIndexFor(childId, seen));
    const all = [...direct, ...nested];
    return all.length > 0 ? Math.min(...all) : Number.MAX_SAFE_INTEGER;
  }
  for (const g of data.groups) groupDeclIndex.set(g.id, minDeclIndexFor(g.id));

  const groups: GroupModel[] = data.groups.map((g) => ({
    id: g.id,
    label: g.label,
    kind: g.kind,
    parent: g.parent,
    rank: g.rank,
    order: g.order,
    declIndex: groupDeclIndex.get(g.id) ?? Number.MAX_SAFE_INTEGER,
  }));

  // avisos: grupo vazio, node sem arestas
  const groupIdsWithContent = new Set<string>([
    ...nodes.map((n) => n.group).filter((g): g is string => !!g),
    ...data.groups.filter((g) => g.parent).map((g) => g.parent!),
  ]);
  for (const g of groups) {
    if (!groupIdsWithContent.has(g.id)) warnings.push(`groups "${g.id}" nao tem nenhum node nem subgrupo`);
  }
  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.from);
    connected.add(e.to);
  }
  for (const n of nodes) {
    if (!connected.has(n.id)) warnings.push(`node "${n.id}" nao tem nenhuma conexao (isolado)`);
  }

  return {
    title: data.title,
    description: data.description,
    direction: data.direction,
    locale: data.locale,
    groups,
    nodes,
    edges,
    warnings,
  };
}

/** Le um arquivo de definicao (.yaml/.yml/.json) do disco e retorna o modelo normalizado. */
export function loadDiagramFile(path: string): DiagramModel {
  const source = readFileSync(path, 'utf-8');
  return parseDiagram(source);
}

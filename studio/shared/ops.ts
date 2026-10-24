import { uniqueId } from './ids.js';
import type { Op, Value } from './yaml-edit.js';

/** Versao "bruta" (pre-validacao) de um node/grupo/edge, do jeito que YAML.parse devolve. */
export interface RawNodeLike extends Record<string, unknown> {
  id: string;
  group?: string;
}
export interface RawGroupLike extends Record<string, unknown> {
  id: string;
  parent?: string;
}
export interface RawEdgeLike extends Record<string, unknown> {
  id?: string;
  from: string;
  to: string;
}
export interface RawDiagramLike {
  nodes: RawNodeLike[];
  groups?: RawGroupLike[];
  edges?: RawEdgeLike[];
}

function withoutUndefined(item: Record<string, Value | undefined>): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const [k, v] of Object.entries(item)) if (v !== undefined) out[k] = v;
  return out;
}

/** Converte o resultado "melhor esforco" de YAML.parse num RawDiagramLike, ou null se a forma minima nao bate. */
export function toRawDiagram(parsed: unknown): RawDiagramLike | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.nodes)) return null;
  const nodes = obj.nodes as unknown[];
  if (!nodes.every((n) => n && typeof n === 'object' && typeof (n as Record<string, unknown>).id === 'string')) return null;

  const groups = Array.isArray(obj.groups) ? (obj.groups as unknown[]) : [];
  if (!groups.every((g) => g && typeof g === 'object' && typeof (g as Record<string, unknown>).id === 'string')) return null;

  const edges = Array.isArray(obj.edges) ? (obj.edges as unknown[]) : [];
  if (
    !edges.every(
      (e) => e && typeof e === 'object' && typeof (e as Record<string, unknown>).from === 'string' && typeof (e as Record<string, unknown>).to === 'string',
    )
  )
    return null;

  return { nodes: nodes as RawNodeLike[], groups: groups as RawGroupLike[], edges: edges as RawEdgeLike[] };
}

export function setNodeField(raw: RawDiagramLike, nodeId: string, key: string, value: Value | undefined): Op[] {
  const index = raw.nodes.findIndex((n) => n.id === nodeId);
  if (index === -1) throw new Error(`node "${nodeId}" nao encontrado`);
  return [{ op: 'setField', coll: 'nodes', index, key, value }];
}

export function setGroupField(raw: RawDiagramLike, groupId: string, key: string, value: Value | undefined): Op[] {
  const index = (raw.groups ?? []).findIndex((g) => g.id === groupId);
  if (index === -1) throw new Error(`grupo "${groupId}" nao encontrado`);
  return [{ op: 'setField', coll: 'groups', index, key, value }];
}

export function setEdgeField(edgeIndex: number, key: string, value: Value | undefined): Op[] {
  return [{ op: 'setField', coll: 'edges', index: edgeIndex, key, value }];
}

/** Renomeia um node, propagando a mudanca para edges.from/to que o referenciam. */
export function renameNode(raw: RawDiagramLike, oldId: string, newId: string): Op[] {
  const ops: Op[] = [];
  const nodeIndex = raw.nodes.findIndex((n) => n.id === oldId);
  if (nodeIndex === -1) throw new Error(`node "${oldId}" nao encontrado`);
  ops.push({ op: 'setField', coll: 'nodes', index: nodeIndex, key: 'id', value: newId });
  (raw.edges ?? []).forEach((e, i) => {
    if (e.from === oldId) ops.push({ op: 'setField', coll: 'edges', index: i, key: 'from', value: newId });
    if (e.to === oldId) ops.push({ op: 'setField', coll: 'edges', index: i, key: 'to', value: newId });
  });
  return ops;
}

/** Renomeia um grupo, propagando para nodes.group e groups.parent que o referenciam. */
export function renameGroup(raw: RawDiagramLike, oldId: string, newId: string): Op[] {
  const ops: Op[] = [];
  const groups = raw.groups ?? [];
  const groupIndex = groups.findIndex((g) => g.id === oldId);
  if (groupIndex === -1) throw new Error(`grupo "${oldId}" nao encontrado`);
  ops.push({ op: 'setField', coll: 'groups', index: groupIndex, key: 'id', value: newId });
  raw.nodes.forEach((n, i) => {
    if (n.group === oldId) ops.push({ op: 'setField', coll: 'nodes', index: i, key: 'group', value: newId });
  });
  groups.forEach((g, i) => {
    if (g.parent === oldId) ops.push({ op: 'setField', coll: 'groups', index: i, key: 'parent', value: newId });
  });
  return ops;
}

/** Remove um node e todas as edges que o referenciam (removidas antes, em ordem decrescente de indice). */
export function deleteNode(raw: RawDiagramLike, nodeId: string): Op[] {
  const ops: Op[] = [];
  const edgeIndexes = (raw.edges ?? []).reduce<number[]>((acc, e, i) => {
    if (e.from === nodeId || e.to === nodeId) acc.push(i);
    return acc;
  }, []);
  for (const i of edgeIndexes.sort((a, b) => b - a)) ops.push({ op: 'remove', coll: 'edges', index: i });

  const nodeIndex = raw.nodes.findIndex((n) => n.id === nodeId);
  if (nodeIndex === -1) throw new Error(`node "${nodeId}" nao encontrado`);
  ops.push({ op: 'remove', coll: 'nodes', index: nodeIndex });
  return ops;
}

/** Remove um grupo; os filhos diretos (nodes e subgrupos) sobem para o parent do grupo removido. */
export function deleteGroup(raw: RawDiagramLike, groupId: string): Op[] {
  const ops: Op[] = [];
  const groups = raw.groups ?? [];
  const group = groups.find((g) => g.id === groupId);
  if (!group) throw new Error(`grupo "${groupId}" nao encontrado`);
  const parent = group.parent as string | undefined; // undefined = sobe para a raiz

  raw.nodes.forEach((n, i) => {
    if (n.group === groupId) ops.push({ op: 'setField', coll: 'nodes', index: i, key: 'group', value: parent });
  });
  groups.forEach((g, i) => {
    if (g.parent === groupId) ops.push({ op: 'setField', coll: 'groups', index: i, key: 'parent', value: parent });
  });

  const groupIndex = groups.findIndex((g) => g.id === groupId);
  ops.push({ op: 'remove', coll: 'groups', index: groupIndex });
  return ops;
}

export interface AddNodeResult {
  ops: Op[];
  id: string;
}

/** Cria um node novo com defaults razoaveis; overrides.id, se informado, e usado como esta (sem checar unicidade). */
export function addNode(raw: RawDiagramLike, overrides: Partial<Record<string, Value>> = {}): AddNodeResult {
  const existingIds = new Set([...raw.nodes.map((n) => n.id), ...(raw.groups ?? []).map((g) => g.id)]);
  const id = (overrides.id as string | undefined) ?? uniqueId('node', existingIds);
  const item = withoutUndefined({
    label: 'Novo componente',
    type: 'microservice',
    status: 'new',
    ...overrides,
    id,
  });
  return { ops: [{ op: 'append', coll: 'nodes', item }], id };
}

export function addEdge(from: string, to: string, overrides: Partial<Record<string, Value>> = {}): Op[] {
  const item = withoutUndefined({ protocol: 'http', ...overrides, from, to });
  return [{ op: 'append', coll: 'edges', item }];
}

export function deleteEdge(edgeIndex: number): Op[] {
  return [{ op: 'remove', coll: 'edges', index: edgeIndex }];
}

export interface AddGroupResult {
  ops: Op[];
  id: string;
}

/** Cria um grupo novo com defaults razoaveis; overrides.id, se informado, e usado como esta (sem checar unicidade). */
export function addGroup(raw: RawDiagramLike, overrides: Partial<Record<string, Value>> = {}): AddGroupResult {
  const existingIds = new Set([...raw.nodes.map((n) => n.id), ...(raw.groups ?? []).map((g) => g.id)]);
  const id = (overrides.id as string | undefined) ?? uniqueId('group', existingIds);
  const item = withoutUndefined({ label: 'Novo grupo', kind: 'layer', ...overrides, id });
  return { ops: [{ op: 'append', coll: 'groups', item }], id };
}

export type HintScope = 'nodes' | 'groups' | 'all';

/** Remove os hints rank/order manuais (volta ao layout 100% automatico) no escopo informado. */
export function clearHints(raw: RawDiagramLike, scope: HintScope = 'all'): Op[] {
  const ops: Op[] = [];
  if (scope === 'nodes' || scope === 'all') {
    raw.nodes.forEach((n, i) => {
      if ('rank' in n) ops.push({ op: 'setField', coll: 'nodes', index: i, key: 'rank', value: undefined });
      if ('order' in n) ops.push({ op: 'setField', coll: 'nodes', index: i, key: 'order', value: undefined });
    });
  }
  if (scope === 'groups' || scope === 'all') {
    (raw.groups ?? []).forEach((g, i) => {
      if ('rank' in g) ops.push({ op: 'setField', coll: 'groups', index: i, key: 'rank', value: undefined });
      if ('order' in g) ops.push({ op: 'setField', coll: 'groups', index: i, key: 'order', value: undefined });
    });
  }
  return ops;
}

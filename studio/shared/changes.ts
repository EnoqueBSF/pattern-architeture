import { parseDocument } from 'yaml';
import type { EdgeInput, GroupInput, NodeInput } from '../../src/schema/schema.js';
import {
  AmbiguousEdgeRefError,
  addEdge,
  addGroup,
  addNode,
  clearHints,
  deleteEdge,
  deleteGroup,
  deleteNode,
  findEdgeIndex,
  renameGroup,
  renameNode,
  setEdgeField,
  setGroupField,
  setNodeField,
  toRawDiagram,
  type EdgeRef,
  type HintScope,
  type RawDiagramLike,
} from './ops.js';
import { applyOps, type Op, type Value } from './yaml-edit.js';

type NodeFields = Omit<NodeInput, 'id'> & { id?: string };
type NodeUnsetKey = 'tech' | 'group' | 'description' | 'icon' | 'slug' | 'subtitle' | 'badge' | 'rank' | 'order';

type GroupFields = Omit<GroupInput, 'id'> & { id?: string };
type GroupUnsetKey = 'parent' | 'rank' | 'order';

type EdgeFields = EdgeInput;
type EdgeUnsetKey = 'id' | 'label' | 'status' | 'async' | 'bidirectional';

export type Change =
  | { action: 'set_meta'; title?: string; description?: string | null; direction?: 'LR' | 'TB'; locale?: 'pt-BR' | 'en'; tags?: string[] | null }
  | { action: 'add_node'; node: NodeFields }
  | { action: 'update_node'; id: string; set?: Partial<NodeFields>; unset?: NodeUnsetKey[] }
  | { action: 'remove_node'; id: string }
  | { action: 'add_group'; group: GroupFields }
  | { action: 'update_group'; id: string; set?: Partial<GroupFields>; unset?: GroupUnsetKey[] }
  | { action: 'remove_group'; id: string }
  | { action: 'add_edge'; edge: EdgeFields }
  | { action: 'update_edge'; edge: EdgeRef; set?: Partial<EdgeFields>; unset?: EdgeUnsetKey[] }
  | { action: 'remove_edge'; edge: EdgeRef }
  | { action: 'clear_hints'; scope?: HintScope };

export interface ApplyChangesResult {
  text: string;
  fallbackUsed: boolean;
  /** 1 resumo legivel por Change, na mesma ordem -- vira o campo `applied` do MutationResult do MCP. */
  applied: string[];
  /** indice do Change (em `changes`) -> id gerado, para add_node/add_group sem `id` explicito. */
  createdNodeIds: Record<number, string>;
  createdGroupIds: Record<number, string>;
}

function currentRaw(text: string): RawDiagramLike {
  const parsed = parseDocument(text).toJS();
  const raw = toRawDiagram(parsed);
  if (!raw) throw new Error('YAML invalido antes de aplicar a mudanca (precisa de ao menos "nodes: []")');
  return raw;
}

/** Aplica cada Change ao YAML, na ordem, re-lendo o estado apos cada um -- indices de edge e ids
 * referenciados por mudancas seguintes sempre refletem o resultado das mudancas anteriores. */
export function applyChanges(initialSource: string, changes: Change[]): ApplyChangesResult {
  let text = initialSource;
  let fallbackUsed = false;
  const applied: string[] = [];
  const createdNodeIds: Record<number, string> = {};
  const createdGroupIds: Record<number, string> = {};

  changes.forEach((change, index) => {
    const raw = currentRaw(text);
    const { ops, summary } = buildOps(raw, change, index, createdNodeIds, createdGroupIds);
    const result = applyOps(text, ops);
    text = result.text;
    if (result.fallbackUsed) fallbackUsed = true;
    applied.push(summary);
  });

  return { text, fallbackUsed, applied, createdNodeIds, createdGroupIds };
}

function buildOps(
  raw: RawDiagramLike,
  change: Change,
  index: number,
  createdNodeIds: Record<number, string>,
  createdGroupIds: Record<number, string>,
): { ops: Op[]; summary: string } {
  switch (change.action) {
    case 'set_meta': {
      const ops: Op[] = [];
      if (change.title !== undefined) ops.push({ op: 'setRoot', key: 'title', value: change.title });
      if (change.description !== undefined) ops.push({ op: 'setRoot', key: 'description', value: change.description ?? undefined });
      if (change.direction !== undefined) ops.push({ op: 'setRoot', key: 'direction', value: change.direction });
      if (change.locale !== undefined) ops.push({ op: 'setRoot', key: 'locale', value: change.locale });
      if (change.tags !== undefined) ops.push({ op: 'setRoot', key: 'tags', value: change.tags ?? undefined });
      return { ops, summary: 'metadados do diagrama atualizados' };
    }

    case 'add_node': {
      const result = addNode(raw, change.node as Record<string, Value>);
      createdNodeIds[index] = result.id;
      return { ops: result.ops, summary: `node "${result.id}" criado` };
    }

    case 'update_node': {
      const ops: Op[] = [];
      if (change.set) {
        for (const [key, value] of Object.entries(change.set)) {
          if (key === 'id') ops.push(...renameNode(raw, change.id, value as string));
          else ops.push(...setNodeField(raw, change.id, key, value as Value));
        }
      }
      for (const key of change.unset ?? []) ops.push(...setNodeField(raw, change.id, key, undefined));
      return { ops, summary: `node "${change.id}" atualizado` };
    }

    case 'remove_node':
      return { ops: deleteNode(raw, change.id), summary: `node "${change.id}" removido` };

    case 'add_group': {
      const result = addGroup(raw, change.group as Record<string, Value>);
      createdGroupIds[index] = result.id;
      return { ops: result.ops, summary: `grupo "${result.id}" criado` };
    }

    case 'update_group': {
      const ops: Op[] = [];
      if (change.set) {
        for (const [key, value] of Object.entries(change.set)) {
          if (key === 'id') ops.push(...renameGroup(raw, change.id, value as string));
          else ops.push(...setGroupField(raw, change.id, key, value as Value));
        }
      }
      for (const key of change.unset ?? []) ops.push(...setGroupField(raw, change.id, key, undefined));
      return { ops, summary: `grupo "${change.id}" atualizado` };
    }

    case 'remove_group':
      return { ops: deleteGroup(raw, change.id), summary: `grupo "${change.id}" removido` };

    case 'add_edge':
      return {
        ops: addEdge(change.edge.from, change.edge.to, change.edge as unknown as Record<string, Value>),
        summary: `edge "${change.edge.from}" -> "${change.edge.to}" criada`,
      };

    case 'update_edge': {
      const edgeIndex = findEdgeIndex(raw, change.edge);
      const ops: Op[] = [];
      for (const [key, value] of Object.entries(change.set ?? {})) ops.push(...setEdgeField(edgeIndex, key, value as Value));
      for (const key of change.unset ?? []) ops.push(...setEdgeField(edgeIndex, key, undefined));
      return { ops, summary: `edge[${edgeIndex}] atualizada` };
    }

    case 'remove_edge': {
      const edgeIndex = findEdgeIndex(raw, change.edge);
      return { ops: deleteEdge(edgeIndex), summary: `edge[${edgeIndex}] removida` };
    }

    case 'clear_hints':
      return { ops: clearHints(raw, change.scope ?? 'all'), summary: `hints de layout (rank/order) limpos (${change.scope ?? 'all'})` };
  }
}

export { AmbiguousEdgeRefError };

import { setGroupField, setNodeField, type RawDiagramLike } from './ops.js';
import type { Op } from './yaml-edit.js';

export interface DropRequest {
  draggedId: string;
  container: string;
  rank: number;
  orderIndex: number;
}

export interface PlacementLike {
  id: string;
  kind: 'node' | 'group';
  container: string;
  rank: number;
  order: number;
}

function reindexByOrder(items: PlacementLike[]): PlacementLike[] {
  return items
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((p, i) => ({ ...p, order: i }));
}

function groupByRank(items: PlacementLike[]): PlacementLike[][] {
  const byRank = new Map<number, PlacementLike[]>();
  for (const it of items) {
    const arr = byRank.get(it.rank) ?? [];
    arr.push(it);
    byRank.set(it.rank, arr);
  }
  return [...byRank.values()];
}

/**
 * Calcula os placements finais (container/rank/order) de TODOS os itens cujos hints precisam ser
 * fixados ("pin") apos um drop: o container de destino INTEIRO -- nao so o rank afetado -- para o
 * motor nao reorganizar os ranks que nao mudaram ao recalcular; e, se for diferente, o container de
 * origem (que perdeu um item, e precisa reindexar os orders sem buraco). So o rank de destino
 * recebe uma ordem nova; os demais ranks preservam a ordem relativa atual, so reindexada.
 *
 * O resultado inclui itens cujo rank/order NAO mudou -- fixa-los no YAML e o proposito do "pin";
 * remover os hints redundantes depois (o motor ja calcularia o mesmo sem eles) e o passo seguinte
 * ("poda"), nao este.
 */
export function computeDropPlacements(current: PlacementLike[], req: DropRequest): PlacementLike[] {
  const dragged = current.find((p) => p.id === req.draggedId);
  if (!dragged) throw new Error(`item arrastado "${req.draggedId}" nao encontrado`);

  const originContainer = dragged.container;
  const result: PlacementLike[] = [];

  const targetRankItems = current.filter((p) => p.container === req.container && p.rank === req.rank && p.id !== req.draggedId).sort((a, b) => a.order - b.order);
  const insertAt = Math.max(0, Math.min(req.orderIndex, targetRankItems.length));
  const withDragged = [...targetRankItems.slice(0, insertAt), { ...dragged, container: req.container, rank: req.rank }, ...targetRankItems.slice(insertAt)];
  withDragged.forEach((p, i) => result.push({ id: p.id, kind: p.kind, container: req.container, rank: req.rank, order: i }));

  const otherTargetRankItems = current.filter((p) => p.container === req.container && p.rank !== req.rank && p.id !== req.draggedId);
  for (const items of groupByRank(otherTargetRankItems)) result.push(...reindexByOrder(items));

  if (originContainer !== req.container) {
    const originItems = current.filter((p) => p.container === originContainer && p.id !== req.draggedId);
    for (const items of groupByRank(originItems)) result.push(...reindexByOrder(items));
  }

  return result;
}

/** Converte os placements calculados em Ops de yaml-edit, fixando rank/order e, quando o container mudou, group/parent. */
export function placementsToOps(raw: RawDiagramLike, placements: PlacementLike[], rootId: string, originalById: Map<string, Pick<PlacementLike, 'container'>>): Op[] {
  const ops: Op[] = [];
  for (const p of placements) {
    const original = originalById.get(p.id);
    const containerChanged = original !== undefined && original.container !== p.container;
    if (p.kind === 'node') {
      if (containerChanged) ops.push(...setNodeField(raw, p.id, 'group', p.container === rootId ? undefined : p.container));
      ops.push(...setNodeField(raw, p.id, 'rank', p.rank));
      ops.push(...setNodeField(raw, p.id, 'order', p.order));
    } else {
      if (containerChanged) ops.push(...setGroupField(raw, p.id, 'parent', p.container === rootId ? undefined : p.container));
      ops.push(...setGroupField(raw, p.id, 'rank', p.rank));
      ops.push(...setGroupField(raw, p.id, 'order', p.order));
    }
  }
  return ops;
}

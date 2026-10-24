import { LAYOUT_CONST } from '../theme/theme.js';
import { ceil8, clamp, median, snap8 } from './util.js';

export interface PlaceEdge {
  from: string;
  to: string;
  labelWidth: number;
}

export interface PlaceResult {
  positions: Map<string, { x: number; y: number }>;
  contentW: number;
  contentH: number;
}

/** Posiciona os itens de um unico container, sem sobreposicao, no eixo main (rank) e cross (order). */
export function placeItems(
  direction: 'LR' | 'TB',
  itemIds: string[],
  ranks: Map<string, number>,
  orders: Map<string, number>,
  sizes: Map<string, { w: number; h: number }>,
  edges: PlaceEdge[],
  isGroup: (id: string) => boolean,
): PlaceResult {
  const isLR = direction === 'LR';
  const mainSize = (id: string) => (isLR ? sizes.get(id)!.w : sizes.get(id)!.h);
  const crossSize = (id: string) => (isLR ? sizes.get(id)!.h : sizes.get(id)!.w);

  const byRank = new Map<number, string[]>();
  for (const id of itemIds) {
    const r = ranks.get(id)!;
    byRank.set(r, [...(byRank.get(r) ?? []), id]);
  }
  const rankKeys = [...byRank.keys()].sort((a, b) => a - b);
  for (const r of rankKeys) byRank.get(r)!.sort((a, b) => orders.get(a)! - orders.get(b)!);

  // --- eixo main: tamanho de cada coluna + gap entre colunas (baseado em rotulos que atravessam) ---
  const colMainSize = new Map<number, number>();
  for (const r of rankKeys) colMainSize.set(r, Math.max(...byRank.get(r)!.map(mainSize)));

  const gapAfter = new Map<number, number>();
  for (let i = 0; i < rankKeys.length - 1; i++) {
    const c = rankKeys[i]!;
    const crossing = edges.filter((e) => {
      const rf = ranks.get(e.from)!;
      const rt = ranks.get(e.to)!;
      const minCol = Math.min(rf, rt);
      const maxCol = Math.max(rf, rt);
      return minCol <= c && c < maxCol;
    });
    if (crossing.length === 0) {
      gapAfter.set(c, LAYOUT_CONST.columnGapMin);
      continue;
    }
    const maxLabelWidth = Math.max(...crossing.map((e) => e.labelWidth));
    const gap = ceil8(clamp(maxLabelWidth + LAYOUT_CONST.columnGapLabelPadding, LAYOUT_CONST.columnGapForLabelMin, LAYOUT_CONST.columnGapForLabelMax));
    gapAfter.set(c, gap);
  }

  const mainPos = new Map<number, number>();
  let acc = 0;
  for (const r of rankKeys) {
    mainPos.set(r, acc);
    acc += colMainSize.get(r)! + (gapAfter.get(r) ?? 0);
  }
  const lastGap = rankKeys.length > 0 ? (gapAfter.get(rankKeys[rankKeys.length - 1]!) ?? 0) : 0;
  const contentMain = acc - lastGap;

  // --- eixo cross: compactacao 1D, esquerda->direita usando vizinhos ja posicionados ---
  function neighborsInRanks(id: string, wantEarlier: boolean): string[] {
    const r = ranks.get(id)!;
    const result: string[] = [];
    for (const e of edges) {
      if (e.to === id) {
        const otherRank = ranks.get(e.from)!;
        if (wantEarlier ? otherRank < r : otherRank > r) result.push(e.from);
      }
      if (e.from === id) {
        const otherRank = ranks.get(e.to)!;
        if (wantEarlier ? otherRank < r : otherRank > r) result.push(e.to);
      }
    }
    return result;
  }

  const crossPos = new Map<string, number>();

  function layoutColumn(ids: string[], desiredFor: (id: string) => number | undefined) {
    const gaps: number[] = [];
    for (let k = 0; k < ids.length - 1; k++) {
      const a = ids[k]!;
      const b = ids[k + 1]!;
      gaps.push(isGroup(a) || isGroup(b) ? LAYOUT_CONST.rowGapWithGroup : LAYOUT_CONST.rowGapNodeNode);
    }
    let cursor = 0;
    for (let k = 0; k < ids.length; k++) {
      const id = ids[k]!;
      const size = crossSize(id);
      const desired = desiredFor(id);
      const y = ceil8(Math.max(desired ?? cursor, cursor));
      crossPos.set(id, y);
      cursor = y + size + (k < ids.length - 1 ? gaps[k]! : 0);
    }
  }

  for (let i = 0; i < rankKeys.length; i++) {
    const r = rankKeys[i]!;
    const ids = byRank.get(r)!;
    layoutColumn(ids, (id) => {
      if (i === 0) return undefined;
      const neighbors = neighborsInRanks(id, true);
      if (neighbors.length === 0) return undefined;
      const centers = neighbors.map((n) => crossPos.get(n)! + crossSize(n) / 2);
      return median(centers) - crossSize(id) / 2;
    });
  }

  // passada reversa: melhora o alinhamento da primeira coluna usando os sucessores
  if (rankKeys.length > 1) {
    const firstIds = byRank.get(rankKeys[0]!)!;
    layoutColumn(firstIds, (id) => {
      const neighbors = neighborsInRanks(id, false);
      if (neighbors.length === 0) return undefined;
      const centers = neighbors.map((n) => crossPos.get(n)! + crossSize(n) / 2);
      return median(centers) - crossSize(id) / 2;
    });
  }

  // --- posicoes finais (x,y), centralizando cada item no eixo main dentro da coluna ---
  const positions = new Map<string, { x: number; y: number }>();
  for (const id of itemIds) {
    const r = ranks.get(id)!;
    const mainOffset = snap8((colMainSize.get(r)! - mainSize(id)) / 2);
    const main = mainPos.get(r)! + mainOffset;
    const cross = crossPos.get(id)!;
    positions.set(id, isLR ? { x: main, y: cross } : { x: cross, y: main });
  }

  const contentCrossMax = itemIds.length > 0 ? Math.max(...itemIds.map((id) => crossPos.get(id)! + crossSize(id))) : 0;

  return {
    positions,
    contentW: isLR ? contentMain : contentCrossMax,
    contentH: isLR ? contentCrossMax : contentMain,
  };
}

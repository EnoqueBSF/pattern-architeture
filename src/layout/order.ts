import { median } from './util.js';

export interface OrderEdge {
  from: string;
  to: string;
}

/**
 * Ordena os itens dentro de cada rank (coluna/linha) via sweeps alternados de
 * baricentro, mantendo a ordenacao com menos cruzamentos entre as tentativas.
 */
export function computeOrder(itemIds: string[], ranks: Map<string, number>, edges: OrderEdge[], declIndexOf: Map<string, number>, orderHints: Map<string, number>): Map<string, number> {
  const byRank = new Map<number, string[]>();
  for (const id of itemIds) {
    const r = ranks.get(id)!;
    byRank.set(r, [...(byRank.get(r) ?? []), id]);
  }
  const rankKeys = [...byRank.keys()].sort((a, b) => a - b);

  const initialSort = (ids: string[]) =>
    [...ids].sort((a, b) => {
      const oa = orderHints.get(a);
      const ob = orderHints.get(b);
      if (oa !== undefined && ob !== undefined) return oa - ob;
      if (oa !== undefined) return -1;
      if (ob !== undefined) return 1;
      return (declIndexOf.get(a) ?? 0) - (declIndexOf.get(b) ?? 0);
    });
  for (const r of rankKeys) byRank.set(r, initialSort(byRank.get(r)!));

  const posInColumn = new Map<string, number>();
  function syncPositions() {
    for (const r of rankKeys) byRank.get(r)!.forEach((id, i) => posInColumn.set(id, i));
  }
  syncPositions();

  const neighborsPrev = new Map<string, string[]>();
  const neighborsNext = new Map<string, string[]>();
  for (const id of itemIds) {
    neighborsPrev.set(id, []);
    neighborsNext.set(id, []);
  }
  for (const e of edges) {
    const rf = ranks.get(e.from)!;
    const rt = ranks.get(e.to)!;
    if (rt === rf + 1) {
      neighborsNext.get(e.from)!.push(e.to);
      neighborsPrev.get(e.to)!.push(e.from);
    } else if (rf === rt + 1) {
      neighborsNext.get(e.to)!.push(e.from);
      neighborsPrev.get(e.from)!.push(e.to);
    }
  }

  function hasExplicitOrder(ids: string[]): boolean {
    return ids.some((id) => orderHints.has(id));
  }

  function sweep(direction: 'forward' | 'backward') {
    const seq = direction === 'forward' ? rankKeys : [...rankKeys].reverse();
    const neighbors = direction === 'forward' ? neighborsPrev : neighborsNext;
    for (const r of seq) {
      const ids = byRank.get(r)!;
      if (hasExplicitOrder(ids)) continue;
      const keyed = ids.map((id) => {
        const neigh = neighbors.get(id)!;
        const key = neigh.length > 0 ? median(neigh.map((n) => posInColumn.get(n)!)) : posInColumn.get(id)!;
        return { id, key };
      });
      keyed.sort((a, b) => a.key - b.key || (declIndexOf.get(a.id) ?? 0) - (declIndexOf.get(b.id) ?? 0));
      byRank.set(r, keyed.map((k) => k.id));
      syncPositions();
    }
  }

  function countCrossings(): number {
    let total = 0;
    for (let i = 0; i < rankKeys.length - 1; i++) {
      const r = rankKeys[i]!;
      const rNext = rankKeys[i + 1]!;
      const pairs: [number, number][] = [];
      for (const e of edges) {
        const rf = ranks.get(e.from)!;
        const rt = ranks.get(e.to)!;
        if ((rf === r && rt === rNext) || (rt === r && rf === rNext)) {
          const leftId = rf === r ? e.from : e.to;
          const rightId = leftId === e.from ? e.to : e.from;
          pairs.push([posInColumn.get(leftId)!, posInColumn.get(rightId)!]);
        }
      }
      for (let a = 0; a < pairs.length; a++) {
        for (let b = a + 1; b < pairs.length; b++) {
          const [l1, r1] = pairs[a]!;
          const [l2, r2] = pairs[b]!;
          if ((l1 - l2) * (r1 - r2) < 0) total++;
        }
      }
    }
    return total;
  }

  function snapshot(): Map<number, string[]> {
    return new Map([...byRank.entries()].map(([r, ids]) => [r, [...ids]]));
  }
  function restore(snap: Map<number, string[]>) {
    for (const [r, ids] of snap) byRank.set(r, ids);
    syncPositions();
  }

  let best = snapshot();
  let bestCrossings = countCrossings();
  for (let iter = 0; iter < 4; iter++) {
    sweep(iter % 2 === 0 ? 'forward' : 'backward');
    const crossings = countCrossings();
    if (crossings < bestCrossings) {
      bestCrossings = crossings;
      best = snapshot();
    }
  }
  restore(best);

  const result = new Map<string, number>();
  for (const r of rankKeys) byRank.get(r)!.forEach((id, i) => result.set(id, i));
  return result;
}

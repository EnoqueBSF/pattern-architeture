export interface RankEdge {
  from: string;
  to: string;
}

/**
 * Calcula o rank (coluna em LR, linha em TB) de cada item, via quebra de ciclos +
 * longest-path + "puxar fontes". Hints (rank explicito) sao respeitados como fixos.
 */
export function computeRanks(itemIds: string[], edges: RankEdge[], hints: Map<string, number>, declIndexOf: Map<string, number>): Map<string, number> {
  if (itemIds.length === 0) return new Map();

  const orderedItems = [...itemIds].sort((a, b) => (declIndexOf.get(a) ?? 0) - (declIndexOf.get(b) ?? 0));

  // 1. quebra de ciclos: DFS em ordem de declIndex; back-edge (destino na pilha) e invertida
  const outgoing = new Map<string, RankEdge[]>();
  for (const id of itemIds) outgoing.set(id, []);
  for (const e of edges) outgoing.get(e.from)?.push(e);

  const acyclic: RankEdge[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(id: string) {
    visited.add(id);
    inStack.add(id);
    for (const e of outgoing.get(id) ?? []) {
      if (inStack.has(e.to)) {
        acyclic.push({ from: e.to, to: id });
      } else {
        acyclic.push(e);
        if (!visited.has(e.to)) dfs(e.to);
      }
    }
    inStack.delete(id);
  }
  for (const id of orderedItems) if (!visited.has(id)) dfs(id);

  const incoming = new Map<string, string[]>();
  const outAdj = new Map<string, string[]>();
  for (const id of itemIds) {
    incoming.set(id, []);
    outAdj.set(id, []);
  }
  for (const e of acyclic) {
    incoming.get(e.to)?.push(e.from);
    outAdj.get(e.from)?.push(e.to);
  }

  // 2. ordenacao topologica (Kahn, determinista por declIndex)
  const indegree = new Map<string, number>();
  for (const id of itemIds) indegree.set(id, incoming.get(id)!.length);
  const queue = orderedItems.filter((id) => indegree.get(id) === 0);
  const topoOrder: string[] = [];
  const seen = new Set<string>();
  while (queue.length > 0) {
    queue.sort((a, b) => (declIndexOf.get(a) ?? 0) - (declIndexOf.get(b) ?? 0));
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    topoOrder.push(id);
    for (const next of outAdj.get(id) ?? []) {
      indegree.set(next, indegree.get(next)! - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  for (const id of orderedItems) if (!seen.has(id)) topoOrder.push(id);

  // 3. longest-path; hints fixam o rank do item (vencem conflito)
  const rank = new Map<string, number>();
  for (const id of topoOrder) {
    if (hints.has(id)) {
      rank.set(id, hints.get(id)!);
      continue;
    }
    const preds = incoming.get(id) ?? [];
    const base = preds.length > 0 ? Math.max(...preds.map((p) => rank.get(p) ?? 0)) + 1 : 0;
    rank.set(id, base);
  }

  // 4. puxar fontes (sem predecessor, com sucessor) para perto do sucessor mais proximo
  for (const id of [...topoOrder].reverse()) {
    if (hints.has(id)) continue;
    const preds = incoming.get(id) ?? [];
    if (preds.length > 0) continue;
    const succs = outAdj.get(id) ?? [];
    if (succs.length === 0) continue;
    const minSuccRank = Math.min(...succs.map((s) => rank.get(s) ?? 0));
    rank.set(id, Math.max(0, minSuccRank - 1));
  }

  // 5. reindexar para 0..k sem buracos
  const used = [...new Set(itemIds.map((id) => rank.get(id)!))].sort((a, b) => a - b);
  const remap = new Map(used.map((r, i) => [r, i]));
  for (const id of itemIds) rank.set(id, remap.get(rank.get(id)!)!);

  return rank;
}

import type { GroupKind } from '../schema/enums.js';
import type { DiagramModel, EdgeModel, GroupModel, NodeModel } from '../schema/model.js';

export const ROOT = '__root__';

export interface ContainerInfo {
  id: string;
  depth: number;
  kind: 'root' | GroupKind;
  label?: string;
  parent?: string;
  /** ids de nodes e subgrupos filhos diretos, em ordem de declIndex */
  children: string[];
}

export interface DiagramTree {
  containers: Map<string, ContainerInfo>;
  nodeById: Map<string, NodeModel>;
  groupById: Map<string, GroupModel>;
  isGroup(id: string): boolean;
  /** container (group id ou ROOT) que contem diretamente este node */
  containerOfNode(nodeId: string): string;
  /** container (group id ou ROOT) que contem diretamente este group */
  containerOfGroup(groupId: string): string;
  /** sobe a cadeia de ancestrais de itemId até achar o item que e filho direto de targetContainerId */
  climbToChildOf(targetContainerId: string, itemId: string): string | undefined;
}

export function buildTree(model: DiagramModel): DiagramTree {
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const groupById = new Map(model.groups.map((g) => [g.id, g]));

  const containerOfNode = (nodeId: string) => nodeById.get(nodeId)!.group ?? ROOT;
  const containerOfGroup = (groupId: string) => groupById.get(groupId)!.parent ?? ROOT;
  const isGroup = (id: string) => groupById.has(id);

  const containers = new Map<string, ContainerInfo>();
  containers.set(ROOT, { id: ROOT, depth: 0, kind: 'root', children: [] });
  for (const g of model.groups) {
    const depth = computeDepth(g.id, groupById);
    containers.set(g.id, { id: g.id, depth, kind: g.kind, label: g.label, parent: containerOfGroup(g.id), children: [] });
  }

  type ChildRef = { id: string; declIndex: number };
  const childrenOf = new Map<string, ChildRef[]>();
  for (const id of containers.keys()) childrenOf.set(id, []);

  for (const n of model.nodes) {
    childrenOf.get(containerOfNode(n.id))!.push({ id: n.id, declIndex: n.declIndex });
  }
  for (const g of model.groups) {
    childrenOf.get(containerOfGroup(g.id))!.push({ id: g.id, declIndex: g.declIndex });
  }

  for (const [containerId, refs] of childrenOf) {
    refs.sort((a, b) => a.declIndex - b.declIndex);
    containers.get(containerId)!.children = refs.map((r) => r.id);
  }

  function climbToChildOf(targetContainerId: string, itemId: string): string | undefined {
    let curId = itemId;
    let curIsNode = nodeById.has(itemId);
    for (;;) {
      const parentContainer = curIsNode ? containerOfNode(curId) : containerOfGroup(curId);
      if (parentContainer === targetContainerId) return curId;
      if (parentContainer === ROOT) return undefined;
      curId = parentContainer;
      curIsNode = false;
    }
  }

  return { containers, nodeById, groupById, isGroup, containerOfNode, containerOfGroup, climbToChildOf };
}

function computeDepth(groupId: string, groupById: Map<string, GroupModel>): number {
  let depth = 1;
  let cur = groupById.get(groupId)!.parent;
  while (cur) {
    depth++;
    cur = groupById.get(cur)!.parent;
  }
  return depth;
}

/** Containers em pos-ordem: filhos (subgrupos) antes dos pais; ROOT por ultimo. */
export function postOrderContainers(tree: DiagramTree): string[] {
  const order: string[] = [];
  const visited = new Set<string>();
  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const info = tree.containers.get(id)!;
    for (const childId of info.children) {
      if (tree.isGroup(childId)) visit(childId);
    }
    order.push(id);
  }
  visit(ROOT);
  return order;
}

export interface ElevatedEdge {
  from: string;
  to: string;
  edges: EdgeModel[];
}

/** Para cada container, as arestas elevadas (entre seus filhos diretos) cujo LCA(from,to) e esse container. */
export function elevatedEdgesByContainer(model: DiagramModel, tree: DiagramTree): Map<string, ElevatedEdge[]> {
  const result = new Map<string, Map<string, ElevatedEdge>>();
  for (const id of tree.containers.keys()) result.set(id, new Map());

  function containerChain(id: string, isNode: boolean): string[] {
    const chain: string[] = [];
    let curId = id;
    let curIsNode = isNode;
    for (;;) {
      const parent = curIsNode ? tree.containerOfNode(curId) : tree.containerOfGroup(curId);
      chain.push(parent);
      if (parent === ROOT) break;
      curId = parent;
      curIsNode = false;
    }
    return chain;
  }

  for (const e of model.edges) {
    const chainFrom = containerChain(e.from, true);
    const chainTo = containerChain(e.to, true);
    const setTo = new Set(chainTo);
    const lca = chainFrom.find((c) => setTo.has(c)) ?? ROOT;

    const childFrom = tree.climbToChildOf(lca, e.from);
    const childTo = tree.climbToChildOf(lca, e.to);
    if (!childFrom || !childTo || childFrom === childTo) continue;

    const byPair = result.get(lca)!;
    const key = `${childFrom}->${childTo}`;
    const existing = byPair.get(key);
    if (existing) existing.edges.push(e);
    else byPair.set(key, { from: childFrom, to: childTo, edges: [e] });
  }

  const flat = new Map<string, ElevatedEdge[]>();
  for (const [containerId, byPair] of result) flat.set(containerId, [...byPair.values()]);
  return flat;
}

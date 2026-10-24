import { edgeLabelText } from '../schema/edge-text.js';
import type { DiagramModel } from '../schema/model.js';
import type { Rect } from '../shapes/types.js';
import { measureText } from '../text/measure.js';
import { CANVAS, GROUP_STYLE, TEXT } from '../theme/theme.js';
import type { IconCardGeometry } from './icon-card.js';
import { computeOrder } from './order.js';
import { type PlaceEdge, placeItems } from './place.js';
import { computeRanks } from './rank.js';
import { computeNodeSize } from './size.js';
import { buildTree, elevatedEdgesByContainer, postOrderContainers, ROOT } from './tree.js';
import { ceil8 } from './util.js';
import type { GroupKind, NodeType, Status } from '../schema/enums.js';

export interface NodeLayout {
  id: string;
  type: NodeType;
  status: Status;
  x: number;
  y: number;
  w: number;
  h: number;
  /** caixa absoluta expandida (espaco para o badge de status) */
  bounds: Rect;
  caption: string;
  labelLines: string[];
  techLines: string[];
  slugLines: string[];
  subtitleLines: string[];
  /** largura da pilula do badge livre (node.badge); 0 se nao houver */
  tagWidth: number;
  badgeText?: string;
  description?: string;
  /** chave do icone resolvido (ver src/icons/catalog.ts); undefined = desenha a forma do type */
  icon?: string;
  /** geometria do card-com-icone, relativa a origem (0,0) do node; presente apenas quando icon esta definido */
  card?: IconCardGeometry;
}

export interface GroupLayout {
  id: string;
  kind: GroupKind;
  label: string;
  depth: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Posicao logica (coluna/ordem dentro do container) de um node ou grupo -- usada pelo Studio para inferir drag-and-drop. */
export interface ItemPlacement {
  id: string;
  kind: 'node' | 'group';
  /** id do container (group ou ROOT) que contem este item diretamente */
  container: string;
  /** coluna (LR) ou linha (TB) dentro do container */
  rank: number;
  /** posicao dentro da coluna/linha, 0-indexed */
  order: number;
}

export interface LayoutResult {
  direction: 'LR' | 'TB';
  /** largura/altura do corpo do grafo (sem cabecalho/legenda, adicionados no render do documento) */
  width: number;
  height: number;
  nodes: NodeLayout[];
  groups: GroupLayout[];
  /** posicao logica (container/rank/order) de todo node e grupo, na ordem em que foram processados */
  placement: ItemPlacement[];
}

export function layoutDiagram(model: DiagramModel): LayoutResult {
  const tree = buildTree(model);
  const elevated = elevatedEdgesByContainer(model, tree);

  const declIndexOf = new Map<string, number>();
  for (const n of model.nodes) declIndexOf.set(n.id, n.declIndex);
  for (const g of model.groups) declIndexOf.set(g.id, g.declIndex);

  const nodeSizeById = new Map(model.nodes.map((n) => [n.id, computeNodeSize(n, model.locale)]));
  const itemSize = new Map<string, { w: number; h: number }>();
  for (const [id, sz] of nodeSizeById) itemSize.set(id, { w: sz.w, h: sz.h });

  const relativePlacement = new Map<string, { x: number; y: number }>();
  const placement: ItemPlacement[] = [];
  const processingOrder = postOrderContainers(tree);

  for (const containerId of processingOrder) {
    const info = tree.containers.get(containerId)!;
    const items = info.children;
    if (items.length === 0) {
      itemSize.set(containerId, { w: 0, h: 0 });
      continue;
    }

    const rankHints = new Map<string, number>();
    const orderHints = new Map<string, number>();
    for (const itemId of items) {
      if (tree.isGroup(itemId)) {
        const g = tree.groupById.get(itemId)!;
        if (g.rank !== undefined) rankHints.set(itemId, g.rank);
        if (g.order !== undefined) orderHints.set(itemId, g.order);
      } else {
        const n = tree.nodeById.get(itemId)!;
        if (n.rank !== undefined) rankHints.set(itemId, n.rank);
        if (n.order !== undefined) orderHints.set(itemId, n.order);
      }
    }

    const elevatedHere = elevated.get(containerId) ?? [];
    const simpleEdges = elevatedHere.map((e) => ({ from: e.from, to: e.to }));
    const placeEdges: PlaceEdge[] = elevatedHere.map((e) => ({
      from: e.from,
      to: e.to,
      labelWidth: Math.max(...e.edges.map((orig) => measureText(edgeLabelText(orig), TEXT.edgeLabel.size, TEXT.edgeLabel.weight))),
    }));

    const ranks = computeRanks(items, simpleEdges, rankHints, declIndexOf);
    const orders = computeOrder(items, ranks, simpleEdges, declIndexOf, orderHints);

    for (const itemId of items) {
      placement.push({
        id: itemId,
        kind: tree.isGroup(itemId) ? 'group' : 'node',
        container: containerId,
        rank: ranks.get(itemId)!,
        order: orders.get(itemId)!,
      });
    }

    const sizes = new Map(items.map((id) => [id, itemSize.get(id)!]));
    const result = placeItems(model.direction, items, ranks, orders, sizes, placeEdges, tree.isGroup);

    for (const [id, pos] of result.positions) relativePlacement.set(id, pos);

    if (containerId === ROOT) {
      itemSize.set(ROOT, { w: result.contentW, h: result.contentH });
    } else {
      const w = ceil8(result.contentW + GROUP_STYLE.padding * 2);
      const h = ceil8(result.contentH + GROUP_STYLE.padding * 2 + GROUP_STYLE.titleBarHeight);
      itemSize.set(containerId, { w, h });
    }
  }

  const absPos = new Map<string, { x: number; y: number }>();
  function resolveAbsolute(containerId: string, originX: number, originY: number) {
    const info = tree.containers.get(containerId)!;
    const contentX = containerId === ROOT ? originX : originX + GROUP_STYLE.padding;
    const contentY = containerId === ROOT ? originY : originY + GROUP_STYLE.padding + GROUP_STYLE.titleBarHeight;
    for (const itemId of info.children) {
      const rel = relativePlacement.get(itemId) ?? { x: 0, y: 0 };
      const abs = { x: contentX + rel.x, y: contentY + rel.y };
      absPos.set(itemId, abs);
      if (tree.isGroup(itemId)) resolveAbsolute(itemId, abs.x, abs.y);
    }
  }
  resolveAbsolute(ROOT, CANVAS.marginX, CANVAS.marginX);

  const nodes: NodeLayout[] = model.nodes.map((n) => {
    const sz = nodeSizeById.get(n.id)!;
    const pos = absPos.get(n.id) ?? { x: 0, y: 0 };
    return {
      id: n.id,
      type: n.type,
      status: n.status,
      x: pos.x,
      y: pos.y,
      w: sz.w,
      h: sz.h,
      bounds: { x: pos.x + sz.bounds.x, y: pos.y + sz.bounds.y, w: sz.bounds.w, h: sz.bounds.h },
      caption: sz.caption,
      labelLines: sz.labelLines,
      techLines: sz.techLines,
      slugLines: sz.slugLines,
      subtitleLines: sz.subtitleLines,
      tagWidth: sz.tagWidth,
      badgeText: n.badge,
      description: n.description,
      icon: n.icon,
      card: sz.card,
    };
  });

  const groups: GroupLayout[] = model.groups.map((g) => {
    const pos = absPos.get(g.id) ?? { x: 0, y: 0 };
    const sz = itemSize.get(g.id) ?? { w: 0, h: 0 };
    return {
      id: g.id,
      kind: g.kind,
      label: g.label,
      depth: tree.containers.get(g.id)!.depth,
      x: pos.x,
      y: pos.y,
      w: sz.w,
      h: sz.h,
    };
  });

  const rootSize = itemSize.get(ROOT) ?? { w: 0, h: 0 };
  const width = CANVAS.marginX * 2 + rootSize.w;
  const height = CANVAS.marginX * 2 + rootSize.h;

  return { direction: model.direction, width, height, nodes, groups, placement };
}

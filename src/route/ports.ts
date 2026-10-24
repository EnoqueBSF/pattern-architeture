import type { NodeLayout } from '../layout/layout.js';
import { shapeForNode } from '../shapes/registry.js';
import { rayHitPolygon } from '../shapes/geometry.js';
import type { Point } from '../shapes/types.js';

export type Side = 'top' | 'right' | 'bottom' | 'left';

export const SIDE_NORMAL: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const SIDE_AXIS: Record<Side, 'x' | 'y'> = { top: 'x', bottom: 'x', left: 'y', right: 'y' };

export interface Port {
  point: Point;
  normal: Point;
  side: Side;
}

export function computeEdgeSides(direction: 'LR' | 'TB', from: NodeLayout, to: NodeLayout): { fromSide: Side; toSide: Side } {
  const dx = to.x + to.w / 2 - (from.x + from.w / 2);
  const dy = to.y + to.h / 2 - (from.y + from.h / 2);

  if (direction === 'LR') {
    if (Math.abs(dx) >= 16) return dx > 0 ? { fromSide: 'right', toSide: 'left' } : { fromSide: 'left', toSide: 'right' };
    return dy >= 0 ? { fromSide: 'bottom', toSide: 'top' } : { fromSide: 'top', toSide: 'bottom' };
  }
  if (Math.abs(dy) >= 16) return dy > 0 ? { fromSide: 'bottom', toSide: 'top' } : { fromSide: 'top', toSide: 'bottom' };
  return dx >= 0 ? { fromSide: 'right', toSide: 'left' } : { fromSide: 'left', toSide: 'right' };
}

function rectBorderPoint(node: NodeLayout, side: Side, t: number): Point {
  switch (side) {
    case 'top':
      return { x: node.x + t * node.w, y: node.y };
    case 'bottom':
      return { x: node.x + t * node.w, y: node.y + node.h };
    case 'left':
      return { x: node.x, y: node.y + t * node.h };
    case 'right':
      return { x: node.x + node.w, y: node.y + t * node.h };
  }
}

function shapeOutlinePoint(node: NodeLayout, targetAbs: Point): Point {
  const shape = shapeForNode(node);
  const outlineAbs = shape.outline(node.w, node.h).map((p) => ({ x: p.x + node.x, y: p.y + node.y }));
  const center = { x: node.x + node.w / 2, y: node.y + node.h / 2 };
  const dir = { x: targetAbs.x - center.x, y: targetAbs.y - center.y };
  return rayHitPolygon(center, dir, outlineAbs) ?? targetAbs;
}

export interface EdgeRef {
  id: string;
  from: string;
  to: string;
}

/** Para cada (edgeId, nodeId), a porta de saida/entrada daquela aresta naquele node. */
export function assignPorts(direction: 'LR' | 'TB', nodeById: Map<string, NodeLayout>, edges: EdgeRef[]): Map<string, Port> {
  const sidesByEdge = new Map<string, { fromSide: Side; toSide: Side }>();
  for (const e of edges) {
    const from = nodeById.get(e.from)!;
    const to = nodeById.get(e.to)!;
    sidesByEdge.set(e.id, computeEdgeSides(direction, from, to));
  }

  type GroupEntry = { edgeId: string; otherId: string };
  const groups = new Map<string, GroupEntry[]>();
  function addToGroup(nodeId: string, side: Side, edgeId: string, otherId: string) {
    const key = `${nodeId}:${side}`;
    const list = groups.get(key);
    if (list) list.push({ edgeId, otherId });
    else groups.set(key, [{ edgeId, otherId }]);
  }
  for (const e of edges) {
    const { fromSide, toSide } = sidesByEdge.get(e.id)!;
    addToGroup(e.from, fromSide, e.id, e.to);
    addToGroup(e.to, toSide, e.id, e.from);
  }

  const result = new Map<string, Port>();
  for (const [key, entries] of groups) {
    const sepIndex = key.lastIndexOf(':');
    const nodeId = key.slice(0, sepIndex);
    const side = key.slice(sepIndex + 1) as Side;
    const node = nodeById.get(nodeId)!;
    const axis = SIDE_AXIS[side];

    const sorted = [...entries].sort((a, b) => {
      const oa = nodeById.get(a.otherId)!;
      const ob = nodeById.get(b.otherId)!;
      const va = axis === 'x' ? oa.x + oa.w / 2 : oa.y + oa.h / 2;
      const vb = axis === 'x' ? ob.x + ob.w / 2 : ob.y + ob.h / 2;
      return va - vb || a.edgeId.localeCompare(b.edgeId);
    });

    const k = sorted.length;
    sorted.forEach((entry, i) => {
      const t = 0.15 + 0.7 * ((i + 1) / (k + 1));
      const targetAbs = rectBorderPoint(node, side, t);
      const point = shapeOutlinePoint(node, targetAbs);
      result.set(`${entry.edgeId}:${nodeId}`, { point, normal: SIDE_NORMAL[side], side });
    });
  }

  return result;
}

import type { LayoutResult, NodeLayout } from '../layout/layout.js';
import type { DiagramModel, EdgeModel } from '../schema/model.js';
import type { Point } from '../shapes/types.js';
import { ROUTE_COST } from '../theme/theme.js';
import { astarRoute } from './astar.js';
import { buildGrid, cellOf, centerOf, NODE_INFLATE, type Grid } from './grid.js';
import { assignPorts, type Port, type Side } from './ports.js';

export interface RoutedEdge {
  edge: EdgeModel;
  points: Point[];
  usedFallback: boolean;
}

const STUB_MIN = 24;
const STUB_SAFETY = 8;
const MAX_EXPANSIONS_LOCAL = 20000;
const MAX_EXPANSIONS_GLOBAL = 400000;

/** Distancia minima para o stub escapar da zona de obstaculo (bounds inflado) do proprio node. */
function stubLength(node: NodeLayout, port: Port): number {
  const b = node.bounds;
  const need: Record<Side, number> = {
    left: port.point.x - (b.x - NODE_INFLATE),
    right: b.x + b.w + NODE_INFLATE - port.point.x,
    top: port.point.y - (b.y - NODE_INFLATE),
    bottom: b.y + b.h + NODE_INFLATE - port.point.y,
  };
  return Math.max(STUB_MIN, need[port.side] + STUB_SAFETY);
}

function normalToDir(normal: Point): number {
  if (normal.x === 1) return 0;
  if (normal.y === 1) return 1;
  if (normal.x === -1) return 2;
  return 3;
}

/**
 * Ponto intermediario entre a porta (fracionaria) e o centro de celula da grade (multiplo de 8+4),
 * preservando a coordenada perpendicular da porta e a coordenada normal do centro da celula --
 * garante que os dois segmentos de transicao (porta->ponto->centro) sejam ambos ortogonais.
 */
function transitionPoint(portPoint: Point, normal: Point, cellCenter: Point): Point {
  return normal.x !== 0 ? { x: cellCenter.x, y: portPoint.y } : { x: portPoint.x, y: cellCenter.y };
}

function simplifyCollinear(pts: Point[]): Point[] {
  if (pts.length <= 2) return pts;
  const result: Point[] = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = result[result.length - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const cross = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    if (Math.abs(cross) > 1e-6) result.push(b);
  }
  result.push(pts[pts.length - 1]!);
  return result;
}

/** Roteia todas as arestas do diagrama como polilinhas ortogonais sobre uma grade 8px. */
export function routeEdges(layout: LayoutResult, model: DiagramModel): RoutedEdge[] {
  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));
  const grid = buildGrid(layout);
  const ports = assignPorts(layout.direction, nodeById, model.edges);

  const withDist = model.edges.map((edge) => {
    const fromPort = ports.get(`${edge.id}:${edge.from}`)!;
    const toPort = ports.get(`${edge.id}:${edge.to}`)!;
    const manhattanDist = Math.abs(fromPort.point.x - toPort.point.x) + Math.abs(fromPort.point.y - toPort.point.y);
    return { edge, fromPort, toPort, manhattanDist };
  });
  withDist.sort((a, b) => a.manhattanDist - b.manhattanDist || a.edge.declIndex - b.edge.declIndex);

  const usage = new Set<string>();

  function routeOne(grid: Grid, start: ReturnType<typeof cellOf>, startDir: number, goal: ReturnType<typeof cellOf>) {
    const extraCost = (cx: number, cy: number) => (usage.has(`${cx},${cy}`) ? ROUTE_COST.reuseSameOrientation : 0);
    const margin = 50; // celulas, ~400px
    const bbox = {
      minCx: Math.min(start.cx, goal.cx) - margin,
      minCy: Math.min(start.cy, goal.cy) - margin,
      maxCx: Math.max(start.cx, goal.cx) + margin,
      maxCy: Math.max(start.cy, goal.cy) + margin,
    };
    const local = astarRoute({ grid, start, startDir, goal, extraCost, bbox, maxExpansions: MAX_EXPANSIONS_LOCAL });
    if (local) return local;
    return astarRoute({ grid, start, startDir, goal, extraCost, maxExpansions: MAX_EXPANSIONS_GLOBAL });
  }

  const results: RoutedEdge[] = [];
  for (const { edge, fromPort, toPort } of withDist) {
    const fromNode = nodeById.get(edge.from)!;
    const toNode = nodeById.get(edge.to)!;
    const fromStubLen = stubLength(fromNode, fromPort);
    const toStubLen = stubLength(toNode, toPort);
    const fromTarget: Point = { x: fromPort.point.x + fromPort.normal.x * fromStubLen, y: fromPort.point.y + fromPort.normal.y * fromStubLen };
    const toTarget: Point = { x: toPort.point.x + toPort.normal.x * toStubLen, y: toPort.point.y + toPort.normal.y * toStubLen };

    const startCell = cellOf(grid, fromTarget);
    const goalCell = cellOf(grid, toTarget);
    const startCenter = centerOf(grid, startCell.cx, startCell.cy);
    const goalCenter = centerOf(grid, goalCell.cx, goalCell.cy);
    const startTransition = transitionPoint(fromPort.point, fromPort.normal, startCenter);
    const goalTransition = transitionPoint(toPort.point, toPort.normal, goalCenter);
    const startDir = normalToDir(fromPort.normal);

    const cellPath = routeOne(grid, startCell, startDir, goalCell);

    let points: Point[];
    let usedFallback: boolean;
    if (cellPath) {
      for (const c of cellPath) usage.add(`${c.cx},${c.cy}`);
      const cellPoints = cellPath.map((c) => centerOf(grid, c.cx, c.cy));
      points = simplifyCollinear([fromPort.point, startTransition, ...cellPoints, goalTransition, toPort.point]);
      usedFallback = false;
    } else {
      points = [fromPort.point, toPort.point];
      usedFallback = true;
    }

    results.push({ edge, points, usedFallback });
  }

  return results;
}

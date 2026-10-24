import { ROUTE_COST } from '../theme/theme.js';
import { type Grid, isObstacle } from './grid.js';

const STEP_DIRS = [
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: -1 },
] as const;

class MinHeap<T> {
  private data: { f: number; seq: number; value: T }[] = [];

  push(value: T, f: number, seq: number) {
    this.data.push({ f, seq, value });
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0]!;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.bubbleDown(0);
    }
    return top.value;
  }

  get size(): number {
    return this.data.length;
  }

  private less(a: { f: number; seq: number }, b: { f: number; seq: number }): boolean {
    return a.f < b.f || (a.f === b.f && a.seq < b.seq);
  }

  private bubbleUp(i: number) {
    let idx = i;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.less(this.data[idx]!, this.data[parent]!)) {
        [this.data[idx], this.data[parent]] = [this.data[parent]!, this.data[idx]!];
        idx = parent;
      } else break;
    }
  }

  private bubbleDown(i: number) {
    let idx = i;
    const n = this.data.length;
    for (;;) {
      let smallest = idx;
      const l = 2 * idx + 1;
      const r = 2 * idx + 2;
      if (l < n && this.less(this.data[l]!, this.data[smallest]!)) smallest = l;
      if (r < n && this.less(this.data[r]!, this.data[smallest]!)) smallest = r;
      if (smallest === idx) break;
      [this.data[idx], this.data[smallest]] = [this.data[smallest]!, this.data[idx]!];
      idx = smallest;
    }
  }
}

export interface Cell {
  cx: number;
  cy: number;
}

export type ExtraCostFn = (cx: number, cy: number, dir: number) => number;

export interface AstarOptions {
  grid: Grid;
  start: Cell;
  startDir: number;
  goal: Cell;
  extraCost?: ExtraCostFn;
  bbox?: { minCx: number; minCy: number; maxCx: number; maxCy: number };
  maxExpansions: number;
}

function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
}

function inBbox(bbox: AstarOptions['bbox'], cx: number, cy: number): boolean {
  if (!bbox) return true;
  return cx >= bbox.minCx && cx <= bbox.maxCx && cy >= bbox.minCy && cy <= bbox.maxCy;
}

/** A* em grade com estado (cx,cy,dir), penalizando viradas via ROUTE_COST.turn. */
export function astarRoute(opts: AstarOptions): Cell[] | undefined {
  const { grid, start, startDir, goal, extraCost, bbox, maxExpansions } = opts;
  const strKey = (cx: number, cy: number, dir: number) => `${cx},${cy},${dir}`;

  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, { cx: number; cy: number; dir: number }>();
  const heap = new MinHeap<{ cx: number; cy: number; dir: number }>();
  let seq = 0;

  const startKey = strKey(start.cx, start.cy, startDir);
  gScore.set(startKey, 0);
  heap.push({ cx: start.cx, cy: start.cy, dir: startDir }, manhattan(start, goal), seq++);

  let expansions = 0;
  let foundKey: string | undefined;

  while (heap.size > 0 && expansions < maxExpansions) {
    const node = heap.pop()!;
    const k = strKey(node.cx, node.cy, node.dir);
    const g = gScore.get(k);
    if (g === undefined) continue;

    if (node.cx === goal.cx && node.cy === goal.cy) {
      foundKey = k;
      break;
    }
    expansions++;

    for (let d = 0; d < 4; d++) {
      const { dx, dy } = STEP_DIRS[d]!;
      const ncx = node.cx + dx;
      const ncy = node.cy + dy;
      if (!(ncx === goal.cx && ncy === goal.cy) && !inBbox(bbox, ncx, ncy)) continue;
      if (isObstacle(grid, ncx, ncy)) continue;

      const turnCost = d === node.dir ? 0 : ROUTE_COST.turn;
      const extra = extraCost ? extraCost(ncx, ncy, d) : 0;
      const ng = g + ROUTE_COST.step + turnCost + extra;
      const nk = strKey(ncx, ncy, d);
      const prevG = gScore.get(nk);
      if (prevG === undefined || ng < prevG) {
        gScore.set(nk, ng);
        cameFrom.set(nk, { cx: node.cx, cy: node.cy, dir: node.dir });
        heap.push({ cx: ncx, cy: ncy, dir: d }, ng + manhattan({ cx: ncx, cy: ncy }, goal), seq++);
      }
    }
  }

  if (!foundKey) return undefined;

  const path: Cell[] = [];
  let curKey = foundKey;
  const first = curKey.split(',').map(Number);
  path.push({ cx: first[0]!, cy: first[1]! });
  while (cameFrom.has(curKey)) {
    const prev = cameFrom.get(curKey)!;
    path.push({ cx: prev.cx, cy: prev.cy });
    curKey = strKey(prev.cx, prev.cy, prev.dir);
  }
  path.reverse();
  return path;
}

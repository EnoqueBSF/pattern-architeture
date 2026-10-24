import type { LayoutResult } from '../layout/layout.js';
import type { Point } from '../shapes/types.js';

export interface Grid {
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  cell: number;
  obstacles: Set<number>;
}

const CELL = 8;
const PADDING = 32;
export const NODE_INFLATE = 12;

export function buildGrid(layout: LayoutResult): Grid {
  const originX = -PADDING;
  const originY = -PADDING;
  const totalW = layout.width + PADDING * 2;
  const totalH = layout.height + PADDING * 2;
  const cols = Math.ceil(totalW / CELL);
  const rows = Math.ceil(totalH / CELL);
  const obstacles = new Set<number>();

  for (let cy = 0; cy < rows; cy++) {
    const py = originY + cy * CELL + CELL / 2;
    for (let cx = 0; cx < cols; cx++) {
      const px = originX + cx * CELL + CELL / 2;
      for (const node of layout.nodes) {
        const b = node.bounds;
        if (px >= b.x - NODE_INFLATE && px <= b.x + b.w + NODE_INFLATE && py >= b.y - NODE_INFLATE && py <= b.y + b.h + NODE_INFLATE) {
          obstacles.add(cy * cols + cx);
          break;
        }
      }
    }
  }

  return { originX, originY, cols, rows, cell: CELL, obstacles };
}

export function cellOf(grid: Grid, p: Point): { cx: number; cy: number } {
  return { cx: Math.floor((p.x - grid.originX) / grid.cell), cy: Math.floor((p.y - grid.originY) / grid.cell) };
}

export function centerOf(grid: Grid, cx: number, cy: number): Point {
  return { x: grid.originX + cx * grid.cell + grid.cell / 2, y: grid.originY + cy * grid.cell + grid.cell / 2 };
}

export function isObstacle(grid: Grid, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) return true;
  return grid.obstacles.has(cy * grid.cols + cx);
}

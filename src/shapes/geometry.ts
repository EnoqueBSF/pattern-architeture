import type { Point } from './types.js';

export function sampleCubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, n: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    pts.push({
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    });
  }
  return pts;
}

/** Amostra um arco elitico; angulos em graus, convencao padrao (0=direita, 90=baixo em coords de tela). */
export function sampleEllipseArc(cx: number, cy: number, rx: number, ry: number, startDeg: number, endDeg: number, n: number): Point[] {
  const pts: Point[] = [];
  const start = (startDeg * Math.PI) / 180;
  const end = (endDeg * Math.PI) / 180;
  for (let i = 0; i <= n; i++) {
    const t = start + (end - start) * (i / n);
    pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return pts;
}

/** Contorno de um rect com cantos circulares de raio r (clamped a w/2,h/2). */
export function roundedRectOutline(w: number, h: number, r: number, perCorner = 6): Point[] {
  const rc = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rc <= 0.01) {
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
  }
  const tl = sampleEllipseArc(rc, rc, rc, rc, 180, 270, perCorner);
  const tr = sampleEllipseArc(w - rc, rc, rc, rc, 270, 360, perCorner);
  const br = sampleEllipseArc(w - rc, h - rc, rc, rc, 0, 90, perCorner);
  const bl = sampleEllipseArc(rc, h - rc, rc, rc, 90, 180, perCorner);
  return [...tl, ...tr, ...br, ...bl];
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const intersect = a.y !== b.y && p.y >= Math.min(a.y, b.y) && p.y < Math.max(a.y, b.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

function cross(ux: number, uy: number, vx: number, vy: number): number {
  return ux * vy - uy * vx;
}

/** Interseccao mais proxima do raio origin+t*dir (t>0) com as arestas do poligono. */
export function rayHitPolygon(origin: Point, dir: Point, poly: Point[]): Point | undefined {
  let best: Point | undefined;
  let bestT = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denom = cross(dir.x, dir.y, ex, ey);
    if (Math.abs(denom) < 1e-9) continue;
    const aox = a.x - origin.x;
    const aoy = a.y - origin.y;
    const t = cross(aox, aoy, ex, ey) / denom;
    const s = cross(aox, aoy, dir.x, dir.y) / denom;
    if (t > 1e-6 && t < bestT && s >= -1e-6 && s <= 1 + 1e-6) {
      bestT = t;
      best = { x: origin.x + t * dir.x, y: origin.y + t * dir.y };
    }
  }
  return best;
}

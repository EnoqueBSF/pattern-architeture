import type { ConnectionNote, LabelPlacement } from '../route/labels.js';
import type { Point } from '../shapes/types.js';
import { ARROWHEAD, FONT_FAMILY_REGULAR, FONT_FAMILY_SEMIBOLD, TEXT, type EdgeStyle } from '../theme/theme.js';
import { el, esc, fmt, points } from './svg.js';

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointTowards(from: Point, to: Point, distance: number): Point {
  const d = dist(from, to);
  if (d === 0) return { ...from };
  const t = distance / d;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** Caminho com cantos arredondados (r limitado a metade de cada segmento adjacente). */
function buildRoundedPath(pts: Point[], radius: number): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) {
    return `M ${fmt(pts[0]!.x)},${fmt(pts[0]!.y)} L ${fmt(pts[1]!.x)},${fmt(pts[1]!.y)}`;
  }
  let d = `M ${fmt(pts[0]!.x)},${fmt(pts[0]!.y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const next = pts[i + 1]!;
    const r = Math.min(radius, dist(prev, cur) / 2, dist(cur, next) / 2);
    const p1 = pointTowards(cur, prev, r);
    const p2 = pointTowards(cur, next, r);
    d += ` L ${fmt(p1.x)},${fmt(p1.y)} Q ${fmt(cur.x)},${fmt(cur.y)} ${fmt(p2.x)},${fmt(p2.y)}`;
  }
  const last = pts[pts.length - 1]!;
  d += ` L ${fmt(last.x)},${fmt(last.y)}`;
  return d;
}

function renderArrowhead(from: Point, to: Point, color: string, isAsync: boolean): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const { length, width } = ARROWHEAD;
  const back = { x: to.x - length * Math.cos(angle), y: to.y - length * Math.sin(angle) };
  const left = { x: back.x - (width / 2) * Math.sin(angle), y: back.y + (width / 2) * Math.cos(angle) };
  const right = { x: back.x + (width / 2) * Math.sin(angle), y: back.y - (width / 2) * Math.cos(angle) };

  if (isAsync) {
    return el('path', { d: `M ${fmt(left.x)},${fmt(left.y)} L ${fmt(to.x)},${fmt(to.y)} L ${fmt(right.x)},${fmt(right.y)}`, fill: 'none', stroke: color, 'stroke-width': 1.5 });
  }
  return el('polygon', { points: points([to, left, right]), fill: color });
}

/** Desenha uma aresta a partir de uma polilinha (2 pontos = reta provisoria; N pontos = rota ortogonal). */
export function renderEdgePath(pts: Point[], style: EdgeStyle, isAsync: boolean, bidirectional: boolean): string {
  if (pts.length < 2) return '';
  const d = buildRoundedPath(pts, 8);
  const line = el('path', { d, fill: 'none', stroke: style.stroke, 'stroke-width': style.strokeWidth, 'stroke-dasharray': style.dash });

  const n = pts.length;
  const arrowEnd = renderArrowhead(pts[n - 2]!, pts[n - 1]!, style.stroke, isAsync);
  const arrowStart = bidirectional ? renderArrowhead(pts[1]!, pts[0]!, style.stroke, isAsync) : '';
  return line + arrowEnd + arrowStart;
}

export function renderEdgeLabel(label: LabelPlacement): string {
  const { box } = label;
  const rect = el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: 3, ry: 3, fill: '#FFFFFF', stroke: label.color, 'stroke-width': 0.75 });
  const text = el(
    'text',
    {
      x: box.x + box.w / 2,
      y: box.y + box.h / 2 + 3.5,
      'text-anchor': 'middle',
      'font-size': TEXT.edgeLabel.size,
      'font-weight': TEXT.edgeLabel.weight,
      'font-family': FONT_FAMILY_REGULAR,
      fill: '#334155',
    },
    esc(label.text),
  );
  return rect + text;
}

const NOTE_MARKER_RADIUS = 8;

export function renderNoteMarker(note: ConnectionNote, color: string): string {
  const circle = el('circle', { cx: note.point.x, cy: note.point.y, r: NOTE_MARKER_RADIUS, fill: '#FFFFFF', stroke: color, 'stroke-width': 1.25 });
  const text = el(
    'text',
    {
      x: note.point.x,
      y: note.point.y + 3,
      'text-anchor': 'middle',
      'font-size': 9,
      'font-weight': 600,
      'font-family': FONT_FAMILY_SEMIBOLD,
      fill: color,
    },
    esc(note.marker),
  );
  return circle + text;
}

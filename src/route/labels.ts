import { lineHeight } from '../layout/size.js';
import type { LayoutResult } from '../layout/layout.js';
import { edgeLabelText } from '../schema/edge-text.js';
import type { Point, Rect } from '../shapes/types.js';
import { measureText } from '../text/measure.js';
import { EDGE_STATUS_STYLE, GROUP_STYLE, TEXT } from '../theme/theme.js';
import { rectsOverlap } from '../verify/invariants.js';
import type { RoutedEdge } from './route.js';

export interface LabelPlacement {
  edgeId: string;
  text: string;
  box: Rect;
  color: string;
}

export interface ConnectionNote {
  edgeId: string;
  marker: string;
  text: string;
  point: Point;
}

const CANDIDATE_T = [0.5, 0.33, 0.67, 0.2, 0.8];
const PAD_X = 4;
const PAD_Y = 2;
const OBSTACLE_MARGIN = 4;

interface Segment {
  a: Point;
  b: Point;
  orientation: 'h' | 'v';
  length: number;
}

function segmentsOf(points: Point[]): Segment[] {
  const segs: Segment[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const orientation: 'h' | 'v' = Math.abs(a.y - b.y) < 0.01 ? 'h' : 'v';
    const length = orientation === 'h' ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
    segs.push({ a, b, orientation, length });
  }
  return segs;
}

function boxAt(center: Point, w: number, h: number): Rect {
  return { x: center.x - w / 2, y: center.y - h / 2, w, h };
}

function groupTitleBars(layout: LayoutResult): Rect[] {
  return layout.groups.map((g) => ({ x: g.x, y: g.y, w: g.w, h: GROUP_STYLE.titleBarHeight }));
}

/** Posiciona os rotulos de aresta sem sobrepor nodes, outros rotulos ou faixas de titulo de grupo; fallback = nota numerada. */
export function placeLabels(routed: RoutedEdge[], layout: LayoutResult): { labels: LabelPlacement[]; notes: ConnectionNote[] } {
  const nodeBoxes = layout.nodes.map((n) => n.bounds);
  const titleBars = groupTitleBars(layout);
  const placedBoxes: Rect[] = [];

  const labels: LabelPlacement[] = [];
  const notes: ConnectionNote[] = [];
  let noteSeq = 1;

  for (const re of routed) {
    const text = edgeLabelText(re.edge);
    if (!text) continue;

    const lh = lineHeight(TEXT.edgeLabel.size);
    const textW = Math.min(measureText(text, TEXT.edgeLabel.size, TEXT.edgeLabel.weight), TEXT.edgeLabel.maxWidth);
    const boxW = textW + PAD_X * 2;
    const boxH = lh + PAD_Y * 2;

    const segs = [...segmentsOf(re.points)].sort((a, b) => {
      if (a.orientation !== b.orientation) return a.orientation === 'h' ? -1 : 1;
      return b.length - a.length;
    });

    let placed: Rect | undefined;
    for (const seg of segs) {
      if (seg.length < boxW + 16) continue;
      for (const t of CANDIDATE_T) {
        const center: Point = { x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t };
        const box = boxAt(center, boxW, boxH);
        const collides =
          nodeBoxes.some((b) => rectsOverlap(box, b, OBSTACLE_MARGIN)) ||
          titleBars.some((b) => rectsOverlap(box, b, OBSTACLE_MARGIN)) ||
          placedBoxes.some((b) => rectsOverlap(box, b, OBSTACLE_MARGIN));
        if (!collides) {
          placed = box;
          break;
        }
      }
      if (placed) break;
    }

    if (placed) {
      placedBoxes.push(placed);
      labels.push({ edgeId: re.edge.id, text, box: placed, color: EDGE_STATUS_STYLE[re.edge.status].stroke });
    } else {
      const marker = `N${noteSeq++}`;
      const midPoint = re.points[Math.floor(re.points.length / 2)]!;
      notes.push({ edgeId: re.edge.id, marker, text: `${marker} — ${text} (${re.edge.from} → ${re.edge.to})`, point: midPoint });
    }
  }

  return { labels, notes };
}

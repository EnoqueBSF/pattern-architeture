import { el, fmt } from '../render/svg.js';
import { roundedRectOutline, sampleEllipseArc } from './geometry.js';
import { insetContentBox, insetOuterSize, type Insets, type Point, type Shape, type ShapeStyle } from './types.js';

function strokeAttrs(style: ShapeStyle) {
  return {
    fill: style.fill,
    stroke: style.stroke,
    'stroke-width': style.strokeWidth,
    'stroke-dasharray': style.dash,
  };
}

const CYLINDER_RY = 8;
function cylinderBody(w: number, h: number, ry: number): string {
  const rx = w / 2;
  return `M 0,${fmt(ry)} L 0,${fmt(h - ry)} A ${fmt(rx)},${fmt(ry)} 0 0,0 ${fmt(w)},${fmt(h - ry)} L ${fmt(w)},${fmt(ry)} A ${fmt(rx)},${fmt(ry)} 0 0,0 0,${fmt(ry)} Z`;
}
function cylinderOutline(w: number, h: number, ry: number): Point[] {
  const rx = w / 2;
  const topRim = sampleEllipseArc(rx, ry, rx, ry, 180, 360, 10); // rim visivel, de cima
  const right = [{ x: w, y: h - ry }];
  const bottomBulge = sampleEllipseArc(rx, h - ry, rx, ry, 0, 180, 10); // bulge inferior
  const left = [{ x: 0, y: ry }];
  return [...topRim, ...right, ...bottomBulge, ...left];
}

/** database */
const DATABASE_INSETS: Insets = { top: 24, right: 14, bottom: 18, left: 14 };
export const cylinderShape: Shape = {
  outerSize: insetOuterSize(DATABASE_INSETS),
  contentBox: insetContentBox(DATABASE_INSETS),
  render: (w, h, style) => {
    const rx = w / 2;
    const body = el('path', { d: cylinderBody(w, h, CYLINDER_RY), ...strokeAttrs(style) });
    const rim = el('ellipse', { cx: rx, cy: CYLINDER_RY, rx, ry: CYLINDER_RY, ...strokeAttrs(style) });
    return body + rim;
  },
  outline: (w, h) => cylinderOutline(w, h, CYLINDER_RY),
};

/** cache: cilindro com 2 aneis internos (decoracao) */
const CACHE_INSETS: Insets = { top: 28, right: 14, bottom: 18, left: 14 };
export const diskStackShape: Shape = {
  outerSize: insetOuterSize(CACHE_INSETS),
  contentBox: insetContentBox(CACHE_INSETS),
  render: (w, h, style) => {
    const rx = w / 2;
    const body = el('path', { d: cylinderBody(w, h, CYLINDER_RY), ...strokeAttrs(style) });
    const rim = el('ellipse', { cx: rx, cy: CYLINDER_RY, rx, ry: CYLINDER_RY, ...strokeAttrs(style) });
    const ring1 = el('ellipse', { cx: rx, cy: CYLINDER_RY + 10, rx: rx * 0.72, ry: CYLINDER_RY * 0.6, fill: 'none', stroke: style.stroke, 'stroke-width': 1 });
    const ring2 = el('ellipse', { cx: rx, cy: CYLINDER_RY + 20, rx: rx * 0.72, ry: CYLINDER_RY * 0.6, fill: 'none', stroke: style.stroke, 'stroke-width': 1 });
    return body + rim + ring1 + ring2;
  },
  outline: (w, h) => cylinderOutline(w, h, CYLINDER_RY),
};

/** queue: cilindro horizontal ("pipe"), aro no lado direito */
const QUEUE_CAP_RX = 10;
const QUEUE_INSETS: Insets = { top: 12, right: 30, bottom: 12, left: 14 };
export const pipeShape: Shape = {
  outerSize: insetOuterSize(QUEUE_INSETS),
  contentBox: insetContentBox(QUEUE_INSETS),
  render: (w, h, style) => {
    const capRx = Math.min(QUEUE_CAP_RX, w / 2);
    const cy = h / 2;
    const body = el('rect', { x: capRx, y: 0, width: Math.max(0, w - 2 * capRx), height: h, ...strokeAttrs(style) });
    const leftCap = el('ellipse', { cx: capRx, cy, rx: capRx, ry: cy, ...strokeAttrs(style) });
    const rightCap = el('ellipse', { cx: w - capRx, cy, rx: capRx, ry: cy, ...strokeAttrs(style) });
    const ring = el('ellipse', { cx: w - capRx, cy, rx: capRx * 0.55, ry: Math.max(0, cy - 4), fill: 'none', stroke: style.stroke, 'stroke-width': 1 });
    return body + leftCap + rightCap + ring;
  },
  outline: (w, h) => roundedRectOutline(w, h, Math.min(QUEUE_CAP_RX, h / 2)),
};

/** storage: trapezio (base recuada 12) + aro eliptico no topo (ry=6) */
const BUCKET_BASE_INSET = 12;
const BUCKET_TOP_RY = 6;
const BUCKET_INSETS: Insets = { top: 20, right: 24, bottom: 12, left: 24 };
function bucketOutline(w: number, h: number): Point[] {
  const inset = Math.min(BUCKET_BASE_INSET, w / 2);
  return [
    { x: 0, y: BUCKET_TOP_RY },
    { x: w, y: BUCKET_TOP_RY },
    { x: w - inset, y: h },
    { x: inset, y: h },
  ];
}
export const bucketShape: Shape = {
  outerSize: insetOuterSize(BUCKET_INSETS),
  contentBox: insetContentBox(BUCKET_INSETS),
  render: (w, h, style) => {
    const inset = Math.min(BUCKET_BASE_INSET, w / 2);
    const body = el('path', {
      d: `M 0,${fmt(BUCKET_TOP_RY)} L ${fmt(inset)},${fmt(h)} L ${fmt(w - inset)},${fmt(h)} L ${fmt(w)},${fmt(BUCKET_TOP_RY)} A ${fmt(w / 2)},${fmt(BUCKET_TOP_RY)} 0 0,0 0,${fmt(BUCKET_TOP_RY)} Z`,
      ...strokeAttrs(style),
    });
    const rim = el('ellipse', { cx: w / 2, cy: BUCKET_TOP_RY, rx: w / 2, ry: BUCKET_TOP_RY, ...strokeAttrs(style) });
    return body + rim;
  },
  outline: bucketOutline,
};

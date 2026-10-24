import { el, points } from '../render/svg.js';
import { roundedRectOutline } from './geometry.js';
import { insetContentBox, insetOuterSize, type Insets, type Point, type Shape, type ShapeStyle } from './types.js';

function strokeAttrs(style: ShapeStyle) {
  return {
    fill: style.fill,
    stroke: style.stroke,
    'stroke-width': style.strokeWidth,
    'stroke-dasharray': style.dash,
  };
}

function roundedRectShapeWithRadius(insets: Insets, radius: number): Shape {
  return {
    outerSize: insetOuterSize(insets),
    contentBox: insetContentBox(insets),
    render: (w, h, style) => el('rect', { x: 0, y: 0, width: w, height: h, rx: radius, ry: radius, ...strokeAttrs(style) }),
    outline: (w, h) => roundedRectOutline(w, h, radius),
  };
}

/** generic */
export const rectShape: Shape = roundedRectShapeWithRadius({ top: 12, right: 14, bottom: 12, left: 14 }, 2);

/** microservice */
export const roundedRectShape: Shape = roundedRectShapeWithRadius({ top: 12, right: 14, bottom: 12, left: 14 }, 8);

/** api-gateway: octogono com chanfro de 12 */
const OCTAGON_CHAMFER = 12;
function octagonPoints(w: number, h: number): Point[] {
  const c = Math.min(OCTAGON_CHAMFER, w / 2, h / 2);
  return [
    { x: c, y: 0 },
    { x: w - c, y: 0 },
    { x: w, y: c },
    { x: w, y: h - c },
    { x: w - c, y: h },
    { x: c, y: h },
    { x: 0, y: h - c },
    { x: 0, y: c },
  ];
}
export const octagonShape: Shape = {
  outerSize: insetOuterSize({ top: 12, right: 18, bottom: 12, left: 18 }),
  contentBox: insetContentBox({ top: 12, right: 18, bottom: 12, left: 18 }),
  render: (w, h, style) => el('polygon', { points: points(octagonPoints(w, h)), ...strokeAttrs(style) }),
  outline: (w, h) => octagonPoints(w, h),
};

/** load-balancer: pilula, rx = min(h/2, 28) */
export const pillShape: Shape = {
  outerSize: insetOuterSize({ top: 12, right: 24, bottom: 12, left: 24 }),
  contentBox: insetContentBox({ top: 12, right: 24, bottom: 12, left: 24 }),
  render: (w, h, style) => {
    const r = Math.min(h / 2, 28);
    return el('rect', { x: 0, y: 0, width: w, height: h, rx: r, ry: r, ...strokeAttrs(style) });
  },
  outline: (w, h) => roundedRectOutline(w, h, Math.min(h / 2, 28)),
};

/** cdn: paralelogramo, inclinacao 16 */
const PARALLELOGRAM_SLANT = 16;
function parallelogramPoints(w: number, h: number): Point[] {
  const s = Math.min(PARALLELOGRAM_SLANT, w / 2);
  return [
    { x: s, y: 0 },
    { x: w, y: 0 },
    { x: w - s, y: h },
    { x: 0, y: h },
  ];
}
export const parallelogramShape: Shape = {
  outerSize: insetOuterSize({ top: 12, right: 26, bottom: 12, left: 26 }),
  contentBox: insetContentBox({ top: 12, right: 26, bottom: 12, left: 26 }),
  render: (w, h, style) => el('polygon', { points: points(parallelogramPoints(w, h)), ...strokeAttrs(style) }),
  outline: (w, h) => parallelogramPoints(w, h),
};

/** message-broker: hexagono com pontas esquerda/direita, recuo 20 */
const HEXAGON_INSET = 20;
function hexagonPoints(w: number, h: number): Point[] {
  const r = Math.min(HEXAGON_INSET, w / 2);
  return [
    { x: r, y: 0 },
    { x: w - r, y: 0 },
    { x: w, y: h / 2 },
    { x: w - r, y: h },
    { x: r, y: h },
    { x: 0, y: h / 2 },
  ];
}
export const hexagonShape: Shape = {
  outerSize: insetOuterSize({ top: 12, right: 26, bottom: 12, left: 26 }),
  contentBox: insetContentBox({ top: 12, right: 26, bottom: 12, left: 26 }),
  render: (w, h, style) => el('polygon', { points: points(hexagonPoints(w, h)), ...strokeAttrs(style) }),
  outline: (w, h) => hexagonPoints(w, h),
};

/** worker: duas copias empilhadas, a de tras deslocada (+6,-6) */
const STACK_OFFSET = 6;
const STACK_INSETS: Insets = { top: 18, right: 20, bottom: 12, left: 14 };
export const stackedShape: Shape = {
  outerSize: insetOuterSize(STACK_INSETS),
  contentBox: insetContentBox(STACK_INSETS),
  render: (w, h, style) => {
    const backFill = style.fill;
    const back = el('rect', {
      x: STACK_OFFSET,
      y: 0,
      width: w - STACK_OFFSET,
      height: h - STACK_OFFSET,
      rx: 8,
      ry: 8,
      fill: backFill,
      stroke: style.stroke,
      'stroke-width': Math.max(1, style.strokeWidth - 0.5),
      'stroke-dasharray': style.dash,
      opacity: 0.55,
    });
    const front = el('rect', {
      x: 0,
      y: STACK_OFFSET,
      width: w - STACK_OFFSET,
      height: h - STACK_OFFSET,
      rx: 8,
      ry: 8,
      ...strokeAttrs(style),
    });
    return back + front;
  },
  outline: (w, h) => {
    const front = roundedRectOutline(w - STACK_OFFSET, h - STACK_OFFSET, 8);
    return front.map((p) => ({ x: p.x, y: p.y + STACK_OFFSET }));
  },
};

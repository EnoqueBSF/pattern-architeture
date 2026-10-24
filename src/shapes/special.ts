import { el, fmt } from '../render/svg.js';
import { roundedRectOutline, sampleCubicBezier } from './geometry.js';
import { insetContentBox, insetOuterSize, type Insets, type Point, type Shape, type ShapeStyle } from './types.js';

function strokeAttrs(style: ShapeStyle) {
  return {
    fill: style.fill,
    stroke: style.stroke,
    'stroke-width': style.strokeWidth,
    'stroke-dasharray': style.dash,
  };
}

/** frontend-web: "navegador" com barra superior de 14px e 3 pontos */
const BROWSER_BAR = 14;
const BROWSER_INSETS: Insets = { top: 26, right: 14, bottom: 12, left: 14 };
export const browserShape: Shape = {
  outerSize: insetOuterSize(BROWSER_INSETS),
  contentBox: insetContentBox(BROWSER_INSETS),
  render: (w, h, style) => {
    const frame = el('rect', { x: 0, y: 0, width: w, height: h, rx: 6, ry: 6, ...strokeAttrs(style) });
    const bar = el('path', {
      d: `M 0,6 A 6,6 0 0,1 6,0 L ${fmt(w - 6)},0 A 6,6 0 0,1 ${fmt(w)},6 L ${fmt(w)},${fmt(BROWSER_BAR)} L 0,${fmt(BROWSER_BAR)} Z`,
      fill: style.stroke,
      opacity: 0.18,
    });
    const dots = [5, 11, 17]
      .map((cx) => el('circle', { cx, cy: BROWSER_BAR / 2, r: 1.6, fill: style.stroke }))
      .join('');
    return frame + bar + dots;
  },
  outline: (w, h) => roundedRectOutline(w, h, 6),
};

/** mobile-app: retangulo r=16 com notch em pilula no topo */
const DEVICE_INSETS: Insets = { top: 20, right: 16, bottom: 16, left: 16 };
export const deviceShape: Shape = {
  outerSize: insetOuterSize(DEVICE_INSETS),
  contentBox: insetContentBox(DEVICE_INSETS),
  render: (w, h, style) => {
    const frame = el('rect', { x: 0, y: 0, width: w, height: h, rx: 16, ry: 16, ...strokeAttrs(style) });
    const notchW = Math.min(28, w * 0.35);
    const notch = el('rect', { x: (w - notchW) / 2, y: 5, width: notchW, height: 5, rx: 2.5, ry: 2.5, fill: style.stroke, opacity: 0.4 });
    return frame + notch;
  },
  outline: (w, h) => roundedRectOutline(w, h, 16),
};

/** actor: cabeca (r=10) + corpo arredondado */
const PERSON_INSETS: Insets = { top: 34, right: 14, bottom: 12, left: 14 };
export const personShape: Shape = {
  outerSize: insetOuterSize(PERSON_INSETS),
  contentBox: insetContentBox(PERSON_INSETS),
  render: (w, h, style) => {
    const headR = 10;
    const head = el('circle', { cx: w / 2, cy: headR + 2, r: headR, ...strokeAttrs(style) });
    const body = el('rect', { x: 0, y: headR * 2 + 2, width: w, height: Math.max(0, h - headR * 2 - 2), rx: 10, ry: 10, ...strokeAttrs(style) });
    return body + head;
  },
  outline: (w, h) => roundedRectOutline(w, h, 12),
};

/** external-service: nuvem, path normalizado escalado por (w,h) */
// Ratios validados empiricamente contra o path abaixo (ver tests/shapes.test.ts):
// a caixa de conteudo precisa ficar dentro do "waist" entre os lobulos da nuvem.
const CLOUD_CONTENT_BOX_RATIO = { x0: 0.22, x1: 0.8, y0: 0.34, y1: 0.78 };
const CLOUD_INSETS_RATIO = { w: CLOUD_CONTENT_BOX_RATIO.x1 - CLOUD_CONTENT_BOX_RATIO.x0, h: CLOUD_CONTENT_BOX_RATIO.y1 - CLOUD_CONTENT_BOX_RATIO.y0 };

// path unitario fornecido no plano, em segmentos cubicos (x,y em [0,1])
const CLOUD_SEGMENTS: [Point, Point, Point][] = [
  [{ x: 0.08, y: 0.85 }, { x: 0.02, y: 0.62 }, { x: 0.14, y: 0.52 }],
  [{ x: 0.06, y: 0.3 }, { x: 0.28, y: 0.14 }, { x: 0.42, y: 0.24 }],
  [{ x: 0.5, y: 0.06 }, { x: 0.78, y: 0.08 }, { x: 0.8, y: 0.3 }],
  [{ x: 0.98, y: 0.3 }, { x: 1.02, y: 0.58 }, { x: 0.88, y: 0.66 }],
  [{ x: 0.96, y: 0.82 }, { x: 0.82, y: 0.92 }, { x: 0.7, y: 0.85 }],
];
const CLOUD_START: Point = { x: 0.25, y: 0.85 };

function cloudPathD(w: number, h: number): string {
  const sx = (p: Point) => fmt(p.x * w);
  const sy = (p: Point) => fmt(p.y * h);
  let d = `M ${sx(CLOUD_START)},${sy(CLOUD_START)}`;
  for (const [c1, c2, end] of CLOUD_SEGMENTS) {
    d += ` C ${sx(c1)},${sy(c1)} ${sx(c2)},${sy(c2)} ${sx(end)},${sy(end)}`;
  }
  // Z: fecha com linha reta de volta ao ponto inicial (a base plana do lado de baixo da nuvem)
  d += ' Z';
  return d;
}

function cloudOutline(w: number, h: number): Point[] {
  const scale = (p: Point) => ({ x: p.x * w, y: p.y * h });
  const pts: Point[] = [scale(CLOUD_START)];
  let prev = CLOUD_START;
  for (const [c1, c2, end] of CLOUD_SEGMENTS) {
    const sampled = sampleCubicBezier(scale(prev), scale(c1), scale(c2), scale(end), 8);
    pts.push(...sampled.slice(1));
    prev = end;
  }
  return pts;
}

export const cloudShape: Shape = {
  outerSize: (contentW, contentH) => ({
    w: Math.ceil(contentW / CLOUD_INSETS_RATIO.w),
    h: Math.ceil(contentH / CLOUD_INSETS_RATIO.h),
  }),
  contentBox: (w, h) => ({
    x: w * CLOUD_CONTENT_BOX_RATIO.x0,
    y: h * CLOUD_CONTENT_BOX_RATIO.y0,
    w: w * (CLOUD_CONTENT_BOX_RATIO.x1 - CLOUD_CONTENT_BOX_RATIO.x0),
    h: h * (CLOUD_CONTENT_BOX_RATIO.y1 - CLOUD_CONTENT_BOX_RATIO.y0),
  }),
  render: (w, h, style) => el('path', { d: cloudPathD(w, h), ...strokeAttrs(style) }),
  outline: cloudOutline,
};

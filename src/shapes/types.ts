export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShapeStyle {
  stroke: string;
  strokeWidth: number;
  dash?: string;
  fill: string;
}

export interface Shape {
  /** Tamanho externo (w,h) que garante pelo menos contentW x contentH de area util. */
  outerSize(contentW: number, contentH: number): { w: number; h: number };
  /** Caixa de conteudo (onde texto/badge devem ficar), relativa a origem (0,0) do node. */
  contentBox(w: number, h: number): Rect;
  /** Fragmento SVG desenhado na origem (0,0)-(w,h); quem chama envolve num <g transform>. */
  render(w: number, h: number, style: ShapeStyle): string;
  /** Poligono (fechado, implicito) aproximando o contorno real, para point-in-polygon/ray-hit. */
  outline(w: number, h: number): Point[];
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function insetOuterSize(insets: Insets) {
  return (contentW: number, contentH: number) => ({
    w: contentW + insets.left + insets.right,
    h: contentH + insets.top + insets.bottom,
  });
}

export function insetContentBox(insets: Insets) {
  return (w: number, h: number): Rect => ({
    x: insets.left,
    y: insets.top,
    w: Math.max(0, w - insets.left - insets.right),
    h: Math.max(0, h - insets.top - insets.bottom),
  });
}

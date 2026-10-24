import { el } from '../render/svg.js';
import { roundedRectOutline } from './geometry.js';
import { insetContentBox, insetOuterSize, type Shape } from './types.js';

const INSETS = { top: 12, right: 14, bottom: 12, left: 14 };
const RADIUS = 8;

/**
 * Forma do card-com-icone: so desenha o corpo (retangulo arredondado com cor de status) e o
 * contorno para roteamento. O conteudo rico (tile, textos, badge, divisor) e desenhado a parte
 * em render/node.ts a partir da geometria calculada por layout/icon-card.ts -- outerSize/
 * contentBox aqui sao so um fallback generico caso algo chame esta Shape fora desse fluxo.
 */
export const iconCardShape: Shape = {
  outerSize: insetOuterSize(INSETS),
  contentBox: insetContentBox(INSETS),
  render: (w, h, style) =>
    el('rect', { x: 0, y: 0, width: w, height: h, rx: RADIUS, ry: RADIUS, fill: style.fill, stroke: style.stroke, 'stroke-width': style.strokeWidth, 'stroke-dasharray': style.dash }),
  outline: (w, h) => roundedRectOutline(w, h, RADIUS),
};

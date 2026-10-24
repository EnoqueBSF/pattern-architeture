import type { NodeType } from '../schema/enums.js';
import { STATUSES } from '../schema/enums.js';
import { getShape } from '../shapes/registry.js';
import { measureText } from '../text/measure.js';
import { nodeTypeLabel, statusCaption, ui } from '../theme/i18n.js';
import { EDGE_STATUS_STYLE, FONT_FAMILY_REGULAR, FONT_FAMILY_SEMIBOLD, STATUS_STYLE } from '../theme/theme.js';
import { el, esc, fmt } from './svg.js';

interface Chip {
  swatch: string;
  swatchWidth: number;
  label: string;
}

function layoutChips(chips: Chip[], x0: number, y0: number, maxWidth: number): { svg: string; height: number } {
  const chipH = 20;
  const gapX = 18;
  const gapY = 10;
  const labelGap = 6;
  let x = x0;
  let y = y0;
  let out = '';
  for (const chip of chips) {
    const labelW = measureText(chip.label, 11, 400);
    const chipW = chip.swatchWidth + labelGap + labelW;
    if (x !== x0 && x + chipW > x0 + maxWidth) {
      x = x0;
      y += chipH + gapY;
    }
    const label = el('text', { x: chip.swatchWidth + labelGap, y: 14, 'font-size': 11, 'font-family': FONT_FAMILY_REGULAR, fill: '#334155' }, esc(chip.label));
    out += el('g', { transform: `translate(${fmt(x)},${fmt(y)})` }, chip.swatch + label);
    x += chipW + gapX;
  }
  return { svg: out, height: y - y0 + chipH };
}

function sectionTitle(text: string, x: number, y: number): string {
  return el('text', { x, y, 'font-size': 10, 'font-weight': 600, 'font-family': FONT_FAMILY_SEMIBOLD, 'letter-spacing': 0.4, fill: '#94A3B8' }, esc(text.toUpperCase()));
}

function statusSwatch(status: (typeof STATUSES)[number]): string {
  const s = STATUS_STYLE[status];
  return el('rect', { x: 0, y: 2, width: 16, height: 16, rx: 3, ry: 3, fill: s.fill, stroke: s.stroke, 'stroke-width': s.strokeWidth, 'stroke-dasharray': s.dash });
}

function edgeSwatch(status: (typeof STATUSES)[number]): string {
  const s = EDGE_STATUS_STYLE[status];
  return el('line', { x1: 0, y1: 10, x2: 18, y2: 10, stroke: s.stroke, 'stroke-width': s.strokeWidth, 'stroke-dasharray': s.dash });
}

function typeSwatch(type: NodeType): string {
  const shape = getShape(type);
  return shape.render(32, 20, { stroke: '#64748B', strokeWidth: 1.25, fill: '#F1F5F9' });
}

export interface LegendResult {
  svg: string;
  height: number;
}

export function renderLegend(usedTypes: NodeType[], maxWidth: number, locale: 'pt-BR' | 'en'): LegendResult {
  const strings = ui(locale);
  let y = 0;
  let out = '';

  out += sectionTitle(strings.legendStatus, 0, y + 10);
  const statusChips = STATUSES.map((s) => ({ swatch: statusSwatch(s), swatchWidth: 16, label: statusCaption(locale, s) }));
  const statusLayout = layoutChips(statusChips, 0, y + 18, maxWidth);
  out += statusLayout.svg;
  y += 18 + statusLayout.height + 16;

  out += sectionTitle(strings.legendEdges, 0, y + 10);
  const edgeChips: Chip[] = [
    { swatch: edgeSwatch('unchanged'), swatchWidth: 18, label: strings.sync },
    { swatch: edgeSwatch('new'), swatchWidth: 18, label: strings.async },
  ];
  const edgeLayout = layoutChips(edgeChips, 0, y + 18, maxWidth);
  out += edgeLayout.svg;
  y += 18 + edgeLayout.height + 16;

  if (usedTypes.length > 0) {
    out += sectionTitle(strings.legendTypes, 0, y + 10);
    const typeChips = usedTypes.map((t) => ({ swatch: typeSwatch(t), swatchWidth: 36, label: nodeTypeLabel(locale, t) }));
    const typeLayout = layoutChips(typeChips, 0, y + 18, maxWidth);
    out += typeLayout.svg;
    y += 18 + typeLayout.height;
  }

  return { svg: out, height: y };
}

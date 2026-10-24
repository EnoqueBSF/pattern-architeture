import { getIcon } from '../icons/catalog.js';
import type { Rect } from '../shapes/types.js';
import { fmt } from './svg.js';

function sanitizeIdPrefix(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '-');
}

/** Desenha o icone (SVG aninhado) dentro de `box`, com os ids internos prefixados por node para evitar colisao. */
export function renderIcon(iconKey: string, box: Rect, nodeId: string): string {
  const def = getIcon(iconKey);
  const prefix = sanitizeIdPrefix(nodeId);
  const body = def.body.replaceAll('__ID__', `ic-${prefix}-`);
  const viewBox = `${fmt(def.left)} ${fmt(def.top)} ${fmt(def.width)} ${fmt(def.height)}`;
  return `<svg x="${fmt(box.x)}" y="${fmt(box.y)}" width="${fmt(box.w)}" height="${fmt(box.h)}" viewBox="${viewBox}">${body}</svg>`;
}

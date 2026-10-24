import { getIcon } from '../icons/catalog.js';
import type { NodeModel } from '../schema/model.js';
import type { Rect } from '../shapes/types.js';
import { measureText, wrapText } from '../text/measure.js';
import { nodeTypeLabel } from '../theme/i18n.js';
import { ICON_CARD, LAYOUT_CONST, STATUS_STYLE, TEXT } from '../theme/theme.js';
import { lineHeight } from './size.js';
import { ceil8, clamp } from './util.js';

export interface IconCardLine {
  text: string;
  x: number;
  /** baseline (y de desenho do <text>), relativo a origem (0,0) do node */
  y: number;
  role: 'caption' | 'label' | 'slug' | 'tech' | 'subtitle';
}

export interface IconCardGeometry {
  tile: Rect;
  /** area onde o <svg> do icone e desenhado, com folga em relacao ao tile */
  iconBox: Rect;
  lines: IconCardLine[];
  tag?: { rect: Rect; text: string };
  divider?: { x1: number; x2: number; y: number };
}

export interface IconCardResult {
  w: number;
  h: number;
  /** caixa expandida (espaco para o badge de status), relativa a (0,0) do node -- mesmo papel que NodeSize.bounds */
  bounds: Rect;
  card: IconCardGeometry;
}

const BASELINE_RATIO = 0.78;

/** Calcula a geometria completa do card-com-icone (usado quando node.icon esta resolvido). */
export function computeIconCard(node: NodeModel, locale: 'pt-BR' | 'en'): IconCardResult {
  const caption = nodeTypeLabel(locale, node.type).toUpperCase();

  const labelWidth = measureText(node.label, TEXT.label.size, TEXT.label.weight);
  const techWidth = node.tech ? measureText(node.tech, TEXT.tech.size, TEXT.tech.weight) : 0;
  const captionWidth = measureText(caption, TEXT.caption.size, TEXT.caption.weight);
  const slugWidth = node.slug ? measureText(node.slug, TEXT.slug.size, TEXT.slug.weight) : 0;
  const tagWidth = node.badge ? measureText(node.badge, TEXT.tag.size, TEXT.tag.weight) + TEXT.tag.padX * 2 : 0;

  const naturalTextW = Math.max(labelWidth, techWidth, captionWidth, slugWidth, tagWidth);
  const textW = clamp(naturalTextW, ICON_CARD.textWMin, ICON_CARD.textWMax);

  const labelWrap = wrapText(node.label, textW, TEXT.label.size, TEXT.label.weight, ICON_CARD.labelMaxLines);
  const techWrap = node.tech ? wrapText(node.tech, textW, TEXT.tech.size, TEXT.tech.weight, TEXT.tech.maxLines) : { lines: [] };
  const slugWrap = node.slug ? wrapText(node.slug, textW, TEXT.slug.size, TEXT.slug.weight, TEXT.slug.maxLines) : { lines: [] };

  const captionLH = lineHeight(TEXT.caption.size);
  const labelLH = lineHeight(TEXT.label.size);
  const slugLH = lineHeight(TEXT.slug.size);
  const techLH = lineHeight(TEXT.tech.size);
  const tagH = tagWidth > 0 ? TEXT.tag.height : 0;

  const gapCaptionLabel = 2;
  const gapLabelSlug = slugWrap.lines.length > 0 ? 2 : 0;
  const gapToTech = techWrap.lines.length > 0 ? 4 : 0;
  const gapToTag = tagH > 0 ? 6 : 0;

  const stackH =
    captionLH + gapCaptionLabel + labelWrap.lines.length * labelLH + gapLabelSlug + slugWrap.lines.length * slugLH + gapToTech + techWrap.lines.length * techLH + gapToTag + tagH;

  const topRowH = Math.max(ICON_CARD.tile, stackH);

  const rawW = ICON_CARD.padX + ICON_CARD.tile + ICON_CARD.gapTileText + textW + ICON_CARD.padX;
  const w = ceil8(rawW);

  const innerW = w - ICON_CARD.padX * 2;
  const subtitleWrap = node.subtitle ? wrapText(node.subtitle, innerW, TEXT.subtitle.size, TEXT.subtitle.weight, ICON_CARD.subtitleMaxLines) : { lines: [] };
  const subtitleLH = lineHeight(TEXT.subtitle.size);
  const subtitleBlockH = subtitleWrap.lines.length > 0 ? ICON_CARD.dividerGap + 1 + ICON_CARD.dividerGap + subtitleWrap.lines.length * subtitleLH : 0;

  const rawH = ICON_CARD.padY + topRowH + subtitleBlockH + ICON_CARD.padY;
  const h = ceil8(Math.max(rawH, ICON_CARD.minHeight));
  const topPad = ICON_CARD.padY + (h - rawH) / 2;

  const tileY = topPad + (topRowH - ICON_CARD.tile) / 2;
  const tile: Rect = { x: ICON_CARD.padX, y: tileY, w: ICON_CARD.tile, h: ICON_CARD.tile };
  const iconInset = (ICON_CARD.tile - ICON_CARD.icon) / 2;
  const iconBox: Rect = { x: tile.x + iconInset, y: tile.y + iconInset, w: ICON_CARD.icon, h: ICON_CARD.icon };

  const textX = ICON_CARD.padX + ICON_CARD.tile + ICON_CARD.gapTileText;
  const stackY = topPad + (topRowH - stackH) / 2;

  const lines: IconCardLine[] = [];
  let cursorY = stackY;

  cursorY += captionLH * BASELINE_RATIO;
  lines.push({ text: caption, x: textX, y: cursorY, role: 'caption' });
  cursorY += captionLH * (1 - BASELINE_RATIO) + gapCaptionLabel;

  for (const line of labelWrap.lines) {
    cursorY += labelLH * BASELINE_RATIO;
    lines.push({ text: line, x: textX, y: cursorY, role: 'label' });
    cursorY += labelLH * (1 - BASELINE_RATIO);
  }

  if (slugWrap.lines.length > 0) cursorY += gapLabelSlug;
  for (const line of slugWrap.lines) {
    cursorY += slugLH * BASELINE_RATIO;
    lines.push({ text: line, x: textX, y: cursorY, role: 'slug' });
    cursorY += slugLH * (1 - BASELINE_RATIO);
  }

  if (techWrap.lines.length > 0) cursorY += gapToTech;
  for (const line of techWrap.lines) {
    cursorY += techLH * BASELINE_RATIO;
    lines.push({ text: line, x: textX, y: cursorY, role: 'tech' });
    cursorY += techLH * (1 - BASELINE_RATIO);
  }

  let tag: IconCardGeometry['tag'];
  if (tagH > 0 && node.badge) {
    cursorY += gapToTag;
    tag = { rect: { x: textX, y: cursorY, w: tagWidth, h: tagH }, text: node.badge };
    cursorY += tagH;
  }

  let divider: IconCardGeometry['divider'];
  if (subtitleWrap.lines.length > 0) {
    const dividerY = topPad + topRowH + ICON_CARD.dividerGap;
    divider = { x1: ICON_CARD.padX, x2: w - ICON_CARD.padX, y: dividerY };
    let subY = dividerY + 1 + ICON_CARD.dividerGap;
    for (const line of subtitleWrap.lines) {
      subY += subtitleLH * BASELINE_RATIO;
      lines.push({ text: line, x: ICON_CARD.padX, y: subY, role: 'subtitle' });
      subY += subtitleLH * (1 - BASELINE_RATIO);
    }
  }

  const hasBadge = STATUS_STYLE[node.status].showBadge;
  const badgeExtra = hasBadge ? LAYOUT_CONST.badgeHeight - LAYOUT_CONST.badgeOffsetFromCorner + 2 : 0;
  const bounds: Rect = { x: 0, y: -badgeExtra, w, h: h + badgeExtra };

  return { w, h, bounds, card: { tile, iconBox, lines, tag, divider } };
}

export function iconViewBox(iconKey: string): { x: number; y: number; w: number; h: number } {
  const def = getIcon(iconKey);
  return { x: def.left, y: def.top, w: def.width, h: def.height };
}

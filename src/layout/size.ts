import type { NodeModel } from '../schema/model.js';
import { getShape } from '../shapes/registry.js';
import type { Rect } from '../shapes/types.js';
import { nodeTypeLabel } from '../theme/i18n.js';
import { LAYOUT_CONST, STATUS_STYLE, TEXT } from '../theme/theme.js';
import { measureText, wrapText } from '../text/measure.js';
import { computeIconCard, type IconCardGeometry } from './icon-card.js';
import { ceil8, clamp } from './util.js';

export interface NodeSize {
  w: number;
  h: number;
  /** caixa expandida (ex: espaco para o badge de status), relativa a (0,0) do node */
  bounds: Rect;
  caption: string;
  labelLines: string[];
  techLines: string[];
  slugLines: string[];
  subtitleLines: string[];
  /** largura da pilula do badge livre (node.badge), ja com padding; 0 se nao houver badge */
  tagWidth: number;
  /** presente quando node.icon esta resolvido -- nesse caso o card e desenhado a partir daqui, nao dos campos de linha acima */
  card?: IconCardGeometry;
}

export function lineHeight(size: number): number {
  return Math.round(size * 1.35);
}

/** No modo forma (sem icone), o subtitle tem menos espaco disponivel que no card com icone. */
const SHAPE_SUBTITLE_MAX_LINES = 2;

export function computeNodeSize(node: NodeModel, locale: 'pt-BR' | 'en'): NodeSize {
  if (node.icon) {
    const result = computeIconCard(node, locale);
    return {
      w: result.w,
      h: result.h,
      bounds: result.bounds,
      caption: '',
      labelLines: [],
      techLines: [],
      slugLines: [],
      subtitleLines: [],
      tagWidth: 0,
      card: result.card,
    };
  }

  const shape = getShape(node.type);
  const caption = nodeTypeLabel(locale, node.type).toUpperCase();

  const labelWidth = measureText(node.label, TEXT.label.size, TEXT.label.weight);
  const techWidth = node.tech ? measureText(node.tech, TEXT.tech.size, TEXT.tech.weight) : 0;
  const captionWidth = measureText(caption, TEXT.caption.size, TEXT.caption.weight);
  const slugWidth = node.slug ? measureText(node.slug, TEXT.slug.size, TEXT.slug.weight) : 0;
  const subtitleWidth = node.subtitle ? measureText(node.subtitle, TEXT.subtitle.size, TEXT.subtitle.weight) : 0;
  const tagWidth = node.badge ? measureText(node.badge, TEXT.tag.size, TEXT.tag.weight) + TEXT.tag.padX * 2 : 0;
  const naturalWidth = Math.max(labelWidth, techWidth, captionWidth, slugWidth, subtitleWidth, tagWidth);
  const contentW = clamp(naturalWidth, LAYOUT_CONST.nodeContentWidthMin, LAYOUT_CONST.nodeContentWidthMax);

  const labelWrap = wrapText(node.label, contentW, TEXT.label.size, TEXT.label.weight, TEXT.label.maxLines);
  const techWrap = node.tech ? wrapText(node.tech, contentW, TEXT.tech.size, TEXT.tech.weight, TEXT.tech.maxLines) : { lines: [] };
  const slugWrap = node.slug ? wrapText(node.slug, contentW, TEXT.slug.size, TEXT.slug.weight, TEXT.slug.maxLines) : { lines: [] };
  const subtitleWrap = node.subtitle ? wrapText(node.subtitle, contentW, TEXT.subtitle.size, TEXT.subtitle.weight, SHAPE_SUBTITLE_MAX_LINES) : { lines: [] };

  const captionH = lineHeight(TEXT.caption.size);
  const labelH = labelWrap.lines.length * lineHeight(TEXT.label.size);
  const slugH = slugWrap.lines.length * lineHeight(TEXT.slug.size);
  const techH = techWrap.lines.length * lineHeight(TEXT.tech.size);
  const tagH = tagWidth > 0 ? TEXT.tag.height : 0;
  const subtitleH = subtitleWrap.lines.length * lineHeight(TEXT.subtitle.size);

  const gapCaptionLabel = 2;
  const gapLabelSlug = slugH > 0 ? 2 : 0;
  const gapToTech = techH > 0 ? 4 : 0;
  const gapToTag = tagH > 0 ? 6 : 0;
  const gapToSubtitle = subtitleH > 0 ? 6 : 0;
  const contentH = captionH + gapCaptionLabel + labelH + gapLabelSlug + slugH + gapToTech + techH + gapToTag + tagH + gapToSubtitle + subtitleH;

  const outer = shape.outerSize(contentW, contentH);
  const w = ceil8(Math.max(outer.w, LAYOUT_CONST.nodeContentWidthMin));
  const h = ceil8(Math.max(outer.h, LAYOUT_CONST.nodeMinHeight));

  const hasBadge = STATUS_STYLE[node.status].showBadge;
  const badgeExtra = hasBadge ? LAYOUT_CONST.badgeHeight - LAYOUT_CONST.badgeOffsetFromCorner + 2 : 0;
  const bounds: Rect = { x: 0, y: -badgeExtra, w, h: h + badgeExtra };

  return {
    w,
    h,
    bounds,
    caption,
    labelLines: labelWrap.lines,
    techLines: techWrap.lines,
    slugLines: slugWrap.lines,
    subtitleLines: subtitleWrap.lines,
    tagWidth,
  };
}

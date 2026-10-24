import { lineHeight } from '../layout/size.js';
import type { IconCardLine } from '../layout/icon-card.js';
import type { NodeLayout } from '../layout/layout.js';
import { getShape } from '../shapes/registry.js';
import { iconCardShape } from '../shapes/card.js';
import type { Rect } from '../shapes/types.js';
import { measureText } from '../text/measure.js';
import { statusBadge } from '../theme/i18n.js';
import { FONT_FAMILY_REGULAR, FONT_FAMILY_SEMIBOLD, ICON_CARD, LAYOUT_CONST, STATUS_STYLE, TEXT, type StatusStyle } from '../theme/theme.js';
import { renderIcon } from './icon.js';
import { el, esc } from './svg.js';

const BASELINE_RATIO = 0.78;

interface PillSpec {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  textColor: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
}

/** Pilula generica (usada tanto pelo badge de status quanto pelo badge livre/"tag"). */
export function renderPill(p: PillSpec): string {
  const rect = el('rect', {
    x: p.x,
    y: p.y,
    width: p.width,
    height: p.height,
    rx: p.height / 2,
    ry: p.height / 2,
    fill: p.fill,
    stroke: p.stroke,
    'stroke-width': p.strokeWidth,
  });
  const label = el(
    'text',
    {
      x: p.x + p.width / 2,
      y: p.y + p.height / 2 + 3.5,
      'text-anchor': 'middle',
      'font-size': p.fontSize,
      'font-weight': p.fontWeight,
      'font-family': p.fontFamily,
      fill: p.textColor,
    },
    esc(p.text),
  );
  return rect + label;
}

function renderNodeText(node: NodeLayout, box: Rect): string {
  const style = STATUS_STYLE[node.status];
  const captionLH = lineHeight(TEXT.caption.size);
  const labelLH = lineHeight(TEXT.label.size);
  const slugLH = lineHeight(TEXT.slug.size);
  const techLH = lineHeight(TEXT.tech.size);
  const subtitleLH = lineHeight(TEXT.subtitle.size);
  const tagH = node.tagWidth > 0 ? TEXT.tag.height : 0;

  const gapCaptionLabel = 2;
  const gapLabelSlug = node.slugLines.length > 0 ? 2 : 0;
  const gapToTech = node.techLines.length > 0 ? 4 : 0;
  const gapToTag = tagH > 0 ? 6 : 0;
  const gapToSubtitle = node.subtitleLines.length > 0 ? 6 : 0;

  const totalH =
    captionLH +
    gapCaptionLabel +
    node.labelLines.length * labelLH +
    gapLabelSlug +
    node.slugLines.length * slugLH +
    gapToTech +
    node.techLines.length * techLH +
    gapToTag +
    tagH +
    gapToSubtitle +
    node.subtitleLines.length * subtitleLH;

  const cx = box.x + box.w / 2;
  let cursorY = box.y + (box.h - totalH) / 2;
  let out = '';

  cursorY += captionLH * BASELINE_RATIO;
  out += el(
    'text',
    {
      x: cx,
      y: cursorY,
      'text-anchor': 'middle',
      'font-size': TEXT.caption.size,
      'font-weight': TEXT.caption.weight,
      'font-family': FONT_FAMILY_SEMIBOLD,
      'letter-spacing': TEXT.caption.letterSpacing,
      fill: TEXT.caption.color,
    },
    esc(node.caption),
  );
  cursorY += captionLH * (1 - BASELINE_RATIO) + gapCaptionLabel;

  for (const line of node.labelLines) {
    cursorY += labelLH * BASELINE_RATIO;
    out += el(
      'text',
      {
        x: cx,
        y: cursorY,
        'text-anchor': 'middle',
        'font-size': TEXT.label.size,
        'font-weight': TEXT.label.weight,
        'font-family': FONT_FAMILY_SEMIBOLD,
        fill: style.labelColor,
      },
      esc(line),
    );
    cursorY += labelLH * (1 - BASELINE_RATIO);
  }

  if (node.slugLines.length > 0) cursorY += gapLabelSlug;
  for (const line of node.slugLines) {
    cursorY += slugLH * BASELINE_RATIO;
    out += el(
      'text',
      { x: cx, y: cursorY, 'text-anchor': 'middle', 'font-size': TEXT.slug.size, 'font-weight': TEXT.slug.weight, 'font-family': FONT_FAMILY_REGULAR, fill: TEXT.slug.color },
      esc(line),
    );
    cursorY += slugLH * (1 - BASELINE_RATIO);
  }

  if (node.techLines.length > 0) cursorY += gapToTech;
  for (const line of node.techLines) {
    cursorY += techLH * BASELINE_RATIO;
    out += el(
      'text',
      {
        x: cx,
        y: cursorY,
        'text-anchor': 'middle',
        'font-size': TEXT.tech.size,
        'font-weight': TEXT.tech.weight,
        'font-family': FONT_FAMILY_REGULAR,
        fill: style.techColor,
      },
      esc(line),
    );
    cursorY += techLH * (1 - BASELINE_RATIO);
  }

  if (tagH > 0 && node.badgeText) {
    cursorY += gapToTag;
    out += renderPill({
      x: cx - node.tagWidth / 2,
      y: cursorY,
      width: node.tagWidth,
      height: tagH,
      text: node.badgeText,
      fill: TEXT.tag.bg,
      stroke: TEXT.tag.stroke,
      strokeWidth: 1,
      textColor: TEXT.tag.text,
      fontSize: TEXT.tag.size,
      fontWeight: TEXT.tag.weight,
      fontFamily: FONT_FAMILY_SEMIBOLD,
    });
    cursorY += tagH;
  }

  if (node.subtitleLines.length > 0) cursorY += gapToSubtitle;
  for (const line of node.subtitleLines) {
    cursorY += subtitleLH * BASELINE_RATIO;
    out += el(
      'text',
      { x: cx, y: cursorY, 'text-anchor': 'middle', 'font-size': TEXT.subtitle.size, 'font-weight': TEXT.subtitle.weight, 'font-family': FONT_FAMILY_REGULAR, fill: TEXT.subtitle.color },
      esc(line),
    );
    cursorY += subtitleLH * (1 - BASELINE_RATIO);
  }

  return out;
}

function renderStatusBadge(w: number, node: NodeLayout, locale: 'pt-BR' | 'en'): string {
  const style = STATUS_STYLE[node.status];
  if (!style.showBadge) return '';
  const text = statusBadge(locale, node.status);
  const textW = measureText(text, TEXT.badge.size, TEXT.badge.weight);
  const paddingX = 6;
  const badgeW = textW + paddingX * 2;
  const badgeH = LAYOUT_CONST.badgeHeight;
  const x = w - LAYOUT_CONST.badgeOffsetFromCorner - badgeW;
  const y = -badgeH / 2;
  return renderPill({
    x,
    y,
    width: badgeW,
    height: badgeH,
    text,
    fill: style.badgeBg,
    textColor: style.badgeText,
    fontSize: TEXT.badge.size,
    fontWeight: TEXT.badge.weight,
    fontFamily: FONT_FAMILY_SEMIBOLD,
  });
}

interface LineStyle {
  size: number;
  weight: number;
  family: string;
  fill: string;
  letterSpacing?: number;
}

function lineStyleFor(role: IconCardLine['role'], statusStyle: StatusStyle): LineStyle {
  switch (role) {
    case 'caption':
      return { size: TEXT.caption.size, weight: TEXT.caption.weight, family: FONT_FAMILY_SEMIBOLD, fill: TEXT.caption.color, letterSpacing: TEXT.caption.letterSpacing };
    case 'label':
      return { size: TEXT.label.size, weight: TEXT.label.weight, family: FONT_FAMILY_SEMIBOLD, fill: statusStyle.labelColor };
    case 'slug':
      return { size: TEXT.slug.size, weight: TEXT.slug.weight, family: FONT_FAMILY_REGULAR, fill: TEXT.slug.color };
    case 'tech':
      return { size: TEXT.tech.size, weight: TEXT.tech.weight, family: FONT_FAMILY_REGULAR, fill: statusStyle.techColor };
    case 'subtitle':
      return { size: TEXT.subtitle.size, weight: TEXT.subtitle.weight, family: FONT_FAMILY_REGULAR, fill: TEXT.subtitle.color };
  }
}

function renderIconCardContent(node: NodeLayout, shapeStyle: { stroke: string; strokeWidth: number; dash?: string; fill: string }): string {
  const card = node.card!;
  const style = STATUS_STYLE[node.status];

  const body = iconCardShape.render(node.w, node.h, shapeStyle);
  const tile = el('rect', {
    x: card.tile.x,
    y: card.tile.y,
    width: card.tile.w,
    height: card.tile.h,
    rx: ICON_CARD.tileRadius,
    ry: ICON_CARD.tileRadius,
    fill: ICON_CARD.tileFill,
    stroke: ICON_CARD.tileStroke,
    'stroke-width': 1,
  });
  const icon = renderIcon(node.icon!, card.iconBox, node.id);

  let text = '';
  for (const line of card.lines) {
    const ls = lineStyleFor(line.role, style);
    text += el(
      'text',
      {
        x: line.x,
        y: line.y,
        'text-anchor': 'start',
        'font-size': ls.size,
        'font-weight': ls.weight,
        'font-family': ls.family,
        'letter-spacing': ls.letterSpacing,
        fill: ls.fill,
      },
      esc(line.text),
    );
  }

  const tag = card.tag
    ? renderPill({
        x: card.tag.rect.x,
        y: card.tag.rect.y,
        width: card.tag.rect.w,
        height: card.tag.rect.h,
        text: card.tag.text,
        fill: TEXT.tag.bg,
        stroke: TEXT.tag.stroke,
        strokeWidth: 1,
        textColor: TEXT.tag.text,
        fontSize: TEXT.tag.size,
        fontWeight: TEXT.tag.weight,
        fontFamily: FONT_FAMILY_SEMIBOLD,
      })
    : '';

  const divider = card.divider
    ? el('line', { x1: card.divider.x1, y1: card.divider.y, x2: card.divider.x2, y2: card.divider.y, stroke: ICON_CARD.dividerColor, 'stroke-width': 1 })
    : '';

  return body + tile + icon + text + tag + divider;
}

function renderShapeContent(node: NodeLayout, shapeStyle: { stroke: string; strokeWidth: number; dash?: string; fill: string }): string {
  const shape = getShape(node.type);
  const box = shape.contentBox(node.w, node.h);
  return shape.render(node.w, node.h, shapeStyle) + renderNodeText(node, box);
}

export function renderNode(node: NodeLayout, locale: 'pt-BR' | 'en'): string {
  const style = STATUS_STYLE[node.status];
  const shapeStyle = { stroke: style.stroke, strokeWidth: style.strokeWidth, dash: style.dash, fill: style.fill };
  const badge = renderStatusBadge(node.w, node, locale);
  const title = node.description ? el('title', {}, esc(node.description)) : '';
  const content = node.icon && node.card ? renderIconCardContent(node, shapeStyle) : renderShapeContent(node, shapeStyle);

  return el(
    'g',
    { transform: `translate(${node.x},${node.y})`, 'data-id': node.id, 'data-type': node.type, 'data-status': node.status, 'data-icon': node.icon },
    title + content + badge,
  );
}

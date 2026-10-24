import type { GroupLayout } from '../layout/layout.js';
import { FONT_FAMILY_SEMIBOLD, GROUP_STYLE, TEXT } from '../theme/theme.js';
import { el, esc } from './svg.js';

export function renderGroup(group: GroupLayout): string {
  const fillIndex = Math.min(group.depth - 1, GROUP_STYLE.fillByDepth.length - 1);
  const fill = GROUP_STYLE.fillByDepth[Math.max(0, fillIndex)];
  const dash = group.kind === 'environment' ? GROUP_STYLE.environmentDash : undefined;

  const rect = el('rect', {
    x: group.x,
    y: group.y,
    width: group.w,
    height: group.h,
    rx: 6,
    ry: 6,
    fill,
    stroke: GROUP_STYLE.stroke,
    'stroke-width': GROUP_STYLE.strokeWidth,
    'stroke-dasharray': dash,
  });

  const titleY = group.y + GROUP_STYLE.titleBarHeight / 2 + 4;
  const title = el(
    'text',
    {
      x: group.x + 12,
      y: titleY,
      'font-size': TEXT.groupTitle.size,
      'font-weight': TEXT.groupTitle.weight,
      'font-family': FONT_FAMILY_SEMIBOLD,
      'letter-spacing': TEXT.groupTitle.letterSpacing,
      fill: TEXT.groupTitle.color,
    },
    esc(group.label.toUpperCase()),
  );

  return el('g', { 'data-group-id': group.id }, rect + title);
}

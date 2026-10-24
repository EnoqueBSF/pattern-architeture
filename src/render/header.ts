import { lineHeight } from '../layout/size.js';
import { CANVAS, FONT_FAMILY_REGULAR, FONT_FAMILY_SEMIBOLD, TEXT } from '../theme/theme.js';
import { el, esc } from './svg.js';

export interface HeaderResult {
  svg: string;
  height: number;
}

export function renderHeader(title: string, description: string | undefined, _width: number): HeaderResult {
  const titleLH = lineHeight(TEXT.title.size);
  const descLH = description ? lineHeight(TEXT.description.size) : 0;
  const gap = description ? 6 : 0;
  const height = titleLH + gap + descLH;

  let out = el(
    'text',
    { x: 0, y: titleLH * 0.78, 'font-size': TEXT.title.size, 'font-weight': TEXT.title.weight, 'font-family': FONT_FAMILY_SEMIBOLD, fill: CANVAS.titleColor },
    esc(title),
  );
  if (description) {
    out += el(
      'text',
      {
        x: 0,
        y: titleLH + gap + descLH * 0.78,
        'font-size': TEXT.description.size,
        'font-weight': TEXT.description.weight,
        'font-family': FONT_FAMILY_REGULAR,
        fill: CANVAS.descriptionColor,
      },
      esc(description),
    );
  }

  return { svg: out, height };
}

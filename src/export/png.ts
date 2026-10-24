import { Resvg } from '@resvg/resvg-js';
import { FONT_PATH_REGULAR, FONT_PATH_SEMIBOLD } from '../text/fonts.js';

const MAX_PIXELS = 8000;

/** Rasteriza um SVG para PNG com a fonte Inter explicita (determinista, sem depender de fontconfig do sistema). */
export function toPng(svg: string, scale = 2): Buffer {
  const widthMatch = svg.match(/width="([0-9.]+)"/);
  const logicalWidth = widthMatch ? Number(widthMatch[1]) : 1024;
  const effectiveScale = logicalWidth * scale > MAX_PIXELS ? MAX_PIXELS / logicalWidth : scale;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: effectiveScale },
    background: '#FFFFFF',
    font: {
      loadSystemFonts: false,
      fontFiles: [FONT_PATH_REGULAR, FONT_PATH_SEMIBOLD],
      defaultFontFamily: 'Inter',
    },
  });

  return resvg.render().asPng();
}

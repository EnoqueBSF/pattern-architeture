import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { Font } from 'opentype.js';

const require = createRequire(import.meta.url);
// opentype.js 1.x e CJS/UMD; carregar via createRequire evita o interop ESM instavel.
const opentype = require('opentype.js') as typeof import('opentype.js');

export const FONT_PATH_REGULAR = fileURLToPath(
  new URL('../../node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf', import.meta.url),
);
export const FONT_PATH_SEMIBOLD = fileURLToPath(
  new URL('../../node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf', import.meta.url),
);

let regular: Font | undefined;
let semibold: Font | undefined;

export function loadFont(weight: 400 | 600): Font {
  if (weight === 600) {
    semibold ??= opentype.loadSync(FONT_PATH_SEMIBOLD);
    return semibold;
  }
  regular ??= opentype.loadSync(FONT_PATH_REGULAR);
  return regular;
}

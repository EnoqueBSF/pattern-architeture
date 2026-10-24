import { loadFont } from './fonts.js';

const WORD_SEPARATORS = /(?<=[/\-·_.])/;
const widthCache = new Map<string, number>();

/** Largura real (px) do texto na fonte Inter, com pequena margem de seguranca. */
export function measureText(text: string, size: number, weight: 400 | 600): number {
  if (text.length === 0) return 0;
  const key = `${weight}:${size}:${text}`;
  const cached = widthCache.get(key);
  if (cached !== undefined) return cached;

  const font = loadFont(weight);
  const raw = font.getAdvanceWidth(text, size, { kerning: true });
  const width = Math.ceil(raw * 1.02 + 1);
  widthCache.set(key, width);
  return width;
}

function breakByChars(word: string, maxWidth: number, size: number, weight: 400 | 600): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const ch of word) {
    const candidate = current + ch;
    if (current === '' || measureText(candidate, size, weight) <= maxWidth) {
      current = candidate;
    } else {
      pieces.push(current);
      current = ch;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function splitWord(word: string, maxWidth: number, size: number, weight: 400 | 600): string[] {
  if (measureText(word, size, weight) <= maxWidth) return [word];

  const parts = word.split(WORD_SEPARATORS).filter((p) => p.length > 0);
  if (parts.length <= 1) return breakByChars(word, maxWidth, size, weight);

  const pieces: string[] = [];
  let current = '';
  for (const part of parts) {
    const candidate = current + part;
    if (current === '' || measureText(candidate, size, weight) <= maxWidth) {
      current = candidate;
    } else {
      pieces.push(current);
      current = part;
    }
  }
  if (current) pieces.push(current);

  return pieces.flatMap((p) => (measureText(p, size, weight) <= maxWidth ? [p] : breakByChars(p, maxWidth, size, weight)));
}

export interface WrapResult {
  lines: string[];
  /** true quando o texto excedeu maxLines e a ultima linha foi cortada com "..." */
  truncated: boolean;
}

/**
 * Quebra texto em linhas que cabem em maxWidth, usando quebra por palavra e,
 * quando a palavra sozinha excede maxWidth, por separador (/, -, middot, _, .)
 * e por fim por caractere. Nunca devolve uma linha mais larga que maxWidth.
 */
export function wrapText(text: string, maxWidth: number, size: number, weight: 400 | 600, maxLines: number): WrapResult {
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);

  type Unit = { text: string; spaceBefore: boolean };
  const units: Unit[] = [];
  words.forEach((word, wordIndex) => {
    const pieces = splitWord(word, maxWidth, size, weight);
    pieces.forEach((piece, pieceIndex) => {
      units.push({ text: piece, spaceBefore: pieceIndex === 0 && wordIndex > 0 });
    });
  });

  const lines: string[] = [];
  let current = '';
  for (const unit of units) {
    const sep = unit.spaceBefore && current.length > 0 ? ' ' : '';
    const candidate = current + sep + unit.text;
    if (current === '' || measureText(candidate, size, weight) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = unit.text;
    }
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) {
    return { lines, truncated: false };
  }

  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1] ?? '';
  while (last.length > 0 && measureText(last + '…', size, weight) > maxWidth) {
    last = last.slice(0, -1);
  }
  kept[maxLines - 1] = last + '…';
  return { lines: kept, truncated: true };
}

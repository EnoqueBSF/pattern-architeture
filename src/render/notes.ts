import type { ConnectionNote } from '../route/labels.js';
import { lineHeight } from '../layout/size.js';
import { FONT_FAMILY_REGULAR, FONT_FAMILY_SEMIBOLD, TEXT } from '../theme/theme.js';
import { el, esc } from './svg.js';

export interface NotesResult {
  svg: string;
  height: number;
}

export function renderNotes(notes: ConnectionNote[], locale: 'pt-BR' | 'en'): NotesResult {
  if (notes.length === 0) return { svg: '', height: 0 };

  const title = locale === 'en' ? 'CONNECTION NOTES' : 'NOTAS DE CONEXAO';
  const lh = lineHeight(TEXT.note.size);
  let out = el('text', { x: 0, y: 10, 'font-size': 10, 'font-weight': 600, 'font-family': FONT_FAMILY_SEMIBOLD, 'letter-spacing': 0.4, fill: '#94A3B8' }, esc(title));

  let y = 18 + lh * 0.78;
  for (const note of notes) {
    out += el('text', { x: 0, y, 'font-size': TEXT.note.size, 'font-weight': TEXT.note.weight, 'font-family': FONT_FAMILY_REGULAR, fill: TEXT.note.color }, esc(note.text));
    y += lh;
  }

  return { svg: out, height: 18 + notes.length * lh };
}

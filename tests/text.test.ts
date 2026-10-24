import { describe, expect, it } from 'vitest';
import { measureText, wrapText } from '../src/text/measure.js';

describe('measureText', () => {
  it('mede uma label curta tipica entre 60 e 90px em 14/600', () => {
    const width = measureText('intera-bff', 14, 600);
    expect(width).toBeGreaterThanOrEqual(60);
    expect(width).toBeLessThanOrEqual(90);
  });

  it('cresce com o tamanho da fonte', () => {
    const small = measureText('servico', 12, 400);
    const big = measureText('servico', 24, 400);
    expect(big).toBeGreaterThan(small * 1.5);
  });

  it('mede caracteres acentuados sem lancar erro', () => {
    const width = measureText('Notificacao - Sessao Autenticacao', 14, 600);
    expect(width).toBeGreaterThan(0);
  });

  it('texto vazio tem largura zero', () => {
    expect(measureText('', 14, 600)).toBe(0);
  });
});

describe('wrapText', () => {
  it('nao quebra texto que ja cabe', () => {
    const { lines, truncated } = wrapText('intera-bff', 200, 14, 600, 3);
    expect(lines).toEqual(['intera-bff']);
    expect(truncated).toBe(false);
  });

  it('quebra por palavra e nenhuma linha excede maxWidth', () => {
    const maxWidth = 120;
    const { lines } = wrapText('Servico de Notificacao Transacional Por Email', maxWidth, 14, 600, 10);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measureText(line, 14, 600)).toBeLessThanOrEqual(maxWidth);
    }
  });

  it('quebra uma palavra sem espacos maior que maxWidth usando separadores ou caractere', () => {
    const maxWidth = 80;
    const longWord = 'notificacao-transacional-assincrona-via-fila-de-eventos-internos';
    const { lines } = wrapText(longWord, maxWidth, 14, 600, 20);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measureText(line, 14, 600)).toBeLessThanOrEqual(maxWidth);
    }
    // concatenado (sem espacos extras) reconstroi a palavra original
    expect(lines.join('')).toBe(longWord);
  });

  it('trunca com reticencias quando excede maxLines', () => {
    const maxWidth = 100;
    const { lines, truncated } = wrapText(
      'Um texto bem longo que certamente precisa de muitas linhas para caber inteiro aqui',
      maxWidth,
      14,
      600,
      2,
    );
    expect(truncated).toBe(true);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.endsWith('…')).toBe(true);
    expect(measureText(lines[1]!, 14, 600)).toBeLessThanOrEqual(maxWidth);
  });
});

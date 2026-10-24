import { describe, expect, it } from 'vitest';
import { NODE_TYPES } from '../src/schema/enums.js';
import { pointInPolygon } from '../src/shapes/geometry.js';
import { iconCardShape } from '../src/shapes/card.js';
import { getShape } from '../src/shapes/registry.js';
import type { Rect, Shape } from '../src/shapes/types.js';

const SIZES: [number, number][] = [
  [160, 64],
  [216, 96],
  [240, 128],
];

const STYLE = { stroke: '#15803D', strokeWidth: 2.5, fill: '#DCFCE7' };

function corners(box: Rect) {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ];
}

const EXTRA_SHAPES: [string, Shape][] = [['icon-card', iconCardShape]];

describe.each([...NODE_TYPES.map((t): [string, Shape] => [t, getShape(t)]), ...EXTRA_SHAPES])('forma: %s', (type, shape) => {
  it.each(SIZES)('contentBox fica dentro do outline em %ix%i', (w, h) => {
    const box = shape.contentBox(w, h);
    const outline = shape.outline(w, h);
    // margem de 0.5px para dentro, para nao falhar por ponto exatamente na borda (chanfros/pontas)
    const shrunk: Rect = { x: box.x + 0.5, y: box.y + 0.5, w: Math.max(0, box.w - 1), h: Math.max(0, box.h - 1) };
    for (const corner of corners(shrunk)) {
      expect(pointInPolygon(corner, outline), `${type} ${w}x${h} canto (${corner.x},${corner.y}) fora do outline`).toBe(true);
    }
  });

  it.each(SIZES)('render devolve fragmento XML bem formado em %ix%i', (w, h) => {
    const svg = shape.render(w, h, STYLE);
    expect(svg.length).toBeGreaterThan(0);
    // bem formado: toda tag aberta (nao auto-fechada) tem seu par de fechamento
    // (checagem simples por contagem, nao um parser XML completo)
    const selfClosing = svg.match(/<[a-zA-Z]+[^>]*\/>/g) ?? [];
    const withoutSelfClosing = svg.replace(/<[a-zA-Z]+[^>]*\/>/g, '');
    const opens = withoutSelfClosing.match(/<[a-zA-Z]+[^>]*>/g) ?? [];
    const closes = withoutSelfClosing.match(/<\/[a-zA-Z]+>/g) ?? [];
    expect(selfClosing.length).toBeGreaterThan(0);
    expect(opens.length).toBe(closes.length);
  });

  it('outerSize(contentBox) >= conteudo pedido', () => {
    const [cw, ch] = [100, 40];
    const { w, h } = shape.outerSize(cw, ch);
    const box = shape.contentBox(w, h);
    expect(box.w).toBeGreaterThanOrEqual(cw - 0.01);
    expect(box.h).toBeGreaterThanOrEqual(ch - 0.01);
  });
});

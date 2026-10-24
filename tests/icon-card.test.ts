import { describe, expect, it } from 'vitest';
import { computeIconCard } from '../src/layout/icon-card.js';
import type { NodeModel } from '../src/schema/model.js';
import { measureText } from '../src/text/measure.js';
import { LAYOUT_CONST } from '../src/theme/theme.js';

let seq = 0;
function makeNode(overrides: Partial<NodeModel>): NodeModel {
  seq++;
  return {
    id: `n${seq}`,
    label: `Node ${seq}`,
    type: 'microservice',
    status: 'unchanged',
    icon: 'nodejs',
    declIndex: seq,
    ...overrides,
  };
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const CASES: [string, Partial<NodeModel>][] = [
  ['so icone e label', {}],
  ['com tech', { tech: 'Node.js 22 · NestJS' }],
  ['com slug', { slug: 'aws-bmg-apoio-operacoes-consumer-service' }],
  ['com badge', { badge: '100% Pronto' }],
  ['com subtitle', { subtitle: 'Interface para comunicacao com a dataprev, usada pelo orquestrador' }],
  ['tudo junto, status new', { tech: 'Node.js 22 · NestJS', slug: 'aws-bmg-checkout-service', badge: '100% Pronto', subtitle: 'Orquestra o fluxo de pagamento do checkout', status: 'new' }],
  ['label longo', { label: 'Um nome de servico bastante longo para testar a quebra de linha do label' }],
];

describe.each(CASES)('computeIconCard: %s', (_desc, overrides) => {
  const node = makeNode(overrides);
  const locale = 'pt-BR' as const;
  const { w, h, bounds, card } = computeIconCard(node, locale);

  it('w e h sao multiplos de 8 e h >= minHeight', () => {
    expect(w % 8).toBe(0);
    expect(h % 8).toBe(0);
    expect(h).toBeGreaterThanOrEqual(72);
  });

  it('tile fica dentro do node', () => {
    expect(card.tile.x).toBeGreaterThanOrEqual(0);
    expect(card.tile.y).toBeGreaterThanOrEqual(0);
    expect(card.tile.x + card.tile.w).toBeLessThanOrEqual(w);
    expect(card.tile.y + card.tile.h).toBeLessThanOrEqual(h);
  });

  it('iconBox fica dentro do tile', () => {
    expect(card.iconBox.x).toBeGreaterThanOrEqual(card.tile.x);
    expect(card.iconBox.y).toBeGreaterThanOrEqual(card.tile.y);
    expect(card.iconBox.x + card.iconBox.w).toBeLessThanOrEqual(card.tile.x + card.tile.w + 0.01);
    expect(card.iconBox.y + card.iconBox.h).toBeLessThanOrEqual(card.tile.y + card.tile.h + 0.01);
  });

  it('cada linha de texto cabe dentro da largura do node e nao invade o tile', () => {
    const sizeByRole = { caption: 10, label: 14, slug: 11, tech: 12, subtitle: 12 } as const;
    const weightByRole = { caption: 600, label: 600, slug: 400, tech: 400, subtitle: 400 } as const;
    for (const line of card.lines) {
      const width = measureText(line.text, sizeByRole[line.role], weightByRole[line.role]);
      expect(width, `linha "${line.text}" (${line.role}) excede a largura do node`).toBeLessThanOrEqual(w - line.x + 0.5);
      if (line.role !== 'subtitle') {
        expect(line.x, `linha "${line.text}" (${line.role}) invade a coluna do tile`).toBeGreaterThanOrEqual(card.tile.x + card.tile.w);
      }
    }
  });

  it('tag (se houver) nao colide com a area do badge de status (y > metade da altura do badge)', () => {
    if (!card.tag) return;
    expect(card.tag.rect.y).toBeGreaterThan(LAYOUT_CONST.badgeHeight / 2);
  });

  it('subtitle (se houver) fica abaixo do divisor', () => {
    if (!card.divider) return;
    const subtitleLines = card.lines.filter((l) => l.role === 'subtitle');
    expect(subtitleLines.length).toBeGreaterThan(0);
    for (const line of subtitleLines) {
      expect(line.y).toBeGreaterThan(card.divider.y);
    }
  });

  it('bounds contem o node e, se status new/changed, reserva espaco para o badge no topo', () => {
    expect(bounds.x).toBeLessThanOrEqual(0.01);
    expect(bounds.y).toBeLessThanOrEqual(0.01);
    expect(bounds.w).toBeGreaterThanOrEqual(w);
    expect(bounds.h).toBeGreaterThanOrEqual(h);
  });
});

describe('computeIconCard: tag e badge de status nao colidem (status new + badge livre)', () => {
  it('o retangulo do badge de status (no sistema de coordenadas do bounds) nao intersecta o do tag', () => {
    const node = makeNode({ status: 'new', badge: '100% Pronto', tech: 'Node.js 22' });
    const { w, card } = computeIconCard(node, 'pt-BR');
    expect(card.tag).toBeDefined();

    const statusBadgeW = 70; // estimativa generosa (texto "NOVO" + padding)
    const statusBadgeRect = { x: w - LAYOUT_CONST.badgeOffsetFromCorner - statusBadgeW, y: -LAYOUT_CONST.badgeHeight / 2, w: statusBadgeW, h: LAYOUT_CONST.badgeHeight };

    expect(rectsOverlap(statusBadgeRect, card.tag!.rect)).toBe(false);
  });
});

describe('computeIconCard: textos vazios (so label)', () => {
  it('nao gera linhas de slug/subtitle/tag quando os campos nao sao fornecidos', () => {
    const node = makeNode({});
    const { card } = computeIconCard(node, 'pt-BR');
    expect(card.lines.some((l) => l.role === 'slug')).toBe(false);
    expect(card.lines.some((l) => l.role === 'subtitle')).toBe(false);
    expect(card.tag).toBeUndefined();
    expect(card.divider).toBeUndefined();
  });
});

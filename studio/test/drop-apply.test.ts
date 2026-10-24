import { describe, expect, it } from 'vitest';
import { computeDropPlacements, placementsToOps, type PlacementLike } from '../shared/drop-apply.js';
import type { RawDiagramLike } from '../shared/ops.js';

const ROOT = '__root__';

/**
 * Fixture: container "g1" com rank0=[n1,n2], rank1=[n3]; container root com "n4" (rank0).
 */
function makePlacements(): PlacementLike[] {
  return [
    { id: 'n1', kind: 'node', container: 'g1', rank: 0, order: 0 },
    { id: 'n2', kind: 'node', container: 'g1', rank: 0, order: 1 },
    { id: 'n3', kind: 'node', container: 'g1', rank: 1, order: 0 },
    { id: 'n4', kind: 'node', container: ROOT, rank: 0, order: 0 },
    { id: 'g1', kind: 'group', container: ROOT, rank: 0, order: 1 },
  ];
}

function byId(placements: PlacementLike[]): Map<string, PlacementLike> {
  return new Map(placements.map((p) => [p.id, p]));
}

describe('computeDropPlacements', () => {
  it('reordena dentro do mesmo rank/container (move n2 para antes de n1)', () => {
    const result = computeDropPlacements(makePlacements(), { draggedId: 'n2', container: 'g1', rank: 0, orderIndex: 0 });
    const m = byId(result);
    expect(m.get('n2')).toEqual({ id: 'n2', kind: 'node', container: 'g1', rank: 0, order: 0 });
    expect(m.get('n1')).toEqual({ id: 'n1', kind: 'node', container: 'g1', rank: 0, order: 1 });
    // o container de destino e fixado INTEIRO (todos os ranks, nao so o afetado) -- n3 (rank 1 de
    // g1) tambem aparece no resultado, mesmo sem mudar de valor (e o proposito do "pin")
    expect(m.get('n3')).toEqual({ id: 'n3', kind: 'node', container: 'g1', rank: 1, order: 0 });
  });

  it('move para outro rank do mesmo container: reindexa o rank de origem sem buraco', () => {
    const result = computeDropPlacements(makePlacements(), { draggedId: 'n1', container: 'g1', rank: 1, orderIndex: 0 });
    const m = byId(result);
    expect(m.get('n1')).toEqual({ id: 'n1', kind: 'node', container: 'g1', rank: 1, order: 0 });
    expect(m.get('n3')).toEqual({ id: 'n3', kind: 'node', container: 'g1', rank: 1, order: 1 });
    // rank 0 (origem) perdeu n1 -- n2 reindexado de order:1 para order:0
    expect(m.get('n2')).toEqual({ id: 'n2', kind: 'node', container: 'g1', rank: 0, order: 0 });
  });

  it('move para outro container: fixa o container de destino inteiro e reindexa o de origem', () => {
    const result = computeDropPlacements(makePlacements(), { draggedId: 'n4', container: 'g1', rank: 0, orderIndex: 1 });
    const m = byId(result);
    // n4 entra no rank 0 de g1, na posicao 1 (entre n1 e n2)
    expect(m.get('n4')).toEqual({ id: 'n4', kind: 'node', container: 'g1', rank: 0, order: 1 });
    expect(m.get('n1')).toEqual({ id: 'n1', kind: 'node', container: 'g1', rank: 0, order: 0 });
    expect(m.get('n2')).toEqual({ id: 'n2', kind: 'node', container: 'g1', rank: 0, order: 2 });
    // outro rank do container de destino (rank 1, so n3): preservado, so reindexado (ja era 0)
    expect(m.get('n3')).toEqual({ id: 'n3', kind: 'node', container: 'g1', rank: 1, order: 0 });
    // container de origem (root) perdeu n4 -- g1 (o unico item restante no root) fica em order 0
    expect(m.get('g1')).toEqual({ id: 'g1', kind: 'group', container: ROOT, rank: 0, order: 0 });
  });

  it('move de dentro de um grupo para o root', () => {
    const result = computeDropPlacements(makePlacements(), { draggedId: 'n1', container: ROOT, rank: 0, orderIndex: 1 });
    const m = byId(result);
    expect(m.get('n1')).toEqual({ id: 'n1', kind: 'node', container: ROOT, rank: 0, order: 1 });
    expect(m.get('n4')).toEqual({ id: 'n4', kind: 'node', container: ROOT, rank: 0, order: 0 });
    expect(m.get('g1')).toEqual({ id: 'g1', kind: 'group', container: ROOT, rank: 0, order: 2 });
    // container de origem (g1), rank 0, perdeu n1 -- n2 reindexado para 0
    expect(m.get('n2')).toEqual({ id: 'n2', kind: 'node', container: 'g1', rank: 0, order: 0 });
  });

  it('orderIndex negativo e clampado para 0', () => {
    const result = computeDropPlacements(makePlacements(), { draggedId: 'n2', container: 'g1', rank: 0, orderIndex: -5 });
    expect(byId(result).get('n2')!.order).toBe(0);
  });

  it('orderIndex maior que o numero de itens e clampado para o final', () => {
    const result = computeDropPlacements(makePlacements(), { draggedId: 'n2', container: 'g1', rank: 0, orderIndex: 99 });
    const m = byId(result);
    expect(m.get('n1')!.order).toBe(0);
    expect(m.get('n2')!.order).toBe(1);
  });

  it('soltar no mesmo lugar (sem mudanca real) ainda retorna o rank de destino fixado (pin)', () => {
    const result = computeDropPlacements(makePlacements(), { draggedId: 'n1', container: 'g1', rank: 0, orderIndex: 0 });
    const m = byId(result);
    expect(m.get('n1')).toEqual({ id: 'n1', kind: 'node', container: 'g1', rank: 0, order: 0 });
    expect(m.get('n2')).toEqual({ id: 'n2', kind: 'node', container: 'g1', rank: 0, order: 1 });
  });

  it('lanca erro quando o item arrastado nao existe nos placements atuais', () => {
    expect(() => computeDropPlacements(makePlacements(), { draggedId: 'zzz', container: 'g1', rank: 0, orderIndex: 0 })).toThrow(/nao encontrado/);
  });

  it('move um GRUPO (nao so nodes) para outro container', () => {
    const placements: PlacementLike[] = [
      { id: 'sub', kind: 'group', container: 'g1', rank: 0, order: 0 },
      { id: 'g1', kind: 'group', container: ROOT, rank: 0, order: 0 },
      { id: 'g2', kind: 'group', container: ROOT, rank: 1, order: 0 },
    ];
    const result = computeDropPlacements(placements, { draggedId: 'sub', container: ROOT, rank: 1, orderIndex: 1 });
    const m = byId(result);
    expect(m.get('sub')).toEqual({ id: 'sub', kind: 'group', container: ROOT, rank: 1, order: 1 });
    expect(m.get('g2')).toEqual({ id: 'g2', kind: 'group', container: ROOT, rank: 1, order: 0 });
  });
});

function makeRaw(): RawDiagramLike {
  return {
    groups: [{ id: 'g1', label: 'G1' }],
    nodes: [
      { id: 'n1', label: 'N1', group: 'g1' },
      { id: 'n2', label: 'N2', group: 'g1' },
      { id: 'n4', label: 'N4' },
    ],
    edges: [],
  };
}

describe('placementsToOps', () => {
  it('sempre fixa rank/order, mesmo quando o valor nao mudou (pin)', () => {
    const raw = makeRaw();
    const placements: PlacementLike[] = [{ id: 'n1', kind: 'node', container: 'g1', rank: 0, order: 0 }];
    const ops = placementsToOps(raw, placements, ROOT, new Map([['n1', { container: 'g1' }]]));
    expect(ops).toContainEqual({ op: 'setField', coll: 'nodes', index: 0, key: 'rank', value: 0 });
    expect(ops).toContainEqual({ op: 'setField', coll: 'nodes', index: 0, key: 'order', value: 0 });
    // container nao mudou -- nao gera op de "group"
    expect(ops.some((o) => o.op === 'setField' && o.key === 'group')).toBe(false);
  });

  it('gera op de "group" (para node) quando o container mudou', () => {
    const raw = makeRaw();
    const placements: PlacementLike[] = [{ id: 'n1', kind: 'node', container: ROOT, rank: 0, order: 0 }];
    const ops = placementsToOps(raw, placements, ROOT, new Map([['n1', { container: 'g1' }]]));
    expect(ops).toContainEqual({ op: 'setField', coll: 'nodes', index: 0, key: 'group', value: undefined });
  });

  it('gera op de "parent" (para group) quando o container mudou, com o id do novo grupo pai', () => {
    const raw: RawDiagramLike = { groups: [{ id: 'g1' }, { id: 'g2' }], nodes: [{ id: 'n1' }] };
    const placements: PlacementLike[] = [{ id: 'g2', kind: 'group', container: 'g1', rank: 0, order: 0 }];
    const ops = placementsToOps(raw, placements, ROOT, new Map([['g2', { container: ROOT }]]));
    expect(ops).toContainEqual({ op: 'setField', coll: 'groups', index: 1, key: 'parent', value: 'g1' });
  });
});

import { describe, expect, it } from 'vitest';
import { inferDropTarget } from '../shared/drop-target.js';
import type { ViewItem } from '../shared/types.js';

const ROOT = '__root__';

/**
 * Layout fixture (direction LR):
 *
 *            GRUPO G1 (x:0..200, y:0..300)
 *   +---------------------------------+
 *   | n1 (rank0, x:10..90, y:10..60)   |         n3 (rank1, sem grupo, x:260..340, y:10..60)
 *   | n2 (rank0, x:10..90, y:110..160) |
 *   +---------------------------------+
 */
function makeItems(): ViewItem[] {
  return [
    { id: 'g1', kind: 'group', container: ROOT, rank: 0, order: 0, x: 0, y: 0, w: 200, h: 300, depth: 1 },
    { id: 'n1', kind: 'node', container: 'g1', rank: 0, order: 0, x: 10, y: 10, w: 80, h: 50, depth: 0 },
    { id: 'n2', kind: 'node', container: 'g1', rank: 0, order: 1, x: 10, y: 110, w: 80, h: 50, depth: 0 },
    { id: 'n3', kind: 'node', container: ROOT, rank: 1, order: 0, x: 260, y: 10, w: 80, h: 50, depth: 0 },
  ];
}

describe('inferDropTarget', () => {
  it('ponto dentro do grupo escolhe esse grupo como container', () => {
    const r = inferDropTarget({ items: makeItems(), draggedId: 'n3', direction: 'LR', rootId: ROOT, point: { x: 50, y: 200 } });
    expect(r.container).toBe('g1');
  });

  it('ponto fora de qualquer grupo escolhe o root como container', () => {
    const r = inferDropTarget({ items: makeItems(), draggedId: 'n1', direction: 'LR', rootId: ROOT, point: { x: 300, y: 30 } });
    expect(r.container).toBe(ROOT);
  });

  it('dentro do grupo, escolhe o rank mais proximo do ponto no eixo principal (x, em LR)', () => {
    const items = makeItems();
    // g1 so tem rank 0 -- qualquer x dentro do grupo cai nesse rank
    const r = inferDropTarget({ items, draggedId: 'n3', direction: 'LR', rootId: ROOT, point: { x: 50, y: 200 } });
    expect(r.rank).toBe(0);
  });

  it('escolhe o rank existente mais proximo quando ha mais de um (nunca cria rank novo)', () => {
    const items = makeItems();
    // ponto fora de qualquer grupo (container root), x bem proximo de n3 (rank 1)
    const r1 = inferDropTarget({ items, draggedId: 'n1', direction: 'LR', rootId: ROOT, point: { x: 295, y: 30 } });
    expect(r1.container).toBe(ROOT);
    expect(r1.rank).toBe(1);
  });

  it('orderIndex 0 quando o ponto esta antes do primeiro item do rank (eixo cruzado)', () => {
    const r = inferDropTarget({ items: makeItems(), draggedId: 'n3', direction: 'LR', rootId: ROOT, point: { x: 50, y: 5 } });
    expect(r.container).toBe('g1');
    expect(r.rank).toBe(0);
    expect(r.orderIndex).toBe(0); // antes de n1 (y centro 35) e n2 (y centro 135)
  });

  it('orderIndex entre dois itens do mesmo rank', () => {
    const r = inferDropTarget({ items: makeItems(), draggedId: 'n3', direction: 'LR', rootId: ROOT, point: { x: 50, y: 90 } });
    expect(r.orderIndex).toBe(1); // entre n1 (centro y=35) e n2 (centro y=135)
  });

  it('orderIndex apos o ultimo item do rank', () => {
    const r = inferDropTarget({ items: makeItems(), draggedId: 'n3', direction: 'LR', rootId: ROOT, point: { x: 50, y: 280 } });
    expect(r.orderIndex).toBe(2); // depois de n1 e n2
  });

  it('exclui o proprio item arrastado da analise (nao colide consigo mesmo)', () => {
    const items = makeItems();
    // soltar n1 exatamente sobre a posicao de n2 -- n1 nao deve aparecer como "sibling" contando a si mesmo
    const r = inferDropTarget({ items, draggedId: 'n1', direction: 'LR', rootId: ROOT, point: { x: 50, y: 135 } });
    expect(r.container).toBe('g1');
    // so resta n2 no rank -- o ponto (y=135, centro de n2) cai depois dele
    expect(r.orderIndex).toBe(1);
  });

  it('ao arrastar um grupo, exclui tambem seus descendentes (nao pode soltar dentro de si mesmo)', () => {
    const items = makeItems();
    // arrastando g1: um ponto "dentro" de g1 nao deveria mais resolver para o container g1
    // (g1 e n1/n2, seus filhos, estao excluidos) -- cai no root
    const r = inferDropTarget({ items, draggedId: 'g1', direction: 'LR', rootId: ROOT, point: { x: 50, y: 50 } });
    expect(r.container).toBe(ROOT);
  });

  it('container vazio (todos os itens excluidos) retorna rank 0 / orderIndex 0', () => {
    const items: ViewItem[] = [{ id: 'g1', kind: 'group', container: ROOT, rank: 0, order: 0, x: 0, y: 0, w: 200, h: 300, depth: 1 }];
    const r = inferDropTarget({ items, draggedId: 'other', direction: 'LR', rootId: ROOT, point: { x: 50, y: 50 } });
    expect(r).toEqual({ container: 'g1', rank: 0, orderIndex: 0 });
  });

  it('direction TB inverte os eixos: rank pelo y, orderIndex pelo x', () => {
    const items: ViewItem[] = [
      { id: 'a', kind: 'node', container: ROOT, rank: 0, order: 0, x: 10, y: 10, w: 80, h: 50, depth: 0 },
      { id: 'b', kind: 'node', container: ROOT, rank: 0, order: 1, x: 110, y: 10, w: 80, h: 50, depth: 0 },
      { id: 'c', kind: 'node', container: ROOT, rank: 1, order: 0, x: 10, y: 110, w: 80, h: 50, depth: 0 },
    ];
    // ponto proximo do rank 1 (y~130) e, dentro dele, depois do unico item "c" (x centro 50)
    const r = inferDropTarget({ items, draggedId: 'z', direction: 'TB', rootId: ROOT, point: { x: 200, y: 130 } });
    expect(r.rank).toBe(1);
    expect(r.orderIndex).toBe(1);
  });
});

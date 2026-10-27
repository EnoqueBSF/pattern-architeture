import { describe, expect, it } from 'vitest';
import {
  addEdge,
  addGroup,
  addNode,
  AmbiguousEdgeRefError,
  clearHints,
  deleteEdge,
  deleteGroup,
  deleteNode,
  findEdgeIndex,
  NotFoundError,
  renameGroup,
  renameNode,
  setNodeField,
  toRawDiagram,
  type RawDiagramLike,
} from '../shared/ops.js';
import { applyOps } from '../shared/yaml-edit.js';

function makeRaw(): RawDiagramLike {
  return {
    groups: [
      { id: 'g1', label: 'Grupo 1' },
      { id: 'g2', label: 'Grupo 2', parent: 'g1' },
    ],
    nodes: [
      { id: 'a', label: 'A', group: 'g2' },
      { id: 'b', label: 'B', group: 'g1' },
      { id: 'c', label: 'C' },
    ],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'a', to: 'c' },
    ],
  };
}

describe('setNodeField', () => {
  it('gera um setField no indice correto', () => {
    const raw = makeRaw();
    const ops = setNodeField(raw, 'b', 'status', 'changed');
    expect(ops).toEqual([{ op: 'setField', coll: 'nodes', index: 1, key: 'status', value: 'changed' }]);
  });

  it('lanca para node inexistente', () => {
    expect(() => setNodeField(makeRaw(), 'zzz', 'status', 'new')).toThrow();
  });
});

describe('renameNode', () => {
  it('renomeia o node e propaga apenas para as edges que de fato referenciam o id antigo', () => {
    const raw = makeRaw(); // edges: a->b, b->c, a->c
    const ops = renameNode(raw, 'a', 'a2');
    // node + edges[0].from (a->b) + edges[2].from (a->c); nenhuma op para edges[1] (b->c, nao referencia "a")
    expect(ops).toHaveLength(3);
    expect(ops).toContainEqual({ op: 'setField', coll: 'nodes', index: 0, key: 'id', value: 'a2' });
    expect(ops).toContainEqual({ op: 'setField', coll: 'edges', index: 0, key: 'from', value: 'a2' });
    expect(ops).toContainEqual({ op: 'setField', coll: 'edges', index: 2, key: 'from', value: 'a2' });
  });

  it('aplicado de ponta a ponta via applyOps, o resultado nao tem mais referencias ao id antigo', () => {
    const raw = makeRaw();
    const ops = renameNode(raw, 'a', 'alpha');
    const yaml = `version: 1
title: Teste
nodes:
  - { id: a, label: A }
  - { id: b, label: B }
  - { id: c, label: C }
edges:
  - { from: a, to: b }
  - { from: b, to: c }
  - { from: a, to: c }
`;
    const { text } = applyOps(yaml, ops);
    expect(text).not.toContain('from: a,');
    expect(text).not.toContain('from: a }');
    expect(text).toContain('id: alpha');
  });
});

describe('renameGroup', () => {
  it('propaga para nodes.group e groups.parent', () => {
    const raw = makeRaw();
    const ops = renameGroup(raw, 'g1', 'g1-novo');
    expect(ops).toContainEqual({ op: 'setField', coll: 'groups', index: 0, key: 'id', value: 'g1-novo' });
    expect(ops).toContainEqual({ op: 'setField', coll: 'nodes', index: 1, key: 'group', value: 'g1-novo' }); // node b
    expect(ops).toContainEqual({ op: 'setField', coll: 'groups', index: 1, key: 'parent', value: 'g1-novo' }); // group g2
  });
});

describe('deleteNode', () => {
  it('remove as edges que referenciam o node, em ordem decrescente de indice, antes do node', () => {
    const raw = makeRaw();
    const ops = deleteNode(raw, 'a'); // edges 0 (a->b) e 2 (a->c) referenciam "a"
    const removeOps = ops.filter((o) => o.op === 'remove');
    const edgeRemovals = removeOps.filter((o) => o.coll === 'edges').map((o) => o.index);
    expect(edgeRemovals).toEqual([2, 0]); // decrescente
    expect(ops[ops.length - 1]).toEqual({ op: 'remove', coll: 'nodes', index: 0 });
  });

  it('aplicado via applyOps, o YAML final nao tem mais o node nem edges orfas', () => {
    const raw = makeRaw();
    const ops = deleteNode(raw, 'a');
    const yaml = `version: 1
title: Teste
nodes:
  - { id: a, label: A }
  - { id: b, label: B }
  - { id: c, label: C }
edges:
  - { from: a, to: b }
  - { from: b, to: c }
  - { from: a, to: c }
`;
    const { text } = applyOps(yaml, ops);
    expect(text).not.toContain('id: a,');
    expect(text).not.toContain('id: a }');
    expect(text).toContain('from: b, to: c');
  });
});

describe('deleteGroup', () => {
  it('os filhos diretos sobem para o parent do grupo removido', () => {
    const raw = makeRaw();
    const ops = deleteGroup(raw, 'g1'); // g1 nao tem parent -> filhos sobem para undefined (raiz)
    expect(ops).toContainEqual({ op: 'setField', coll: 'nodes', index: 1, key: 'group', value: undefined }); // node b (estava em g1)
    expect(ops).toContainEqual({ op: 'setField', coll: 'groups', index: 1, key: 'parent', value: undefined }); // group g2 (parent era g1)
    expect(ops[ops.length - 1]).toEqual({ op: 'remove', coll: 'groups', index: 0 });
  });
});

describe('addNode', () => {
  it('gera um id unico e defaults razoaveis', () => {
    const raw = makeRaw();
    const { ops, id } = addNode(raw);
    expect(id).toBe('node-1');
    expect(ops).toHaveLength(1);
    const appendOp = ops[0]!;
    expect(appendOp.op).toBe('append');
    if (appendOp.op === 'append') {
      expect(appendOp.item.id).toBe('node-1');
      expect(appendOp.item.status).toBe('new');
      expect(appendOp.item.type).toBe('microservice');
    }
  });

  it('nao reutiliza um id ja existente (como node ou grupo)', () => {
    const raw = makeRaw();
    raw.nodes.push({ id: 'node-1', label: 'Ja existe' });
    const { id } = addNode(raw);
    expect(id).toBe('node-2');
  });

  it('aceita overrides e respeita group explicito', () => {
    const raw = makeRaw();
    const { ops } = addNode(raw, { label: 'Meu node', group: 'g1', icon: 'nodejs' });
    const appendOp = ops[0]!;
    if (appendOp.op === 'append') {
      expect(appendOp.item.label).toBe('Meu node');
      expect(appendOp.item.group).toBe('g1');
      expect(appendOp.item.icon).toBe('nodejs');
    }
  });
});

describe('addEdge', () => {
  it('gera um append com protocolo default http', () => {
    const ops = addEdge('a', 'b');
    expect(ops).toEqual([{ op: 'append', coll: 'edges', item: { protocol: 'http', from: 'a', to: 'b' } }]);
  });
});

describe('deleteEdge', () => {
  it('gera um remove no indice informado', () => {
    expect(deleteEdge(1)).toEqual([{ op: 'remove', coll: 'edges', index: 1 }]);
  });
});

describe('addGroup', () => {
  it('gera um id unico e defaults razoaveis', () => {
    const raw = makeRaw();
    const { ops, id } = addGroup(raw);
    expect(id).toBe('group-1');
    expect(ops).toHaveLength(1);
    const appendOp = ops[0]!;
    expect(appendOp.op).toBe('append');
    if (appendOp.op === 'append') {
      expect(appendOp.item.id).toBe('group-1');
      expect(appendOp.item.label).toBe('Novo grupo');
      expect(appendOp.item.kind).toBe('layer');
    }
  });

  it('nao reutiliza um id ja existente (como node ou grupo)', () => {
    const raw = makeRaw();
    raw.groups!.push({ id: 'group-1', label: 'Ja existe' });
    const { id } = addGroup(raw);
    expect(id).toBe('group-2');
  });

  it('aceita overrides', () => {
    const raw = makeRaw();
    const { ops } = addGroup(raw, { label: 'Meu grupo', kind: 'context', parent: 'g1' });
    const appendOp = ops[0]!;
    if (appendOp.op === 'append') {
      expect(appendOp.item.label).toBe('Meu grupo');
      expect(appendOp.item.kind).toBe('context');
      expect(appendOp.item.parent).toBe('g1');
    }
  });
});

describe('toRawDiagram', () => {
  it('aceita um objeto com a forma minima (nodes com id), ignorando campos extras como version', () => {
    const parsed = { version: 1, nodes: [{ id: 'a' }], groups: [{ id: 'g1' }], edges: [{ from: 'a', to: 'a' }] };
    expect(toRawDiagram(parsed)).toEqual({ nodes: [{ id: 'a' }], groups: [{ id: 'g1' }], edges: [{ from: 'a', to: 'a' }] });
  });

  it('preenche groups/edges ausentes com array vazio', () => {
    const parsed = { nodes: [{ id: 'a' }] };
    expect(toRawDiagram(parsed)).toEqual({ nodes: [{ id: 'a' }], groups: [], edges: [] });
  });

  it('retorna null para undefined, nao-objeto ou nodes ausente/invalido', () => {
    expect(toRawDiagram(undefined)).toBeNull();
    expect(toRawDiagram(null)).toBeNull();
    expect(toRawDiagram('texto solto')).toBeNull();
    expect(toRawDiagram({})).toBeNull();
    expect(toRawDiagram({ nodes: [{ label: 'sem id' }] })).toBeNull();
  });

  it('retorna null se groups/edges existirem mas com forma invalida', () => {
    expect(toRawDiagram({ nodes: [{ id: 'a' }], groups: [{ label: 'sem id' }] })).toBeNull();
    expect(toRawDiagram({ nodes: [{ id: 'a' }], edges: [{ from: 'a' }] })).toBeNull();
  });
});

describe('clearHints', () => {
  it('remove rank/order de nodes e grupos quando scope=all', () => {
    const raw = makeRaw();
    raw.nodes[0]!.rank = 2;
    raw.nodes[1]!.order = 0;
    raw.groups![0]!.rank = 1;
    const ops = clearHints(raw, 'all');
    expect(ops).toContainEqual({ op: 'setField', coll: 'nodes', index: 0, key: 'rank', value: undefined });
    expect(ops).toContainEqual({ op: 'setField', coll: 'nodes', index: 1, key: 'order', value: undefined });
    expect(ops).toContainEqual({ op: 'setField', coll: 'groups', index: 0, key: 'rank', value: undefined });
  });

  it('nao gera ops para itens sem hints', () => {
    const raw = makeRaw();
    expect(clearHints(raw, 'all')).toEqual([]);
  });

  it('scope=nodes nao mexe em grupos', () => {
    const raw = makeRaw();
    raw.groups![0]!.rank = 1;
    expect(clearHints(raw, 'nodes')).toEqual([]);
  });
});

describe('findEdgeIndex', () => {
  it('resolve por index', () => {
    expect(findEdgeIndex(makeRaw(), { index: 1 })).toBe(1);
  });

  it('lanca NotFoundError para index fora do range', () => {
    expect(() => findEdgeIndex(makeRaw(), { index: 99 })).toThrow(NotFoundError);
  });

  it('resolve por id quando a edge tem id', () => {
    const raw = makeRaw();
    raw.edges![1]!.id = 'e-bc';
    expect(findEdgeIndex(raw, { id: 'e-bc' })).toBe(1);
  });

  it('lanca NotFoundError para id inexistente', () => {
    expect(() => findEdgeIndex(makeRaw(), { id: 'zzz' })).toThrow(NotFoundError);
  });

  it('resolve por from+to quando unica', () => {
    expect(findEdgeIndex(makeRaw(), { from: 'b', to: 'c' })).toBe(1);
  });

  it('lanca NotFoundError para from+to sem nenhuma edge correspondente', () => {
    expect(() => findEdgeIndex(makeRaw(), { from: 'c', to: 'a' })).toThrow(NotFoundError);
  });

  it('from+to com mais de uma correspondencia lanca AmbiguousEdgeRefError com os candidatos', () => {
    const raw = makeRaw();
    raw.edges!.push({ from: 'a', to: 'b' }); // duplica a edge 0 -- ambiguo
    expect(() => findEdgeIndex(raw, { from: 'a', to: 'b' })).toThrow(AmbiguousEdgeRefError);
    let caught: unknown;
    try {
      findEdgeIndex(raw, { from: 'a', to: 'b' });
    } catch (err) {
      caught = err;
    }
    expect((caught as InstanceType<typeof AmbiguousEdgeRefError>).candidates).toEqual([0, 3]);
  });

  it('protocol desambigua quando from+to repete mas o protocolo difere', () => {
    const raw = makeRaw();
    raw.edges![0]!.protocol = 'http';
    raw.edges!.push({ from: 'a', to: 'b', protocol: 'grpc' });
    expect(findEdgeIndex(raw, { from: 'a', to: 'b', protocol: 'grpc' })).toBe(3);
  });
});

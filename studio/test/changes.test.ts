import { describe, expect, it } from 'vitest';
import { applyChanges, type Change } from '../shared/changes.js';
import { AmbiguousEdgeRefError, NotFoundError } from '../shared/ops.js';

const BASE = `version: 1
title: Diagrama de teste
direction: LR
locale: pt-BR
groups:
  - { id: g1, label: Grupo 1 }
nodes:
  - { id: a, label: A, type: microservice, status: unchanged, group: g1 }
  - { id: b, label: B, type: microservice, status: unchanged }
edges:
  - { from: a, to: b, protocol: http }
`;

describe('applyChanges', () => {
  it('set_meta atualiza so os campos informados', () => {
    const { text } = applyChanges(BASE, [{ action: 'set_meta', title: 'Novo titulo', tags: ['bff'] }]);
    expect(text).toContain('title: "Novo titulo"'); // tem espaco -- scalarItemText nao e ID_LIKE, fica quoted
    expect(text).toContain('tags: [bff]');
    expect(text).toContain('direction: LR'); // nao tocado
  });

  it('set_meta com description: null remove a chave', () => {
    const withDesc = applyChanges(BASE, [{ action: 'set_meta', description: 'Algo' }]).text;
    const { text } = applyChanges(withDesc, [{ action: 'set_meta', description: null }]);
    expect(text).not.toContain('description:');
  });

  it('add_node cria com id automatico e devolve o id criado', () => {
    const result = applyChanges(BASE, [{ action: 'add_node', node: { label: 'Novo', type: 'queue', status: 'new' } }]);
    expect(result.createdNodeIds[0]).toBeDefined();
    expect(result.text).toContain(`id: ${result.createdNodeIds[0]}`);
    expect(result.applied[0]).toContain(result.createdNodeIds[0]!);
  });

  it('add_node com id explicito usa o id informado', () => {
    const result = applyChanges(BASE, [{ action: 'add_node', node: { id: 'worker', label: 'Worker', type: 'worker', status: 'new' } }]);
    expect(result.createdNodeIds[0]).toBe('worker');
    expect(result.text).toContain('id: worker');
  });

  it('update_node com set.id renomeia e propaga para as edges', () => {
    const { text } = applyChanges(BASE, [{ action: 'update_node', id: 'a', set: { id: 'alpha' } }]);
    expect(text).toContain('id: alpha');
    expect(text).toContain('from: alpha');
    expect(text).not.toContain('id: a,');
  });

  it('update_node com set de campo simples e unset', () => {
    const withDesc = applyChanges(BASE, [{ action: 'update_node', id: 'a', set: { description: 'Algo' } }]).text;
    expect(withDesc).toContain('description: Algo');
    const { text } = applyChanges(withDesc, [{ action: 'update_node', id: 'a', unset: ['description'] }]);
    expect(text).not.toContain('description:');
  });

  it('update_node para id inexistente lanca NotFoundError', () => {
    expect(() => applyChanges(BASE, [{ action: 'update_node', id: 'zzz', set: { label: 'X' } }])).toThrow(NotFoundError);
  });

  it('remove_node remove o node e as edges que o referenciam', () => {
    const { text } = applyChanges(BASE, [{ action: 'remove_node', id: 'a' }]);
    expect(text).not.toContain('id: a');
    expect(text).not.toContain('from: a');
  });

  it('add_group / update_group (rename propaga) / remove_group (filhos sobem)', () => {
    const added = applyChanges(BASE, [{ action: 'add_group', group: { label: 'Grupo 2', kind: 'context', parent: 'g1' } }]);
    const groupId = added.createdGroupIds[0]!;
    expect(added.text).toContain(`parent: g1`);

    const renamed = applyChanges(added.text, [{ action: 'update_group', id: 'g1', set: { id: 'g1-novo' } }]);
    expect(renamed.text).toContain('group: g1-novo'); // node a
    expect(renamed.text).toContain(`parent: g1-novo`); // o grupo criado, cujo parent era g1

    const removed = applyChanges(renamed.text, [{ action: 'remove_group', id: groupId }]);
    expect(removed.text).not.toContain(groupId);
  });

  it('add_edge / update_edge (por EdgeRef from+to) / remove_edge', () => {
    const added = applyChanges(BASE, [{ action: 'add_edge', edge: { from: 'b', to: 'a', protocol: 'amqp', label: 'evento' } }]);
    expect(added.text).toContain('label: evento');

    const updated = applyChanges(added.text, [
      { action: 'update_edge', edge: { from: 'a', to: 'b' }, set: { label: 'chamada sincrona' } },
    ]);
    expect(updated.text).toContain('label: "chamada sincrona"');

    const removed = applyChanges(updated.text, [{ action: 'remove_edge', edge: { from: 'b', to: 'a' } }]);
    expect(removed.text).not.toContain('evento');
  });

  it('update_edge/remove_edge com EdgeRef ambigua lanca AmbiguousEdgeRefError', () => {
    const duped = `${BASE}  - { from: a, to: b, protocol: amqp }\n`;
    expect(() => applyChanges(duped, [{ action: 'remove_edge', edge: { from: 'a', to: 'b' } }])).toThrow(AmbiguousEdgeRefError);
  });

  it('clear_hints remove rank/order no escopo informado', () => {
    const withHints = `${BASE.replace('{ id: a, label: A, type: microservice, status: unchanged, group: g1 }', '{ id: a, label: A, type: microservice, status: unchanged, group: g1, rank: 2 }')}`;
    const { text } = applyChanges(withHints, [{ action: 'clear_hints', scope: 'nodes' }]);
    expect(text).not.toContain('rank: 2');
  });

  it('lote e atomico: se um Change falhar no meio, nenhuma mudanca anterior do lote fica no resultado (a chamada toda lanca)', () => {
    const changes: Change[] = [
      { action: 'update_node', id: 'a', set: { label: 'Mudou antes' } },
      { action: 'update_node', id: 'inexistente', set: { label: 'X' } },
    ];
    expect(() => applyChanges(BASE, changes)).toThrow(NotFoundError);
    // a funcao joga a excecao antes de devolver qualquer resultado -- quem chama (mutateDiagram)
    // nunca ve um `text` parcial, e portanto nunca grava nada; aqui confirmamos so o "lanca e nao retorna".
  });

  it('cria do zero (skeleton) e aplica uma 2a edicao cirurgica por cima, sem fallback', () => {
    const skeleton = 'version: 1\ntitle: "Novo diagrama"\nnodes: []\n';
    const created = applyChanges(skeleton, [{ action: 'add_node', node: { id: 'svc', label: 'Servico', type: 'microservice', status: 'new' } }]);
    expect(created.text).toContain('id: svc');

    const edited = applyChanges(created.text, [{ action: 'update_node', id: 'svc', set: { label: 'Servico renomeado' } }]);
    expect(edited.fallbackUsed).toBe(false);
    expect(edited.text).toContain('label: "Servico renomeado"');
  });

  it('varias mudancas em sequencia reprocessam o YAML (indices de edge nao ficam desatualizados apos um remove)', () => {
    const threeEdges = `version: 1
title: T
nodes:
  - { id: a, label: A, type: microservice, status: new }
  - { id: b, label: B, type: microservice, status: new }
  - { id: c, label: C, type: microservice, status: new }
edges:
  - { from: a, to: b, protocol: http }
  - { from: b, to: c, protocol: http }
  - { from: a, to: c, protocol: http }
`;
    const { text } = applyChanges(threeEdges, [
      { action: 'remove_edge', edge: { index: 0 } }, // remove a->b; sobram b->c (idx0), a->c (idx1)
      { action: 'update_edge', edge: { index: 1 }, set: { label: 'ultima' } }, // precisa ser a->c, nao b->c
    ]);
    expect(text).toContain('from: a, to: c, protocol: http, label: ultima');
    expect(text).not.toContain('label: ultima\n  - { from: b');
  });
});

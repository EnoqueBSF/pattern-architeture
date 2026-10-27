import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { describe, expect, it } from 'vitest';
import { applyOps, type Op } from '../shared/yaml-edit.js';

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf-8');
}

function toJS(text: string): unknown {
  const doc = parseDocument(text);
  expect(doc.errors, `YAML malformado apos edicao:\n${text}`).toEqual([]);
  return doc.toJS();
}

/** Quantas linhas, fora do maior prefixo/sufixo comum, diferem entre before/after -- mede o quao "local" foi a edicao. */
function touchedLineCount(before: string, after: string): number {
  const a = before.split('\n');
  const b = after.split('\n');
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  return a.length - prefix - suffix + (b.length - prefix - suffix);
}

describe('applyOps: casos basicos (flow map)', () => {
  const src = `version: 1
title: Teste
nodes:
  - { id: a, label: A, type: microservice, status: new }
  - { id: b, label: B, type: database, status: unchanged }
`;

  it('seta uma chave que ja existe (flow)', () => {
    const op: Op = { op: 'setField', coll: 'nodes', index: 0, key: 'label', value: 'Novo rotulo' };
    const { text, fallbackUsed } = applyOps(src, [op]);
    expect(fallbackUsed).toBe(false);
    expect((toJS(text) as { nodes: { label: string }[] }).nodes[0]!.label).toBe('Novo rotulo');
    expect(touchedLineCount(src, text)).toBeLessThanOrEqual(2);
  });

  it('adiciona uma chave nova (flow)', () => {
    const op: Op = { op: 'setField', coll: 'nodes', index: 0, key: 'icon', value: 'nodejs' };
    const { text, fallbackUsed } = applyOps(src, [op]);
    expect(fallbackUsed).toBe(false);
    expect((toJS(text) as { nodes: { icon: string }[] }).nodes[0]!.icon).toBe('nodejs');
    expect(touchedLineCount(src, text)).toBeLessThanOrEqual(2);
  });

  it('remove uma chave existente (flow)', () => {
    const op: Op = { op: 'setField', coll: 'nodes', index: 0, key: 'label', value: undefined };
    const { text, fallbackUsed } = applyOps(src, [op]);
    expect(fallbackUsed).toBe(false);
    expect((toJS(text) as { nodes: Record<string, unknown>[] }).nodes[0]!.label).toBeUndefined();
  });

  it('adiciona um item novo (append)', () => {
    const op: Op = { op: 'append', coll: 'nodes', item: { id: 'c', label: 'C', type: 'generic', status: 'unchanged' } };
    const { text, fallbackUsed } = applyOps(src, [op]);
    expect(fallbackUsed).toBe(false);
    const nodes = (toJS(text) as { nodes: { id: string }[] }).nodes;
    expect(nodes).toHaveLength(3);
    expect(nodes[2]!.id).toBe('c');
  });

  it('remove um item (remove)', () => {
    const op: Op = { op: 'remove', coll: 'nodes', index: 0 };
    const { text, fallbackUsed } = applyOps(src, [op]);
    expect(fallbackUsed).toBe(false);
    const nodes = (toJS(text) as { nodes: { id: string }[] }).nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.id).toBe('b');
  });

  it('setRoot em chave existente', () => {
    const { text, fallbackUsed } = applyOps(src, [{ op: 'setRoot', key: 'title', value: 'Novo titulo' }]);
    expect(fallbackUsed).toBe(false);
    expect((toJS(text) as { title: string }).title).toBe('Novo titulo');
  });

  it('setRoot em chave nova', () => {
    const { text, fallbackUsed } = applyOps(src, [{ op: 'setRoot', key: 'description', value: 'Uma descricao' }]);
    expect(fallbackUsed).toBe(false);
    expect((toJS(text) as { description: string }).description).toBe('Uma descricao');
  });

  it('setRoot com valor array (tags), chave nova', () => {
    const { text, fallbackUsed } = applyOps(src, [{ op: 'setRoot', key: 'tags', value: ['checkout', 'pagamentos'] }]);
    expect(fallbackUsed).toBe(false);
    expect((toJS(text) as { tags: string[] }).tags).toEqual(['checkout', 'pagamentos']);
  });

  it('setRoot com valor array (tags), sobrescrevendo um valor existente', () => {
    const withTags = applyOps(src, [{ op: 'setRoot', key: 'tags', value: ['a'] }]).text;
    const { text, fallbackUsed } = applyOps(withTags, [{ op: 'setRoot', key: 'tags', value: ['b', 'c'] }]);
    expect(fallbackUsed).toBe(false);
    expect((toJS(text) as { tags: string[] }).tags).toEqual(['b', 'c']);
  });

  it('setRoot com undefined remove a chave tags', () => {
    const withTags = applyOps(src, [{ op: 'setRoot', key: 'tags', value: ['a'] }]).text;
    const { text, fallbackUsed } = applyOps(withTags, [{ op: 'setRoot', key: 'tags', value: undefined }]);
    expect(fallbackUsed).toBe(false);
    expect((toJS(text) as { tags?: string[] }).tags).toBeUndefined();
  });
});

describe('applyOps: casos basicos (block map)', () => {
  const src = `version: 1
title: Teste
nodes:
  - id: a
    label: A
    type: microservice
    status: new
`;

  it('seta uma chave que ja existe (block)', () => {
    const { text, fallbackUsed } = applyOps(src, [{ op: 'setField', coll: 'nodes', index: 0, key: 'status', value: 'changed' }]);
    expect(fallbackUsed).toBe(false);
    expect((toJS(text) as { nodes: { status: string }[] }).nodes[0]!.status).toBe('changed');
    expect(touchedLineCount(src, text)).toBeLessThanOrEqual(2);
  });

  it('adiciona uma chave nova no final (block)', () => {
    const { text, fallbackUsed } = applyOps(src, [{ op: 'setField', coll: 'nodes', index: 0, key: 'slug', value: 'aws-bmg-exemplo' }]);
    expect(fallbackUsed).toBe(false);
    expect((toJS(text) as { nodes: { slug: string }[] }).nodes[0]!.slug).toBe('aws-bmg-exemplo');
    // a edicao deve ser uma linha nova inserida (1 linha a mais em "after"), sem reescrever o resto
    expect(touchedLineCount(src, text)).toBeLessThanOrEqual(2);
  });

  it('remove uma chave existente (block)', () => {
    const { text, fallbackUsed } = applyOps(src, [{ op: 'setField', coll: 'nodes', index: 0, key: 'type', value: undefined }]);
    expect(fallbackUsed).toBe(false);
    expect((toJS(text) as { nodes: Record<string, unknown>[] }).nodes[0]!.type).toBeUndefined();
  });
});

describe('applyOps: fallback quando a edicao cirurgica nao e possivel', () => {
  it('YAML com anchor/alias cai no fallback e ainda produz o resultado correto', () => {
    const src = `version: 1
title: Teste
nodes:
  - &base
    id: a
    label: A
    type: microservice
    status: new
  - <<: *base
    id: b
`;
    const { text, fallbackUsed } = applyOps(src, [{ op: 'setField', coll: 'nodes', index: 0, key: 'label', value: 'Mudou' }]);
    expect(fallbackUsed).toBe(true);
    const nodes = (toJS(text) as { nodes: { id: string; label: string }[] }).nodes;
    expect(nodes[0]!.label).toBe('Mudou');
  });

  it('remover a ultima chave de um map (ficaria vazio) cai no fallback com resultado correto', () => {
    const src = `version: 1
title: Teste
nodes:
  - { id: a }
`;
    // forcar um caso onde so sobra 1 chave no map do node, e remover ela
    const { text, fallbackUsed } = applyOps(src, [{ op: 'setField', coll: 'nodes', index: 0, key: 'id', value: undefined }]);
    expect(fallbackUsed).toBe(true);
    const nodes = (toJS(text) as { nodes: Record<string, unknown>[] }).nodes;
    expect(nodes[0]).toEqual({});
  });
});

describe('applyOps: edicao localizada nos YAMLs reais do repo', () => {
  const files = [
    'examples/intera-bff/intera-bff.yaml',
    'examples/showcase/showcase.yaml',
    'examples/icon-cards/icon-cards.yaml',
    'diagrams/demo/checkout-novo-servico.yaml',
    'templates/diagram.template.yaml',
  ];

  it.each(files)('setField em chave existente do 1o node preserva o resto do arquivo (%s)', (rel) => {
    const src = fixture(rel);
    const doc = parseDocument(src);
    const nodes = doc.get('nodes', true) as { items: unknown[] } | undefined;
    if (!nodes || nodes.items.length === 0) return;

    const { text, fallbackUsed } = applyOps(src, [{ op: 'setField', coll: 'nodes', index: 0, key: 'status', value: 'changed' }]);
    expect(fallbackUsed, rel).toBe(false);
    expect(touchedLineCount(src, text), rel).toBeLessThanOrEqual(2);

    const before = toJS(src) as { nodes: Record<string, unknown>[] };
    const after = toJS(text) as { nodes: Record<string, unknown>[] };
    expect(after.nodes[0]!.status).toBe('changed');
    // todo o resto do documento (exceto o campo editado) continua identico
    expect({ ...after.nodes[0]!, status: before.nodes[0]!.status }).toEqual(before.nodes[0]);
  });

  it.each(files)('append de um node novo nao reescreve o arquivo inteiro (%s)', (rel) => {
    const src = fixture(rel);
    const { text, fallbackUsed } = applyOps(src, [{ op: 'append', coll: 'nodes', item: { id: 'zz-novo', label: 'Novo', type: 'generic', status: 'new' } }]);
    expect(fallbackUsed, rel).toBe(false);
    const before = src.split('\n').length;
    const after = text.split('\n').length;
    expect(after).toBe(before + 1);
    expect(touchedLineCount(src, text), rel).toBeLessThanOrEqual(1);
  });
});

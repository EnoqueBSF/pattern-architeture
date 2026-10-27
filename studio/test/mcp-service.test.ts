import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDiagram, mutateDiagram, readDiagram, ServiceError, type ServiceOptions } from '../mcp/service.js';

let root: string;
let svc: ServiceOptions;

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-service-test-')));
  svc = { repoRoot: root, allowedRoots: [root], catalogConfig: { mode: 'off', url: '' } };
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const SOME_NODE = { label: 'Servico', type: 'microservice' as const, status: 'new' as const };

describe('createDiagram', () => {
  it('cria do zero (sem template) com um change add_node, path relativo ao repoRoot', async () => {
    const result = await createDiagram(
      { path: 'diagrams/novo.yaml', title: 'Diagrama novo', changes: [{ action: 'add_node', node: SOME_NODE }] },
      svc,
    );
    expect(result.applied).toHaveLength(1);
    expect(result.written).toHaveLength(3); // yaml + svg + png
    expect(existsSync(join(root, 'diagrams/novo.yaml'))).toBe(true);
    expect(readFileSync(join(root, 'diagrams/novo.yaml'), 'utf-8')).toContain('title: "Diagrama novo"');
  });

  it('sem nenhum add_node nos changes, a validacao final rejeita "nodes" vazio com INVALID', async () => {
    await expect(createDiagram({ path: 'diagrams/vazio.yaml', title: 'Vazio', changes: [] }, svc)).rejects.toMatchObject({
      code: 'INVALID',
    });
    expect(existsSync(join(root, 'diagrams/vazio.yaml'))).toBe(false);
  });

  it('path ja existente lanca EXISTS e nao sobrescreve', async () => {
    await createDiagram({ path: 'diagrams/dup.yaml', title: 'Original', changes: [{ action: 'add_node', node: SOME_NODE }] }, svc);
    await expect(
      createDiagram({ path: 'diagrams/dup.yaml', title: 'Outro', changes: [{ action: 'add_node', node: SOME_NODE }] }, svc),
    ).rejects.toMatchObject({ code: 'EXISTS' });
    expect(readFileSync(join(root, 'diagrams/dup.yaml'), 'utf-8')).toContain('title: "Original"');
  });

  it('path fora da allowlist lanca FORBIDDEN', async () => {
    await expect(
      createDiagram({ path: '/etc/fora-da-allowlist.yaml', title: 'X', changes: [{ action: 'add_node', node: SOME_NODE }] }, svc),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('readDiagram', () => {
  it('le e devolve outline + hash', async () => {
    await createDiagram(
      {
        path: 'diagrams/leitura.yaml',
        title: 'Para leitura',
        changes: [
          { action: 'add_node', node: { id: 'a', ...SOME_NODE } },
          { action: 'add_node', node: { id: 'b', ...SOME_NODE } },
          { action: 'add_edge', edge: { from: 'a', to: 'b', protocol: 'http' } },
        ],
      },
      svc,
    );
    const result = readDiagram('diagrams/leitura.yaml', svc);
    expect(result.outline.title).toBe('Para leitura');
    expect(result.outline.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(result.outline.edges).toHaveLength(1);
    expect(result.hash).toHaveLength(64);
  });

  it('path inexistente lanca NOT_FOUND', () => {
    expect(() => readDiagram('diagrams/nao-existe.yaml', svc)).toThrow(ServiceError);
    try {
      readDiagram('diagrams/nao-existe.yaml', svc);
    } catch (err) {
      expect((err as ServiceError).code).toBe('NOT_FOUND');
    }
  });
});

describe('mutateDiagram', () => {
  async function createFixture(path: string) {
    return createDiagram(
      {
        path,
        title: 'Fixture',
        changes: [
          { action: 'add_node', node: { id: 'a', ...SOME_NODE } },
          { action: 'add_node', node: { id: 'b', ...SOME_NODE } },
          { action: 'add_edge', edge: { from: 'a', to: 'b', protocol: 'http' } },
        ],
      },
      svc,
    );
  }

  it('aplica changes e devolve o novo hash + baseHash usado', async () => {
    await createFixture('diagrams/mut1.yaml');
    const result = await mutateDiagram({ path: 'diagrams/mut1.yaml', changes: [{ action: 'update_node', id: 'a', set: { label: 'A renomeado' } }] }, svc);
    expect(result.baseHash).toHaveLength(64);
    expect(readFileSync(join(root, 'diagrams/mut1.yaml'), 'utf-8')).toContain('label: "A renomeado"');
  });

  it('baseHash divergente lanca CONFLICT sem gravar nada', async () => {
    await createFixture('diagrams/mut2.yaml');
    const before = readFileSync(join(root, 'diagrams/mut2.yaml'), 'utf-8');
    await expect(
      mutateDiagram({ path: 'diagrams/mut2.yaml', baseHash: 'hash-errado', changes: [{ action: 'update_node', id: 'a', set: { label: 'X' } }] }, svc),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(readFileSync(join(root, 'diagrams/mut2.yaml'), 'utf-8')).toBe(before);
  });

  it('Change referenciando node inexistente lanca NOT_FOUND e nao grava nada (atomicidade do lote)', async () => {
    await createFixture('diagrams/mut3.yaml');
    const before = readFileSync(join(root, 'diagrams/mut3.yaml'), 'utf-8');
    await expect(
      mutateDiagram(
        {
          path: 'diagrams/mut3.yaml',
          changes: [
            { action: 'update_node', id: 'a', set: { label: 'Mudou primeiro' } },
            { action: 'remove_node', id: 'zzz-inexistente' },
          ],
        },
        svc,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(readFileSync(join(root, 'diagrams/mut3.yaml'), 'utf-8')).toBe(before);
  });

  it('EdgeRef ambigua lanca BAD_REF', async () => {
    const path = 'diagrams/mut4.yaml';
    await createDiagram(
      {
        path,
        title: 'Ambiguo',
        changes: [
          { action: 'add_node', node: { id: 'a', ...SOME_NODE } },
          { action: 'add_node', node: { id: 'b', ...SOME_NODE } },
          { action: 'add_edge', edge: { from: 'a', to: 'b', protocol: 'http' } },
          { action: 'add_edge', edge: { from: 'a', to: 'b', protocol: 'grpc' } },
        ],
      },
      svc,
    );
    // sem informar protocol, from+to casa com as 2 edges criadas acima
    await expect(mutateDiagram({ path, changes: [{ action: 'remove_edge', edge: { from: 'a', to: 'b' } }] }, svc)).rejects.toMatchObject({
      code: 'BAD_REF',
    });
  });

  it('arquivo inexistente lanca NOT_FOUND', async () => {
    await expect(mutateDiagram({ path: 'diagrams/nao-existe-mut.yaml', changes: [{ action: 'clear_hints' }] }, svc)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

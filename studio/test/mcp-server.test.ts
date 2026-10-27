import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMcpServer } from '../mcp/server.js';
import type { ServiceOptions } from '../mcp/service.js';

let root: string;
let svc: ServiceOptions;
let client: Client;

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-server-test-')));
  svc = { repoRoot: root, allowedRoots: [root], catalogConfig: { mode: 'off', url: '' } };
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

beforeEach(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(svc);
  await server.connect(serverTransport);
  client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
});

describe('servidor MCP (cliente em memoria)', () => {
  it('lista as tools registradas', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'catalog_reindex',
        'catalog_search',
        'diagram_apply',
        'diagram_create',
        'diagram_export',
        'diagram_preview',
        'diagram_read',
        'templates_list',
        'vocabulary_get',
      ].sort(),
    );
  });

  it('vocabulary_get devolve os enums do core', async () => {
    const result = await client.callTool({ name: 'vocabulary_get', arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ statuses: ['new', 'changed', 'unchanged'] });
  });

  it('diagram_create cria um diagrama novo e diagram_apply edita por cima', async () => {
    const created = await client.callTool({
      name: 'diagram_create',
      arguments: {
        path: 'diagrams/mcp-client-test.yaml',
        title: 'Criado via MCP',
        changes: [
          { action: 'add_node', node: { id: 'a', label: 'A', type: 'microservice', status: 'new' } },
          { action: 'add_node', node: { id: 'b', label: 'B', type: 'microservice', status: 'new' } },
          { action: 'add_edge', edge: { from: 'a', to: 'b', protocol: 'http' } },
        ],
      },
    });
    expect(created.isError).not.toBe(true);
    expect((created.structuredContent as { written: string[] }).written).toHaveLength(3);

    const applied = await client.callTool({
      name: 'diagram_apply',
      arguments: { path: 'diagrams/mcp-client-test.yaml', changes: [{ action: 'update_node', id: 'a', set: { label: 'A editado' } }] },
    });
    expect(applied.isError).not.toBe(true);

    const read = await client.callTool({ name: 'diagram_read', arguments: { path: 'diagrams/mcp-client-test.yaml' } });
    expect(read.isError).not.toBe(true);
    const outline = (read.structuredContent as { outline: { nodes: { id: string; label: string }[] } }).outline;
    expect(outline.nodes.find((n) => n.id === 'a')?.label).toBe('A editado');
  });

  it('diagram_apply com dryRun nao grava nada em disco', async () => {
    await client.callTool({
      name: 'diagram_create',
      arguments: {
        path: 'diagrams/mcp-dry-run.yaml',
        title: 'Dry run',
        changes: [{ action: 'add_node', node: { id: 'a', label: 'A', type: 'microservice', status: 'new' } }],
      },
    });
    const dry = await client.callTool({
      name: 'diagram_apply',
      arguments: { path: 'diagrams/mcp-dry-run.yaml', dryRun: true, changes: [{ action: 'update_node', id: 'a', set: { label: 'Nunca grava' } }] },
    });
    expect(dry.isError).not.toBe(true);
    const read = await client.callTool({ name: 'diagram_read', arguments: { path: 'diagrams/mcp-dry-run.yaml' } });
    const outline = (read.structuredContent as { outline: { nodes: { id: string; label: string }[] } }).outline;
    expect(outline.nodes.find((n) => n.id === 'a')?.label).toBe('A'); // nao mudou -- dryRun nao grava
  });

  it('diagram_preview devolve o PNG como imagem', async () => {
    await client.callTool({
      name: 'diagram_create',
      arguments: {
        path: 'diagrams/mcp-preview.yaml',
        title: 'Preview',
        changes: [{ action: 'add_node', node: { id: 'a', label: 'A', type: 'microservice', status: 'new' } }],
      },
    });
    const preview = await client.callTool({ name: 'diagram_preview', arguments: { path: 'diagrams/mcp-preview.yaml' } });
    expect(preview.isError).not.toBe(true);
    const [content] = preview.content!;
    expect(content!.type).toBe('image');
    expect((content as { mimeType: string }).mimeType).toBe('image/png');
  });

  it('erro de dominio (NOT_FOUND) vem com isError e o codigo em structuredContent', async () => {
    const result = await client.callTool({ name: 'diagram_read', arguments: { path: 'diagrams/nao-existe.yaml' } });
    expect(result.isError).toBe(true);
    expect((result.structuredContent as { code: string }).code).toBe('NOT_FOUND');
  });
});

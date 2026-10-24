import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandler, type HandlerOptions } from '../server/app.js';
import { parse as parseYaml } from 'yaml';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function path(rel: string): string {
  return fileURLToPath(new URL(`../../${rel}`, import.meta.url));
}

let server: Server;
let baseUrl: string;
const opts: HandlerOptions = { repoRoot: REPO_ROOT, allowedRoots: [REPO_ROOT], port: 0, viteMiddlewares: null };

beforeAll(async () => {
  const handler = createHandler(opts);
  server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('falha ao obter a porta do servidor de teste');
  opts.port = address.port;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server.close();
});

interface DropBody {
  source: string;
  draggedId: string;
  container: string;
  rank: number;
  orderIndex: number;
}

async function drop(body: DropBody): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}/api/drop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function render(source: string): Promise<{ ok: boolean; report?: { violations: string[] } }> {
  const res = await fetch(`${baseUrl}/api/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });
  return (await res.json()) as { ok: boolean; report?: { violations: string[] } };
}

describe('/api/drop', () => {
  it('move um node para outro grupo, grava "group" no YAML e o resultado continua valido com 0 violacoes', async () => {
    const source = readFileSync(path('examples/intera-bff/intera-bff.yaml'), 'utf-8');
    const { status, body } = await drop({ source, draggedId: 'orders-api', container: 'data', rank: 2, orderIndex: 1 });
    expect(status).toBe(200);
    const { source: newSource } = body as { source: string };

    const parsed = parseYaml(newSource) as { nodes: { id: string; group?: string }[] };
    const ordersApi = parsed.nodes.find((n) => n.id === 'orders-api');
    expect(ordersApi?.group).toBe('data');

    const rendered = await render(newSource);
    expect(rendered.ok).toBe(true);
    expect(rendered.report?.violations).toEqual([]);
  });

  it('reordenar dentro do mesmo rank (sem mudar de grupo) continua valido com 0 violacoes', async () => {
    const source = readFileSync(path('examples/intera-bff/intera-bff.yaml'), 'utf-8');
    // api-gateway e intera-bff estao ambos no "miolo" do fluxo -- um drop trivial no proprio lugar
    const { status, body } = await drop({ source, draggedId: 'api-gateway', container: 'edge', rank: 1, orderIndex: 0 });
    expect(status).toBe(200);
    const { source: newSource } = body as { source: string };
    const rendered = await render(newSource);
    expect(rendered.ok).toBe(true);
    expect(rendered.report?.violations).toEqual([]);
  });

  it('move um node de volta para fora de qualquer grupo (root)', async () => {
    const source = readFileSync(path('examples/intera-bff/intera-bff.yaml'), 'utf-8');
    const { status, body } = await drop({ source, draggedId: 'orders-api', container: '__root__', rank: 0, orderIndex: 0 });
    expect(status).toBe(200);
    const { source: newSource } = body as { source: string };
    const parsed = parseYaml(newSource) as { nodes: { id: string; group?: string }[] };
    expect(parsed.nodes.find((n) => n.id === 'orders-api')?.group).toBeUndefined();
    const rendered = await render(newSource);
    expect(rendered.ok).toBe(true);
    expect(rendered.report?.violations).toEqual([]);
  });

  it('draggedId inexistente retorna 400', async () => {
    const source = readFileSync(path('examples/intera-bff/intera-bff.yaml'), 'utf-8');
    const { status } = await drop({ source, draggedId: 'nao-existe-xyz', container: 'data', rank: 0, orderIndex: 0 });
    expect(status).toBe(400);
  });

  it('campo obrigatorio ausente retorna 400', async () => {
    const res = await fetch(`${baseUrl}/api/drop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'version: 1', draggedId: 'a' }),
    });
    expect(res.status).toBe(400);
  });

  it('YAML de entrada invalido retorna 422', async () => {
    const { status } = await drop({ source: 'version: 1\ntitle: X\nnodes: []\n', draggedId: 'a', container: '__root__', rank: 0, orderIndex: 0 });
    expect(status).toBe(422);
  });

  it('poda: containers nao afetados pelo drop nao ganham nenhum hint rank/order novo', async () => {
    const source = readFileSync(path('examples/intera-bff/intera-bff.yaml'), 'utf-8');
    const { status, body } = await drop({ source, draggedId: 'orders-api', container: 'data', rank: 2, orderIndex: 1 });
    expect(status).toBe(200);
    const { source: newSource } = body as { source: string };
    const parsed = parseYaml(newSource) as {
      groups: { id: string; rank?: number; order?: number }[];
      nodes: { id: string; group?: string; rank?: number; order?: number }[];
    };

    // nenhum desses pertence aos containers afetados pelo drop (origem "core", destino "data") --
    // nao deveriam ganhar rank/order so por causa deste drop
    const untouchedIds = ['clients', 'edge', 'intera', 'messaging', 'web-app', 'api-gateway', 'intera-bff', 'intera-events', 'notifier', 'sendgrid'];
    for (const id of untouchedIds) {
      const item = parsed.groups.find((g) => g.id === id) ?? parsed.nodes.find((n) => n.id === id);
      expect(item, `${id} deveria existir`).toBeDefined();
      expect(item).not.toHaveProperty('rank');
      expect(item).not.toHaveProperty('order');
    }

    // o grupo de origem ("core"), que ficou vazio, nao precisa de nenhum hint (nao tem mais filhos para ordenar)
    const core = parsed.groups.find((g) => g.id === 'core');
    expect(core).not.toHaveProperty('rank');
    expect(core).not.toHaveProperty('order');
  });

  it('poda: preserva um hint manual que o item ja tinha ANTES deste drop, mesmo que pareca redundante', async () => {
    const source = readFileSync(path('examples/intera-bff/intera-bff.yaml'), 'utf-8');
    // da um hint manual a pg-main (fica no mesmo container "data" que sera afetado pelo drop)
    const withManualHint = source.replace(
      '{ id: pg-main, label: "Postgres principal", type: database, status: unchanged, tech: "PostgreSQL 16 · AWS RDS", group: data }',
      '{ id: pg-main, label: "Postgres principal", type: database, status: unchanged, tech: "PostgreSQL 16 · AWS RDS", group: data, rank: 2, order: 0 }',
    );
    expect(withManualHint).not.toBe(source); // confirma que o replace encontrou a linha esperada

    const { status, body } = await drop({ source: withManualHint, draggedId: 'orders-api', container: 'data', rank: 2, orderIndex: 1 });
    expect(status).toBe(200);
    const { source: newSource } = body as { source: string };
    const parsed = parseYaml(newSource) as { nodes: { id: string; rank?: number; order?: number }[] };
    const pgMain = parsed.nodes.find((n) => n.id === 'pg-main');
    // o hint manual de pg-main sobrevive (fixado pelo pin, nunca candidato a poda)
    expect(pgMain).toHaveProperty('rank');
    expect(pgMain).toHaveProperty('order');
  });

  it('move um GRUPO (nao so node) via HTTP: grava "parent" e preserva os filhos dentro dele', async () => {
    const source = readFileSync(path('examples/showcase/showcase.yaml'), 'utf-8');
    // "aws-edge" e subgrupo de "aws" (parent: aws); move para fora, para o root
    const { status, body } = await drop({ source, draggedId: 'aws-edge', container: '__root__', rank: 1, orderIndex: 0 });
    expect(status).toBe(200);
    const { source: newSource } = body as { source: string };

    const parsed = parseYaml(newSource) as {
      groups: { id: string; parent?: string }[];
      nodes: { id: string; group?: string }[];
    };
    const awsEdge = parsed.groups.find((g) => g.id === 'aws-edge');
    expect(awsEdge?.parent).toBeUndefined();
    // os filhos de aws-edge continuam apontando para ele -- moveram junto, mesmo sem edicao propria
    for (const childId of ['cdn', 'lb', 'gw']) {
      expect(parsed.nodes.find((n) => n.id === childId)?.group).toBe('aws-edge');
    }

    const rendered = await render(newSource);
    expect(rendered.ok).toBe(true);
    expect(rendered.report?.violations).toEqual([]);
  });

  it('aplica drops sucessivos encadeados e o resultado final continua valido', async () => {
    let source = readFileSync(path('examples/intera-bff/intera-bff.yaml'), 'utf-8');

    const first = await drop({ source, draggedId: 'orders-api', container: 'data', rank: 2, orderIndex: 1 });
    expect(first.status).toBe(200);
    source = (first.body as { source: string }).source;

    const second = await drop({ source, draggedId: 'notifier', container: 'messaging', rank: 3, orderIndex: 0 });
    expect(second.status).toBe(200);
    source = (second.body as { source: string }).source;

    const rendered = await render(source);
    expect(rendered.ok).toBe(true);
    expect(rendered.report?.violations).toEqual([]);
  });
});

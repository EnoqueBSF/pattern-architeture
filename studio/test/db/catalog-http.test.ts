import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHandler, type HandlerOptions } from '../../server/app.js';
import { connectTestDb, truncateAll, TEST_DB_URL } from './helpers.js';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

function path(rel: string): string {
  return fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
}

let server: Server;
let baseUrl: string;
let allowedRoot: string;
let sql: Sql;
const opts: HandlerOptions = {
  repoRoot: REPO_ROOT,
  allowedRoots: [],
  port: 0,
  viteMiddlewares: null,
  catalog: { mode: 'on', url: TEST_DB_URL },
};

beforeAll(async () => {
  sql = await connectTestDb();
  // realpath: /tmp e symlink para /private/tmp no macOS -- assertAllowedPath resolve o caminho
  // real antes de gravar, entao o teste precisa comparar contra o mesmo caminho resolvido.
  allowedRoot = realpathSync(mkdtempSync(join(tmpdir(), 'catalog-http-db-test-')));
  opts.allowedRoots = [allowedRoot];

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

beforeEach(async () => {
  await truncateAll(sql);
});

afterAll(async () => {
  server.close();
  rmSync(allowedRoot, { recursive: true, force: true });
  await sql.end({ timeout: 0 });
});

describe('PUT /api/file indexa no catalogo, GET /api/catalog/search encontra', () => {
  it('salva via HTTP e encontra via busca, com last_writer=studio', async () => {
    const source = `version: 1\ntitle: "Encontravel via HTTP"\nnodes:\n  - { id: a, label: A, type: generic, status: unchanged }\n`;
    const target = join(allowedRoot, 'http-db-smoke.yaml');

    const putRes = await fetch(`${baseUrl}/api/file`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target, source }),
    });
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as { catalog: { indexed: boolean } };
    expect(putBody.catalog.indexed).toBe(true);

    const searchRes = await fetch(`${baseUrl}/api/catalog/search?q=encontravel`);
    expect(searchRes.status).toBe(200);
    const searchBody = (await searchRes.json()) as { items: { title: string; path: string }[] };
    expect(searchBody.items).toHaveLength(1);
    expect(searchBody.items[0]!.title).toBe('Encontravel via HTTP');

    const rows = await sql<{ last_writer: string }[]>`SELECT last_writer FROM diagrams WHERE path = ${target}`;
    expect(rows[0]!.last_writer).toBe('studio');
  });

  it('GET /api/catalog/status reflete a contagem real', async () => {
    const source = readFileSync(path('templates/diagram.template.yaml'), 'utf-8');
    await fetch(`${baseUrl}/api/file`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: join(allowedRoot, 'status-check.yaml'), source }),
    });

    const res = await fetch(`${baseUrl}/api/catalog/status`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; count: number };
    expect(body.status).toBe('ok');
    expect(body.count).toBe(1);
  });
});

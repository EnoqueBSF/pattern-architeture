import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandler, type HandlerOptions } from '../server/app.js';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function path(rel: string): string {
  return fileURLToPath(new URL(`../../${rel}`, import.meta.url));
}

let server: Server;
let baseUrl: string;
let allowedRoot: string;
const opts: HandlerOptions = {
  repoRoot: REPO_ROOT,
  allowedRoots: [],
  port: 0,
  viteMiddlewares: null,
  catalog: { mode: 'off', url: '' }, // catalogo explicitamente desligado por instancia -- nao depende de env vars globais
};

beforeAll(async () => {
  allowedRoot = mkdtempSync(join(tmpdir(), 'catalog-http-test-'));
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

afterAll(() => {
  server.close();
  rmSync(allowedRoot, { recursive: true, force: true });
});

describe('/api/catalog/* com catalogo desligado (HandlerOptions.catalog = {mode: "off"})', () => {
  it('GET /api/catalog/status retorna 503', async () => {
    const res = await fetch(`${baseUrl}/api/catalog/status`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('disabled');
  });

  it('GET /api/catalog/search retorna 503', async () => {
    const res = await fetch(`${baseUrl}/api/catalog/search?q=kafka`);
    expect(res.status).toBe(503);
  });

  it('POST /api/catalog/reindex retorna 503', async () => {
    const res = await fetch(`${baseUrl}/api/catalog/reindex`, { method: 'POST' });
    expect(res.status).toBe(503);
  });
});

describe('PUT /api/file continua funcionando sem o catalogo (regressao: Studio funciona sem banco)', () => {
  it('grava os 3 arquivos no disco e retorna 200 com catalog.indexed=false', async () => {
    const source = readFileSync(path('templates/diagram.template.yaml'), 'utf-8');
    const target = join(allowedRoot, 'sem-catalogo.yaml');

    const res = await fetch(`${baseUrl}/api/file`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target, source }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { written: string[]; catalog: { indexed: boolean; reason?: string } };
    expect(body.written).toHaveLength(3);
    expect(body.catalog).toEqual({ indexed: false, reason: 'catalogo offline' });

    for (const file of body.written) {
      expect(() => readFileSync(file)).not.toThrow();
    }
  });
});

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandler, type HandlerOptions } from '../server/app.js';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const GOLDEN_FILES = ['examples/intera-bff/intera-bff', 'examples/showcase/showcase', 'examples/icon-cards/icon-cards', 'diagrams/demo/checkout-novo-servico'];

function path(rel: string): string {
  return fileURLToPath(new URL(`../../${rel}`, import.meta.url));
}

let server: Server;
let baseUrl: string;
const opts: HandlerOptions = {
  repoRoot: REPO_ROOT,
  allowedRoots: [REPO_ROOT],
  port: 0,
  viteMiddlewares: null,
};

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

describe.each(GOLDEN_FILES)('paridade: %s', (base) => {
  it('o SVG de /api/render bate byte a byte com o .svg em disco', async () => {
    const filePath = path(`${base}.yaml`);
    const expectedSvg = readFileSync(path(`${base}.svg`), 'utf-8');

    const fileRes = await fetch(`${baseUrl}/api/file?path=${encodeURIComponent(filePath)}`);
    expect(fileRes.status).toBe(200);
    const file = (await fileRes.json()) as { source: string };

    const renderRes = await fetch(`${baseUrl}/api/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: file.source }),
    });
    expect(renderRes.status).toBe(200);
    const result = (await renderRes.json()) as { ok: boolean; svg: string };
    expect(result.ok).toBe(true);
    expect(result.svg).toBe(expectedSvg);
  });
});

/** fetch() nativo (undici) reescreve o header Host com base na URL -- http.request permite customiza-lo de verdade. */
function requestWithHost(reqPath: string, host: string): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port: opts.port, path: reqPath, method: 'GET', headers: { Host: host } }, (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0 });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('seguranca basica do handler', () => {
  it('Host header fora da allowlist retorna 403', async () => {
    const { status } = await requestWithHost('/api/health', 'evil.com');
    expect(status).toBe(403);
  });

  it('Host valido (127.0.0.1) retorna 200', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
  });

  it('GET /api/file fora dos allowedRoots retorna 403 (arquivo existe, mas fora da allowlist)', async () => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'studio-parity-'));
    const outsideFile = join(outsideDir, 'outside.yaml');
    writeFileSync(outsideFile, 'version: 1\ntitle: fora\nnodes:\n  - { id: a, label: A, type: generic, status: unchanged }\n', 'utf-8');
    try {
      const res = await fetch(`${baseUrl}/api/file?path=${encodeURIComponent(outsideFile)}`);
      expect(res.status).toBe(403);
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('GET /api/file para arquivo inexistente (mas dentro da allowlist) retorna 404', async () => {
    const res = await fetch(`${baseUrl}/api/file?path=${encodeURIComponent(path('examples/nao-existe-123.yaml'))}`);
    expect(res.status).toBe(404);
  });

  it('GET /api/file com caminho relativo retorna 400', async () => {
    const res = await fetch(`${baseUrl}/api/file?path=${encodeURIComponent('examples/showcase/showcase.yaml')}`);
    expect(res.status).toBe(400);
  });
});

describe('/api/export', () => {
  it('SVG exportado bate byte a byte com o .svg em disco', async () => {
    const filePath = path('examples/intera-bff/intera-bff.yaml');
    const expectedSvg = readFileSync(path('examples/intera-bff/intera-bff.svg'), 'utf-8');
    const source = readFileSync(filePath, 'utf-8');

    const res = await fetch(`${baseUrl}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, format: 'svg', filename: 'intera-bff' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="intera-bff.svg"');
    expect(await res.text()).toBe(expectedSvg);
  });

  it('PNG exportado (scale default 2) bate byte a byte com o .png em disco', async () => {
    const filePath = path('examples/intera-bff/intera-bff.yaml');
    const expectedPng = readFileSync(path('examples/intera-bff/intera-bff.png'));
    const source = readFileSync(filePath, 'utf-8');

    const res = await fetch(`${baseUrl}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, format: 'png', filename: 'intera-bff' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.equals(expectedPng)).toBe(true);
  });

  it('sanitiza o filename para o header Content-Disposition', async () => {
    const source = readFileSync(path('examples/showcase/showcase.yaml'), 'utf-8');
    const res = await fetch(`${baseUrl}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, format: 'svg', filename: '../../etc/passwd; evil' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="..-..-etc-passwd-evil.svg"');
  });

  it('diagrama invalido retorna 422 com as issues', async () => {
    const res = await fetch(`${baseUrl}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'version: 1\ntitle: X\nnodes: []\n', format: 'svg' }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { issues: unknown[] };
    expect(body.issues.length).toBeGreaterThan(0);
  });
});

describe('/api/meta', () => {
  it('expoe os enums do schema e a altura da faixa de titulo', async () => {
    const res = await fetch(`${baseUrl}/api/meta`);
    const meta = (await res.json()) as { nodeTypes: string[]; titleBarHeight: number; root: string };
    expect(meta.nodeTypes).toContain('microservice');
    expect(meta.titleBarHeight).toBeGreaterThan(0);
    expect(meta.root).toBe('__root__');
  });
});

describe('/api/templates e /api/template', () => {
  it('lista pelo menos os templates "blank" e "card-completo"', async () => {
    const res = await fetch(`${baseUrl}/api/templates`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { templates: { id: string; label: string; description: string }[] };
    const ids = body.templates.map((t) => t.id);
    expect(ids).toContain('blank');
    expect(ids).toContain('card-completo');
    for (const t of body.templates) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('GET /api/template sem id devolve o template "blank"', async () => {
    const res = await fetch(`${baseUrl}/api/template`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string };
    expect(body.source).toBe(readFileSync(path('templates/diagram.template.yaml'), 'utf-8'));
  });

  it('GET /api/template?id=card-completo devolve um diagrama valido com icon/slug/subtitle/badge', async () => {
    const res = await fetch(`${baseUrl}/api/template?id=card-completo`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string };
    expect(body.source).toBe(readFileSync(path('templates/card-completo.template.yaml'), 'utf-8'));

    const renderRes = await fetch(`${baseUrl}/api/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: body.source }),
    });
    const rendered = (await renderRes.json()) as { ok: boolean; report?: { violations: string[] } };
    expect(rendered.ok).toBe(true);
    expect(rendered.report?.violations).toEqual([]);
  });

  it('GET /api/template?id=inexistente retorna 404', async () => {
    const res = await fetch(`${baseUrl}/api/template?id=nao-existe-xyz`);
    expect(res.status).toBe(404);
  });
});

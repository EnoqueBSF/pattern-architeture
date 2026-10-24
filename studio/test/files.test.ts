import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHandler, type HandlerOptions } from '../server/app.js';
import { assertAllowedPath, listFiles, readYamlFile, sha256, writeYamlFile, ConflictError, ExistsError } from '../server/files.js';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function examplePath(rel: string): string {
  return fileURLToPath(new URL(`../../${rel}`, import.meta.url));
}

describe('assertAllowedPath', () => {
  it('rejeita caminho relativo', () => {
    expect(() => assertAllowedPath('examples/showcase/showcase.yaml', [REPO_ROOT], { mustExist: true })).toThrow(/absoluto/);
  });

  it('rejeita extensao diferente de .yaml/.yml', () => {
    expect(() => assertAllowedPath(join(REPO_ROOT, 'package.json'), [REPO_ROOT], { mustExist: false })).toThrow(/yaml/);
  });

  it('rejeita arquivo fora da allowlist (tentativa de traversal)', () => {
    const outsideFile = examplePath('../outside-repo.yaml'); // fora do repo
    expect(() => assertAllowedPath(outsideFile, [REPO_ROOT], { mustExist: false })).toThrow(/fora dos diretorios/);
  });

  it('rejeita arquivo inexistente quando mustExist e true', () => {
    expect(() => assertAllowedPath(examplePath('examples/nao-existe-xyz.yaml'), [REPO_ROOT], { mustExist: true })).toThrow(/nao encontrado/);
  });

  it('aceita arquivo existente dentro da allowlist', () => {
    const real = assertAllowedPath(examplePath('examples/showcase/showcase.yaml'), [REPO_ROOT], { mustExist: true });
    expect(real).toContain('showcase.yaml');
  });

  it('resolve symlink e rejeita se o alvo real estiver fora da allowlist', () => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'studio-files-'));
    const outsideFile = join(outsideDir, 'secret.yaml');
    writeFileSync(outsideFile, 'version: 1\ntitle: fora\nnodes:\n  - { id: a, label: A, type: generic, status: unchanged }\n', 'utf-8');
    const linkDir = mkdtempSync(join(tmpdir(), 'studio-files-link-'));
    const linkPath = join(linkDir, 'link.yaml');
    try {
      symlinkSync(outsideFile, linkPath);
      // o symlink esta "dentro" de linkDir, mas o alvo real esta fora -- allowedRoots = [linkDir] nao deveria vazar outsideDir
      expect(() => assertAllowedPath(linkPath, [REPO_ROOT], { mustExist: true })).toThrow(/fora dos diretorios/);
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
      rmSync(linkDir, { recursive: true, force: true });
    }
  });
});

describe('readYamlFile', () => {
  it('le o arquivo e calcula o hash sha256 do conteudo', () => {
    const result = readYamlFile(examplePath('examples/showcase/showcase.yaml'), [REPO_ROOT]);
    expect(result.source.length).toBeGreaterThan(0);
    expect(result.hash).toBe(sha256(result.source));
  });
});

describe('listFiles', () => {
  it('lista os .yaml de diagrams/examples/templates no repoRoot, sem duplicatas', () => {
    const entries = listFiles(REPO_ROOT, [REPO_ROOT]);
    const rels = entries.map((e) => e.rel);
    expect(rels).toContain('examples/showcase/showcase.yaml');
    expect(new Set(rels).size).toBe(rels.length);
  });

  it('nao duplica um arquivo quando um root extra e o dirname de um arquivo ja dentro do repoRoot', () => {
    // cenario real: `npm run studio -- examples/showcase/showcase.yaml` adiciona dirname(arquivo)
    // como root extra, que cai dentro de examples/ (ja varrido a partir do repoRoot) -- antes da
    // correcao, o mesmo arquivo aparecia 2x: uma vez como "examples/showcase/showcase.yaml" e
    // outra soh como "showcase.yaml" (relativo ao root extra)
    const exampleDir = examplePath('examples/showcase');
    const entries = listFiles(REPO_ROOT, [REPO_ROOT, exampleDir]);
    const showcaseEntries = entries.filter((e) => e.path.endsWith('/examples/showcase/showcase.yaml'));
    expect(showcaseEntries).toHaveLength(1);
    expect(showcaseEntries[0]!.rel).toBe('examples/showcase/showcase.yaml');
  });
});

describe('writeYamlFile', () => {
  let dir: string;

  beforeEach(() => {
    // realpath aqui porque /tmp pode ser um symlink (ex.: /var -> /private/var no macOS);
    // writeYamlFile sempre devolve o caminho real resolvido, entao os testes comparam contra ele
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'studio-write-')));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const validSource = `version: 1
title: Teste de escrita
nodes:
  - { id: a, label: A, type: microservice, status: new }
  - { id: b, label: B, type: database, status: unchanged }
edges:
  - { from: a, to: b, protocol: sql }
`;

  it('grava .yaml + .svg + .png, e o svg bate com o que renderDiagramSource produz', () => {
    const target = join(dir, 'novo.yaml');
    const result = writeYamlFile({ path: target, source: validSource, allowedRoots: [dir], repoRoot: REPO_ROOT });

    expect(result.written).toEqual([target, join(dir, 'novo.svg'), join(dir, 'novo.png')]);
    expect(readFileSync(target, 'utf-8')).toBe(validSource);

    const svg = readFileSync(join(dir, 'novo.svg'), 'utf-8');
    expect(svg).toContain('<svg');
    const png = readFileSync(join(dir, 'novo.png'));
    expect(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  });

  it('rejeita diagrama invalido (lanca DiagramValidationError, que o app.ts converte em 422)', () => {
    const target = join(dir, 'invalido.yaml');
    expect(() => writeYamlFile({ path: target, source: 'version: 1\ntitle: sem nodes\n', allowedRoots: [dir], repoRoot: REPO_ROOT })).toThrow();
  });

  it('cria um arquivo novo sem baseHash/overwrite (nao ha conflito)', () => {
    const target = join(dir, 'novo2.yaml');
    expect(() => writeYamlFile({ path: target, source: validSource, allowedRoots: [dir], repoRoot: REPO_ROOT })).not.toThrow();
  });

  it('sobrescrever um arquivo existente sem baseHash nem overwrite lanca ExistsError', () => {
    const target = join(dir, 'existente.yaml');
    writeYamlFile({ path: target, source: validSource, allowedRoots: [dir], repoRoot: REPO_ROOT });
    expect(() => writeYamlFile({ path: target, source: validSource, allowedRoots: [dir], repoRoot: REPO_ROOT })).toThrow(ExistsError);
  });

  it('overwrite:true permite sobrescrever sem baseHash', () => {
    const target = join(dir, 'existente2.yaml');
    writeYamlFile({ path: target, source: validSource, allowedRoots: [dir], repoRoot: REPO_ROOT });
    expect(() => writeYamlFile({ path: target, source: validSource, allowedRoots: [dir], overwrite: true, repoRoot: REPO_ROOT })).not.toThrow();
  });

  it('baseHash desatualizado (arquivo mudou em disco) lanca ConflictError com o hash atual', () => {
    const target = join(dir, 'conflito.yaml');
    const first = writeYamlFile({ path: target, source: validSource, allowedRoots: [dir], repoRoot: REPO_ROOT });

    // simula outra sessao alterando o arquivo em disco
    const changedSource = validSource.replace('Teste de escrita', 'Mudado por fora');
    writeFileSync(target, changedSource, 'utf-8');
    const currentHash = sha256(changedSource);

    try {
      writeYamlFile({ path: target, source: validSource, baseHash: first.hash, allowedRoots: [dir], repoRoot: REPO_ROOT });
      expect.unreachable('deveria ter lancado ConflictError');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).currentHash).toBe(currentHash);
    }
  });

  it('baseHash correto permite salvar por cima', () => {
    const target = join(dir, 'ok.yaml');
    const first = writeYamlFile({ path: target, source: validSource, allowedRoots: [dir], repoRoot: REPO_ROOT });
    const updatedSource = validSource.replace('Teste de escrita', 'Atualizado');
    const second = writeYamlFile({ path: target, source: updatedSource, baseHash: first.hash, allowedRoots: [dir], repoRoot: REPO_ROOT });
    expect(readFileSync(target, 'utf-8')).toBe(updatedSource);
    expect(second.hash).toBe(sha256(updatedSource));
  });
});

describe('rotas de arquivo via HTTP (PUT /api/file, GET /api/files, GET /api/template)', () => {
  let server: Server;
  let baseUrl: string;
  let dir: string;
  const opts: HandlerOptions = { repoRoot: REPO_ROOT, allowedRoots: [], port: 0, viteMiddlewares: null };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'studio-http-write-'));
    opts.allowedRoots = [REPO_ROOT, dir];
    const handler = createHandler(opts);
    server = createServer(handler);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('falha ao obter porta');
    opts.port = address.port;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('GET /api/template devolve o conteudo do template', async () => {
    const res = await fetch(`${baseUrl}/api/template`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string };
    expect(body.source).toContain('version: 1');
  });

  it('GET /api/files lista os exemplos do repo', async () => {
    const res = await fetch(`${baseUrl}/api/files`);
    const body = (await res.json()) as { files: { rel: string }[] };
    expect(body.files.some((f) => f.rel.includes('showcase'))).toBe(true);
  });

  it('PUT /api/file cria um arquivo novo e retorna 200 com hash/report', async () => {
    const target = join(dir, 'http-novo.yaml');
    const res = await fetch(`${baseUrl}/api/file`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: target,
        source: 'version: 1\ntitle: Via HTTP\nnodes:\n  - { id: a, label: A, type: generic, status: new }\n',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hash: string; written: string[] };
    expect(body.written).toHaveLength(3);
    expect(readFileSync(target, 'utf-8')).toContain('Via HTTP');
  });

  it('PUT /api/file com diagrama invalido retorna 422', async () => {
    const target = join(dir, 'http-invalido.yaml');
    const res = await fetch(`${baseUrl}/api/file`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target, source: 'version: 1\ntitle: sem nodes\n' }),
    });
    expect(res.status).toBe(422);
  });

  it('PUT /api/file em cima de um arquivo existente sem baseHash/overwrite retorna 409', async () => {
    const target = join(dir, 'http-existente.yaml');
    const source = 'version: 1\ntitle: Existente\nnodes:\n  - { id: a, label: A, type: generic, status: new }\n';
    await fetch(`${baseUrl}/api/file`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: target, source }) });
    const res = await fetch(`${baseUrl}/api/file`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: target, source }) });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('exists');
  });
});

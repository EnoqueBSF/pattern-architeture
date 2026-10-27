import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sql } from 'postgres';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reindex } from '../../catalog/indexer.js';
import { search } from '../../catalog/repo.js';
import { connectTestDb, truncateAll } from './helpers.js';

let sql: Sql;
let repoRoot: string;

const VALID_NODE = `  - { id: a, label: A, type: generic, status: unchanged }\n`;

function writeDiagram(root: string, rel: string, title: string): string {
  const full = join(root, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, `version: 1\ntitle: "${title}"\nnodes:\n${VALID_NODE}`);
  return full;
}

beforeEach(async () => {
  sql ??= await connectTestDb();
  await truncateAll(sql);
  repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'indexer-test-')));
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

afterAll(async () => {
  await sql?.end({ timeout: 0 });
});

describe('reindex', () => {
  it('indexa arquivos novos de diagrams/ e examples/, pula templates/', async () => {
    writeDiagram(repoRoot, 'diagrams/demo/a.yaml', 'Diagrama A');
    writeDiagram(repoRoot, 'examples/b.yaml', 'Diagrama B');
    mkdirSync(join(repoRoot, 'templates'), { recursive: true });
    writeFileSync(join(repoRoot, 'templates', 'c.yaml'), `version: 1\ntitle: "Template"\nnodes:\n${VALID_NODE}`);

    const result = await reindex(sql, repoRoot, [repoRoot]);

    expect(result.indexed).toBe(2); // templates/ nao conta
    expect(result.errors).toEqual([]);

    const found = await search(sql, {});
    expect(found.items.map((i) => i.title).sort()).toEqual(['Diagrama A', 'Diagrama B']);
  });

  it('rodar de novo sem mudar nada reporta updated:0, unchanged:N', async () => {
    writeDiagram(repoRoot, 'diagrams/demo/a.yaml', 'Diagrama A');
    await reindex(sql, repoRoot, [repoRoot]);

    const second = await reindex(sql, repoRoot, [repoRoot]);
    expect(second.indexed).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.unchanged).toBe(1);
  });

  it('detecta mudanca de conteudo como updated', async () => {
    const file = writeDiagram(repoRoot, 'diagrams/demo/a.yaml', 'Titulo original');
    await reindex(sql, repoRoot, [repoRoot]);

    writeFileSync(file, `version: 1\ntitle: "Titulo mudou"\nnodes:\n${VALID_NODE}`);
    const second = await reindex(sql, repoRoot, [repoRoot]);

    expect(second.updated).toBe(1);
    expect(second.unchanged).toBe(0);
    const found = await search(sql, {});
    expect(found.items[0]!.title).toBe('Titulo mudou');
  });

  it('remove do catalogo um arquivo apagado do disco (prune so dentro do root varrido)', async () => {
    writeDiagram(repoRoot, 'diagrams/demo/a.yaml', 'Vai ficar');
    const toDelete = writeDiagram(repoRoot, 'diagrams/demo/b.yaml', 'Vai sumir');
    await reindex(sql, repoRoot, [repoRoot]);

    unlinkSync(toDelete);
    const second = await reindex(sql, repoRoot, [repoRoot]);

    expect(second.removed).toBe(1);
    const found = await search(sql, {});
    expect(found.items.map((i) => i.title)).toEqual(['Vai ficar']);
  });

  it('um arquivo invalido vira erro no resultado, sem interromper os demais', async () => {
    writeDiagram(repoRoot, 'diagrams/demo/valido.yaml', 'Valido');
    const invalidPath = join(repoRoot, 'diagrams', 'demo', 'invalido.yaml');
    writeFileSync(invalidPath, 'version: 1\ntitle: X\nnodes: []\n'); // nodes vazio -- invalido pelo schema

    const result = await reindex(sql, repoRoot, [repoRoot]);

    expect(result.indexed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.path).toBe(invalidPath);
  });
});

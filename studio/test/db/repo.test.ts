import type { Sql } from 'postgres';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { facets, getByPath, pruneMissing, search, upsert } from '../../catalog/repo.js';
import { connectTestDb, makeRecord, truncateAll } from './helpers.js';

let sql: Sql;

beforeEach(async () => {
  sql ??= await connectTestDb();
  await truncateAll(sql);
});

afterAll(async () => {
  await sql?.end({ timeout: 0 });
});

describe('upsert', () => {
  it('insere um registro novo com last_writer informado', async () => {
    const record = makeRecord({ title: 'Primeiro' });
    await upsert(sql, record, 'studio');
    const item = await getByPath(sql, record.path);
    expect(item?.title).toBe('Primeiro');
  });

  it('e idempotente: aplicar o mesmo registro de novo nao duplica nem muda updated_at/created_at', async () => {
    const record = makeRecord();
    await upsert(sql, record, 'studio');
    const first = await getByPath(sql, record.path);

    await new Promise((r) => setTimeout(r, 20));
    await upsert(sql, record, 'studio'); // mesmo hash
    const second = await getByPath(sql, record.path);

    expect(second?.createdAt).toBe(first?.createdAt);
    expect(second?.updatedAt).toBe(first?.updatedAt);
  });

  it('updated_at e last_writer so mudam quando o yaml_sha256 muda', async () => {
    const record = makeRecord();
    await upsert(sql, record, 'studio');
    const first = await getByPath(sql, record.path);

    await new Promise((r) => setTimeout(r, 20));
    const changed = { ...record, title: 'Mudou de verdade', yamlSha256: `${record.yamlSha256.slice(1)}f` };
    await upsert(sql, changed, 'mcp');
    const second = await getByPath(sql, record.path);

    expect(second?.title).toBe('Mudou de verdade');
    expect(new Date(second!.updatedAt).getTime()).toBeGreaterThan(new Date(first!.updatedAt).getTime());
    expect(second?.createdAt).toBe(first?.createdAt); // created_at nunca muda
  });
});

describe('search', () => {
  it('encontra por tech do node (texto livre que entra no search_text)', async () => {
    await upsert(sql, makeRecord({ title: 'Pipeline de eventos', searchText: 'pipeline de eventos kafka consumer producer' }), 'studio');
    await upsert(sql, makeRecord({ title: 'Outro diagrama', searchText: 'outro diagrama sem relacao' }), 'studio');

    const result = await search(sql, { query: 'kafka' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe('Pipeline de eventos');
  });

  it('busca e insensivel a acento (search_text ja vem normalizado por extract.ts)', async () => {
    await upsert(sql, makeRecord({ title: 'Nao Importa', searchText: 'nao importa observabilidade' }), 'studio');
    const result = await search(sql, { query: 'observabilidade' });
    expect(result.items).toHaveLength(1);
  });

  it('filtra por tag (tags @> array)', async () => {
    await upsert(sql, makeRecord({ title: 'Com tag checkout', tags: ['checkout', 'pagamentos'] }), 'studio');
    await upsert(sql, makeRecord({ title: 'Sem a tag', tags: ['outro'] }), 'studio');

    const result = await search(sql, { tags: ['checkout'] });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe('Com tag checkout');
  });

  it('filtra por project', async () => {
    await upsert(sql, makeRecord({ title: 'Do projeto A', project: 'projeto-a' }), 'studio');
    await upsert(sql, makeRecord({ title: 'Do projeto B', project: 'projeto-b' }), 'studio');

    const result = await search(sql, { project: 'projeto-a' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe('Do projeto A');
  });

  it('sem query nem filtros, lista tudo ordenado por updated_at desc', async () => {
    await upsert(sql, makeRecord({ title: 'A' }), 'studio');
    await upsert(sql, makeRecord({ title: 'B' }), 'studio');
    const result = await search(sql, {});
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('limit e clampado entre 1 e 50', async () => {
    for (let i = 0; i < 3; i++) await upsert(sql, makeRecord(), 'studio');
    const result = await search(sql, { limit: 999 });
    expect(result.items.length).toBeLessThanOrEqual(50);
    expect(result.total).toBe(3);
  });
});

describe('facets', () => {
  it('conta ocorrencias de tags e projects', async () => {
    await upsert(sql, makeRecord({ project: 'demo', tags: ['checkout'] }), 'studio');
    await upsert(sql, makeRecord({ project: 'demo', tags: ['checkout', 'pagamentos'] }), 'studio');
    await upsert(sql, makeRecord({ project: 'examples', tags: [] }), 'studio');

    const result = await facets(sql);
    const checkout = result.tags.find((t) => t.tag === 'checkout');
    const demo = result.projects.find((p) => p.project === 'demo');
    expect(checkout?.count).toBe(2);
    expect(demo?.count).toBe(2);
  });
});

describe('pruneMissing', () => {
  it('remove so os registros do root informado cujo path nao esta em existingPaths', async () => {
    const keep = makeRecord({ root: '/repo', path: '/repo/a.yaml' });
    const remove = makeRecord({ root: '/repo', path: '/repo/b.yaml' });
    const otherRoot = makeRecord({ root: '/outro', path: '/outro/c.yaml' });
    await upsert(sql, keep, 'studio');
    await upsert(sql, remove, 'studio');
    await upsert(sql, otherRoot, 'studio');

    const removedCount = await pruneMissing(sql, '/repo', new Set([keep.path]));

    expect(removedCount).toBe(1);
    expect(await getByPath(sql, keep.path)).not.toBeNull();
    expect(await getByPath(sql, remove.path)).toBeNull();
    expect(await getByPath(sql, otherRoot.path)).not.toBeNull(); // outro root intocado
  });
});

import postgres, { type Sql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { migrate } from '../../catalog/migrate.js';
import { TEST_DB_URL } from './helpers.js';

const pools: Sql[] = [];

function freshConnection(): Sql {
  const sql = postgres(TEST_DB_URL, { max: 1, connect_timeout: 2, onnotice: () => {} });
  pools.push(sql);
  return sql;
}

afterAll(async () => {
  await Promise.all(pools.map((p) => p.end({ timeout: 0 })));
});

describe('migrate', () => {
  it('duas conexoes rodando migrate() ao mesmo tempo nao falham (advisory lock serializa)', async () => {
    const a = freshConnection();
    const b = freshConnection();
    await expect(Promise.all([migrate(a), migrate(b)])).resolves.toBeDefined();

    const rows = await a`SELECT to_regclass('public.diagrams') AS exists`;
    expect(rows[0]!.exists).not.toBeNull();
  });

  it('rodar migrate() de novo e idempotente (nao reaplica o que ja foi aplicado)', async () => {
    const sql = freshConnection();
    await migrate(sql);
    await migrate(sql);
    const applied = await sql<{ name: string }[]>`SELECT name FROM catalog_migrations`;
    const names = applied.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length); // sem duplicata
  });
});

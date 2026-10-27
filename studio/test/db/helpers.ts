import postgres, { type Sql } from 'postgres';
import { migrate } from '../../catalog/migrate.js';
import type { CatalogRecord } from '../../catalog/extract.js';

export const TEST_DB_URL = 'postgres://pattern:pattern-local-only@127.0.0.1:54747/pattern_catalog_test';

export async function connectTestDb(): Promise<Sql> {
  const sql = postgres(TEST_DB_URL, { max: 2, connect_timeout: 2, onnotice: () => {} });
  await migrate(sql);
  return sql;
}

export async function truncateAll(sql: Sql): Promise<void> {
  await sql`TRUNCATE diagrams RESTART IDENTITY`;
}

let counter = 0;

/** Monta um CatalogRecord sintetico valido, com defaults razoaveis e um path/hash unicos por chamada. */
export function makeRecord(overrides: Partial<CatalogRecord> = {}): CatalogRecord {
  counter += 1;
  return {
    path: `/repo/diagrams/demo/fixture-${counter}.yaml`,
    root: '/repo',
    relPath: `diagrams/demo/fixture-${counter}.yaml`,
    project: 'demo',
    title: `Fixture ${counter}`,
    description: null,
    tags: [],
    direction: 'LR',
    nodeCount: 1,
    edgeCount: 0,
    groupCount: 0,
    yamlSha256: `${counter}`.padStart(64, '0'),
    yamlSnapshot: 'version: 1\n',
    searchText: `fixture ${counter}`,
    ...overrides,
  };
}

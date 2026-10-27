import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from 'postgres';

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));

/** Numero arbitrario fixo que identifica esta aplicacao para pg_advisory_lock -- serializa a aplicacao de migrations entre processos concorrentes (Studio e MCP podem subir ao mesmo tempo). */
const ADVISORY_LOCK_KEY = 847_472_026;

/** Aplica, em ordem, as migrations `.sql` de migrations/ que ainda nao constam em catalog_migrations. Idempotente e seguro entre processos concorrentes via advisory lock. */
export async function migrate(sql: Sql): Promise<void> {
  await sql`SELECT pg_advisory_lock(${ADVISORY_LOCK_KEY})`;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS catalog_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    const appliedRows = await sql<{ name: string }[]>`SELECT name FROM catalog_migrations`;
    const applied = new Set(appliedRows.map((r) => r.name));

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      await sql.unsafe(content);
      await sql`INSERT INTO catalog_migrations (name) VALUES (${file})`;
    }
  } finally {
    await sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
  }
}

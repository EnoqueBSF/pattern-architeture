import { afterEach, describe, expect, it } from 'vitest';
import { closeCatalog, getCatalogSql, getCatalogStatus, markCatalogUnavailable, resetCatalogStateForTests } from '../../catalog/db.js';
import { TEST_DB_URL } from './helpers.js';

describe('getCatalogSql / getCatalogStatus (contra Postgres real)', () => {
  afterEach(async () => {
    await closeCatalog();
    resetCatalogStateForTests();
  });

  it('mode off nunca tenta conectar', async () => {
    const sql = await getCatalogSql({ mode: 'off', url: '' });
    expect(sql).toBeNull();
    expect(getCatalogStatus()).toBe('disabled');
  });

  it('conecta de verdade no banco de teste local e aplica as migrations', async () => {
    const sql = await getCatalogSql({ mode: 'on', url: TEST_DB_URL });
    expect(sql).not.toBeNull();
    expect(getCatalogStatus()).toBe('ok');
    const rows = await sql!`SELECT to_regclass('public.diagrams') AS exists`;
    expect(rows[0]!.exists).not.toBeNull();
  });

  it('chamadas concorrentes para o mesmo config reusam a mesma tentativa de conexao', async () => {
    const config = { mode: 'on' as const, url: TEST_DB_URL };
    const [a, b, c] = await Promise.all([getCatalogSql(config), getCatalogSql(config), getCatalogSql(config)]);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('porta fechada falha rapido e fica unavailable, sem lancar', async () => {
    const start = Date.now();
    const sql = await getCatalogSql({ mode: 'on', url: 'postgres://u:p@127.0.0.1:1/db' });
    const elapsed = Date.now() - start;
    expect(sql).toBeNull();
    expect(getCatalogStatus()).toBe('unavailable');
    expect(elapsed).toBeLessThan(500);
  });

  it('markCatalogUnavailable derruba uma conexao "ok" cacheada e bloqueia reuso imediato (regressao: conexao que cai DEPOIS de conectar nao ficava presa em "ok" para sempre)', async () => {
    const sql = await getCatalogSql({ mode: 'on', url: TEST_DB_URL });
    expect(sql).not.toBeNull();
    expect(getCatalogStatus()).toBe('ok');

    markCatalogUnavailable();
    expect(getCatalogStatus()).toBe('unavailable');

    // imediatamente apos, ainda respeita o RETRY_DELAY_MS -- nao tenta reconectar na hora
    const immediate = await getCatalogSql({ mode: 'on', url: TEST_DB_URL });
    expect(immediate).toBeNull();
    expect(getCatalogStatus()).toBe('unavailable');
  });
});

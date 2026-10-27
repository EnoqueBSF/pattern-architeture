import postgres, { type Sql } from 'postgres';
import { resolveCatalogConfig, type CatalogConfig } from './config.js';
import { migrate } from './migrate.js';

export type CatalogStatus = 'disabled' | 'connecting' | 'ok' | 'unavailable';

const RETRY_DELAY_MS = 30_000;

interface Handle {
  status: CatalogStatus;
  sql: Sql | null;
}

let handle: Handle = { status: 'disabled', sql: null };
let lastAttemptAt = 0;
let initPromise: Promise<void> | null = null;

function createConnection(url: string): Sql {
  // onnotice vazio: o SDK MCP usa stdout como canal JSON-RPC, e um NOTICE do Postgres (ex.: de um
  // "CREATE TABLE IF NOT EXISTS" ou "CREATE DATABASE IF NOT EXISTS") iria para console.log por
  // padrao, corrompendo o protocolo -- aqui so e silenciado, nunca escrito em stdout nem stderr.
  return postgres(url, { max: 2, connect_timeout: 2, onnotice: () => {} });
}

async function tryConnect(config: CatalogConfig): Promise<void> {
  handle = { status: 'connecting', sql: null };
  lastAttemptAt = Date.now();
  const sql = createConnection(config.url);
  try {
    await sql`SELECT 1`;
    await migrate(sql);
    handle = { status: 'ok', sql };
  } catch {
    await sql.end({ timeout: 0 }).catch(() => {});
    handle = { status: 'unavailable', sql: null };
  }
}

/**
 * Garante uma tentativa de conexao e devolve o client `sql` se o catalogo estiver disponivel, ou
 * `null` caso contrario -- nunca lanca. Reusa a conexao existente quando ja esta `ok`; quando
 * `unavailable`, so tenta de novo apos RETRY_DELAY_MS (uma porta fechada em localhost falha na
 * hora, entao isso nao deixa o chamador lento). Chamadas concorrentes esperam a MESMA tentativa
 * em curso (nunca abrem N conexoes simultaneas para a primeira chamada de N requests paralelos).
 */
export async function getCatalogSql(config: CatalogConfig = resolveCatalogConfig()): Promise<Sql | null> {
  if (config.mode === 'off') {
    handle = { status: 'disabled', sql: null };
    return null;
  }

  const shouldRetry = handle.status === 'unavailable' && Date.now() - lastAttemptAt >= RETRY_DELAY_MS;
  if (handle.status === 'disabled' || shouldRetry) {
    if (!initPromise) {
      initPromise = tryConnect(config).finally(() => {
        initPromise = null;
      });
    }
  }
  if (initPromise) await initPromise;

  return handle.status === 'ok' ? handle.sql : null;
}

/** Estado atual, sem tentar conectar -- para endpoints de status que nao devem bloquear. */
export function getCatalogStatus(): CatalogStatus {
  return handle.status;
}

/**
 * Chame quando uma query contra o `sql` retornado por `getCatalogSql` falhar (ex.: o Postgres caiu
 * DEPOIS de uma conexao `ok` ja estabelecida e cacheada -- `getCatalogSql` so revalida a conexao
 * quando o status NAO e `ok`, entao uma queda nao e detectada ate uma query de verdade falhar).
 * Derruba a conexao velha e marca `unavailable`, para a proxima chamada tentar reconectar.
 */
export function markCatalogUnavailable(): void {
  if (handle.sql) void handle.sql.end({ timeout: 0 }).catch(() => {});
  handle = { status: 'unavailable', sql: null };
  lastAttemptAt = Date.now();
}

export async function closeCatalog(): Promise<void> {
  if (handle.sql) await handle.sql.end({ timeout: 0 }).catch(() => {});
  handle = { status: 'disabled', sql: null };
  initPromise = null;
}

/** Para testes: reseta o estado do modulo entre casos (o handle e singleton no modulo). */
export function resetCatalogStateForTests(): void {
  handle = { status: 'disabled', sql: null };
  lastAttemptAt = 0;
  initPromise = null;
}

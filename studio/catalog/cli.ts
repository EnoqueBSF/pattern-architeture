/**
 * CLI do catalogo local (Postgres opcional, ver docs/STUDIO.md secao Catalogo).
 *
 * uso:
 *   npm run catalog:status
 *   npm run catalog:reindex [-- --root <dir>]
 *   npm run catalog:reset -- --yes
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeCatalog, getCatalogSql } from './db.js';
import { reindex } from './indexer.js';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DATA_DIR = fileURLToPath(new URL('../data/postgres', import.meta.url));
const COMPOSE_FILE = fileURLToPath(new URL('./compose.yaml', import.meta.url));

interface ParsedArgs {
  command: string | undefined;
  roots: string[];
  yes: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0];
  const roots: string[] = [];
  let yes = false;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--root') roots.push(argv[++i]!);
    else if (argv[i] === '--yes') yes = true;
  }
  return { command, roots, yes };
}

async function cmdStatus(): Promise<void> {
  const sql = await getCatalogSql();
  if (!sql) {
    console.log('catalogo: offline (rode "npm run catalog:up")');
    process.exitCode = 1;
    return;
  }
  const rows = await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM diagrams`;
  console.log(`catalogo: ok, ${rows[0]!.count} diagrama(s) indexado(s)`);
}

async function cmdReindex(extraRoots: string[]): Promise<void> {
  const sql = await getCatalogSql();
  if (!sql) {
    console.error('catalogo offline -- rode "npm run catalog:up" primeiro');
    process.exitCode = 1;
    return;
  }
  const allowedRoots = [REPO_ROOT, ...extraRoots.map((r) => resolve(r))];
  const result = await reindex(sql, REPO_ROOT, allowedRoots);
  console.log(`indexados: ${result.indexed}, atualizados: ${result.updated}, sem mudanca: ${result.unchanged}, removidos: ${result.removed}`);
  if (result.errors.length > 0) {
    console.log(`erros (${result.errors.length}):`);
    for (const e of result.errors) console.log(`  - ${e.path}: ${e.message}`);
    process.exitCode = 1;
  }
}

function cmdReset(yes: boolean): void {
  if (!yes) {
    console.error('catalog:reset apaga TODOS os dados do catalogo local. Rode de novo com --yes para confirmar.');
    process.exitCode = 1;
    return;
  }
  execFileSync('docker', ['compose', '-f', COMPOSE_FILE, 'down'], { stdio: 'inherit' });
  rmSync(DATA_DIR, { recursive: true, force: true });
  console.log('catalogo resetado (container parado + dados apagados). Rode "npm run catalog:up" para recomecar.');
}

async function main(): Promise<void> {
  const { command, roots, yes } = parseArgs(process.argv.slice(2));
  try {
    if (command === 'status') await cmdStatus();
    else if (command === 'reindex') await cmdReindex(roots);
    else if (command === 'reset') cmdReset(yes);
    else {
      console.error('uso: status | reindex [--root <dir>] | reset --yes');
      process.exitCode = 1;
    }
  } finally {
    await closeCatalog();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { createServer as createViteServer } from 'vite';
import { resolveCatalogConfig } from '../catalog/config.js';
import { getCatalogSql, getCatalogStatus } from '../catalog/db.js';
import { reindex } from '../catalog/indexer.js';
import { createHandler } from './app.js';

const STUDIO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CLIENT_ROOT = fileURLToPath(new URL('../client', import.meta.url));

interface CliArgs {
  file?: string;
  port: number;
  open: boolean;
  extraRoot?: string;
  noCatalog: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { port: 4747, open: true, noCatalog: false };
  const rest = [...argv];
  while (rest.length > 0) {
    const a = rest.shift()!;
    if (a === '--port') args.port = Number(rest.shift());
    else if (a === '--no-open') args.open = false;
    else if (a === '--root') args.extraRoot = rest.shift();
    else if (a === '--no-catalog') args.noCatalog = true;
    else if (!args.file) args.file = a;
  }
  return args;
}

function resolveInput(input: string): string {
  const base = process.env.INIT_CWD ?? process.cwd();
  return resolve(base, input);
}

function openBrowser(url: string): void {
  const platform = process.platform;
  try {
    if (platform === 'darwin') spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    else if (platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    else spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
  } catch {
    console.log(`Abra manualmente no navegador: ${url}`);
  }
}

function listen(server: Server, port: number, attemptsLeft: number): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
        resolvePromise(listen(server, port + 1, attemptsLeft - 1));
      } else {
        reject(err);
      }
    };
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', onError);
      resolvePromise(port);
    });
  });
}

async function main(): Promise<void> {
  if (!existsSync(resolve(STUDIO_ROOT, 'node_modules'))) {
    console.error('ERRO: node_modules do studio nao encontrado.');
    console.error('Rode: npm run studio:install');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));

  const initialFile = args.file ? resolveInput(args.file) : undefined;
  if (initialFile && !existsSync(initialFile)) {
    console.error(`ERRO: arquivo nao encontrado: ${initialFile}`);
    process.exit(1);
  }

  const allowedRoots = [REPO_ROOT];
  if (initialFile) allowedRoots.push(dirname(initialFile));
  if (args.extraRoot) allowedRoots.push(resolveInput(args.extraRoot));

  const catalogConfig = resolveCatalogConfig(process.env, args.noCatalog);

  const vite = await createViteServer({
    configFile: false,
    root: CLIENT_ROOT,
    appType: 'spa',
    server: { middlewareMode: true },
    plugins: [react()],
  });

  const handler = createHandler({
    repoRoot: REPO_ROOT,
    allowedRoots,
    initialFile,
    port: args.port,
    viteMiddlewares: vite.middlewares,
    catalog: catalogConfig,
  });

  const httpServer = createHttpServer(handler);
  const port = await listen(httpServer, args.port, 10);
  const url = `http://127.0.0.1:${port}`;

  console.log(`Pattern Studio rodando em ${url}`);
  if (initialFile) console.log(`Arquivo inicial: ${initialFile}`);
  if (args.open) openBrowser(url);

  // nunca bloqueia a abertura do navegador -- tenta conectar/reindexar em segundo plano
  void (async () => {
    if (catalogConfig.mode === 'off') {
      console.log('catalogo: desabilitado (--no-catalog)');
      return;
    }
    const sql = await getCatalogSql(catalogConfig);
    if (!sql) {
      console.log(`catalogo: offline (${getCatalogStatus()}) -- rode "npm run catalog:up" para habilitar a busca`);
      return;
    }
    const result = await reindex(sql, REPO_ROOT, allowedRoots);
    console.log(`catalogo: ok -- ${result.indexed} novo(s), ${result.updated} atualizado(s), ${result.removed} removido(s)`);
  })();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

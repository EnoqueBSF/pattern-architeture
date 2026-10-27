import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { fileURLToPath } from 'node:url';
import { resolveCatalogConfig } from '../catalog/config.js';
import { createMcpServer } from './server.js';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function parseArgs(argv: string[]): string[] {
  const roots: string[] = [];
  const rest = [...argv];
  while (rest.length > 0) {
    const a = rest.shift()!;
    if (a === '--root') {
      const value = rest.shift();
      if (value) roots.push(value);
    }
  }
  return roots;
}

/** Roots extras alem do repoRoot do pattern-architeture (sempre permitido): `--root <dir>` (pode
 * repetir) e/ou a env PATTERN_ARCH_ROOTS (diretorios absolutos separados por ":"). Serve qualquer
 * projeto (MCP registrado em escopo global/user) -- nao exige que o diagrama esteja dentro deste repo. */
function resolveAllowedRoots(): string[] {
  const fromArgs = parseArgs(process.argv.slice(2));
  const fromEnv = (process.env.PATTERN_ARCH_ROOTS ?? '').split(':').filter((r) => r.length > 0);
  return [REPO_ROOT, ...fromArgs, ...fromEnv];
}

// stdout e o canal JSON-RPC do protocolo MCP -- logs SEMPRE em stderr, nunca console.log.
console.error(`pattern-architeture MCP: iniciando (repoRoot=${REPO_ROOT})`);

serveStdio(
  () =>
    createMcpServer({
      repoRoot: REPO_ROOT,
      allowedRoots: resolveAllowedRoots(),
      catalogConfig: resolveCatalogConfig(),
    }),
  { onerror: (err) => console.error('pattern-architeture MCP: erro no transporte stdio:', err) },
);

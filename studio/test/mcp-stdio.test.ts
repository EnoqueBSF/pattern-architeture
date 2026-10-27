import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MAIN_PATH = fileURLToPath(new URL('../mcp/main.ts', import.meta.url));
const TSX_BIN = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url));

let transport: StdioClientTransport | undefined;
let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  transport = undefined;
  client = undefined;
});

describe('servidor MCP via stdio real (processo spawnado, nao cliente em memoria)', () => {
  it('conecta, inicializa e lista as tools -- so funciona se stdout for 100% JSON-RPC (qualquer log misturado quebraria o parse)', async () => {
    transport = new StdioClientTransport({
      command: TSX_BIN,
      args: [MAIN_PATH],
      cwd: REPO_ROOT,
      env: { ...process.env, PATTERN_CATALOG: 'off' } as Record<string, string>,
      stderr: 'pipe', // stderr e onde os logs do servidor DEVEM ir -- nao interessa pro teste, so isola de stdout
    });
    client = new Client({ name: 'stdio-smoke-test', version: '1.0.0' });

    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(9);
    expect(tools.map((t) => t.name)).toContain('diagram_create');
  }, 20_000);
});

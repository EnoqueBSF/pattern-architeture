import { NODE_TYPES, PROTOCOLS, STATUSES } from '../../src/schema/enums.js';

function makeLcg(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** Grafo determinístico (seed fixa): 30 nodes em 5 grupos, 45 edges, para testar layout/roteamento sob carga. */
export function buildStressYaml(): string {
  const rng = makeLcg(42);
  const nodeCount = 30;
  const groupCount = 5;
  const edgeCount = 45;

  const lines: string[] = [];
  lines.push('version: 1');
  lines.push('title: Stress (seed fixa)');
  lines.push('direction: LR');
  lines.push('groups:');
  for (let g = 0; g < groupCount; g++) {
    lines.push(`  - { id: g${g}, label: "Grupo ${g}" }`);
  }
  lines.push('nodes:');
  for (let i = 0; i < nodeCount; i++) {
    const type = NODE_TYPES[Math.floor(rng() * NODE_TYPES.length)];
    const status = STATUSES[Math.floor(rng() * STATUSES.length)];
    const group = `g${i % groupCount}`;
    lines.push(`  - { id: n${i}, label: "Node ${i}", type: ${type}, status: ${status}, group: ${group} }`);
  }
  lines.push('edges:');
  const seen = new Set<string>();
  let created = 0;
  let attempts = 0;
  while (created < edgeCount && attempts < edgeCount * 20) {
    attempts++;
    const i = Math.floor(rng() * nodeCount);
    // tendencia de DAG: destino com indice maior na maioria dos casos
    const forward = rng() < 0.8;
    const j = forward ? i + 1 + Math.floor(rng() * (nodeCount - i - 1)) : Math.floor(rng() * nodeCount);
    if (j === i || j < 0 || j >= nodeCount) continue;
    const key = `${i}->${j}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const protocol = PROTOCOLS[Math.floor(rng() * PROTOCOLS.length)];
    lines.push(`  - { from: n${i}, to: n${j}, protocol: ${protocol} }`);
    created++;
  }

  return lines.join('\n') + '\n';
}

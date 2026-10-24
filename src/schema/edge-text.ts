import { PROTOCOL_LABEL } from './enums.js';
import type { EdgeModel } from './model.js';

/** Texto de rotulo de uma aresta: "PROTOCOLO" ou "PROTOCOLO · rotulo customizado". */
export function edgeLabelText(e: EdgeModel): string {
  const proto = PROTOCOL_LABEL[e.protocol];
  if (!e.label) return proto;
  return proto ? `${proto} · ${e.label}` : e.label;
}

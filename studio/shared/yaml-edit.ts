import { isMap, isScalar, isSeq, parseDocument, type Pair, type YAMLMap, type YAMLSeq } from 'yaml';

export type Coll = 'nodes' | 'groups' | 'edges';
export type Value = string | number | boolean | string[];

export type Op =
  | { op: 'setRoot'; key: 'title' | 'description' | 'direction' | 'locale'; value?: Value }
  | { op: 'setField'; coll: Coll; index: number; key: string; value?: Value }
  | { op: 'append'; coll: Coll; item: Record<string, Value> }
  | { op: 'remove'; coll: Coll; index: number };

export interface ApplyResult {
  text: string;
  fallbackUsed: boolean;
}

const KEY_ORDER: Record<'root' | Coll, string[]> = {
  root: ['version', 'title', 'description', 'direction', 'locale', 'groups', 'nodes', 'edges'],
  nodes: ['id', 'label', 'type', 'status', 'tech', 'group', 'description', 'icon', 'slug', 'subtitle', 'badge', 'rank', 'order'],
  groups: ['id', 'label', 'kind', 'parent', 'rank', 'order'],
  edges: ['id', 'from', 'to', 'protocol', 'label', 'status', 'async', 'bidirectional'],
};

const ID_LIKE_RE = /^[a-zA-Z_][a-zA-Z0-9_.-]*$/;
const RESERVED_SCALARS = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', 'y', 'n', '~', '']);

function scalarItemText(v: string): string {
  if (ID_LIKE_RE.test(v) && !RESERVED_SCALARS.has(v.toLowerCase())) return v;
  return JSON.stringify(v);
}

function scalarText(v: Value): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(scalarItemText).join(', ')}]`;
  return scalarItemText(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();
    if (ak.length !== bk.length || ak.some((k, i) => k !== bk[i])) return false;
    return ak.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

/** Aplica a mesma Op num objeto JS puro -- usado como "oracle" para verificar o resultado da edicao cirurgica. */
function applyToJS(raw: unknown, op: Op): unknown {
  const clone = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  if (op.op === 'setRoot') {
    if (op.value === undefined) delete clone[op.key];
    else clone[op.key] = op.value;
    return clone;
  }
  if (op.op === 'setField') {
    const arr = clone[op.coll] as Record<string, unknown>[] | undefined;
    if (!Array.isArray(arr) || !arr[op.index]) throw new Error(`indice invalido: ${op.coll}[${op.index}]`);
    if (op.value === undefined) delete arr[op.index]![op.key];
    else arr[op.index]![op.key] = op.value;
    return clone;
  }
  if (op.op === 'append') {
    if (!Array.isArray(clone[op.coll])) clone[op.coll] = [];
    (clone[op.coll] as unknown[]).push(op.item);
    return clone;
  }
  // remove
  const arr = clone[op.coll] as unknown[] | undefined;
  if (Array.isArray(arr)) arr.splice(op.index, 1);
  return clone;
}

function lineStartOf(text: string, pos: number): number {
  return text.lastIndexOf('\n', pos - 1) + 1;
}

function indentBeforeKey(text: string, keyStart: number): string {
  const raw = text.slice(lineStartOf(text, keyStart), keyStart);
  // se a chave e a primeira de um item de lista block (ex.: "  - id: a"), o prefixo inclui o
  // marcador "- "; a indentacao real usada pelas DEMAIS chaves do mesmo map troca o "-" por espaco,
  // mantendo o alinhamento (ex.: "  - " -> "    ")
  return raw.replace(/-(?=\s)/, ' ');
}

function dashIndentFor(text: string, itemStart: number): string | undefined {
  const lineStart = lineStartOf(text, itemStart);
  const prefix = text.slice(lineStart, itemStart);
  const m = /^(\s*)-\s*$/.exec(prefix);
  return m ? m[1] : undefined;
}

function pairRange(p: Pair): { keyStart: number; valueRange: [number, number, number] } | undefined {
  const key = p.key as { range?: [number, number, number] } | null;
  const value = p.value as { range?: [number, number, number] } | null;
  if (!key?.range || !value?.range) return undefined;
  return { keyStart: key.range[0], valueRange: value.range };
}

function surgicalSetInMap(text: string, map: YAMLMap, key: string, value: Value | undefined, order: string[]): string | undefined {
  const pair = map.items.find((p) => isScalar(p.key) && p.key.value === key) as Pair | undefined;

  if (pair) {
    if (value === undefined) return removeKeyFromMap(text, map, key);
    const r = pairRange(pair);
    if (!r) return undefined;
    return text.slice(0, r.valueRange[0]) + scalarText(value) + text.slice(r.valueRange[1]);
  }

  if (value === undefined) return text; // chave nao existe e e pra remover -- no-op
  return insertKeyInMap(text, map, key, value, order);
}

function removeKeyFromMap(text: string, map: YAMLMap, key: string): string | undefined {
  const idx = map.items.findIndex((p) => isScalar(p.key) && p.key.value === key);
  if (idx === -1) return text;
  if (map.items.length === 1) return undefined; // mapa ficaria vazio -- fallback decide null/{} corretamente

  const pair = map.items[idx] as Pair;
  const r = pairRange(pair);
  if (!r) return undefined;

  if (map.flow) {
    if (idx === 0) {
      const next = map.items[1] as Pair;
      const nextKey = (next.key as { range?: [number, number, number] } | null)?.range?.[0];
      if (nextKey === undefined) return undefined;
      return text.slice(0, r.keyStart) + text.slice(nextKey);
    }
    const prev = map.items[idx - 1] as Pair;
    const prevValueEnd = (prev.value as { range?: [number, number, number] } | null)?.range?.[1];
    if (prevValueEnd === undefined) return undefined;
    return text.slice(0, prevValueEnd) + text.slice(r.valueRange[1]);
  }

  // block: remove a linha inteira, do inicio da linha da chave ate o inicio da LINHA da proxima
  // chave (nao so do texto dela -- senao a indentacao da proxima linha seria engolida junto)
  const lineStart = lineStartOf(text, r.keyStart);
  const next = map.items[idx + 1] as Pair | undefined;
  const nextMapRange = map as unknown as { range?: [number, number, number] };
  const nextKeyStart = next ? pairRange(next)?.keyStart : undefined;
  const end = next ? (nextKeyStart === undefined ? undefined : lineStartOf(text, nextKeyStart)) : nextMapRange.range?.[1];
  if (end === undefined) return undefined;
  return text.slice(0, lineStart) + text.slice(end);
}

function insertKeyInMap(text: string, map: YAMLMap, key: string, value: Value, _order: string[]): string | undefined {
  const entryText = `${key}: ${scalarText(value)}`;
  const mapRange = (map as unknown as { range?: [number, number, number] }).range;

  if (map.flow) {
    if (map.items.length === 0) {
      if (!mapRange) return undefined;
      return text.slice(0, mapRange[0]) + `{ ${entryText} }` + text.slice(mapRange[1]);
    }
    const last = map.items[map.items.length - 1] as Pair;
    const lastValueEnd = pairRange(last)?.valueRange[1];
    if (lastValueEnd === undefined) return undefined;
    return text.slice(0, lastValueEnd) + `, ${entryText}` + text.slice(lastValueEnd);
  }

  if (map.items.length === 0) return undefined; // map block vazio: ambiguo, fallback
  const first = map.items[0] as Pair;
  const firstKeyStart = pairRange(first)?.keyStart;
  if (firstKeyStart === undefined) return undefined;
  const indent = indentBeforeKey(text, firstKeyStart);

  const last = map.items[map.items.length - 1] as Pair;
  const lastValueEnd = pairRange(last)?.valueRange[1];
  if (lastValueEnd === undefined) return undefined;
  return text.slice(0, lastValueEnd) + `\n${indent}${entryText}` + text.slice(lastValueEnd);
}

function serializeFlowItem(item: Record<string, Value>, order: string[]): string {
  const keys = Object.keys(item).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return `{ ${keys.map((k) => `${k}: ${scalarText(item[k]!)}`).join(', ')} }`;
}

function surgicalAppendToSeq(text: string, seq: YAMLSeq, itemText: string): string | undefined {
  if (seq.items.length === 0) return undefined; // seq vazia ("[]"): indentacao ambigua, fallback decide
  const last = seq.items[seq.items.length - 1] as unknown as { range?: [number, number, number] };
  if (!last.range) return undefined;
  const dashIndent = dashIndentFor(text, last.range[0]);
  if (dashIndent === undefined) return undefined;
  const insertAt = last.range[2] ?? last.range[1];
  return text.slice(0, insertAt) + `${dashIndent}- ${itemText}\n` + text.slice(insertAt);
}

function surgicalRemoveFromSeq(text: string, seq: YAMLSeq, index: number): string | undefined {
  const item = seq.items[index] as unknown as { range?: [number, number, number] } | undefined;
  if (!item?.range) return undefined;
  if (seq.items.length === 1) return undefined; // seq ficaria vazia ("[]"): fallback
  const lineStart = lineStartOf(text, item.range[0]);
  const prefix = text.slice(lineStart, item.range[0]);
  if (!/^\s*-\s*$/.test(prefix)) return undefined;
  const end = item.range[2] ?? item.range[1];
  return text.slice(0, lineStart) + text.slice(end);
}

function applySingleOpSurgical(text: string, op: Op): string | undefined {
  const doc = parseDocument(text);
  if (doc.errors.length > 0 || !isMap(doc.contents)) return undefined;

  if (op.op === 'setRoot') {
    return surgicalSetInMap(text, doc.contents, op.key, op.value, KEY_ORDER.root);
  }

  const seq = doc.get(op.coll, true);
  if (!isSeq(seq)) return undefined;

  if (op.op === 'setField') {
    const item = seq.items[op.index];
    if (!isMap(item)) return undefined;
    return surgicalSetInMap(text, item, op.key, op.value, KEY_ORDER[op.coll]);
  }
  if (op.op === 'append') {
    return surgicalAppendToSeq(text, seq, serializeFlowItem(op.item, KEY_ORDER[op.coll]));
  }
  // remove
  return surgicalRemoveFromSeq(text, seq, op.index);
}

function applySingleOpFallback(text: string, op: Op): string {
  const doc = parseDocument(text);
  if (op.op === 'setRoot') {
    if (op.value === undefined) doc.deleteIn([op.key]);
    else doc.setIn([op.key], op.value);
  } else if (op.op === 'setField') {
    if (op.value === undefined) doc.deleteIn([op.coll, op.index, op.key]);
    else doc.setIn([op.coll, op.index, op.key], op.value);
  } else if (op.op === 'append') {
    const seq = doc.get(op.coll, true);
    if (!isSeq(seq)) doc.setIn([op.coll], [op.item]);
    else doc.addIn([op.coll], op.item);
  } else {
    doc.deleteIn([op.coll, op.index]);
  }
  return doc.toString({ lineWidth: 0 });
}

function tryParseToJS(text: string): unknown {
  try {
    const doc = parseDocument(text);
    if (doc.errors.length > 0) return undefined;
    return doc.toJS();
  } catch {
    return undefined;
  }
}

/** Aplica uma sequencia de Op ao texto YAML, preservando formatacao/comentarios quando possivel. */
export function applyOps(initialText: string, ops: Op[]): ApplyResult {
  let text = initialText;
  let fallbackUsed = false;

  for (const op of ops) {
    const before = tryParseToJS(text);
    if (before === undefined) {
      text = applySingleOpFallback(text, op);
      fallbackUsed = true;
      continue;
    }
    const expected = applyToJS(before, op);

    let next: string | undefined;
    try {
      next = applySingleOpSurgical(text, op);
    } catch {
      next = undefined;
    }

    if (next !== undefined) {
      const actual = tryParseToJS(next);
      if (actual !== undefined && deepEqual(actual, expected)) {
        text = next;
        continue;
      }
    }

    text = applySingleOpFallback(text, op);
    fallbackUsed = true;
  }

  return { text, fallbackUsed };
}

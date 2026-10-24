import { parse as parseYaml } from 'yaml';
import { renderDiagramSource, type RenderOutput } from '../../src/index.js';
import { DiagramValidationError } from '../../src/schema/load.js';
import { GROUP_STYLE } from '../../src/theme/theme.js';
import { ROOT } from '../../src/layout/tree.js';
import { computeDropPlacements, placementsToOps, type DropRequest, type PlacementLike } from '../shared/drop-apply.js';
import { setGroupField, setNodeField, toRawDiagram, type RawDiagramLike } from '../shared/ops.js';
import { applyOps } from '../shared/yaml-edit.js';
import type { IssueItem, LayoutView, RenderResult, ViewItem } from '../shared/types.js';

const ISSUE_RE = /^([\w.[\]-]+): (.*)$/;

function parseIssue(raw: string): IssueItem {
  const match = raw.match(ISSUE_RE);
  if (!match) return { path: null, message: raw, raw };
  const [, pathStr, message] = match;
  const path = pathStr!
    .split('.')
    .filter((p) => p.length > 0)
    .map((p) => (/^\d+$/.test(p) ? Number(p) : p));
  return { path, message: message!, raw };
}

export function toView(result: RenderOutput): LayoutView {
  const { layout, bodyY } = result;
  const placementById = new Map(layout.placement.map((p) => [p.id, p]));

  const items: ViewItem[] = [];
  for (const n of layout.nodes) {
    const p = placementById.get(n.id);
    if (!p) continue;
    items.push({ id: n.id, kind: 'node', container: p.container, rank: p.rank, order: p.order, x: n.x, y: n.y, w: n.w, h: n.h, depth: 0 });
  }
  for (const g of layout.groups) {
    const p = placementById.get(g.id);
    if (!p) continue;
    items.push({ id: g.id, kind: 'group', container: p.container, rank: p.rank, order: p.order, x: g.x, y: g.y, w: g.w, h: g.h, depth: g.depth });
  }

  return {
    direction: layout.direction,
    bodyY,
    svgWidth: result.report.layoutWidth,
    svgHeight: result.report.layoutHeight,
    bodyWidth: layout.width,
    bodyHeight: layout.height,
    titleBarHeight: GROUP_STYLE.titleBarHeight,
    items,
  };
}

/** Le, valida e renderiza o diagrama a partir do texto YAML/JSON, medindo o tempo gasto. */
export function renderView(source: string): RenderResult {
  const start = performance.now();
  try {
    const result = renderDiagramSource(source);
    const ms = performance.now() - start;
    return { ok: true, svg: result.svg, view: toView(result), report: result.report, ms };
  } catch (err) {
    if (err instanceof DiagramValidationError) {
      return { ok: false, issues: err.issues.map(parseIssue) };
    }
    throw err;
  }
}

export class DropNotFoundError extends Error {}

/** true se o rank/order atuais de um item (vindos do render) batem com os placements desejados -- usado para validar cada tentativa de poda. */
function matchesDesired(text: string, desired: Map<string, { rank: number; order: number }>): boolean {
  let result: RenderOutput;
  try {
    result = renderDiagramSource(text);
  } catch {
    return false; // defensivo: remover so rank/order nunca deveria invalidar o diagrama
  }
  const view = toView(result);
  for (const [id, want] of desired) {
    const item = view.items.find((it) => it.id === id);
    if (!item || item.rank !== want.rank || item.order !== want.order) return false;
  }
  return true;
}

/**
 * Tenta remover os hints rank/order de UM item, na ordem mais agressiva para a mais conservadora
 * (remove os dois juntos; senao so order; senao so rank), mantendo a remocao apenas se o diagrama
 * inteiro ainda bate com os placements desejados -- o que garante que podar um item nao desloca
 * outro item que dependia do layout automatico para ficar no lugar certo.
 */
function tryPruneItem(text: string, raw: RawDiagramLike, item: PlacementLike, desired: Map<string, { rank: number; order: number }>): string {
  const setField = item.kind === 'node' ? setNodeField : setGroupField;

  const withoutBoth = applyOps(text, [...setField(raw, item.id, 'rank', undefined), ...setField(raw, item.id, 'order', undefined)]).text;
  if (matchesDesired(withoutBoth, desired)) return withoutBoth;

  const withoutOrder = applyOps(text, setField(raw, item.id, 'order', undefined)).text;
  if (matchesDesired(withoutOrder, desired)) return withoutOrder;

  const withoutRank = applyOps(text, setField(raw, item.id, 'rank', undefined)).text;
  if (matchesDesired(withoutRank, desired)) return withoutRank;

  return text;
}

/**
 * Aplica um drop: calcula os placements finais ("pin" do container de destino inteiro, e do de
 * origem se for diferente -- ver shared/drop-apply.ts), traduz em Ops e edita o texto YAML. Depois
 * poda ("poda" = passo seguinte ao pin): para cada item que NAO tinha rank/order manual antes DESTE
 * drop, tenta remover o hint recem-fixado quando o motor calcularia o mesmo valor sozinho --
 * minimiza o ruido de hints no YAML sem nunca tocar em hints que o usuario ja tinha escrito.
 * Valida tanto o source de entrada quanto o resultado pinado (via renderDiagramSource, que lanca
 * DiagramValidationError se invalido -- o chamador HTTP trata isso como 422).
 */
export function applyDrop(source: string, req: DropRequest): string {
  const result = renderDiagramSource(source);
  const view = toView(result);

  const raw = toRawDiagram(parseYaml(source) as unknown);
  if (!raw) throw new Error('YAML sem a forma minima esperada (nodes com id)');

  const originalById = new Map(view.items.map((it) => [it.id, { container: it.container }]));

  let placements;
  try {
    placements = computeDropPlacements(view.items, req);
  } catch (err) {
    throw new DropNotFoundError(err instanceof Error ? err.message : String(err));
  }

  const ops = placementsToOps(raw, placements, ROOT, originalById);
  const { text: pinnedText } = applyOps(source, ops);
  renderDiagramSource(pinnedText); // valida o pin antes de tentar podar

  const hadHintBefore = new Set<string>();
  for (const n of raw.nodes) if ('rank' in n || 'order' in n) hadHintBefore.add(n.id);
  for (const g of raw.groups ?? []) if ('rank' in g || 'order' in g) hadHintBefore.add(g.id);

  const desired = new Map(placements.map((p) => [p.id, { rank: p.rank, order: p.order }]));
  const prunable = placements.filter((p) => !hadHintBefore.has(p.id));

  let text = pinnedText;
  for (const item of prunable) text = tryPruneItem(text, raw, item, desired);

  return text;
}

import { NODE_TYPES } from '../schema/enums.js';
import type { Status } from '../schema/enums.js';
import type { DiagramModel } from '../schema/model.js';
import type { LayoutResult } from '../layout/layout.js';
import { placeLabels } from '../route/labels.js';
import { routeEdges, type RoutedEdge } from '../route/route.js';
import { CANVAS, EDGE_STATUS_STYLE } from '../theme/theme.js';
import { renderEdgeLabel, renderEdgePath, renderNoteMarker } from './edge.js';
import { renderGroup } from './group.js';
import { renderHeader } from './header.js';
import { renderLegend } from './legend.js';
import { renderNode } from './node.js';
import { renderNotes } from './notes.js';
import { el, fmt } from './svg.js';

const STATUS_DRAW_ORDER: Status[] = ['unchanged', 'changed', 'new'];

export interface DocumentResult {
  svg: string;
  width: number;
  height: number;
  edgeCount: number;
  routedCount: number;
  noteCount: number;
  /** deslocamento vertical do corpo do grafo (grupos/nodes/arestas) dentro do SVG; docY = layoutY + bodyY */
  bodyY: number;
}

export function renderDocument(model: DiagramModel, layout: LayoutResult): DocumentResult {
  // a legenda de "Tipos" mostra mini-formas; nodes com icone nao desenham a forma, entao ficam de fora
  const usedTypes = NODE_TYPES.filter((t) => layout.nodes.some((n) => n.type === t && !n.icon));

  const width = Math.max(layout.width, 640);
  const contentWidth = width - CANVAS.marginX * 2;

  const routedEdges = routeEdges(layout, model);
  const { labels, notes } = placeLabels(routedEdges, layout);

  const header = renderHeader(model.title, model.description, contentWidth);
  const legend = renderLegend(usedTypes, contentWidth, model.locale);
  const notesResult = renderNotes(notes, model.locale);

  const gap = 24;
  const bodyY = CANVAS.marginX + header.height + gap;
  const legendY = bodyY + layout.height + gap;
  const notesY = legendY + legend.height + (notes.length > 0 ? gap : 0);
  const totalHeight = notesY + notesResult.height + CANVAS.marginX;

  const groupsLayer = [...layout.groups].sort((a, b) => a.depth - b.depth).map(renderGroup).join('');

  const routedByStatus = new Map<Status, RoutedEdge[]>(STATUS_DRAW_ORDER.map((s) => [s, []]));
  for (const re of routedEdges) routedByStatus.get(re.edge.status)!.push(re);

  let edgesLayer = '';
  for (const status of STATUS_DRAW_ORDER) {
    const style = EDGE_STATUS_STYLE[status];
    for (const re of routedByStatus.get(status)!) {
      edgesLayer += renderEdgePath(re.points, style, re.edge.async, re.edge.bidirectional);
    }
  }

  const nodesLayer = layout.nodes.map((n) => renderNode(n, model.locale)).join('');

  const edgeColorByEdgeId = new Map(routedEdges.map((re) => [re.edge.id, EDGE_STATUS_STYLE[re.edge.status].stroke]));
  const labelsLayer = labels.map(renderEdgeLabel).join('') + notes.map((n) => renderNoteMarker(n, edgeColorByEdgeId.get(n.edgeId) ?? '#334155')).join('');

  const content =
    el('rect', { x: 0, y: 0, width, height: totalHeight, fill: CANVAS.background }) +
    el('g', { transform: `translate(${fmt(CANVAS.marginX)},${fmt(CANVAS.marginX)})` }, header.svg) +
    el('g', { transform: `translate(0,${fmt(bodyY)})` }, groupsLayer + edgesLayer + nodesLayer + labelsLayer) +
    el('g', { transform: `translate(${fmt(CANVAS.marginX)},${fmt(legendY)})` }, legend.svg) +
    (notes.length > 0 ? el('g', { transform: `translate(${fmt(CANVAS.marginX)},${fmt(notesY)})` }, notesResult.svg) : '');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" height="${fmt(totalHeight)}" viewBox="0 0 ${fmt(width)} ${fmt(totalHeight)}">${content}</svg>`;
  const routedCount = routedEdges.filter((re) => !re.usedFallback).length;

  return { svg, width, height: totalHeight, edgeCount: routedEdges.length, routedCount, noteCount: notes.length, bodyY };
}

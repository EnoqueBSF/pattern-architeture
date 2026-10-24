import { layoutDiagram } from './layout/layout.js';
import { parseDiagram } from './schema/load.js';
import type { DiagramModel } from './schema/model.js';
import { renderDocument } from './render/document.js';
import { checkLayoutInvariants } from './verify/invariants.js';

export interface RenderReport {
  nodeCount: number;
  edgeCount: number;
  groupCount: number;
  layoutWidth: number;
  layoutHeight: number;
  routedCount: number;
  noteCount: number;
  warnings: string[];
  violations: string[];
}

export interface RenderOutput {
  svg: string;
  model: DiagramModel;
  report: RenderReport;
}

/** Le, valida, calcula o layout e renderiza o SVG a partir do texto de definicao (YAML/JSON). */
export function renderDiagramSource(source: string): RenderOutput {
  const model = parseDiagram(source);
  const layout = layoutDiagram(model);

  const groupOfNode = new Map(model.nodes.map((n) => [n.id, n.group]));
  const parentOfGroup = new Map(model.groups.map((g) => [g.id, g.parent]));
  const violations = checkLayoutInvariants(layout, groupOfNode, parentOfGroup).map((v) => v.message);

  const doc = renderDocument(model, layout);

  return {
    svg: doc.svg,
    model,
    report: {
      nodeCount: model.nodes.length,
      edgeCount: model.edges.length,
      groupCount: model.groups.length,
      layoutWidth: doc.width,
      layoutHeight: doc.height,
      routedCount: doc.routedCount,
      noteCount: doc.noteCount,
      warnings: model.warnings,
      violations,
    },
  };
}

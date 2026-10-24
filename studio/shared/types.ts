/** Tipos TS puros, compartilhados entre server e client (sem node:*, sem DOM). */

export interface ViewItem {
  id: string;
  kind: 'node' | 'group';
  /** id do container (group id ou "__root__") que contem este item diretamente -- para um grupo, e o pai logico dele */
  container: string;
  rank: number;
  order: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** profundidade de aninhamento; 0 para nodes, GroupLayout.depth para grupos */
  depth: number;
}

export interface LayoutView {
  direction: 'LR' | 'TB';
  /** deslocamento vertical do corpo do grafo dentro do SVG */
  bodyY: number;
  svgWidth: number;
  svgHeight: number;
  bodyWidth: number;
  bodyHeight: number;
  titleBarHeight: number;
  items: ViewItem[];
}

export interface IssueItem {
  /** caminho no modelo (ex.: ['nodes', 3, 'group']), ou null se nao foi possivel extrair */
  path: (string | number)[] | null;
  message: string;
  raw: string;
}

export interface RenderOk {
  ok: true;
  svg: string;
  view: LayoutView;
  report: {
    nodeCount: number;
    edgeCount: number;
    groupCount: number;
    layoutWidth: number;
    layoutHeight: number;
    routedCount: number;
    noteCount: number;
    warnings: string[];
    violations: string[];
  };
  ms: number;
}

export interface RenderFail {
  ok: false;
  issues: IssueItem[];
}

export type RenderResult = RenderOk | RenderFail;

export interface TemplateDef {
  id: string;
  label: string;
  description: string;
}

export interface Meta {
  nodeTypes: string[];
  protocols: string[];
  groupKinds: string[];
  statuses: string[];
  asyncProtocols: string[];
  nodeTypeLabels: Record<string, string>;
  statusLabels: Record<string, string>;
  protocolLabels: Record<string, string>;
  iconKeys: string[];
  iconAliases: Record<string, string>;
  titleBarHeight: number;
  root: string;
  /** diretorio absoluto do repo pattern-architeture no servidor (base para "salvar como" em diagrams/) */
  repoRoot: string;
  initialFile: string | null;
}

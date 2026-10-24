import type { GroupKind, NodeType, Protocol, Status } from './enums.js';

export interface NodeModel {
  id: string;
  label: string;
  type: NodeType;
  status: Status;
  tech?: string;
  group?: string;
  description?: string;
  /** chave canonica ja resolvida contra o catalogo local; undefined = usa a forma do type */
  icon?: string;
  slug?: string;
  subtitle?: string;
  badge?: string;
  rank?: number;
  order?: number;
  declIndex: number;
}

export interface EdgeModel {
  id: string;
  from: string;
  to: string;
  protocol: Protocol;
  label?: string;
  status: Status;
  async: boolean;
  bidirectional: boolean;
  declIndex: number;
}

export interface GroupModel {
  id: string;
  label: string;
  kind: GroupKind;
  parent?: string;
  rank?: number;
  order?: number;
  /** menor declIndex entre os nos descendentes; usado para desempate estavel */
  declIndex: number;
}

export interface DiagramModel {
  title: string;
  description?: string;
  direction: 'LR' | 'TB';
  locale: 'pt-BR' | 'en';
  groups: GroupModel[];
  nodes: NodeModel[];
  edges: EdgeModel[];
  warnings: string[];
}

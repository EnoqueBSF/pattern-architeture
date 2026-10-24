import type { GroupLayout, LayoutResult, NodeLayout } from '../layout/layout.js';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

export function rectContains(outer: Rect, inner: Rect, epsilon = 0.01): boolean {
  return inner.x >= outer.x - epsilon && inner.y >= outer.y - epsilon && inner.x + inner.w <= outer.x + outer.w + epsilon && inner.y + inner.h <= outer.y + outer.h + epsilon;
}

export interface LayoutViolation {
  kind: string;
  message: string;
}

/** Checagens geometricas: nenhum par de node.bounds se intersecta, nodes dentro do seu grupo, grupos irmaos disjuntos. */
export function checkLayoutInvariants(layout: LayoutResult, groupOfNode: Map<string, string | undefined>, parentOfGroup: Map<string, string | undefined>): LayoutViolation[] {
  const violations: LayoutViolation[] = [];

  for (let i = 0; i < layout.nodes.length; i++) {
    for (let j = i + 1; j < layout.nodes.length; j++) {
      const a = layout.nodes[i]!;
      const b = layout.nodes[j]!;
      if (rectsOverlap(a.bounds, b.bounds)) {
        violations.push({ kind: 'node-overlap', message: `nodes "${a.id}" e "${b.id}" se sobrepoem` });
      }
    }
  }

  const groupById = new Map(layout.groups.map((g) => [g.id, g]));
  for (const node of layout.nodes) {
    const groupId = groupOfNode.get(node.id);
    if (!groupId) continue;
    const group = groupById.get(groupId);
    if (!group) continue;
    if (!rectContains(group, node.bounds)) {
      violations.push({ kind: 'node-outside-group', message: `node "${node.id}" fica fora do grupo "${groupId}"` });
    }
  }

  for (const group of layout.groups) {
    const parentId = parentOfGroup.get(group.id);
    if (!parentId) continue;
    const parent = groupById.get(parentId);
    if (!parent) continue;
    if (!rectContains(parent, group)) {
      violations.push({ kind: 'group-outside-parent', message: `grupo "${group.id}" fica fora do grupo pai "${parentId}"` });
    }
  }

  for (let i = 0; i < layout.groups.length; i++) {
    for (let j = i + 1; j < layout.groups.length; j++) {
      const a = layout.groups[i]!;
      const b = layout.groups[j]!;
      const parentA = parentOfGroup.get(a.id);
      const parentB = parentOfGroup.get(b.id);
      if (parentA !== parentB) continue; // so compara irmaos (mesmo pai)
      if (rectsOverlap(a, b)) {
        violations.push({ kind: 'sibling-group-overlap', message: `grupos irmaos "${a.id}" e "${b.id}" se sobrepoem` });
      }
    }
  }

  return violations;
}

export type { GroupLayout, NodeLayout };

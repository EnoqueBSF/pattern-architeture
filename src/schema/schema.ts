import { z } from 'zod';
import { closestSuggestion } from '../text/similarity.js';
import { GROUP_KINDS, NODE_TYPES, PROTOCOLS, STATUSES } from './enums.js';

const Id = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/, 'id: minusculas, digitos e - _ . (comecando por letra)');

const Status = z.enum(STATUSES);
const Hint = z.number().int().min(0);

export const GroupSchema = z.strictObject({
  id: Id,
  label: z.string().min(1).max(60),
  kind: z.enum(GROUP_KINDS).default('layer'),
  parent: Id.optional(),
  rank: Hint.optional(),
  order: z.number().int().optional(),
});

export const NodeSchema = z.strictObject({
  id: Id,
  label: z.string().min(1).max(80),
  type: z.enum(NODE_TYPES),
  status: Status,
  tech: z.union([z.string().min(1).max(60), z.array(z.string().min(1).max(40)).min(1).max(4)]).optional(),
  group: Id.optional(),
  description: z.string().max(300).optional(),
  icon: z.string().min(1).max(60).optional(),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^\S+$/, 'slug: identificador tecnico sem espacos (ex.: aws-bmg-apoio-operacoes)')
    .optional(),
  subtitle: z.string().min(1).max(200).optional(),
  badge: z.string().min(1).max(24).optional(),
  rank: Hint.optional(),
  order: z.number().int().optional(),
});

export const EdgeSchema = z.strictObject({
  id: Id.optional(),
  from: Id,
  to: Id,
  protocol: z.enum(PROTOCOLS),
  label: z.string().min(1).max(60).optional(),
  status: Status.optional(),
  async: z.boolean().optional(),
  bidirectional: z.boolean().default(false),
});

export type RawGroup = z.infer<typeof GroupSchema>;
export type RawNode = z.infer<typeof NodeSchema>;
export type RawEdge = z.infer<typeof EdgeSchema>;

function crossRefChecks(data: { groups: RawGroup[]; nodes: RawNode[]; edges: RawEdge[] }, ctx: z.RefinementCtx) {
  const { groups, nodes, edges } = data;

  const nodeIds = new Set(nodes.map((n) => n.id));
  const groupIds = new Set(groups.map((g) => g.id));
  const allIds = [...nodeIds, ...groupIds];

  // ids unicos no espaco global (nos + grupos)
  const seen = new Map<string, string>();
  nodes.forEach((n, i) => {
    if (seen.has(n.id)) ctx.addIssue({ code: 'custom', message: `id duplicado: "${n.id}"`, path: ['nodes', i, 'id'] });
    seen.set(n.id, `nodes[${i}]`);
  });
  groups.forEach((g, i) => {
    if (seen.has(g.id)) ctx.addIssue({ code: 'custom', message: `id duplicado: "${g.id}"`, path: ['groups', i, 'id'] });
    seen.set(g.id, `groups[${i}]`);
  });

  // referencias de nodes
  nodes.forEach((n, i) => {
    if (n.group && !groupIds.has(n.group)) {
      const suggestion = closestSuggestion(n.group, [...groupIds]);
      ctx.addIssue({
        code: 'custom',
        message: `nodes[${i}].group "${n.group}" nao existe entre os grupos declarados.${suggestion ? ` Voce quis dizer "${suggestion}"?` : ''}`,
        path: ['nodes', i, 'group'],
      });
    }
  });

  // referencias de groups.parent + ciclo + profundidade
  const parentOf = new Map<string, string | undefined>();
  groups.forEach((g, i) => {
    if (g.parent) {
      if (!groupIds.has(g.parent)) {
        const suggestion = closestSuggestion(g.parent, [...groupIds]);
        ctx.addIssue({
          code: 'custom',
          message: `groups[${i}].parent "${g.parent}" nao existe entre os grupos declarados.${suggestion ? ` Voce quis dizer "${suggestion}"?` : ''}`,
          path: ['groups', i, 'parent'],
        });
      } else if (g.parent === g.id) {
        ctx.addIssue({ code: 'custom', message: `groups[${i}] nao pode ser parent de si mesmo`, path: ['groups', i, 'parent'] });
      }
    }
    parentOf.set(g.id, g.parent);
  });

  for (const g of groups) {
    const visited = new Set<string>();
    let depth = 0;
    let cur: string | undefined = g.id;
    while (cur) {
      if (visited.has(cur)) {
        ctx.addIssue({ code: 'custom', message: `ciclo de "parent" envolvendo o grupo "${g.id}"`, path: ['groups'] });
        break;
      }
      visited.add(cur);
      cur = parentOf.get(cur);
      depth++;
      if (depth > 3) {
        ctx.addIssue({ code: 'custom', message: `grupo "${g.id}" excede a profundidade maxima de aninhamento (3)`, path: ['groups'] });
        break;
      }
    }
  }

  // referencias de edges
  edges.forEach((e, i) => {
    if (!nodeIds.has(e.from)) {
      const suggestion = closestSuggestion(e.from, [...nodeIds]);
      ctx.addIssue({
        code: 'custom',
        message: `edges[${i}].from "${e.from}" nao existe entre os nodes declarados.${suggestion ? ` Voce quis dizer "${suggestion}"?` : ''}`,
        path: ['edges', i, 'from'],
      });
    }
    if (!nodeIds.has(e.to)) {
      const suggestion = closestSuggestion(e.to, [...nodeIds]);
      ctx.addIssue({
        code: 'custom',
        message: `edges[${i}].to "${e.to}" nao existe entre os nodes declarados.${suggestion ? ` Voce quis dizer "${suggestion}"?` : ''}`,
        path: ['edges', i, 'to'],
      });
    }
    if (e.from === e.to) {
      ctx.addIssue({ code: 'custom', message: `edges[${i}]: from e to nao podem ser o mesmo node ("${e.from}")`, path: ['edges', i] });
    }
  });

  void allIds;
}

export const DiagramSchema = z
  .strictObject({
    version: z.literal(1),
    title: z.string().min(1).max(120),
    description: z.string().max(400).optional(),
    direction: z.enum(['LR', 'TB']).default('LR'),
    locale: z.enum(['pt-BR', 'en']).default('pt-BR'),
    groups: z.array(GroupSchema).default([]),
    nodes: z.array(NodeSchema).min(1),
    edges: z.array(EdgeSchema).default([]),
  })
  .superRefine(crossRefChecks);

export type RawDiagram = z.infer<typeof DiagramSchema>;

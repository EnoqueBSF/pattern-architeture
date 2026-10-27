import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { GROUP_KINDS, NODE_TYPES, PROTOCOLS, STATUSES } from '../../src/schema/enums.js';
import { getCatalogSql, getCatalogStatus } from '../catalog/db.js';
import { reindex } from '../catalog/indexer.js';
import { facets, search } from '../catalog/repo.js';
import { listFiles } from '../server/files.js';
import type { Change } from '../shared/changes.js';
import { createDiagram, exportDiagram, mutateDiagram, readDiagram, readDiagramPng, ServiceError, type ServiceOptions } from './service.js';

const INSTRUCTIONS = `Servidor MCP do pattern-architeture: monta diagramas de arquitetura (YAML determinístico -> SVG/PNG) sem precisar abrir o Studio.

Regras do vocabulário (confira com vocabulary_get antes de inventar valores):
- Todo node e edge tem "status": new | changed | unchanged -- é a decisão mais importante do diagrama, nunca assuma "unchanged" por padrão sem ter uma base pra isso.
- Convenção de seta: chamada síncrona = "from" quem chama, "to" quem é chamado; mensageria segue o fluxo da mensagem (produtor -> fila, fila -> consumidor, como duas edges).
- "icon" é sempre explícito, nunca inferido a partir de "tech" -- se não tiver certeza do nome do ícone no catálogo local, omita o campo (o node usa a forma geométrica do "type").
- "rank"/"order" são válvula de escape manual para o layout automático -- só use se o resultado automático ficar visualmente ruim; não é o caminho normal.
- "tech" é string livre, convenção "Linguagem/Runtime · Framework · Motor/Hospedagem" (ex.: "Node.js 22 · NestJS").

Fluxo típico: diagram_create (novo, com pelo menos 1 add_node em "changes") ou diagram_apply (editar um existente) -> diagram_preview para conferir visualmente -> catalog_search para achar diagramas já catalogados.`;

const EdgeRefSchema = z.union([
  z.object({ id: z.string() }),
  z.object({ from: z.string(), to: z.string(), protocol: z.string().optional() }),
  z.object({ index: z.number().int() }),
]);

/** Esquema de entrada intencionalmente permissivo (campos como z.record) -- a validacao de verdade
 * (enums, campos obrigatorios, referencias cruzadas) e a do DiagramSchema do core, que roda dentro
 * de createDiagram/mutateDiagram e devolve ServiceError('INVALID', issues) com mensagens claras. */
const ChangeSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set_meta'),
    title: z.string().optional(),
    description: z.string().nullable().optional(),
    direction: z.enum(['LR', 'TB']).optional(),
    locale: z.enum(['pt-BR', 'en']).optional(),
    tags: z.array(z.string()).nullable().optional(),
  }),
  z.object({ action: z.literal('add_node'), node: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal('update_node'), id: z.string(), set: z.record(z.string(), z.unknown()).optional(), unset: z.array(z.string()).optional() }),
  z.object({ action: z.literal('remove_node'), id: z.string() }),
  z.object({ action: z.literal('add_group'), group: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal('update_group'), id: z.string(), set: z.record(z.string(), z.unknown()).optional(), unset: z.array(z.string()).optional() }),
  z.object({ action: z.literal('remove_group'), id: z.string() }),
  z.object({ action: z.literal('add_edge'), edge: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal('update_edge'), edge: EdgeRefSchema, set: z.record(z.string(), z.unknown()).optional(), unset: z.array(z.string()).optional() }),
  z.object({ action: z.literal('remove_edge'), edge: EdgeRefSchema }),
  z.object({ action: z.literal('clear_hints'), scope: z.enum(['nodes', 'groups', 'all']).optional() }),
]);

function asChanges(changes: z.infer<typeof ChangeSchema>[]): Change[] {
  return changes as unknown as Change[];
}

function textResult(text: string, structuredContent?: unknown) {
  return { content: [{ type: 'text' as const, text }], structuredContent: structuredContent as Record<string, unknown> | undefined };
}

function errorResult(err: unknown) {
  if (err instanceof ServiceError) {
    const issuesText = err.issues && err.issues.length > 0 ? `\nIssues:\n${err.issues.map((i) => `  - ${i}`).join('\n')}` : '';
    return { content: [{ type: 'text' as const, text: `[${err.code}] ${err.message}${issuesText}` }], isError: true, structuredContent: { code: err.code, issues: err.issues } };
  }
  return { content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }], isError: true };
}

/** Cria um McpServer novo com todas as tools registradas -- chamado pela factory de serveStdio (que
 * pode reusar a mesma factory para mais de uma conexao/era). Reaproveita 100% a logica de
 * studio/mcp/service.ts (que por sua vez reaproveita shared/changes.ts, shared/ops.ts e o motor core
 * em src/) -- nenhuma regra de edicao/validacao e reimplementada aqui. */
export function createMcpServer(svc: ServiceOptions): McpServer {
  const server = new McpServer({ name: 'pattern-architeture', version: '1.0.0' }, { instructions: INSTRUCTIONS, capabilities: { tools: {} } });

  server.registerTool(
    'vocabulary_get',
    { description: 'Devolve os valores validos para status/type/kind/protocol/direction/locale -- confira antes de montar um node/group/edge.' },
    async () => {
      const vocabulary = {
        statuses: STATUSES,
        nodeTypes: NODE_TYPES,
        groupKinds: GROUP_KINDS,
        protocols: PROTOCOLS,
        directions: ['LR', 'TB'],
        locales: ['pt-BR', 'en'],
      };
      return textResult(JSON.stringify(vocabulary, null, 2), vocabulary);
    },
  );

  server.registerTool(
    'templates_list',
    { description: 'Lista os templates disponiveis em templates/ (ponto de partida para diagram_create a partir de um template, lendo o arquivo com diagram_read).' },
    async () => {
      const files = listFiles(svc.repoRoot, svc.allowedRoots).filter((f) => f.rel.startsWith('templates/') || f.root !== svc.repoRoot);
      return textResult(files.map((f) => f.rel).join('\n') || '(nenhum template encontrado)', { templates: files });
    },
  );

  server.registerTool(
    'catalog_search',
    {
      description: 'Busca diagramas ja catalogados (titulo/descricao/tech, filtro por tag/project). Se o catalogo estiver offline, cai no fallback de listar os arquivos do disco.',
      inputSchema: z.object({ q: z.string().optional(), project: z.string().optional(), tag: z.string().optional(), limit: z.number().int().min(1).max(100).optional() }),
    },
    async ({ q, project, tag }) => {
      const sql = await getCatalogSql(svc.catalogConfig);
      if (!sql) {
        const files = listFiles(svc.repoRoot, svc.allowedRoots);
        const filtered = q ? files.filter((f) => f.rel.toLowerCase().includes(q.toLowerCase())) : files;
        return textResult(`catalogo offline (${getCatalogStatus()}) -- fallback por arquivos:\n${filtered.map((f) => f.rel).join('\n')}`, {
          offline: true,
          files: filtered,
        });
      }
      const result = await search(sql, { query: q, project, tags: tag ? [tag] : undefined });
      const facetsResult = await facets(sql);
      return textResult(
        result.items.map((i) => `${i.path} -- "${i.title}" (${i.project}, tags: ${i.tags.join(', ') || '-'})`).join('\n') || '(nenhum resultado)',
        { ...result, facets: facetsResult },
      );
    },
  );

  server.registerTool(
    'catalog_reindex',
    { description: 'Reindexa o catalogo a partir dos arquivos no disco (fonte de verdade). Sem efeito se o catalogo estiver offline.' },
    async () => {
      const sql = await getCatalogSql(svc.catalogConfig);
      if (!sql) return textResult(`catalogo offline (${getCatalogStatus()}) -- nada a reindexar`, { offline: true });
      const result = await reindex(sql, svc.repoRoot, svc.allowedRoots);
      return textResult(JSON.stringify(result), result);
    },
  );

  server.registerTool(
    'diagram_read',
    {
      description: 'Le um diagrama existente: outline (nodes/groups/edges), hash atual (para baseHash de diagram_apply) e o report de layout.',
      inputSchema: z.object({ path: z.string().describe('absoluto, ou relativo a raiz do repo') }),
    },
    async ({ path }) => {
      try {
        const result = readDiagram(path, svc);
        return textResult(JSON.stringify(result.outline, null, 2), { ...result, source: undefined });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'diagram_create',
    {
      description:
        'Cria um diagrama novo (nao sobrescreve um existente -- usa diagram_apply para isso). Sem template, "changes" precisa incluir ao menos 1 "add_node" (um diagrama sem nenhum node e invalido).',
      inputSchema: z.object({
        path: z.string().describe('relativo a raiz do repo, ex.: diagrams/meu-projeto/fluxo.yaml'),
        title: z.string(),
        description: z.string().optional(),
        direction: z.enum(['LR', 'TB']).optional(),
        locale: z.enum(['pt-BR', 'en']).optional(),
        tags: z.array(z.string()).optional(),
        changes: z.array(ChangeSchema),
      }),
    },
    async ({ path, title, description, direction, locale, tags, changes }) => {
      try {
        const result = await createDiagram({ path, title, description, direction, locale, tags, changes: asChanges(changes) }, svc);
        return textResult(`criado: ${result.path}\n${result.applied.join('\n')}`, result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'diagram_apply',
    {
      description:
        'Aplica uma lista de mudancas (set_meta, add/update/remove_node, add/update/remove_group, add/update/remove_edge, clear_hints) a um diagrama existente, em lote atomico -- se uma mudanca falhar, nenhuma e gravada. Use dryRun para validar sem gravar.',
      inputSchema: z.object({
        path: z.string(),
        changes: z.array(ChangeSchema),
        baseHash: z.string().optional().describe('hash de diagram_read/diagram_apply anterior -- se informado e divergir do hash atual em disco, falha com CONFLICT sem aplicar nada'),
        dryRun: z.boolean().optional(),
      }),
    },
    async ({ path, changes, baseHash, dryRun }) => {
      try {
        const result = await mutateDiagram({ path, changes: asChanges(changes), baseHash, dryRun }, svc);
        return textResult(`${dryRun ? '[dry run] ' : ''}${result.path}\n${result.applied.join('\n')}`, result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'diagram_preview',
    {
      description: 'Devolve o PNG ja gravado do diagrama (gerado no ultimo diagram_create/diagram_apply) para inspecao visual.',
      inputSchema: z.object({ path: z.string() }),
    },
    async ({ path }) => {
      try {
        const png = readDiagramPng(path, svc);
        return { content: [{ type: 'image' as const, data: png.toString('base64'), mimeType: 'image/png' }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'diagram_export',
    {
      description: 'Renderiza o diagrama para um arquivo SVG/PNG a parte (sem reescrever o .yaml). Sem outPath, usa a base canonica ao lado do .yaml -- so permitido com scale=2 (ou omitido), para nao sobrescrever o PNG canonico com outra escala.',
      inputSchema: z.object({
        path: z.string(),
        outPath: z.string().optional(),
        format: z.enum(['svg', 'png']).optional(),
        scale: z.number().positive().optional(),
      }),
    },
    async ({ path, outPath, format, scale }) => {
      try {
        const result = exportDiagram({ path, outPath, format, scale }, svc);
        return textResult(`exportado: ${result.outPath}`, result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  return server;
}

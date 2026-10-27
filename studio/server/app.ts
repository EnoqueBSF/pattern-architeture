import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { toPng } from '../../src/export/png.js';
import { iconAliases, iconKeys } from '../../src/icons/catalog.js';
import { ASYNC_PROTOCOLS, GROUP_KINDS, NODE_TYPES, PROTOCOLS, PROTOCOL_LABEL, STATUSES } from '../../src/schema/enums.js';
import { ROOT } from '../../src/layout/tree.js';
import { renderDiagramSource } from '../../src/index.js';
import { DiagramValidationError } from '../../src/schema/load.js';
import { FONT_PATH_REGULAR, FONT_PATH_SEMIBOLD } from '../../src/text/fonts.js';
import { nodeTypeLabel, statusCaption } from '../../src/theme/i18n.js';
import { GROUP_STYLE } from '../../src/theme/theme.js';
import type { CatalogConfig } from '../catalog/config.js';
import { getCatalogSql, getCatalogStatus, markCatalogUnavailable } from '../catalog/db.js';
import { reindex as reindexCatalog } from '../catalog/indexer.js';
import { facets, search, type CatalogItem } from '../catalog/repo.js';
import { applyDrop, DropNotFoundError, renderView } from './engine.js';
import { ConflictError, ExistsError, listFiles, readYamlFile, sha256 } from './files.js';
import { HttpError, readJsonBody, sendError, sendJson } from './http-util.js';
import { saveDiagram } from './save.js';
import { listTemplates, readTemplate } from './templates.js';

export interface ViteMiddlewares {
  (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void): void;
}

export interface HandlerOptions {
  /** raiz do repo pattern-architeture (onde ficam examples/, diagrams/, templates/) */
  repoRoot: string;
  /** diretorios (absolutos, ja resolvidos) de onde e permitido ler/escrever .yaml */
  allowedRoots: string[];
  /** caminho absoluto do arquivo a abrir automaticamente ao iniciar, se fornecido via CLI */
  initialFile?: string;
  port: number;
  /** middlewares do Vite dev server (modo middleware), ou null se o build do client nao estiver disponivel */
  viteMiddlewares: ViteMiddlewares | null;
  /** config explicita do catalogo (controle por instancia, usado em testes); default: le do ambiente */
  catalog?: CatalogConfig;
}

/** `onDisk` e calculado so para a pagina retornada (no maximo 50 itens) -- compara o hash atual do arquivo com o que esta indexado, para o client sinalizar quando um diagrama foi editado fora do catalogo (CLI, `git pull`, edicao manual) desde a ultima indexacao. */
function toClientCatalogItem(item: CatalogItem): Omit<CatalogItem, 'yamlSha256'> & { onDisk: 'ok' | 'changed' | 'missing' } {
  const { yamlSha256, ...rest } = item;
  let onDisk: 'ok' | 'changed' | 'missing' = 'missing';
  if (existsSync(item.path)) {
    try {
      onDisk = sha256(readFileSync(item.path, 'utf-8')) === yamlSha256 ? 'ok' : 'changed';
    } catch {
      onDisk = 'missing';
    }
  }
  return { ...rest, onDisk };
}

function isAllowedRequest(req: IncomingMessage, port: number): boolean {
  const host = req.headers.host ?? '';
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  if (!allowedHosts.has(host)) return false;
  const origin = req.headers.origin;
  if (origin) {
    const expected = new Set([...allowedHosts].map((h) => `http://${h}`));
    if (!expected.has(origin)) return false;
  }
  return true;
}

const FONT_FILES: Record<string, string> = {
  'inter-400.ttf': FONT_PATH_REGULAR,
  'inter-600.ttf': FONT_PATH_SEMIBOLD,
};

interface PutFileBody {
  path?: string;
  source?: string;
  baseHash?: string;
  overwrite?: boolean;
}

export function createHandler(opts: HandlerOptions) {
  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;
    const isApi = pathname.startsWith('/api/') || pathname.startsWith('/fonts/');

    try {
      if (isApi && !isAllowedRequest(req, opts.port)) {
        sendError(res, 403, 'host/origin nao permitido');
        return;
      }

      if (pathname === '/api/health') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === '/api/meta' && req.method === 'GET') {
        sendJson(res, 200, {
          nodeTypes: NODE_TYPES,
          protocols: PROTOCOLS,
          groupKinds: GROUP_KINDS,
          statuses: STATUSES,
          asyncProtocols: [...ASYNC_PROTOCOLS],
          nodeTypeLabels: Object.fromEntries(NODE_TYPES.map((t) => [t, nodeTypeLabel('pt-BR', t)])),
          statusLabels: Object.fromEntries(STATUSES.map((s) => [s, statusCaption('pt-BR', s)])),
          protocolLabels: PROTOCOL_LABEL,
          iconKeys: iconKeys(),
          iconAliases: iconAliases(),
          titleBarHeight: GROUP_STYLE.titleBarHeight,
          root: ROOT,
          repoRoot: opts.repoRoot,
          initialFile: opts.initialFile ?? null,
        });
        return;
      }

      if (pathname === '/api/render' && req.method === 'POST') {
        const body = await readJsonBody<{ source?: string }>(req);
        if (typeof body.source !== 'string') throw new HttpError(400, 'campo "source" (string) e obrigatorio');
        sendJson(res, 200, renderView(body.source));
        return;
      }

      if (pathname === '/api/drop' && req.method === 'POST') {
        const body = await readJsonBody<{ source?: string; draggedId?: string; container?: string; rank?: number; orderIndex?: number }>(req);
        if (typeof body.source !== 'string') throw new HttpError(400, 'campo "source" (string) e obrigatorio');
        if (typeof body.draggedId !== 'string') throw new HttpError(400, 'campo "draggedId" (string) e obrigatorio');
        if (typeof body.container !== 'string') throw new HttpError(400, 'campo "container" (string) e obrigatorio');
        if (typeof body.rank !== 'number') throw new HttpError(400, 'campo "rank" (number) e obrigatorio');
        if (typeof body.orderIndex !== 'number') throw new HttpError(400, 'campo "orderIndex" (number) e obrigatorio');

        try {
          const source = applyDrop(body.source, { draggedId: body.draggedId, container: body.container, rank: body.rank, orderIndex: body.orderIndex });
          sendJson(res, 200, { source });
        } catch (err) {
          if (err instanceof DiagramValidationError) {
            sendJson(res, 422, { issues: err.issues });
            return;
          }
          if (err instanceof DropNotFoundError) {
            throw new HttpError(400, err.message);
          }
          throw err;
        }
        return;
      }

      if (pathname === '/api/export' && req.method === 'POST') {
        const body = await readJsonBody<{ source?: string; format?: string; scale?: number; filename?: string }>(req);
        if (typeof body.source !== 'string') throw new HttpError(400, 'campo "source" (string) e obrigatorio');
        const format = body.format === 'png' ? 'png' : 'svg';
        const safeName = (body.filename ?? 'diagrama').replace(/[^a-zA-Z0-9._-]+/g, '-') || 'diagrama';

        let result;
        try {
          result = renderDiagramSource(body.source);
        } catch (err) {
          if (err instanceof DiagramValidationError) {
            sendJson(res, 422, { issues: err.issues });
            return;
          }
          throw err;
        }

        if (format === 'svg') {
          const buf = Buffer.from(result.svg, 'utf-8');
          res.writeHead(200, {
            'Content-Type': 'image/svg+xml',
            'Content-Disposition': `attachment; filename="${safeName}.svg"`,
            'Content-Length': buf.length,
          });
          res.end(buf);
          return;
        }

        const scale = body.scale === 3 ? 3 : 2;
        const png = toPng(result.svg, scale);
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Disposition': `attachment; filename="${safeName}.png"`,
          'Content-Length': png.length,
        });
        res.end(png);
        return;
      }

      if (pathname === '/api/catalog/status' && req.method === 'GET') {
        const sql = await getCatalogSql(opts.catalog);
        if (!sql) {
          sendJson(res, 503, { status: getCatalogStatus() });
          return;
        }
        try {
          const rows = await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM diagrams`;
          sendJson(res, 200, { status: 'ok', count: Number(rows[0]!.count) });
        } catch {
          // a conexao estava "ok" (cacheada) mas o Postgres caiu desde entao -- so uma query real
          // revela isso; marca indisponivel para a proxima chamada tentar reconectar
          markCatalogUnavailable();
          sendJson(res, 503, { status: getCatalogStatus() });
        }
        return;
      }

      if (pathname === '/api/catalog/search' && req.method === 'GET') {
        const sql = await getCatalogSql(opts.catalog);
        if (!sql) {
          sendJson(res, 503, { status: getCatalogStatus() });
          return;
        }
        try {
          const tagParams = url.searchParams.getAll('tag');
          const limitParam = url.searchParams.get('limit');
          const offsetParam = url.searchParams.get('offset');
          const [result, facetsResult] = await Promise.all([
            search(sql, {
              query: url.searchParams.get('q') ?? undefined,
              tags: tagParams.length > 0 ? tagParams : undefined,
              project: url.searchParams.get('project') ?? undefined,
              limit: limitParam ? Number(limitParam) : undefined,
              offset: offsetParam ? Number(offsetParam) : undefined,
            }),
            facets(sql),
          ]);
          sendJson(res, 200, { items: result.items.map(toClientCatalogItem), total: result.total, facets: facetsResult });
        } catch {
          markCatalogUnavailable();
          sendJson(res, 503, { status: getCatalogStatus() });
        }
        return;
      }

      if (pathname === '/api/catalog/reindex' && req.method === 'POST') {
        const sql = await getCatalogSql(opts.catalog);
        if (!sql) {
          sendJson(res, 503, { status: getCatalogStatus() });
          return;
        }
        try {
          sendJson(res, 200, await reindexCatalog(sql, opts.repoRoot, opts.allowedRoots));
        } catch {
          markCatalogUnavailable();
          sendJson(res, 503, { status: getCatalogStatus() });
        }
        return;
      }

      if (pathname === '/api/templates' && req.method === 'GET') {
        sendJson(res, 200, { templates: listTemplates() });
        return;
      }

      if (pathname === '/api/template' && req.method === 'GET') {
        const id = url.searchParams.get('id') ?? 'blank';
        const source = readTemplate(id);
        if (source === undefined) throw new HttpError(404, `template "${id}" nao encontrado`);
        sendJson(res, 200, { source });
        return;
      }

      if (pathname === '/api/files' && req.method === 'GET') {
        sendJson(res, 200, { files: listFiles(opts.repoRoot, opts.allowedRoots) });
        return;
      }

      if (pathname === '/api/file' && req.method === 'GET') {
        const filePath = url.searchParams.get('path');
        if (!filePath) throw new HttpError(400, 'parametro "path" e obrigatorio');
        sendJson(res, 200, readYamlFile(filePath, opts.allowedRoots));
        return;
      }

      if (pathname === '/api/file' && req.method === 'PUT') {
        const body = await readJsonBody<PutFileBody>(req);
        if (typeof body.path !== 'string') throw new HttpError(400, 'campo "path" (string) e obrigatorio');
        if (typeof body.source !== 'string') throw new HttpError(400, 'campo "source" (string) e obrigatorio');

        try {
          const result = await saveDiagram({
            path: body.path,
            source: body.source,
            baseHash: body.baseHash,
            overwrite: body.overwrite,
            allowedRoots: opts.allowedRoots,
            repoRoot: opts.repoRoot,
            origin: 'studio',
            catalogConfig: opts.catalog,
          });
          sendJson(res, 200, result);
        } catch (err) {
          if (err instanceof DiagramValidationError) {
            sendJson(res, 422, { issues: err.issues });
            return;
          }
          if (err instanceof ConflictError) {
            sendJson(res, 409, { reason: 'conflict', currentHash: err.currentHash });
            return;
          }
          if (err instanceof ExistsError) {
            sendJson(res, 409, { reason: 'exists' });
            return;
          }
          throw err;
        }
        return;
      }

      if (pathname.startsWith('/fonts/')) {
        const name = pathname.slice('/fonts/'.length);
        const filePath = FONT_FILES[name];
        if (!filePath || !existsSync(filePath)) {
          sendError(res, 404, 'fonte nao encontrada');
          return;
        }
        const data = readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': 'font/ttf', 'Content-Length': data.length, 'Cache-Control': 'public, max-age=31536000, immutable' });
        res.end(data);
        return;
      }

      if (opts.viteMiddlewares) {
        opts.viteMiddlewares(req, res, () => {
          sendError(res, 404, 'nao encontrado');
        });
        return;
      }

      sendError(res, 404, 'nao encontrado');
    } catch (err) {
      if (err instanceof HttpError) {
        sendError(res, err.status, err.message);
        return;
      }
      console.error(err);
      sendError(res, 500, (err as Error).message || 'erro interno');
    }
  };
}

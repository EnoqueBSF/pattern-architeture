import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { DiagramValidationError } from '../../src/schema/load.js';
import { renderDiagramSource, type RenderReport } from '../../src/index.js';
import { toPng } from '../../src/export/png.js';
import type { CatalogConfig } from '../catalog/config.js';
import { AmbiguousEdgeRefError, NotFoundError } from '../shared/ops.js';
import { applyChanges, type Change } from '../shared/changes.js';
import { diagramSkeleton, type SkeletonOptions } from '../shared/skeleton.js';
import { assertAllowedPath, ConflictError, ExistsError, readYamlFile } from '../server/files.js';
import { HttpError } from '../server/http-util.js';
import { saveDiagram, type CatalogIndexResult } from '../server/save.js';

export type ServiceErrorCode = 'INVALID' | 'CONFLICT' | 'NOT_FOUND' | 'FORBIDDEN' | 'EXISTS' | 'BAD_REF';

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    public readonly issues?: string[],
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export interface ServiceOptions {
  repoRoot: string;
  allowedRoots: string[];
  catalogConfig?: CatalogConfig;
}

export interface DiagramOutline {
  title: string;
  description?: string;
  direction: 'LR' | 'TB';
  locale: 'pt-BR' | 'en';
  nodes: { id: string; label: string; type: string; status: string; group?: string }[];
  groups: { id: string; label: string; kind: string; parent?: string }[];
  edges: { id: string; from: string; to: string; protocol: string; label?: string }[];
}

export interface ReadDiagramResult {
  path: string;
  source: string;
  hash: string;
  outline: DiagramOutline;
  report: RenderReport;
}

export interface MutationResult {
  path: string;
  hash: string;
  written: string[];
  report: RenderReport;
  applied: string[];
  fallbackUsed: boolean;
  catalog: CatalogIndexResult;
  baseHash?: string;
}

/** Resolve `path` para absoluto (relativo ao repoRoot quando nao for ja absoluto) e mapeia erros de
 * fronteira (403/404 de assertAllowedPath) para os codigos do MCP. */
function resolvePath(path: string, repoRoot: string): string {
  return isAbsolute(path) ? path : join(repoRoot, path);
}

function toOutline(source: string): { outline: DiagramOutline; report: RenderReport } {
  const result = renderDiagramSource(source);
  const { model } = result;
  return {
    outline: {
      title: model.title,
      description: model.description,
      direction: model.direction,
      locale: model.locale,
      nodes: model.nodes.map((n) => ({ id: n.id, label: n.label, type: n.type, status: n.status, group: n.group })),
      groups: model.groups.map((g) => ({ id: g.id, label: g.label, kind: g.kind, parent: g.parent })),
      edges: model.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, protocol: e.protocol, label: e.label })),
    },
    report: result.report,
  };
}

function rethrowAsServiceError(err: unknown): never {
  if (err instanceof DiagramValidationError) throw new ServiceError('INVALID', err.message, err.issues);
  if (err instanceof ConflictError) throw new ServiceError('CONFLICT', 'o arquivo mudou em disco desde a ultima leitura (baseHash desatualizado)');
  if (err instanceof ExistsError) throw new ServiceError('EXISTS', 'ja existe um arquivo nesse caminho');
  if (err instanceof AmbiguousEdgeRefError) throw new ServiceError('BAD_REF', err.message);
  if (err instanceof NotFoundError) throw new ServiceError('NOT_FOUND', err.message);
  if (err instanceof HttpError) {
    if (err.status === 403) throw new ServiceError('FORBIDDEN', err.message);
    if (err.status === 404) throw new ServiceError('NOT_FOUND', err.message);
    throw new ServiceError('INVALID', err.message);
  }
  throw err;
}

export function readDiagram(path: string, opts: ServiceOptions): ReadDiagramResult {
  try {
    const abs = resolvePath(path, opts.repoRoot);
    const { source, hash } = readYamlFile(abs, opts.allowedRoots);
    const { outline, report } = toOutline(source);
    return { path: abs, source, hash, outline, report };
  } catch (err) {
    rethrowAsServiceError(err);
  }
}

export interface CreateDiagramOptions extends SkeletonOptions {
  path: string;
  changes: Change[];
}

/** Cria um diagrama novo: skeleton minimo + `changes` (precisa incluir ao menos 1 `add_node`, ou a
 * validacao final rejeita "nodes: []" com INVALID) e grava os 3 arquivos (sem sobrescrever existente). */
export async function createDiagram(opts: CreateDiagramOptions, svc: ServiceOptions): Promise<MutationResult> {
  try {
    const abs = resolvePath(opts.path, svc.repoRoot);
    const base = diagramSkeleton(opts);
    const applied = applyChanges(base, opts.changes);

    const result = await saveDiagram({
      path: abs,
      source: applied.text,
      overwrite: false,
      allowedRoots: svc.allowedRoots,
      repoRoot: svc.repoRoot,
      origin: 'mcp',
      catalogConfig: svc.catalogConfig,
    });

    return {
      path: abs,
      hash: result.hash,
      written: result.written,
      report: result.report,
      applied: applied.applied,
      fallbackUsed: applied.fallbackUsed,
      catalog: result.catalog,
    };
  } catch (err) {
    rethrowAsServiceError(err);
  }
}

export interface MutateDiagramOptions {
  path: string;
  changes: Change[];
  /** se informado, precisa bater com o hash atual do arquivo -- senao CONFLICT antes de aplicar nada. */
  baseHash?: string;
  /** valida e devolve o resultado (outline/report/applied) sem gravar nada em disco nem no catalogo. */
  dryRun?: boolean;
}

/** Le o arquivo atual, aplica `changes` em sequencia (cada um reprocessando o YAML resultante do
 * anterior) e grava -- atomico: se qualquer Change falhar, nada e gravado. Com `dryRun`, para antes
 * de gravar (so valida e devolve o preview). */
export async function mutateDiagram(opts: MutateDiagramOptions, svc: ServiceOptions): Promise<MutationResult> {
  try {
    const abs = resolvePath(opts.path, svc.repoRoot);
    const current = readYamlFile(abs, svc.allowedRoots);
    if (opts.baseHash !== undefined && opts.baseHash !== current.hash) {
      throw new ConflictError(current.hash);
    }

    const applied = applyChanges(current.source, opts.changes);

    if (opts.dryRun) {
      const { report } = toOutline(applied.text); // lanca DiagramValidationError se o resultado ficar invalido
      return {
        path: abs,
        hash: current.hash,
        written: [],
        report,
        applied: applied.applied,
        fallbackUsed: applied.fallbackUsed,
        catalog: { indexed: false, reason: 'dry run -- nada foi gravado' },
        baseHash: current.hash,
      };
    }

    const result = await saveDiagram({
      path: abs,
      source: applied.text,
      baseHash: current.hash,
      allowedRoots: svc.allowedRoots,
      repoRoot: svc.repoRoot,
      origin: 'mcp',
      catalogConfig: svc.catalogConfig,
    });

    return {
      path: abs,
      hash: result.hash,
      written: result.written,
      report: result.report,
      applied: applied.applied,
      fallbackUsed: applied.fallbackUsed,
      catalog: result.catalog,
      baseHash: current.hash,
    };
  } catch (err) {
    rethrowAsServiceError(err);
  }
}

export interface ExportDiagramOptions {
  path: string;
  /** destino do SVG/PNG; default: ao lado do .yaml (base canonica), so permitido quando scale e 2 (ou omitido). */
  outPath?: string;
  format?: 'svg' | 'png';
  scale?: number;
}

export interface ExportDiagramResult {
  outPath: string;
  format: 'svg' | 'png';
}

/** Renderiza o diagrama (sem reescrever o .yaml) e grava SVG/PNG em `outPath`. Sem `outPath`,
 * usa a base canonica ao lado do .yaml -- mas so quando `scale` e 2 (padrao do CLI/Studio), para
 * nunca sobrescrever o PNG canonico com uma escala diferente por engano. */
export function exportDiagram(opts: ExportDiagramOptions, svc: ServiceOptions): ExportDiagramResult {
  try {
    const abs = resolvePath(opts.path, svc.repoRoot);
    const { source } = readYamlFile(abs, svc.allowedRoots);
    const format = opts.format ?? 'png';
    const scale = opts.scale ?? 2;

    let outPath = opts.outPath ? resolvePath(opts.outPath, svc.repoRoot) : undefined;
    if (!outPath) {
      if (scale !== 2) {
        throw new ServiceError('INVALID', 'outPath e obrigatorio quando scale != 2 (nao sobrescreve o PNG canonico com outra escala)');
      }
      outPath = abs.replace(/\.ya?ml$/i, `.${format}`);
    }
    const real = assertAllowedPath(outPath, svc.allowedRoots, { mustExist: false });

    const { svg } = renderDiagramSource(source);
    if (format === 'svg') writeFileSync(real, svg, 'utf-8');
    else writeFileSync(real, toPng(svg, scale));
    return { outPath: real, format };
  } catch (err) {
    rethrowAsServiceError(err);
  }
}

/** Le o PNG ja gravado ao lado do .yaml (gerado no ultimo save) -- usado pelo preview do MCP. */
export function readDiagramPng(path: string, svc: ServiceOptions): Buffer {
  try {
    const abs = resolvePath(path, svc.repoRoot);
    const real = assertAllowedPath(abs, svc.allowedRoots, { mustExist: true });
    const pngPath = real.replace(/\.ya?ml$/i, '.png');
    return readFileSync(pngPath);
  } catch (err) {
    rethrowAsServiceError(err);
  }
}

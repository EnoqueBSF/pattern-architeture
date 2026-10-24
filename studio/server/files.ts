import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync, type Dirent } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { toPng } from '../../src/export/png.js';
import { renderDiagramSource, type RenderReport } from '../../src/index.js';
import { HttpError } from './http-util.js';

const REPO_LISTABLE_DIRS = ['diagrams', 'examples', 'templates'];
const SKIP_DIR_NAMES = new Set(['node_modules', '.git']);
const MAX_LIST_DEPTH = 6;
const MAX_LIST_FILES = 500;

export interface FileEntry {
  path: string;
  root: string;
  rel: string;
  mtimeMs: number;
}

function safeRealpath(p: string): string | undefined {
  try {
    return realpathSync(p);
  } catch {
    return undefined;
  }
}

function walkDir(dir: string, root: string, out: FileEntry[], depthLeft: number): void {
  if (depthLeft < 0 || out.length >= MAX_LIST_FILES) return;
  let items: Dirent[];
  try {
    items = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const item of items) {
    if (out.length >= MAX_LIST_FILES) return;
    if (item.name.startsWith('.') || SKIP_DIR_NAMES.has(item.name)) continue;
    const full = join(dir, item.name);
    if (item.isDirectory()) {
      walkDir(full, root, out, depthLeft - 1);
    } else if (item.isFile() && /\.ya?ml$/i.test(item.name)) {
      const stat = statSync(full);
      out.push({ path: full, root, rel: relative(root, full), mtimeMs: stat.mtimeMs });
    }
  }
}

/** Lista os .yaml visiveis: no repoRoot, so diagrams/examples/templates; nos roots extras, tudo (ate os limites). */
export function listFiles(repoRoot: string, allowedRoots: string[]): FileEntry[] {
  const collected: FileEntry[] = [];
  const realRepoRoot = safeRealpath(repoRoot);

  for (const root of allowedRoots) {
    const realRoot = safeRealpath(root);
    if (!realRoot) continue;
    if (realRoot === realRepoRoot) {
      for (const dir of REPO_LISTABLE_DIRS) {
        const dirPath = join(realRoot, dir);
        if (existsSync(dirPath)) walkDir(dirPath, realRoot, collected, MAX_LIST_DEPTH);
      }
    } else {
      walkDir(realRoot, realRoot, collected, MAX_LIST_DEPTH);
    }
  }

  // um root extra (ex.: o diretorio do arquivo inicial passado via CLI) pode estar DENTRO do
  // repoRoot -- nesse caso o mesmo arquivo e encontrado duas vezes, com "rel" diferentes. Mantem
  // so a entrada relativa ao repoRoot, que e a mais descritiva para a UI.
  const byPath = new Map<string, FileEntry>();
  for (const entry of collected) {
    const existing = byPath.get(entry.path);
    if (!existing || (existing.root !== realRepoRoot && entry.root === realRepoRoot)) {
      byPath.set(entry.path, entry);
    }
  }
  return [...byPath.values()];
}

/** Caminho absoluto resolvido (via realpath quando existe) se `filePath` estiver dentro de algum allowedRoot. */
export function assertAllowedPath(filePath: string, allowedRoots: string[], opts: { mustExist: boolean }): string {
  if (!isAbsolute(filePath)) throw new HttpError(400, 'caminho deve ser absoluto');
  if (!/\.ya?ml$/i.test(filePath)) throw new HttpError(400, 'so arquivos .yaml/.yml sao permitidos');

  let real: string;
  if (opts.mustExist) {
    const resolved = safeRealpath(filePath);
    if (!resolved) throw new HttpError(404, 'arquivo nao encontrado');
    real = resolved;
  } else {
    // o arquivo pode nao existir ainda (sera criado); resolve o diretorio pai via realpath (ex.: no
    // macOS /var e /tmp sao symlinks para /private/...) para comparar de forma consistente com os
    // allowedRoots, tambem resolvidos abaixo. Se o dir tambem nao existir, usa como esta (sera criado
    // via mkdir -p pelo chamador, e nesse caso o root ja precisa bater exatamente).
    const dir = dirname(filePath);
    const realDir = safeRealpath(dir) ?? dir;
    real = join(realDir, basename(filePath));
  }

  const ok = allowedRoots.some((root) => {
    const realRoot = safeRealpath(root);
    if (!realRoot) return false;
    const rel = relative(realRoot, real);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  });
  if (!ok) throw new HttpError(403, 'caminho fora dos diretorios permitidos');
  return real;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export interface ReadResult {
  path: string;
  source: string;
  hash: string;
}

export function readYamlFile(filePath: string, allowedRoots: string[]): ReadResult {
  const real = assertAllowedPath(filePath, allowedRoots, { mustExist: true });
  const source = readFileSync(real, 'utf-8');
  return { path: real, source, hash: sha256(source) };
}

const SCHEMA_COMMENT_RE = /^# yaml-language-server: \$schema=.*$/;

/** Reescreve a 1a linha `# yaml-language-server: $schema=...` para apontar certo a partir de `filePath`. */
export function rewriteSchemaComment(source: string, filePath: string, repoRoot: string): string {
  const lines = source.split('\n');
  if (!lines[0] || !SCHEMA_COMMENT_RE.test(lines[0])) return source;
  const schemaPath = join(repoRoot, 'schema', 'diagram.schema.json');
  const relPath = relative(dirname(filePath), schemaPath).split(sep).join('/');
  lines[0] = `# yaml-language-server: $schema=${relPath}`;
  return lines.join('\n');
}

function atomicWrite(filePath: string, content: string | Buffer): void {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  if (typeof content === 'string') writeFileSync(tmp, content, 'utf-8');
  else writeFileSync(tmp, content);
  renameSync(tmp, filePath);
}

export class ConflictError extends Error {
  constructor(public currentHash: string) {
    super('o arquivo mudou em disco desde a ultima leitura');
  }
}

export class ExistsError extends Error {
  constructor() {
    super('ja existe um arquivo nesse caminho');
  }
}

export interface WriteOptions {
  path: string;
  source: string;
  baseHash?: string;
  overwrite?: boolean;
  allowedRoots: string[];
  repoRoot: string;
}

export interface WriteResult {
  hash: string;
  written: string[];
  report: RenderReport;
}

/** Valida, grava .yaml + .svg + .png (atomicamente), igual a saida padrao do CLI. */
export function writeYamlFile(opts: WriteOptions): WriteResult {
  const adjustedSource = rewriteSchemaComment(opts.source, opts.path, opts.repoRoot);
  const result = renderDiagramSource(adjustedSource); // lanca DiagramValidationError se invalido (caller trata como 422)

  const real = assertAllowedPath(opts.path, opts.allowedRoots, { mustExist: false });
  const exists = existsSync(real);
  if (exists) {
    const currentHash = sha256(readFileSync(real, 'utf-8'));
    if (opts.baseHash !== undefined) {
      if (opts.baseHash !== currentHash) throw new ConflictError(currentHash);
    } else if (!opts.overwrite) {
      throw new ExistsError();
    }
  }

  mkdirSync(dirname(real), { recursive: true });
  const base = real.replace(/\.ya?ml$/i, '');
  const svgPath = `${base}.svg`;
  const pngPath = `${base}.png`;

  atomicWrite(real, adjustedSource);
  atomicWrite(svgPath, result.svg);
  atomicWrite(pngPath, toPng(result.svg, 2));

  return { hash: sha256(adjustedSource), written: [real, svgPath, pngPath], report: result.report };
}

import { readFileSync } from 'node:fs';
import type { Sql } from 'postgres';
import { listFiles } from '../server/files.js';
import { extractCatalogRecord } from './extract.js';
import { getByPath, pruneMissing, upsert } from './repo.js';

export interface ReindexResult {
  indexed: number;
  updated: number;
  unchanged: number;
  removed: number;
  errors: { path: string; message: string }[];
}

/** Varre `allowedRoots` (via listFiles, a mesma varredura que o FileDialog usa) e sincroniza o catálogo com o disco: indexa o que é novo, atualiza o que mudou (por hash), deixa intocado o que não mudou, e remove do catálogo o que não existe mais -- só dentro dos roots efetivamente varridos nesta chamada. */
export async function reindex(sql: Sql, repoRoot: string, allowedRoots: string[]): Promise<ReindexResult> {
  const result: ReindexResult = { indexed: 0, updated: 0, unchanged: 0, removed: 0, errors: [] };
  const files = listFiles(repoRoot, allowedRoots);

  const pathsByRoot = new Map<string, Set<string>>();
  for (const file of files) {
    if (!pathsByRoot.has(file.root)) pathsByRoot.set(file.root, new Set());
  }

  for (const file of files) {
    try {
      const source = readFileSync(file.path, 'utf-8');
      const record = extractCatalogRecord(source, file.path, file.root, repoRoot);
      if (!record) continue; // templates/ e outros caminhos nao-indexaveis

      pathsByRoot.get(file.root)!.add(record.path);

      const existing = await getByPath(sql, record.path);
      await upsert(sql, record, 'reindex');

      if (!existing) result.indexed++;
      else if (existing.yamlSha256 !== record.yamlSha256) result.updated++;
      else result.unchanged++;
    } catch (err) {
      result.errors.push({ path: file.path, message: err instanceof Error ? err.message : String(err) });
    }
  }

  for (const [root, paths] of pathsByRoot) {
    result.removed += await pruneMissing(sql, root, paths);
  }

  return result;
}

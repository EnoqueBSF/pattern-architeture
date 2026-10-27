import type { CatalogConfig } from '../catalog/config.js';
import { getCatalogSql, markCatalogUnavailable } from '../catalog/db.js';
import { extractCatalogRecord } from '../catalog/extract.js';
import { upsert, type LastWriter } from '../catalog/repo.js';
import { writeYamlFile, type WriteOptions, type WriteResult } from './files.js';

export interface SaveDiagramOptions extends WriteOptions {
  /** quem esta salvando -- vira last_writer no catalogo */
  origin: LastWriter;
  /** config explicita do catalogo (controle por instancia de handler, ex. em testes); default: le do ambiente */
  catalogConfig?: CatalogConfig;
}

export interface CatalogIndexResult {
  indexed: boolean;
  reason?: string;
}

export interface SaveDiagramResult extends WriteResult {
  catalog: CatalogIndexResult;
}

/** root mais especifico (mais longo) de `allowedRoots` que e prefixo de `absPath`. */
function findRootFor(absPath: string, allowedRoots: string[]): string {
  const matches = allowedRoots.filter((r) => absPath === r || absPath.startsWith(r.endsWith('/') ? r : `${r}/`));
  return matches.sort((a, b) => b.length - a.length)[0] ?? allowedRoots[0]!;
}

/**
 * Funil unico de "salvar um diagrama" usado pelo Studio (PUT /api/file) e pelo MCP: grava os 3
 * arquivos no disco -- fonte de verdade, via `writeYamlFile` -- e, como melhor esforco, atualiza o
 * catalogo. O catalogo NUNCA faz o save falhar: se estiver offline, ou a indexacao der qualquer
 * erro, o resultado ainda reflete os arquivos gravados com sucesso, so com `catalog.indexed=false`
 * e o motivo. `writeYamlFile` pode lancar (YAML invalido, conflito de hash, arquivo ja existe) --
 * isso propaga para o chamador decidir o status HTTP, sem passar pelo catalogo.
 */
export async function saveDiagram(opts: SaveDiagramOptions): Promise<SaveDiagramResult> {
  const result = writeYamlFile(opts);

  let catalog: CatalogIndexResult;
  try {
    const sql = await getCatalogSql(opts.catalogConfig); // undefined ativa o default parameter (le do ambiente)
    if (!sql) {
      catalog = { indexed: false, reason: 'catalogo offline' };
    } else {
      const yamlPath = result.written[0]!;
      const root = findRootFor(yamlPath, opts.allowedRoots);
      const record = extractCatalogRecord(opts.source, yamlPath, root, opts.repoRoot);
      if (!record) {
        catalog = { indexed: false, reason: 'caminho nao indexavel (ex.: dentro de templates/)' };
      } else {
        try {
          await upsert(sql, record, opts.origin);
          catalog = { indexed: true };
        } catch (err) {
          // a conexao estava "ok" (cacheada) mas a query falhou de verdade (ex.: Postgres caiu
          // depois de conectar) -- marca indisponivel para a proxima chamada tentar reconectar,
          // em vez de ficar presa reusando uma conexao morta indefinidamente
          markCatalogUnavailable();
          throw err;
        }
      }
    }
  } catch (err) {
    catalog = { indexed: false, reason: err instanceof Error ? err.message : 'falha ao indexar' };
  }

  return { ...result, catalog };
}

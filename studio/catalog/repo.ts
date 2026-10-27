import type { Row, Sql } from 'postgres';
import type { CatalogRecord } from './extract.js';
import { buildTsQuery } from './query.js';

export type LastWriter = 'studio' | 'mcp' | 'reindex';

export interface CatalogItem {
  path: string;
  relPath: string;
  project: string;
  title: string;
  description: string | null;
  tags: string[];
  nodeCount: number;
  edgeCount: number;
  groupCount: number;
  yamlSha256: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchParams {
  query?: string;
  tags?: string[];
  project?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  items: CatalogItem[];
  total: number;
}

export interface Facets {
  tags: { tag: string; count: number }[];
  projects: { project: string; count: number }[];
}

function toItem(row: Row): CatalogItem {
  return {
    path: row.path as string,
    relPath: row.rel_path as string,
    project: row.project as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    tags: row.tags as string[],
    nodeCount: row.node_count as number,
    edgeCount: row.edge_count as number,
    groupCount: row.group_count as number,
    yamlSha256: row.yaml_sha256 as string,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

/** Upsert por `path` (chave unica): `updated_at`/`last_writer` só mudam quando o hash do YAML muda -- um save sem alteração de conteúdo não "mexe" na data de atualização nem rouba a autoria de quem escreveu por último. */
export async function upsert(sql: Sql, record: CatalogRecord, lastWriter: LastWriter): Promise<void> {
  await sql`
    INSERT INTO diagrams (path, root, rel_path, project, title, description, tags, direction, node_count, edge_count, group_count, yaml_sha256, yaml_snapshot, search_text, last_writer)
    VALUES (
      ${record.path}, ${record.root}, ${record.relPath}, ${record.project}, ${record.title}, ${record.description},
      ${record.tags}, ${record.direction}, ${record.nodeCount}, ${record.edgeCount}, ${record.groupCount},
      ${record.yamlSha256}, ${record.yamlSnapshot}, ${record.searchText}, ${lastWriter}
    )
    ON CONFLICT (path) DO UPDATE SET
      root = EXCLUDED.root,
      rel_path = EXCLUDED.rel_path,
      project = EXCLUDED.project,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      tags = EXCLUDED.tags,
      direction = EXCLUDED.direction,
      node_count = EXCLUDED.node_count,
      edge_count = EXCLUDED.edge_count,
      group_count = EXCLUDED.group_count,
      yaml_sha256 = EXCLUDED.yaml_sha256,
      yaml_snapshot = EXCLUDED.yaml_snapshot,
      search_text = EXCLUDED.search_text,
      updated_at = CASE WHEN diagrams.yaml_sha256 <> EXCLUDED.yaml_sha256 THEN now() ELSE diagrams.updated_at END,
      last_writer = CASE WHEN diagrams.yaml_sha256 <> EXCLUDED.yaml_sha256 THEN EXCLUDED.last_writer ELSE diagrams.last_writer END,
      indexed_at = now()
  `;
}

export async function getByPath(sql: Sql, path: string): Promise<CatalogItem | null> {
  const rows = await sql`SELECT * FROM diagrams WHERE path = ${path} LIMIT 1`;
  return rows[0] ? toItem(rows[0]) : null;
}

export async function search(sql: Sql, params: SearchParams): Promise<SearchResult> {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
  const offset = Math.max(params.offset ?? 0, 0);
  const tsq = params.query ? buildTsQuery(params.query) : null;
  const tags = params.tags && params.tags.length > 0 ? params.tags : null;
  const project = params.project ?? null;

  const where = sql`
    WHERE 1=1
    ${tsq ? sql`AND search @@ to_tsquery('simple', ${tsq})` : sql``}
    ${tags ? sql`AND tags @> ${tags}` : sql``}
    ${project ? sql`AND project = ${project}` : sql``}
  `;
  const orderBy = tsq ? sql`ORDER BY ts_rank(search, to_tsquery('simple', ${tsq})) DESC, updated_at DESC` : sql`ORDER BY updated_at DESC`;

  const rows = await sql`SELECT * FROM diagrams ${where} ${orderBy} LIMIT ${limit} OFFSET ${offset}`;
  const countRows = await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM diagrams ${where}`;

  return { items: rows.map(toItem), total: Number(countRows[0]!.count) };
}

export async function facets(sql: Sql): Promise<Facets> {
  const tagRows = await sql<{ tag: string; count: string }[]>`
    SELECT unnest(tags) AS tag, count(*)::text AS count FROM diagrams GROUP BY tag ORDER BY count(*) DESC, tag
  `;
  const projectRows = await sql<{ project: string; count: string }[]>`
    SELECT project, count(*)::text AS count FROM diagrams GROUP BY project ORDER BY count(*) DESC, project
  `;
  return {
    tags: tagRows.map((r) => ({ tag: r.tag, count: Number(r.count) })),
    projects: projectRows.map((r) => ({ project: r.project, count: Number(r.count) })),
  };
}

/** Remove do catálogo os registros de `root` cujo `path` não está em `existingPaths` -- só age dentro desse root, nunca em arquivos de outro root que não foi varrido nesta chamada. */
export async function pruneMissing(sql: Sql, root: string, existingPaths: Set<string>): Promise<number> {
  const rows = await sql<{ path: string }[]>`SELECT path FROM diagrams WHERE root = ${root}`;
  const toRemove = rows.map((r) => r.path).filter((p) => !existingPaths.has(p));
  if (toRemove.length === 0) return 0;
  await sql`DELETE FROM diagrams WHERE path = ANY(${toRemove})`;
  return toRemove.length;
}

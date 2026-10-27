CREATE TABLE IF NOT EXISTS diagrams (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  path          text        NOT NULL UNIQUE CHECK (path LIKE '/%'),
  root          text        NOT NULL,
  rel_path      text        NOT NULL,
  project       text        NOT NULL,
  title         text        NOT NULL,
  description   text,
  tags          text[]      NOT NULL DEFAULT '{}',
  direction     text        NOT NULL CHECK (direction IN ('LR', 'TB')),
  node_count    integer     NOT NULL,
  edge_count    integer     NOT NULL,
  group_count   integer     NOT NULL,
  yaml_sha256   char(64)    NOT NULL,
  yaml_snapshot text        NOT NULL,
  search_text   text        NOT NULL,
  search        tsvector    GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED,
  last_writer   text        NOT NULL CHECK (last_writer IN ('studio', 'mcp', 'reindex')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  indexed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS diagrams_search_gin  ON diagrams USING gin (search);
CREATE INDEX IF NOT EXISTS diagrams_tags_gin    ON diagrams USING gin (tags);
CREATE INDEX IF NOT EXISTS diagrams_project_idx ON diagrams (project);
CREATE INDEX IF NOT EXISTS diagrams_updated_idx ON diagrams (updated_at DESC);

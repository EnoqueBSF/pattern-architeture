import { useEffect, useState } from 'react';
import { useStore } from '../store';

interface FileEntry {
  path: string;
  root: string;
  rel: string;
  mtimeMs: number;
}

interface CatalogItem {
  path: string;
  relPath: string;
  project: string;
  title: string;
  description: string | null;
  tags: string[];
  nodeCount: number;
  edgeCount: number;
  groupCount: number;
  createdAt: string;
  updatedAt: string;
  onDisk: 'ok' | 'changed' | 'missing';
}

interface CatalogSearchResponse {
  items: CatalogItem[];
  total: number;
  facets: { tags: { tag: string; count: number }[]; projects: { project: string; count: number }[] };
}

function SearchTab() {
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [result, setResult] = useState<CatalogSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const openFile = useStore((s) => s.openFile);
  const closeFileDialog = useStore((s) => s.closeFileDialog);
  const isDirty = useStore((s) => s.isDirty());

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (activeTag) params.append('tag', activeTag);
    if (activeProject) params.set('project', activeProject);
    fetch(`/api/catalog/search?${params.toString()}`)
      .then((r) => r.json() as Promise<CatalogSearchResponse>)
      .then((body) => {
        setResult(body);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'falha na busca'));
  }, [query, activeTag, activeProject, refreshToken]);

  async function open(item: CatalogItem) {
    if (isDirty && !window.confirm('Ha mudancas nao salvas. Descartar e abrir outro arquivo?')) return;
    const res = await fetch(`/api/file?path=${encodeURIComponent(item.path)}`);
    if (!res.ok) {
      setError(`falha ao abrir (HTTP ${res.status})`);
      return;
    }
    const body = (await res.json()) as { path: string; source: string; hash: string };
    openFile({ path: body.path, hash: body.hash }, body.source);
    closeFileDialog();
  }

  async function handleReindex() {
    setReindexing(true);
    try {
      await fetch('/api/catalog/reindex', { method: 'POST' });
      setRefreshToken((t) => t + 1);
    } finally {
      setReindexing(false);
    }
  }

  return (
    <>
      <div className="dialog-search-row">
        <input type="text" className="dialog-filter" autoFocus placeholder="buscar por titulo, tecnologia, id..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" onClick={() => void handleReindex()} disabled={reindexing} title="Varre os arquivos no disco e atualiza o catalogo">
          {reindexing ? 'Reindexando...' : 'Reindexar'}
        </button>
      </div>

      {result && (result.facets.tags.length > 0 || result.facets.projects.length > 0) && (
        <div className="dialog-facets">
          {result.facets.projects.map((p) => (
            <button key={p.project} type="button" className={`facet-chip${activeProject === p.project ? ' active' : ''}`} onClick={() => setActiveProject((cur) => (cur === p.project ? null : p.project))}>
              {p.project} ({p.count})
            </button>
          ))}
          {result.facets.tags.map((t) => (
            <button key={t.tag} type="button" className={`facet-chip${activeTag === t.tag ? ' active' : ''}`} onClick={() => setActiveTag((cur) => (cur === t.tag ? null : t.tag))}>
              #{t.tag} ({t.count})
            </button>
          ))}
        </div>
      )}

      {error && <p className="dialog-error">{error}</p>}
      {result === null && !error && <p className="dialog-empty">Carregando...</p>}
      {result !== null && result.items.length === 0 && <p className="dialog-empty">nenhum diagrama encontrado</p>}
      <ul className="dialog-catalog-list">
        {result?.items.map((item) => (
          <li key={item.path}>
            <button type="button" onClick={() => void open(item)}>
              <span className="catalog-item-title">
                {item.title}
                {item.onDisk === 'missing' && (
                  <span className="catalog-item-badge badge-missing" title="O arquivo nao existe mais no disco">
                    apagado
                  </span>
                )}
                {item.onDisk === 'changed' && (
                  <span className="catalog-item-badge badge-changed" title="O arquivo no disco mudou desde a ultima indexacao">
                    desatualizado
                  </span>
                )}
              </span>
              <span className="catalog-item-meta">
                {item.project} · {item.relPath}
              </span>
              {item.tags.length > 0 && <span className="catalog-item-tags">{item.tags.map((t) => `#${t}`).join(' ')}</span>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function FilesTab() {
  const [files, setFiles] = useState<FileEntry[] | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const openFile = useStore((s) => s.openFile);
  const closeFileDialog = useStore((s) => s.closeFileDialog);
  const isDirty = useStore((s) => s.isDirty());

  useEffect(() => {
    fetch('/api/files')
      .then((r) => r.json() as Promise<{ files: FileEntry[] }>)
      .then((body) => setFiles(body.files))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'falha ao listar arquivos'));
  }, []);

  async function open(entry: FileEntry) {
    if (isDirty && !window.confirm('Ha mudancas nao salvas. Descartar e abrir outro arquivo?')) return;
    const res = await fetch(`/api/file?path=${encodeURIComponent(entry.path)}`);
    if (!res.ok) {
      setError(`falha ao abrir (HTTP ${res.status})`);
      return;
    }
    const body = (await res.json()) as { path: string; source: string; hash: string };
    openFile({ path: body.path, hash: body.hash }, body.source);
    closeFileDialog();
  }

  const visible = (files ?? []).filter((f) => f.rel.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <input
        type="text"
        className="dialog-filter"
        autoFocus
        placeholder="filtrar por nome..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {error && <p className="dialog-error">{error}</p>}
      {files === null && !error && <p className="dialog-empty">Carregando...</p>}
      {files !== null && visible.length === 0 && <p className="dialog-empty">nenhum arquivo encontrado</p>}
      <ul className="dialog-file-list">
        {visible.map((f) => (
          <li key={f.path}>
            <button type="button" onClick={() => void open(f)}>
              {f.rel}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function OpenDialogContent() {
  const [tab, setTab] = useState<'search' | 'files'>('search');
  const [catalogStatus, setCatalogStatus] = useState<'checking' | 'ok' | 'offline'>('checking');

  useEffect(() => {
    fetch('/api/catalog/status')
      .then((r) => {
        if (!r.ok) {
          setCatalogStatus('offline');
          setTab('files');
          return;
        }
        setCatalogStatus('ok');
      })
      .catch(() => {
        setCatalogStatus('offline');
        setTab('files');
      });
  }, []);

  return (
    <>
      <div className="dialog-tabs">
        <button type="button" className={tab === 'search' ? 'active' : ''} disabled={catalogStatus === 'offline'} onClick={() => setTab('search')}>
          Buscar
        </button>
        <button type="button" className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}>
          Arquivos
        </button>
      </div>
      {catalogStatus === 'offline' && (
        <p className="dialog-hint">
          Catálogo offline — rode <code>npm run catalog:up</code> para habilitar a busca.
        </p>
      )}
      {tab === 'search' ? <SearchTab /> : <FilesTab />}
    </>
  );
}

function SaveAsPanel() {
  const meta = useStore((s) => s.meta);
  const file = useStore((s) => s.file);
  const saveFile = useStore((s) => s.saveFile);
  const saving = useStore((s) => s.saving);
  const saveError = useStore((s) => s.saveError);
  const [relPath, setRelPath] = useState(() => (file ? file.path.split('/').pop()?.replace(/\.ya?ml$/i, '') ?? '' : ''));

  function fullPath(): string | null {
    if (!meta) return null;
    const cleaned = relPath.trim().replace(/^\/+/, '');
    if (!cleaned || cleaned.includes('..')) return null;
    const withExt = /\.ya?ml$/i.test(cleaned) ? cleaned : `${cleaned}.yaml`;
    return `${meta.repoRoot.replace(/\/+$/, '')}/diagrams/${withExt}`;
  }

  const target = fullPath();

  return (
    <>
      <label className="field">
        <span className="field-label">Caminho (dentro de diagrams/)</span>
        <input type="text" autoFocus placeholder="meu-projeto/novo-diagrama" value={relPath} onChange={(e) => setRelPath(e.target.value)} />
      </label>
      {target && <p className="dialog-hint">sera salvo em: {target}</p>}
      {saveError && <p className="dialog-error">{saveError}</p>}
      <div className="dialog-actions">
        <button type="button" disabled={!target || saving} onClick={() => target && void saveFile(target)}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </>
  );
}

export function FileDialog() {
  const mode = useStore((s) => s.fileDialogMode);
  const closeFileDialog = useStore((s) => s.closeFileDialog);

  if (mode !== 'open' && mode !== 'save-as') return null;

  return (
    <div className="dialog-overlay" onClick={closeFileDialog}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>{mode === 'open' ? 'Abrir arquivo' : 'Salvar como'}</h3>
          <button type="button" className="dialog-close" onClick={closeFileDialog}>
            ×
          </button>
        </div>
        {mode === 'open' ? <OpenDialogContent /> : <SaveAsPanel />}
      </div>
    </div>
  );
}

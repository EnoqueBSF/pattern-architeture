import { useEffect, useState } from 'react';
import { useStore } from '../store';

interface FileEntry {
  path: string;
  root: string;
  rel: string;
  mtimeMs: number;
}

function OpenPanel() {
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
        {mode === 'open' ? <OpenPanel /> : <SaveAsPanel />}
      </div>
    </div>
  );
}

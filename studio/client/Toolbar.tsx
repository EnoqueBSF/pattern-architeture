import { useState } from 'react';
import { exportDiagram } from './export';
import { useStore } from './store';

function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'diagrama'
  );
}

export function Toolbar() {
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const canUndo = useStore((s) => s.canUndo());
  const canRedo = useStore((s) => s.canRedo());
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const file = useStore((s) => s.file);
  const isDirty = useStore((s) => s.isDirty());
  const saving = useStore((s) => s.saving);
  const saveFile = useStore((s) => s.saveFile);
  const openFileDialog = useStore((s) => s.openFileDialog);
  const source = useStore((s) => s.source);
  const parsed = useStore((s) => s.parsed) as Record<string, unknown> | undefined;
  const renderOk = useStore((s) => s.render.status === 'ok');
  const [exporting, setExporting] = useState<'svg' | 'png' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const fileName = file ? (file.path.split('/').pop() ?? file.path) : 'sem arquivo';

  function handleNew() {
    if (isDirty && !window.confirm('Ha mudancas nao salvas. Descartar e comecar um novo diagrama?')) return;
    openFileDialog('new');
  }

  async function handleExport(format: 'svg' | 'png') {
    setExportError(null);
    setExporting(format);
    try {
      const base = file ? (file.path.split('/').pop() ?? 'diagrama').replace(/\.ya?ml$/i, '') : slugify((parsed?.title as string | undefined) ?? '');
      await exportDiagram(source, format, base);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'falha ao exportar');
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="toolbar">
      <span className="toolbar-file">
        {fileName}
        {isDirty ? ' *' : ''}
      </span>
      <button type="button" onClick={handleNew} title="Novo diagrama (escolher template)">
        Novo
      </button>
      <button type="button" onClick={() => openFileDialog('open')} title="Abrir arquivo existente">
        Abrir
      </button>
      <button type="button" onClick={() => void saveFile()} disabled={saving} title="Salvar (Cmd+S)">
        {saving ? 'Salvando...' : 'Salvar'}
      </button>
      <button type="button" onClick={() => void handleExport('svg')} disabled={!renderOk || exporting !== null} title="Exportar como SVG">
        {exporting === 'svg' ? 'Exportando...' : 'Exportar SVG'}
      </button>
      <button type="button" onClick={() => void handleExport('png')} disabled={!renderOk || exporting !== null} title="Exportar como PNG">
        {exporting === 'png' ? 'Exportando...' : 'Exportar PNG'}
      </button>
      {exportError && (
        <span className="toolbar-error" title={exportError}>
          {exportError}
        </span>
      )}
      <div className="toolbar-spacer" />
      <button type="button" onClick={undo} disabled={!canUndo} title="Desfazer (Cmd+Z)">
        Desfazer
      </button>
      <button type="button" onClick={redo} disabled={!canRedo} title="Refazer (Cmd+Shift+Z)">
        Refazer
      </button>
      <div className="toolbar-zoom">
        <button type="button" onClick={() => setZoom(zoom - 0.1)}>
          -
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(zoom + 0.1)}>
          +
        </button>
        <button type="button" onClick={() => setZoom(1)}>
          100%
        </button>
      </div>
    </div>
  );
}

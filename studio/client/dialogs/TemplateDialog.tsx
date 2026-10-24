import { useEffect, useState } from 'react';
import type { TemplateDef } from '../../shared/types';
import { useStore } from '../store';

export function TemplateDialog() {
  const mode = useStore((s) => s.fileDialogMode);
  const closeFileDialog = useStore((s) => s.closeFileDialog);
  const newFromTemplate = useStore((s) => s.newFromTemplate);
  const [templates, setTemplates] = useState<TemplateDef[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = mode === 'new';

  useEffect(() => {
    if (!open) return;
    setTemplates(null);
    setError(null);
    fetch('/api/templates')
      .then((r) => r.json() as Promise<{ templates: TemplateDef[] }>)
      .then((body) => setTemplates(body.templates))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'falha ao listar templates'));
  }, [open]);

  if (!open) return null;

  async function choose(id: string) {
    const res = await fetch(`/api/template?id=${encodeURIComponent(id)}`);
    if (!res.ok) {
      setError(`falha ao carregar template (HTTP ${res.status})`);
      return;
    }
    const body = (await res.json()) as { source: string };
    newFromTemplate(body.source);
    closeFileDialog();
  }

  return (
    <div className="dialog-overlay" onClick={closeFileDialog}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Novo diagrama</h3>
          <button type="button" className="dialog-close" onClick={closeFileDialog}>
            ×
          </button>
        </div>
        {error && <p className="dialog-error">{error}</p>}
        {templates === null && !error && <p className="dialog-empty">Carregando...</p>}
        <ul className="dialog-template-list">
          {templates?.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => void choose(t.id)}>
                <span className="dialog-template-label">{t.label}</span>
                <span className="dialog-template-description">{t.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

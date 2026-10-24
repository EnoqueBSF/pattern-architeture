import { useStore } from '../store';

export function ConflictDialog() {
  const conflict = useStore((s) => s.saveConflict);
  const resolveConflict = useStore((s) => s.resolveConflict);

  if (!conflict) return null;

  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <div className="dialog-header">
          <h3>Conflito ao salvar</h3>
        </div>
        <p>O arquivo mudou em disco desde a ultima leitura (outro processo ou o CLI podem ter gravado por cima).</p>
        <div className="dialog-actions">
          <button type="button" onClick={() => void resolveConflict('reload')}>
            Descartar minhas mudancas e recarregar
          </button>
          <button type="button" className="danger" onClick={() => void resolveConflict('overwrite')}>
            Sobrescrever mesmo assim
          </button>
        </div>
      </div>
    </div>
  );
}

export function SaveErrorBanner() {
  const saveError = useStore((s) => s.saveError);
  const fileDialogMode = useStore((s) => s.fileDialogMode);
  const dismissSaveError = useStore((s) => s.dismissSaveError);

  // quando o dialogo de "salvar como" esta aberto, ele ja mostra o erro junto do formulario
  if (!saveError || fileDialogMode === 'save-as') return null;

  return (
    <div className="save-error-banner">
      <span>{saveError}</span>
      <button type="button" onClick={dismissSaveError}>
        ×
      </button>
    </div>
  );
}

import { deleteGroup, renameGroup, setGroupField } from '../../shared/ops';
import { useStore } from '../store';
import { IdField, SelectField, TextField } from './fields';

const GROUP_KIND_LABELS: Record<string, string> = {
  layer: 'Camada',
  context: 'Contexto',
  environment: 'Ambiente',
};

interface GroupFormProps {
  id: string;
}

export function GroupForm({ id }: GroupFormProps) {
  const raw = useStore((s) => s.raw);
  const meta = useStore((s) => s.meta);
  const applyOps = useStore((s) => s.applyOps);
  const select = useStore((s) => s.select);

  const group = raw?.groups?.find((g) => g.id === id);
  if (!raw || !group) return <p className="inspector-empty">Grupo nao encontrado (o YAML pode ter mudado).</p>;

  const label = typeof group.label === 'string' ? group.label : '';
  const kind = typeof group.kind === 'string' ? group.kind : 'layer';
  const parent = typeof group.parent === 'string' ? group.parent : '';
  const hasHints = 'rank' in group || 'order' in group;

  const kindOptions = (meta?.groupKinds ?? ['layer', 'context', 'environment']).map((k) => ({ value: k, label: GROUP_KIND_LABELS[k] ?? k }));
  const parentOptions = (raw.groups ?? []).filter((g) => g.id !== id).map((g) => ({ value: g.id, label: (g.label as string | undefined) ?? g.id }));

  return (
    <div className="inspector-form">
      <h3 className="inspector-title">Grupo</h3>
      <IdField
        label="Id"
        id={group.id}
        onCommit={(newId) => {
          applyOps(renameGroup(raw, group.id, newId));
          select({ kind: 'group', id: newId });
        }}
      />
      <TextField label="Rotulo" value={label} onChange={(value) => applyOps(setGroupField(raw, id, 'label', value))} />
      <SelectField label="Tipo" value={kind} onChange={(value) => applyOps(setGroupField(raw, id, 'kind', value))} options={kindOptions} />
      <SelectField
        label="Grupo pai"
        value={parent}
        onChange={(value) => applyOps(setGroupField(raw, id, 'parent', value || undefined))}
        options={parentOptions}
        emptyLabel="— nenhum (raiz) —"
      />

      <div className="inspector-actions">
        {hasHints && (
          <button
            type="button"
            onClick={() => applyOps([...setGroupField(raw, id, 'rank', undefined), ...setGroupField(raw, id, 'order', undefined)])}
          >
            Limpar posicao manual
          </button>
        )}
        <button
          type="button"
          className="danger"
          onClick={() => {
            applyOps(deleteGroup(raw, id));
            select(null);
          }}
        >
          Excluir grupo
        </button>
      </div>
    </div>
  );
}

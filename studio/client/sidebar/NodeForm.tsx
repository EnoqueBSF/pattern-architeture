import { deleteNode, renameNode, setNodeField } from '../../shared/ops';
import { useStore } from '../store';
import { FormSection, IdField, SelectField, TextAreaField, TextField } from './fields';
import { IconPicker } from './IconPicker';

interface NodeFormProps {
  id: string;
}

export function NodeForm({ id }: NodeFormProps) {
  const raw = useStore((s) => s.raw);
  const meta = useStore((s) => s.meta);
  const applyOps = useStore((s) => s.applyOps);
  const select = useStore((s) => s.select);

  const node = raw?.nodes.find((n) => n.id === id);
  if (!raw || !node) return <p className="inspector-empty">Node nao encontrado (o YAML pode ter mudado).</p>;

  const str = (key: string) => (typeof node[key] === 'string' ? (node[key] as string) : '');
  const label = str('label');
  const type = str('type') || 'microservice';
  const status = str('status') || 'new';
  const tech = Array.isArray(node.tech) ? (node.tech as string[]).join(' · ') : str('tech');
  const group = str('group');
  const description = str('description');
  const icon = str('icon');
  const slug = str('slug');
  const subtitle = str('subtitle');
  const badge = str('badge');
  const hasHints = 'rank' in node || 'order' in node;

  const typeOptions = (meta?.nodeTypes ?? []).map((t) => ({ value: t, label: meta?.nodeTypeLabels[t] ?? t }));
  const statusOptions = (meta?.statuses ?? ['new', 'changed', 'unchanged']).map((s) => ({ value: s, label: meta?.statusLabels[s] ?? s }));
  const groupOptions = (raw.groups ?? []).map((g) => ({ value: g.id, label: (g.label as string | undefined) ?? g.id }));

  function set(key: string, value: string | undefined) {
    if (!raw) return;
    applyOps(setNodeField(raw, id, key, value || undefined));
  }

  return (
    <div className="inspector-form">
      <h3 className="inspector-title">Componente</h3>
      <IdField
        label="Id"
        id={node.id}
        onCommit={(newId) => {
          applyOps(renameNode(raw, node.id, newId));
          select({ kind: 'node', id: newId });
        }}
      />
      <TextField label="Rotulo" value={label} onChange={(v) => set('label', v)} />
      <SelectField label="Tipo" value={type} onChange={(v) => set('type', v)} options={typeOptions} />
      <SelectField label="Status" value={status} onChange={(v) => set('status', v)} options={statusOptions} />
      <TextField label="Tecnologia" value={tech} onChange={(v) => set('tech', v)} placeholder="Node.js 22 · NestJS" />
      <SelectField label="Grupo" value={group} onChange={(v) => set('group', v)} options={groupOptions} emptyLabel="— sem grupo —" />
      <TextAreaField label="Descricao" value={description} onChange={(v) => set('description', v)} />

      <FormSection
        title="Card completo (padrão ARB)"
        hint='Preenchendo os 4 campos abaixo, o card substitui a forma geométrica por um card com ícone real — ver "Card com ícone" em docs/NOTATION.md.'
      >
        <IconPicker value={icon} onChange={(v) => set('icon', v)} />
        <TextField label="Slug" value={slug} onChange={(v) => set('slug', v)} placeholder="identificador-tecnico" />
        <TextField label="Subtitulo" value={subtitle} onChange={(v) => set('subtitle', v)} />
        <TextField label="Selo" value={badge} onChange={(v) => set('badge', v)} placeholder="100% Pronto" />
      </FormSection>

      <div className="inspector-actions">
        {hasHints && (
          <button type="button" onClick={() => applyOps([...setNodeField(raw, id, 'rank', undefined), ...setNodeField(raw, id, 'order', undefined)])}>
            Limpar posicao manual
          </button>
        )}
        <button
          type="button"
          className="danger"
          onClick={() => {
            applyOps(deleteNode(raw, id));
            select(null);
          }}
        >
          Excluir componente
        </button>
      </div>
    </div>
  );
}

import { deleteEdge, setEdgeField } from '../../shared/ops';
import { useStore } from '../store';
import { CheckboxField, SelectField, TextField } from './fields';

interface EdgeFormProps {
  index: number;
}

export function EdgeForm({ index }: EdgeFormProps) {
  const raw = useStore((s) => s.raw);
  const meta = useStore((s) => s.meta);
  const applyOps = useStore((s) => s.applyOps);
  const select = useStore((s) => s.select);

  const edge = raw?.edges?.[index];
  if (!raw || !edge) return <p className="inspector-empty">Conexao nao encontrada (o YAML pode ter mudado).</p>;

  const from = typeof edge.from === 'string' ? edge.from : '';
  const to = typeof edge.to === 'string' ? edge.to : '';
  const protocol = typeof edge.protocol === 'string' ? edge.protocol : 'http';
  const label = typeof edge.label === 'string' ? edge.label : '';
  const status = typeof edge.status === 'string' ? edge.status : '';
  const async = edge.async === true;
  const bidirectional = edge.bidirectional === true;

  const nodeOptions = raw.nodes.map((n) => ({ value: n.id, label: (n.label as string | undefined) ?? n.id }));
  const protocolOptions = (meta?.protocols ?? []).map((p) => ({ value: p, label: meta?.protocolLabels[p] || p }));
  const statusOptions = (meta?.statuses ?? ['new', 'changed', 'unchanged']).map((s) => ({ value: s, label: meta?.statusLabels[s] ?? s }));

  function set(key: string, value: string | boolean | undefined) {
    if (!raw) return;
    applyOps(setEdgeField(index, key, typeof value === 'string' ? value || undefined : value));
  }

  return (
    <div className="inspector-form">
      <h3 className="inspector-title">Conexao</h3>
      <SelectField label="De" value={from} onChange={(v) => set('from', v)} options={nodeOptions} />
      <SelectField label="Para" value={to} onChange={(v) => set('to', v)} options={nodeOptions} />
      <SelectField label="Protocolo" value={protocol} onChange={(v) => set('protocol', v)} options={protocolOptions} />
      <TextField label="Rotulo" value={label} onChange={(v) => set('label', v)} placeholder="publica pedido.criado" />
      <SelectField label="Status" value={status} onChange={(v) => set('status', v)} options={statusOptions} emptyLabel="— herda do destino —" />
      <CheckboxField label="Assincrona" checked={async} onChange={(v) => set('async', v || undefined)} />
      <CheckboxField label="Bidirecional" checked={bidirectional} onChange={(v) => set('bidirectional', v)} />

      <div className="inspector-actions">
        <button
          type="button"
          className="danger"
          onClick={() => {
            applyOps(deleteEdge(index));
            select(null);
          }}
        >
          Excluir conexao
        </button>
      </div>
    </div>
  );
}

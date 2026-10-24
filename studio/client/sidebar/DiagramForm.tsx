import { useStore } from '../store';
import { SelectField, TextAreaField, TextField } from './fields';

export function DiagramForm() {
  const parsed = useStore((s) => s.parsed) as Record<string, unknown> | undefined;
  const applyOps = useStore((s) => s.applyOps);

  if (!parsed || typeof parsed !== 'object') {
    return <p className="inspector-empty">YAML invalido -- corrija no editor para editar os metadados aqui.</p>;
  }

  const title = typeof parsed.title === 'string' ? parsed.title : '';
  const description = typeof parsed.description === 'string' ? parsed.description : '';
  const direction = typeof parsed.direction === 'string' ? parsed.direction : 'LR';
  const locale = typeof parsed.locale === 'string' ? parsed.locale : 'pt-BR';

  return (
    <div className="inspector-form">
      <h3 className="inspector-title">Diagrama</h3>
      <TextField label="Titulo" value={title} onChange={(value) => applyOps([{ op: 'setRoot', key: 'title', value }])} />
      <TextAreaField
        label="Descricao"
        value={description}
        onChange={(value) => applyOps([{ op: 'setRoot', key: 'description', value: value || undefined }])}
      />
      <SelectField
        label="Direcao"
        value={direction}
        onChange={(value) => applyOps([{ op: 'setRoot', key: 'direction', value }])}
        options={[
          { value: 'LR', label: 'Esquerda -> direita' },
          { value: 'TB', label: 'Cima -> baixo' },
        ]}
      />
      <SelectField
        label="Idioma"
        value={locale}
        onChange={(value) => applyOps([{ op: 'setRoot', key: 'locale', value }])}
        options={[
          { value: 'pt-BR', label: 'Portugues (BR)' },
          { value: 'en', label: 'English' },
        ]}
      />
    </div>
  );
}

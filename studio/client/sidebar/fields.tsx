import { useEffect, useState, type ChangeEvent } from 'react';

interface FieldWrapProps {
  label: string;
  children: React.ReactNode;
}

function FieldWrap({ label, children }: FieldWrapProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

interface FormSectionProps {
  title: string;
  hint?: string;
  children: React.ReactNode;
}

/** Agrupa campos relacionados dentro do Inspector com um titulo e uma dica opcional (ex.: "Card completo"). */
export function FormSection({ title, hint, children }: FormSectionProps) {
  return (
    <fieldset className="form-section">
      <legend>{title}</legend>
      {hint && <p className="form-section-hint">{hint}</p>}
      {children}
    </fieldset>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onBlur?: () => void;
}

export function TextField({ label, value, onChange, placeholder, onBlur }: TextFieldProps) {
  return (
    <FieldWrap label={label}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </FieldWrap>
  );
}

interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function TextAreaField({ label, value, onChange, placeholder }: TextAreaFieldProps) {
  return (
    <FieldWrap label={label}>
      <textarea value={value} placeholder={placeholder} rows={3} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)} />
    </FieldWrap>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  emptyLabel?: string;
}

export function SelectField({ label, value, onChange, options, emptyLabel }: SelectFieldProps) {
  return (
    <FieldWrap label={label}>
      <select value={value} onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}>
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldWrap>
  );
}

interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function CheckboxField({ label, checked, onChange }: CheckboxFieldProps) {
  return (
    <label className="field field-checkbox">
      <input type="checkbox" checked={checked} onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)} />
      <span className="field-label">{label}</span>
    </label>
  );
}

interface IdFieldProps {
  label: string;
  id: string;
  onCommit: (newId: string) => void;
  idPattern?: RegExp;
}

const DEFAULT_ID_PATTERN = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;

/**
 * Campo de id com estado local: so dispara `onCommit` (rename) ao perder o foco ou Enter, nunca a
 * cada tecla -- renomear a cada keystroke geraria um historico de undo ruidoso e ids intermediarios
 * invalidos/colidentes enquanto o usuario ainda esta digitando.
 */
export function IdField({ label, id, onCommit, idPattern = DEFAULT_ID_PATTERN }: IdFieldProps) {
  const [draft, setDraft] = useState(id);

  useEffect(() => {
    setDraft(id);
  }, [id]);

  function commit() {
    if (draft !== id && draft.length > 0 && idPattern.test(draft)) onCommit(draft);
    else setDraft(id);
  }

  const invalid = draft.length > 0 && !idPattern.test(draft);

  return (
    <FieldWrap label={label}>
      <input
        type="text"
        value={draft}
        className={invalid ? 'field-invalid' : undefined}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setDraft(id);
        }}
      />
    </FieldWrap>
  );
}

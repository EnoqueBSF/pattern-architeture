import type { ChangeEvent } from 'react';
import { useStore } from '../store';

interface IconPickerProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Busca textual (datalist nativo) sobre o catalogo de icones local. O preview visual real e o
 * proprio canvas, que ja atualiza via debounce ao escolher -- nao duplicamos a renderizacao do SVG aqui.
 */
export function IconPicker({ value, onChange }: IconPickerProps) {
  const meta = useStore((s) => s.meta);
  const options = [...(meta?.iconKeys ?? []), ...Object.keys(meta?.iconAliases ?? {})].sort();

  return (
    <label className="field">
      <span className="field-label">Icone</span>
      <input
        type="text"
        list="icon-catalog"
        value={value}
        placeholder="ex.: aws, postgresql, kafka..."
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
      <datalist id="icon-catalog">
        {options.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
    </label>
  );
}

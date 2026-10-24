import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TemplateDef } from '../shared/types.js';

interface TemplateEntry extends TemplateDef {
  file: string;
}

const TEMPLATES: TemplateEntry[] = [
  {
    id: 'blank',
    label: 'Em branco',
    description: 'Esqueleto mínimo comentado, 2 nodes de exemplo -- ponto de partida padrão.',
    file: 'diagram.template.yaml',
  },
  {
    id: 'card-completo',
    label: 'Card completo (padrão ARB)',
    description: 'Node com ícone real, slug técnico, subtítulo visível e selo preenchidos -- o card de um board de Change/ARB.',
    file: 'card-completo.template.yaml',
  },
];

export function listTemplates(): TemplateDef[] {
  return TEMPLATES.map(({ id, label, description }) => ({ id, label, description }));
}

export function readTemplate(id: string): string | undefined {
  const entry = TEMPLATES.find((t) => t.id === id);
  if (!entry) return undefined;
  const filePath = fileURLToPath(new URL(`../../templates/${entry.file}`, import.meta.url));
  return readFileSync(filePath, 'utf-8');
}

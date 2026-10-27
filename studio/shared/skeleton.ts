/** Cabecalho minimo de um diagrama novo "do zero" -- sem nodes (invalido sozinho; quem chama precisa
 * aplicar pelo menos um Change `add_node` por cima antes de salvar). */
export interface SkeletonOptions {
  title: string;
  description?: string;
  direction?: 'LR' | 'TB';
  locale?: 'pt-BR' | 'en';
  tags?: string[];
}

export function diagramSkeleton(opts: SkeletonOptions): string {
  const lines = ['version: 1', `title: ${JSON.stringify(opts.title)}`];
  if (opts.description !== undefined) lines.push(`description: ${JSON.stringify(opts.description)}`);
  if (opts.direction !== undefined) lines.push(`direction: ${opts.direction}`);
  if (opts.locale !== undefined) lines.push(`locale: ${opts.locale}`);
  if (opts.tags !== undefined && opts.tags.length > 0) lines.push(`tags: [${opts.tags.join(', ')}]`);
  lines.push('nodes: []');
  return `${lines.join('\n')}\n`;
}

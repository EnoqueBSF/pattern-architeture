/** Formata numero para atributo SVG: 2 casas, sem zeros a direita. */
export function fmt(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const value = rounded === 0 ? 0 : rounded;
  return value.toFixed(2).replace(/\.?0+$/, '') || '0';
}

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

type AttrValue = string | number | undefined;

/** Monta um elemento SVG. `children` undefined -> self-closing. */
export function el(tag: string, attrs: Record<string, AttrValue>, children?: string): string {
  const attrStr = Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${typeof v === 'number' ? fmt(v) : esc(String(v))}"`)
    .join('');
  if (children === undefined) return `<${tag}${attrStr}/>`;
  return `<${tag}${attrStr}>${children}</${tag}>`;
}

export function points(pts: { x: number; y: number }[]): string {
  return pts.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
}

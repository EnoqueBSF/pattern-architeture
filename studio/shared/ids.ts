/** Gera um id curto unico (ex.: "node-3") dado um prefixo e o conjunto de ids ja em uso. */
export function uniqueId(prefix: string, existingIds: ReadonlySet<string>): string {
  let i = 1;
  let candidate = `${prefix}-${i}`;
  while (existingIds.has(candidate)) {
    i++;
    candidate = `${prefix}-${i}`;
  }
  return candidate;
}

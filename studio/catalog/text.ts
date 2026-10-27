/** Minusculo e sem acento (NFD + remocao de marcas diacriticas) -- usado tanto para indexar (extract.ts) quanto para buscar (query.ts), para "kafka"/"KAFKA"/"Kafka" e "nao"/"não" baterem igual. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

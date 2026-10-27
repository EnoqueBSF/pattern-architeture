import { normalizeText } from './text.js';

/**
 * Converte a query de busca do usuario numa tsquery segura para `to_tsquery('simple', $1)`:
 * tokens normalizados (sem acento, minusculos), filtrados para [a-z0-9], como prefixo (`tok:*`)
 * unidos com `&`. Qualquer caractere de sintaxe de tsquery (` & | ! : ( ) * `) e descartado na
 * tokenizacao -- nunca chega ao banco como parte da sintaxe da query, so como conteudo de token.
 * Retorna null para uma query vazia ou sem nenhum token valido (o chamador lista sem filtro de texto).
 */
export function buildTsQuery(rawQuery: string): string | null {
  const tokens = normalizeText(rawQuery)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
    .map((t) => `${t}:*`);
  if (tokens.length === 0) return null;
  return tokens.join(' & ');
}

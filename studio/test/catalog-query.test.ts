import { describe, expect, it } from 'vitest';
import { buildTsQuery } from '../catalog/query.js';

describe('buildTsQuery', () => {
  it('tokeniza uma busca simples em prefixos unidos por &', () => {
    expect(buildTsQuery('kafka checkout')).toBe('kafka:* & checkout:*');
  });

  it('normaliza acento e maiusculas', () => {
    expect(buildTsQuery('Nao Pagamento')).toBe('nao:* & pagamento:*');
  });

  it('neutraliza caracteres de sintaxe do tsquery -- nunca chegam como sintaxe ao banco', () => {
    const dangerous = "kafka' OR 1=1 & (evil) | !neg : foo*";
    const result = buildTsQuery(dangerous)!;
    // nenhum caractere de controle sobra fora dos separadores "&" que o proprio buildTsQuery insere
    expect(result.replace(/:\*/g, '').replace(/ & /g, '')).toMatch(/^[a-z0-9]+$/);
  });

  it('retorna null para query vazia', () => {
    expect(buildTsQuery('')).toBeNull();
    expect(buildTsQuery('   ')).toBeNull();
  });

  it('retorna null quando a query so tem caracteres de sintaxe (nenhum token valido)', () => {
    expect(buildTsQuery('&|!():*')).toBeNull();
  });
});

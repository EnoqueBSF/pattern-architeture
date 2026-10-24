import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getIcon, iconKeys, resolveIcon } from '../src/icons/catalog.js';

interface CatalogFile {
  icons: Record<string, { body: string; width: number; height: number; source: string }>;
  aliases: Record<string, string>;
}

function loadRawCatalog(): CatalogFile {
  const path = fileURLToPath(new URL('../assets/icons/catalog.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf-8')) as CatalogFile;
}

const FORBIDDEN_TAG = /<\s*(script|foreignObject|image|style|text)\b/i;
const EVENT_ATTR = /\son[a-z]+\s*=/i;

describe('catalogo de icones: integridade estrutural', () => {
  const catalog = loadRawCatalog();

  it('nenhum icone usa elementos ou atributos perigosos', () => {
    for (const [key, def] of Object.entries(catalog.icons)) {
      expect(FORBIDDEN_TAG.test(def.body), `icone "${key}" tem elemento proibido`).toBe(false);
      expect(EVENT_ATTR.test(def.body), `icone "${key}" tem atributo de evento`).toBe(false);
    }
  });

  it('todo id= esta no formato normalizado __ID__n', () => {
    const idRe = /\bid="([^"]+)"/g;
    for (const [key, def] of Object.entries(catalog.icons)) {
      for (const match of def.body.matchAll(idRe)) {
        expect(match[1], `icone "${key}" tem id nao normalizado: ${match[1]}`).toMatch(/^__ID__\d+$/);
      }
    }
  });

  it('toda referencia url(#) e href="#" aponta para um id presente no corpo', () => {
    for (const [key, def] of Object.entries(catalog.icons)) {
      const declaredIds = new Set([...def.body.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
      for (const match of def.body.matchAll(/url\(#([^)]+)\)/g)) {
        expect(declaredIds.has(match[1]!), `icone "${key}": url(#${match[1]}) nao declarado`).toBe(true);
      }
      for (const match of def.body.matchAll(/href="#([^"]+)"/g)) {
        expect(declaredIds.has(match[1]!), `icone "${key}": href="#${match[1]}" nao declarado`).toBe(true);
      }
    }
  });

  it('width/height sao positivos em todos os icones', () => {
    for (const [key, def] of Object.entries(catalog.icons)) {
      expect(def.width, key).toBeGreaterThan(0);
      expect(def.height, key).toBeGreaterThan(0);
    }
  });

  it('todo alias aponta para uma chave existente', () => {
    for (const [alias, target] of Object.entries(catalog.aliases)) {
      expect(catalog.icons[target], `alias "${alias}" -> "${target}" nao existe`).toBeDefined();
    }
  });

  it('a lista minima pedida pelo usuario esta presente', () => {
    const required = ['nodejs', 'python', 'nestjs', 'react', 'postgresql', 'mysql', 'redis', 'rabbitmq', 'kafka', 'docker', 'kubernetes', 'kong', 'aws-rds', 'aws-s3', 'aws-lambda', 'aws-sqs', 'microsoft-azure', 'google-cloud'];
    for (const key of required) {
      expect(catalog.icons[key], `icone obrigatorio ausente: "${key}"`).toBeDefined();
    }
  });
});

describe('resolveIcon', () => {
  it('resolve o nome exato', () => {
    expect(resolveIcon('nodejs').key).toBe('nodejs');
  });

  it('e case-insensitive e tolera espacos nas pontas', () => {
    expect(resolveIcon('  NodeJS  ').key).toBe('nodejs');
  });

  it('resolve aliases', () => {
    expect(resolveIcon('azure').key).toBe('microsoft-azure');
    expect(resolveIcon('gcp').key).toBe('google-cloud');
    expect(resolveIcon('postgres').key).toBe('postgresql');
  });

  it('aceita o prefixo logos: opcional', () => {
    expect(resolveIcon('logos:aws-rds').key).toBe('aws-rds');
  });

  it('sugere o nome correto para um typo plausivel', () => {
    const result = resolveIcon('aws-rdss');
    expect(result.key).toBeUndefined();
    expect(result.suggestion).toBe('aws-rds');
  });

  it('nao encontra nada e nao sugere nada para um nome completamente diferente', () => {
    const result = resolveIcon('xyzqwerty123');
    expect(result.key).toBeUndefined();
    expect(result.suggestion).toBeUndefined();
  });
});

describe('getIcon / iconKeys', () => {
  it('iconKeys retorna uma lista ordenada e nao vazia', () => {
    const keys = iconKeys();
    expect(keys.length).toBeGreaterThan(50);
    expect(keys).toEqual([...keys].sort());
  });

  it('getIcon devolve a definicao completa de um icone valido', () => {
    const def = getIcon('nodejs');
    expect(def.width).toBeGreaterThan(0);
    expect(def.body.length).toBeGreaterThan(0);
  });

  it('getIcon lanca para uma chave inexistente', () => {
    expect(() => getIcon('nao-existe-123')).toThrow();
  });
});

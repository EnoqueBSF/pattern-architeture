import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deriveProject, extractCatalogRecord } from '../catalog/extract.js';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function path(rel: string): string {
  return fileURLToPath(new URL(`../../${rel}`, import.meta.url));
}

describe('deriveProject', () => {
  it('diagrams/<projeto>/... vira <projeto>', () => {
    expect(deriveProject(path('diagrams/demo/checkout-novo-servico.yaml'), REPO_ROOT)).toBe('demo');
  });

  it('examples/... vira "examples"', () => {
    expect(deriveProject(path('examples/intera-bff/intera-bff.yaml'), REPO_ROOT)).toBe('examples');
  });

  it('templates/... nao e indexado (null)', () => {
    expect(deriveProject(path('templates/diagram.template.yaml'), REPO_ROOT)).toBeNull();
  });

  it('um arquivo fora do repoRoot usa o diretorio ancestral com .git', () => {
    const outsideRepo = mkdtempSync(join(tmpdir(), 'catalog-extract-'));
    try {
      writeFileSync(join(outsideRepo, '.git'), ''); // so precisa existir, nao precisa ser um repo real
      const docsDir = join(outsideRepo, 'docs', 'architecture');
      mkdirSync(docsDir, { recursive: true });
      const file = join(docsDir, 'fluxo.yaml');
      writeFileSync(file, 'x');
      expect(deriveProject(file, REPO_ROOT)).toBe(outsideRepo.split('/').pop());
    } finally {
      rmSync(outsideRepo, { recursive: true, force: true });
    }
  });
});

describe('extractCatalogRecord', () => {
  const ALL_REAL_YAMLS = [
    ['diagrams/demo/checkout-novo-servico.yaml', 'demo'],
    ['diagrams/demo/microservicos-kafka.yaml', 'demo'],
    ['diagrams/demo/observabilidade.yaml', 'demo'],
    ['diagrams/demo/serverless-mobile.yaml', 'demo'],
    ['examples/icon-cards/icon-cards.yaml', 'examples'],
    ['examples/intera-bff/intera-bff.yaml', 'examples'],
    ['examples/showcase/showcase.yaml', 'examples'],
  ] as const;

  it.each(ALL_REAL_YAMLS)('extrai %s sem lancar, com o project certo', (rel, expectedProject) => {
    const abs = path(rel);
    const source = readFileSync(abs, 'utf-8');
    const record = extractCatalogRecord(source, abs, REPO_ROOT, REPO_ROOT);
    expect(record).not.toBeNull();
    expect(record!.project).toBe(expectedProject);
    expect(record!.title.length).toBeGreaterThan(0);
    expect(record!.nodeCount).toBeGreaterThan(0);
    expect(record!.yamlSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('retorna null para um arquivo dentro de templates/ (nao indexado)', () => {
    const abs = path('templates/diagram.template.yaml');
    const source = readFileSync(abs, 'utf-8');
    expect(extractCatalogRecord(source, abs, REPO_ROOT, REPO_ROOT)).toBeNull();
  });

  it('searchText inclui titulo normalizado (sem acento, minusculo) e tags/tech/slug/subtitle dos nodes', () => {
    // tags seguem o mesmo formato de id do schema (minusculas/digitos/- _ .) -- a normalizacao de
    // maiusculas/acento aqui e so para o titulo, que e texto livre
    const synthetic = `version: 1
title: "Nao Importa"
tags: [checkout, pagamentos]
nodes:
  - { id: a, label: A, type: database, status: new, tech: "PostgreSQL", slug: meu-slug-tecnico, subtitle: "Texto Visivel" }
`;
    const record = extractCatalogRecord(synthetic, path('diagrams/demo/synthetic.yaml'), REPO_ROOT, REPO_ROOT)!;
    expect(record.tags).toEqual(['checkout', 'pagamentos']);
    expect(record.searchText).toContain('nao importa'); // sem acento, minusculo
    expect(record.searchText).toContain('pagamentos');
    expect(record.searchText).toContain('postgresql');
    expect(record.searchText).toContain('meu-slug-tecnico');
    expect(record.searchText).toContain('texto visivel');
  });

  it('lanca quando o YAML e invalido (nao esconde o erro de validacao)', () => {
    expect(() => extractCatalogRecord('version: 1\ntitle: X\nnodes: []\n', path('diagrams/demo/x.yaml'), REPO_ROOT, REPO_ROOT)).toThrow();
  });
});

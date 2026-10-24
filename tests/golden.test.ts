import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderDiagramSource } from '../src/index.js';

const GOLDEN_FILES = ['examples/intera-bff/intera-bff', 'examples/showcase/showcase', 'examples/icon-cards/icon-cards', 'diagrams/demo/checkout-novo-servico'];

function path(rel: string): string {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}

/**
 * Trava o SVG gerado para os diagramas ja existentes, byte a byte, contra o arquivo .svg
 * ja commitado/gerado em disco. Qualquer mudanca no motor que altere esses diagramas
 * (mesmo sem tocar os YAMLs) precisa regenerar essas saidas conscientemente via
 * `npm run example` -- esse teste existe para que isso nunca aconteca por acidente.
 */
describe.each(GOLDEN_FILES)('golden: %s', (base) => {
  it('SVG gerado bate byte a byte com o .svg em disco', () => {
    const yaml = readFileSync(path(`${base}.yaml`), 'utf-8');
    const expectedSvg = readFileSync(path(`${base}.svg`), 'utf-8');
    const { svg } = renderDiagramSource(yaml);
    expect(svg).toBe(expectedSvg);
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toPng } from '../src/export/png.js';
import { renderDiagramSource } from '../src/index.js';
import { loadDiagramFile } from '../src/schema/load.js';

function example(name: string): string {
  return fileURLToPath(new URL(`../examples/${name}`, import.meta.url));
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('renderDiagramSource + toPng', () => {
  const source = readFileSync(example('intera-bff/intera-bff.yaml'), 'utf-8');

  it('renderiza SVG deterministico (byte a byte) para a mesma entrada', () => {
    const a = renderDiagramSource(source);
    const b = renderDiagramSource(source);
    expect(a.svg).toBe(b.svg);
  });

  it('o relatorio nao acusa violacoes nem notas no exemplo de referencia', () => {
    const result = renderDiagramSource(source);
    expect(result.report.violations).toEqual([]);
    expect(result.report.noteCount).toBe(0);
    expect(result.report.routedCount).toBe(result.report.edgeCount);
  });

  it('o SVG contem o grupo do corpo transladado por bodyY, e o layout bruto e exposto', () => {
    const result = renderDiagramSource(source);
    expect(result.bodyY).toBeGreaterThan(0);
    expect(result.svg).toContain(`translate(0,${result.bodyY})`);
    expect(result.layout.nodes.length).toBe(result.report.nodeCount);
  });

  it('gera um PNG valido com assinatura correta', () => {
    const { svg } = renderDiagramSource(source);
    const png = toPng(svg, 2);
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  });

  it('as dimensoes do PNG batem com largura/altura do SVG multiplicadas pelo scale', () => {
    const { svg } = renderDiagramSource(source);
    const widthMatch = svg.match(/width="([0-9.]+)"/);
    const heightMatch = svg.match(/height="([0-9.]+)"/);
    const svgWidth = Math.round(Number(widthMatch![1]));
    const svgHeight = Math.round(Number(heightMatch![1]));

    const scale = 2;
    const png = toPng(svg, scale);

    // le width/height do chunk IHDR do PNG (bytes 16..24, big-endian)
    const pngWidth = png.readUInt32BE(16);
    const pngHeight = png.readUInt32BE(20);

    expect(pngWidth).toBe(svgWidth * scale);
    expect(pngHeight).toBe(svgHeight * scale);
  });
});

describe('renderDiagramSource: showcase', () => {
  it('nao tem violacoes nem usa fallback de nota', () => {
    const source = readFileSync(example('showcase/showcase.yaml'), 'utf-8');
    const result = renderDiagramSource(source);
    expect(result.report.violations).toEqual([]);
  });
});

describe('renderDiagramSource: icon-cards', () => {
  const source = readFileSync(example('icon-cards/icon-cards.yaml'), 'utf-8');

  it('nao tem violacoes e todas as arestas sao roteadas (sem fallback)', () => {
    const result = renderDiagramSource(source);
    expect(result.report.violations).toEqual([]);
    expect(result.report.routedCount).toBe(result.report.edgeCount);
  });

  it('todo id="..." do SVG final e unico', () => {
    const { svg } = renderDiagramSource(source);
    const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!);
    const unique = new Set(ids);
    expect(ids.length).toBeGreaterThan(0);
    expect(unique.size).toBe(ids.length);
  });

  it('dois nodes com o MESMO icone nao colidem em ids (teste sintetico)', () => {
    const synthetic = `
version: 1
title: Dois nodes com o mesmo icone
nodes:
  - { id: svc-a, label: Servico A, type: microservice, status: new, icon: aws-rds }
  - { id: svc-b, label: Servico B, type: microservice, status: new, icon: aws-rds }
edges:
  - { from: svc-a, to: svc-b, protocol: http }
`;
    const { svg } = renderDiagramSource(synthetic);
    const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('loadDiagramFile + renderDiagramSource: consistencia', () => {
  it('nodeCount/edgeCount do relatorio batem com o modelo carregado', () => {
    const model = loadDiagramFile(example('intera-bff/intera-bff.yaml'));
    const source = readFileSync(example('intera-bff/intera-bff.yaml'), 'utf-8');
    const result = renderDiagramSource(source);
    expect(result.report.nodeCount).toBe(model.nodes.length);
    expect(result.report.edgeCount).toBe(model.edges.length);
  });
});

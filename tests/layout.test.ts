import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { layoutDiagram } from '../src/layout/layout.js';
import { loadDiagramFile, parseDiagram } from '../src/schema/load.js';
import type { DiagramModel } from '../src/schema/model.js';
import { getShape } from '../src/shapes/registry.js';
import { measureText } from '../src/text/measure.js';
import { TEXT } from '../src/theme/theme.js';
import { checkLayoutInvariants } from '../src/verify/invariants.js';
import { buildStressYaml } from './fixtures/stress.js';

function example(name: string): string {
  return fileURLToPath(new URL(`../examples/${name}`, import.meta.url));
}

function relationMaps(model: DiagramModel) {
  const groupOfNode = new Map(model.nodes.map((n) => [n.id, n.group]));
  const parentOfGroup = new Map(model.groups.map((g) => [g.id, g.parent]));
  return { groupOfNode, parentOfGroup };
}

describe.each([
  ['intera-bff', () => loadDiagramFile(example('intera-bff/intera-bff.yaml'))],
  ['showcase', () => loadDiagramFile(example('showcase/showcase.yaml'))],
  ['icon-cards', () => loadDiagramFile(example('icon-cards/icon-cards.yaml'))],
  ['stress', () => parseDiagram(buildStressYaml())],
] as const)('layoutDiagram: %s', (_name, loadModel) => {
  const model = loadModel();
  const layout = layoutDiagram(model);
  const { groupOfNode, parentOfGroup } = relationMaps(model);

  it('nao tem violacoes geometricas (overlap, contencao)', () => {
    const violations = checkLayoutInvariants(layout, groupOfNode, parentOfGroup);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  it('todo texto cabe na largura de conteudo do seu node', () => {
    for (const node of layout.nodes) {
      const shape = getShape(node.type);
      const box = shape.contentBox(node.w, node.h);
      const groups: { lines: string[]; size: 10 | 11 | 12 | 14; weight: 400 | 600 }[] = [
        { lines: node.labelLines, size: TEXT.label.size, weight: TEXT.label.weight },
        { lines: node.techLines, size: TEXT.tech.size, weight: TEXT.tech.weight },
        { lines: node.slugLines, size: TEXT.slug.size, weight: TEXT.slug.weight },
        { lines: node.subtitleLines, size: TEXT.subtitle.size, weight: TEXT.subtitle.weight },
      ];
      for (const { lines, size, weight } of groups) {
        for (const line of lines) {
          const width = measureText(line, size, weight);
          expect(width, `node "${node.id}" linha "${line}" (${width}px) excede contentBox (${box.w}px)`).toBeLessThanOrEqual(box.w + 0.5);
        }
      }
      if (node.tagWidth > 0) {
        expect(node.tagWidth, `node "${node.id}" badge livre (${node.tagWidth}px) excede contentBox (${box.w}px)`).toBeLessThanOrEqual(box.w + 0.5);
      }

      if (node.card) {
        const sizeByRole = { caption: 10, label: 14, slug: 11, tech: 12, subtitle: 12 } as const;
        const weightByRole = { caption: 600, label: 600, slug: 400, tech: 400, subtitle: 400 } as const;
        for (const line of node.card.lines) {
          const width = measureText(line.text, sizeByRole[line.role], weightByRole[line.role]);
          expect(width, `node "${node.id}" linha de card "${line.text}" (${width}px) excede a largura do node (${node.w}px)`).toBeLessThanOrEqual(node.w - line.x + 0.5);
        }
      }
    }
  });

  it('largura e altura do layout sao positivas e finitas', () => {
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
    expect(Number.isFinite(layout.width)).toBe(true);
    expect(Number.isFinite(layout.height)).toBe(true);
  });
});

describe('layoutDiagram: campos novos no modo forma (sem icone)', () => {
  const src = `
version: 1
title: Campos novos no modo forma
nodes:
  - id: svc-a
    label: Servico A
    type: database
    status: unchanged
    tech: "PostgreSQL 16 · AWS RDS"
    slug: aws-bmg-apoio-operacoes-consumer-service
    subtitle: "Interface para comunicacao com a dataprev, usada pelo orquestrador de solicitacoes"
    badge: "100% Pronto"
`;
  const model = parseDiagram(src);
  const layout = layoutDiagram(model);
  const node = layout.nodes[0]!;

  it('todo o texto (incl. slug/subtitle/badge) cabe no contentBox', () => {
    const shape = getShape(node.type);
    const box = shape.contentBox(node.w, node.h);
    const groups: { lines: string[]; size: 11 | 12 | 14; weight: 400 | 600 }[] = [
      { lines: node.labelLines, size: TEXT.label.size, weight: TEXT.label.weight },
      { lines: node.techLines, size: TEXT.tech.size, weight: TEXT.tech.weight },
      { lines: node.slugLines, size: TEXT.slug.size, weight: TEXT.slug.weight },
      { lines: node.subtitleLines, size: TEXT.subtitle.size, weight: TEXT.subtitle.weight },
    ];
    expect(node.slugLines.length).toBeGreaterThan(0);
    expect(node.subtitleLines.length).toBeGreaterThan(0);
    for (const { lines, size, weight } of groups) {
      for (const line of lines) {
        expect(measureText(line, size, weight), `linha "${line}" excede o contentBox (${box.w}px)`).toBeLessThanOrEqual(box.w + 0.5);
      }
    }
    expect(node.tagWidth).toBeGreaterThan(0);
    expect(node.tagWidth).toBeLessThanOrEqual(box.w + 0.5);
  });

  it('nao tem violacao geometrica', () => {
    const violations = checkLayoutInvariants(layout, new Map([[node.id, undefined]]), new Map());
    expect(violations).toEqual([]);
  });
});

describe('layoutDiagram: intera-bff (ranks esperados)', () => {
  const model = loadDiagramFile(example('intera-bff/intera-bff.yaml'));
  const layout = layoutDiagram(model);
  const xOf = (id: string) => layout.nodes.find((n) => n.id === id)!.x;

  it('segue a ordem de dependencia web-app < api-gateway < intera-bff < pg-main', () => {
    expect(xOf('web-app')).toBeLessThan(xOf('api-gateway'));
    expect(xOf('api-gateway')).toBeLessThan(xOf('intera-bff'));
    expect(xOf('intera-bff')).toBeLessThan(xOf('pg-main'));
  });
});

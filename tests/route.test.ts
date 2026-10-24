import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { layoutDiagram } from '../src/layout/layout.js';
import { loadDiagramFile, parseDiagram } from '../src/schema/load.js';
import type { DiagramModel } from '../src/schema/model.js';
import { placeLabels } from '../src/route/labels.js';
import { routeEdges } from '../src/route/route.js';
import { GROUP_STYLE } from '../src/theme/theme.js';
import { rectsOverlap } from '../src/verify/invariants.js';
import { buildStressYaml } from './fixtures/stress.js';

function example(name: string): string {
  return fileURLToPath(new URL(`../examples/${name}`, import.meta.url));
}

function isAxisAligned(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01;
}

describe.each([
  ['intera-bff', () => loadDiagramFile(example('intera-bff/intera-bff.yaml'))],
  ['showcase', () => loadDiagramFile(example('showcase/showcase.yaml'))],
  ['icon-cards', () => loadDiagramFile(example('icon-cards/icon-cards.yaml'))],
] as const)('routeEdges: %s', (_name, loadModel) => {
  const model = loadModel();
  const layout = layoutDiagram(model);
  const routed = routeEdges(layout, model);

  it('todos os segmentos sao horizontais ou verticais', () => {
    for (const re of routed) {
      for (let i = 1; i < re.points.length; i++) {
        expect(isAxisAligned(re.points[i - 1]!, re.points[i]!), `edge "${re.edge.id}" segmento ${i} nao e ortogonal`).toBe(true);
      }
    }
  });

  it('nenhum segmento cruza o bounds de um node que nao e extremo da aresta', () => {
    for (const re of routed) {
      const ignoreIds = new Set([re.edge.from, re.edge.to]);
      for (let i = 1; i < re.points.length; i++) {
        const segBox = segmentBounds(re.points[i - 1]!, re.points[i]!);
        for (const node of layout.nodes) {
          if (ignoreIds.has(node.id)) continue;
          expect(rectsOverlap(segBox, node.bounds, -2), `edge "${re.edge.id}" cruza node "${node.id}"`).toBe(false);
        }
      }
    }
  });

  it('extremidades ficam a menos de 1px do outline (nao usa fallback)', () => {
    for (const re of routed) {
      expect(re.usedFallback, `edge "${re.edge.id}" usou fallback de linha reta`).toBe(false);
    }
  });
});

function segmentBounds(a: { x: number; y: number }, b: { x: number; y: number }) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x, b.x) - x, h: Math.max(a.y, b.y) - y };
}

describe('routeEdges: stress (performance)', () => {
  it('roteia o grafo de 30 nodes / 45 edges em menos de 3s', () => {
    const model: DiagramModel = parseDiagram(buildStressYaml());
    const layout = layoutDiagram(model);
    const start = Date.now();
    const routed = routeEdges(layout, model);
    const elapsed = Date.now() - start;
    expect(routed.length).toBe(model.edges.length);
    expect(elapsed).toBeLessThan(3000);
  });
});

describe.each([
  ['intera-bff', () => loadDiagramFile(example('intera-bff/intera-bff.yaml'))],
  ['showcase', () => loadDiagramFile(example('showcase/showcase.yaml'))],
  ['icon-cards', () => loadDiagramFile(example('icon-cards/icon-cards.yaml'))],
  ['stress', () => parseDiagram(buildStressYaml())],
] as const)('placeLabels: %s', (_name, loadModel) => {
  const model = loadModel();
  const layout = layoutDiagram(model);
  const routed = routeEdges(layout, model);
  const { labels, notes } = placeLabels(routed, layout);

  it('nenhum rotulo intersecta node ou outro rotulo', () => {
    const nodeBoxes = layout.nodes.map((n) => n.bounds);
    const titleBars = layout.groups.map((g) => ({ x: g.x, y: g.y, w: g.w, h: GROUP_STYLE.titleBarHeight }));
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i]!;
      for (const box of nodeBoxes) expect(rectsOverlap(label.box, box), `label da edge "${label.edgeId}" sobrepoe um node`).toBe(false);
      for (const box of titleBars) expect(rectsOverlap(label.box, box), `label da edge "${label.edgeId}" sobrepoe faixa de titulo`).toBe(false);
      for (let j = i + 1; j < labels.length; j++) {
        expect(rectsOverlap(label.box, labels[j]!.box), `labels "${label.edgeId}" e "${labels[j]!.edgeId}" se sobrepoem`).toBe(false);
      }
    }
  });

  it('notas (se houver) nao se sobrepoem entre si', () => {
    for (let i = 0; i < notes.length; i++) {
      for (let j = i + 1; j < notes.length; j++) {
        const a = notes[i]!.point;
        const b = notes[j]!.point;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        expect(d, `notas "${notes[i]!.marker}" e "${notes[j]!.marker}" muito proximas`).toBeGreaterThanOrEqual(16);
      }
    }
  });
});

describe('placeLabels: intera-bff nao gera notas de fallback', () => {
  it('todas as 8 arestas conseguem um rotulo posicionado', () => {
    const model = loadDiagramFile(example('intera-bff/intera-bff.yaml'));
    const layout = layoutDiagram(model);
    const routed = routeEdges(layout, model);
    const { notes } = placeLabels(routed, layout);
    expect(notes).toEqual([]);
  });
});

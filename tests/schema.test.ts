import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DiagramValidationError, loadDiagramFile, parseDiagram } from '../src/schema/load.js';

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

function example(name: string): string {
  return fileURLToPath(new URL(`../examples/${name}`, import.meta.url));
}

describe('parseDiagram - caminho feliz (intera-bff)', () => {
  const model = loadDiagramFile(example('intera-bff/intera-bff.yaml'));

  it('carrega todos os nodes e grupos', () => {
    expect(model.nodes).toHaveLength(8);
    expect(model.groups).toHaveLength(6);
    expect(model.edges).toHaveLength(8);
  });

  it('junta tech array com separador middot', () => {
    const bff = model.nodes.find((n) => n.id === 'intera-bff');
    expect(bff?.tech).toBe('Node.js 22 · TypeScript · NestJS');
  });

  it('deriva status da edge a partir dos nodes quando nao declarado', () => {
    const toQueue = model.edges.find((e) => e.from === 'intera-bff' && e.to === 'intera-events');
    expect(toQueue?.status).toBe('new'); // intera-bff e intera-events sao new

    const toDb = model.edges.find((e) => e.from === 'orders-api' && e.to === 'pg-main');
    expect(toDb?.status).toBe('unchanged'); // os dois sao unchanged
  });

  it('respeita status explicito da edge mesmo quando os nodes nao sao new', () => {
    const toGateway = model.edges.find((e) => e.from === 'web-app' && e.to === 'api-gateway');
    expect(toGateway?.status).toBe('changed');
  });

  it('marca protocolos assincronos automaticamente', () => {
    const amqpEdge = model.edges.find((e) => e.protocol === 'amqp' && e.from === 'intera-bff');
    expect(amqpEdge?.async).toBe(true);
    const httpEdge = model.edges.find((e) => e.protocol === 'http' && e.to === 'intera-bff');
    expect(httpEdge?.async).toBe(false);
  });

  it('nao gera avisos no exemplo de referencia', () => {
    expect(model.warnings).toEqual([]);
  });

  it('nenhum node tem icon/slug/subtitle/badge (campos novos, retrocompatibilidade)', () => {
    for (const n of model.nodes) {
      expect(n.icon, n.id).toBeUndefined();
      expect(n.slug, n.id).toBeUndefined();
      expect(n.subtitle, n.id).toBeUndefined();
      expect(n.badge, n.id).toBeUndefined();
    }
  });
});

describe('parseDiagram - campos novos (icon/slug/subtitle/badge)', () => {
  it('resolve um icone valido para a chave canonica do catalogo', () => {
    const src = `
version: 1
title: Icone valido
nodes:
  - { id: svc-a, label: Servico A, type: microservice, status: new, icon: nodejs }
`;
    const model = parseDiagram(src);
    expect(model.nodes[0]?.icon).toBe('nodejs');
    expect(model.warnings.some((w) => w.includes('icone'))).toBe(false);
  });

  it('resolve um icone via alias', () => {
    const src = `
version: 1
title: Icone via alias
nodes:
  - { id: svc-a, label: Servico A, type: database, status: unchanged, icon: postgres }
`;
    const model = parseDiagram(src);
    expect(model.nodes[0]?.icon).toBe('postgresql');
  });

  it('icone desconhecido gera aviso (nao erro) e deixa icon undefined, com sugestao', () => {
    const src = readFileSync(fixture('icon-unknown.yaml'), 'utf-8');
    const model = parseDiagram(src);
    expect(model.nodes[0]?.icon).toBeUndefined();
    expect(model.warnings.some((w) => w.includes('aws-rdss') && w.includes('aws-rds'))).toBe(true);
  });

  it('carrega slug, subtitle e badge quando presentes', () => {
    const src = `
version: 1
title: Campos novos
nodes:
  - id: svc-a
    label: Servico A
    type: microservice
    status: new
    slug: aws-bmg-apoio-operacoes
    subtitle: "Interface para comunicacao com a dataprev"
    badge: "100% Pronto"
`;
    const model = parseDiagram(src);
    const n = model.nodes[0]!;
    expect(n.slug).toBe('aws-bmg-apoio-operacoes');
    expect(n.subtitle).toBe('Interface para comunicacao com a dataprev');
    expect(n.badge).toBe('100% Pronto');
  });

  it('rejeita slug com espaco', () => {
    const src = readFileSync(fixture('invalid-slug.yaml'), 'utf-8');
    expect(() => parseDiagram(src)).toThrow();
  });

  it('rejeita badge com mais de 24 caracteres', () => {
    const src = `
version: 1
title: Badge grande demais
nodes:
  - { id: svc-a, label: Servico A, type: microservice, status: new, badge: "este badge tem mais de vinte e quatro caracteres" }
`;
    expect(() => parseDiagram(src)).toThrow();
  });
});

describe('parseDiagram - casos invalidos', () => {
  it('rejeita referencia de edge para node inexistente, com sugestao', () => {
    const src = readFileSync(fixture('invalid-missing-ref.yaml'), 'utf-8');
    try {
      parseDiagram(src);
      expect.unreachable('deveria ter lancado');
    } catch (err) {
      expect(err).toBeInstanceOf(DiagramValidationError);
      const message = (err as DiagramValidationError).message;
      expect(message).toContain('svc-b');
      expect(message).toContain('svc-a');
    }
  });

  it('rejeita id duplicado', () => {
    const src = readFileSync(fixture('invalid-duplicate-id.yaml'), 'utf-8');
    expect(() => parseDiagram(src)).toThrow(/duplicado/);
  });

  it('rejeita ciclo de parent entre grupos', () => {
    const src = readFileSync(fixture('invalid-parent-cycle.yaml'), 'utf-8');
    expect(() => parseDiagram(src)).toThrow(/ciclo/);
  });

  it('rejeita enum de tipo invalido', () => {
    const src = readFileSync(fixture('invalid-enum.yaml'), 'utf-8');
    expect(() => parseDiagram(src)).toThrow();
  });

  it('rejeita campo desconhecido no node', () => {
    const src = readFileSync(fixture('invalid-unknown-field.yaml'), 'utf-8');
    expect(() => parseDiagram(src)).toThrow();
  });
});

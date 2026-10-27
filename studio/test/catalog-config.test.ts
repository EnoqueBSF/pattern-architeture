import { describe, expect, it } from 'vitest';
import { resolveCatalogConfig } from '../catalog/config.js';

describe('resolveCatalogConfig', () => {
  it('usa a URL padrao (127.0.0.1:54747) quando nada esta configurado', () => {
    const config = resolveCatalogConfig({});
    expect(config.mode).toBe('on');
    expect(config.url).toContain('127.0.0.1:54747');
  });

  it('mode off quando PATTERN_CATALOG=off', () => {
    expect(resolveCatalogConfig({ PATTERN_CATALOG: 'off' }).mode).toBe('off');
  });

  it('mode off quando o chamador desabilita via flag (--no-catalog)', () => {
    expect(resolveCatalogConfig({}, true).mode).toBe('off');
  });

  it('aceita host localhost explicito', () => {
    const config = resolveCatalogConfig({ PATTERN_CATALOG_URL: 'postgres://u:p@localhost:5432/db' });
    expect(config.mode).toBe('on');
  });

  it('aceita host IPv6 loopback ([::1])', () => {
    const config = resolveCatalogConfig({ PATTERN_CATALOG_URL: 'postgres://u:p@[::1]:5432/db' });
    expect(config.mode).toBe('on');
  });

  it('rejeita um host remoto (nunca conecta silenciosamente fora do loopback)', () => {
    expect(() => resolveCatalogConfig({ PATTERN_CATALOG_URL: 'postgres://u:p@sandbox-shared.aviait.com.br:5432/db' })).toThrow(/nao-local/);
  });

  it('rejeita uma URL malformada', () => {
    expect(() => resolveCatalogConfig({ PATTERN_CATALOG_URL: 'nao e uma url' })).toThrow();
  });

  it('mode off quando VITEST esta setado e nenhuma URL foi pedida explicitamente (evita indexar lixo de teste no catalogo real)', () => {
    expect(resolveCatalogConfig({ VITEST: 'true' }).mode).toBe('off');
  });

  it('VITEST setado nao impede uma URL explicita (e o que test:db pede de verdade)', () => {
    const config = resolveCatalogConfig({ VITEST: 'true', PATTERN_CATALOG_URL: 'postgres://u:p@127.0.0.1:1/db' });
    expect(config.mode).toBe('on');
  });

  it('ignora PGHOST/PGUSER/DATABASE_URL -- so le PATTERN_CATALOG_URL', () => {
    const env = {
      PGHOST: 'dev-shared.aviait.com.br',
      PGUSER: 'admin',
      DATABASE_URL: 'postgres://admin:x@dev-shared.aviait.com.br:5432/app',
    };
    const config = resolveCatalogConfig(env);
    expect(config.mode).toBe('on');
    expect(config.url).toContain('127.0.0.1');
  });
});

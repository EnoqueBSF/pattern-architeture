export type CatalogMode = 'off' | 'on';

export interface CatalogConfig {
  mode: CatalogMode;
  url: string;
}

const DEFAULT_URL = 'postgres://pattern:pattern-local-only@127.0.0.1:54747/pattern_catalog';
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * Resolve a configuracao do catalogo a partir do ambiente.
 *
 * Guarda-corpo (decisao de design, nao um detalhe tecnico): esta funcao NUNCA le as variaveis
 * PG* (PGHOST, PGUSER...) nem DATABASE_URL -- elas podem estar setadas no shell apontando para outro ambiente (ex.: Postgres de
 * DEV usado no dia a dia para outros projetos), e o catalogo nao deve herdar isso por acidente. A
 * URL so pode vir de PATTERN_CATALOG_URL (ou do default local). Alem disso, um host que nao seja
 * loopback lanca erro em vez de conectar silenciosamente em outro lugar -- o catalogo e,
 * por decisao explicita, sempre local e isolado (ver docs/STUDIO.md).
 */
export function resolveCatalogConfig(env: NodeJS.ProcessEnv = process.env, cliDisabled = false): CatalogConfig {
  if (cliDisabled || env.PATTERN_CATALOG === 'off') return { mode: 'off', url: '' };

  // guarda-corpo extra: sob Vitest (que seta VITEST=true em todo processo de teste), o catalogo
  // fica OFF por padrao a menos que o proprio teste peca uma URL explicitamente. Sem isso, qualquer
  // teste HTTP da suite padrao que nao passe HandlerOptions.catalog acaba, se o Postgres do
  // catalogo estiver rodando na maquina (ex.: durante o desenvolvimento), indexando "lixo" de
  // teste (diretorios temp) no catalogo REAL -- bug ja observado nesta sessao.
  if (env.VITEST && !env.PATTERN_CATALOG_URL) return { mode: 'off', url: '' };

  const url = env.PATTERN_CATALOG_URL ?? DEFAULT_URL;
  let hostname: string;
  try {
    hostname = new URL(url).hostname.replace(/^\[|\]$/g, '');
  } catch {
    throw new Error(`PATTERN_CATALOG_URL invalida: "${url}"`);
  }

  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new Error(
      `PATTERN_CATALOG_URL aponta para um host nao-local ("${hostname}"). Por design, o catalogo so conecta em 127.0.0.1/localhost/::1 -- rode "npm run catalog:up" para subir o Postgres local.`,
    );
  }

  return { mode: 'on', url };
}

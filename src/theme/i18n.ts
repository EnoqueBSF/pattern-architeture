import type { NodeType, Protocol, Status } from '../schema/enums.js';

type Locale = 'pt-BR' | 'en';

const STATUS_CAPTION: Record<Locale, Record<Status, string>> = {
  'pt-BR': { new: 'NOVO', changed: 'ALTERADO', unchanged: 'SEM MUDANCA' },
  en: { new: 'NEW', changed: 'CHANGED', unchanged: 'UNCHANGED' },
};

const STATUS_BADGE: Record<Locale, Record<Status, string>> = {
  'pt-BR': { new: 'NOVO', changed: 'ALTERADO', unchanged: '' },
  en: { new: 'NEW', changed: 'CHANGED', unchanged: '' },
};

const NODE_TYPE_LABEL: Record<Locale, Record<NodeType, string>> = {
  'pt-BR': {
    microservice: 'Microsservico',
    'api-gateway': 'API Gateway',
    'frontend-web': 'Frontend Web',
    'mobile-app': 'App Mobile',
    database: 'Banco de Dados',
    cache: 'Cache',
    'message-broker': 'Broker de Mensagens',
    queue: 'Fila',
    worker: 'Worker',
    storage: 'Armazenamento',
    cdn: 'CDN',
    'load-balancer': 'Load Balancer',
    'external-service': 'Servico Externo',
    actor: 'Ator',
    generic: 'Componente',
  },
  en: {
    microservice: 'Microservice',
    'api-gateway': 'API Gateway',
    'frontend-web': 'Frontend Web',
    'mobile-app': 'Mobile App',
    database: 'Database',
    cache: 'Cache',
    'message-broker': 'Message Broker',
    queue: 'Queue',
    worker: 'Worker',
    storage: 'Storage',
    cdn: 'CDN',
    'load-balancer': 'Load Balancer',
    'external-service': 'External Service',
    actor: 'Actor',
    generic: 'Component',
  },
};

const UI_STRINGS: Record<Locale, { legendStatus: string; legendEdges: string; legendTypes: string; connectionNotes: string; sync: string; async: string }> = {
  'pt-BR': {
    legendStatus: 'Status',
    legendEdges: 'Conexoes',
    legendTypes: 'Tipos',
    connectionNotes: 'Notas de conexao',
    sync: 'sincrona',
    async: 'assincrona',
  },
  en: {
    legendStatus: 'Status',
    legendEdges: 'Connections',
    legendTypes: 'Types',
    connectionNotes: 'Connection notes',
    sync: 'sync',
    async: 'async',
  },
};

export function statusCaption(locale: Locale, status: Status): string {
  return STATUS_CAPTION[locale][status];
}

export function statusBadge(locale: Locale, status: Status): string {
  return STATUS_BADGE[locale][status];
}

export function nodeTypeLabel(locale: Locale, type: NodeType): string {
  return NODE_TYPE_LABEL[locale][type];
}

export function protocolLabel(protocol: Protocol): string {
  // protocolos sao siglas/nomes proprios, nao variam por locale (ver enums.ts)
  return protocol;
}

export function ui(locale: Locale) {
  return UI_STRINGS[locale];
}

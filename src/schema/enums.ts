export const STATUSES = ['new', 'changed', 'unchanged'] as const;
export type Status = (typeof STATUSES)[number];

export const NODE_TYPES = [
  'microservice',
  'api-gateway',
  'frontend-web',
  'mobile-app',
  'database',
  'cache',
  'message-broker',
  'queue',
  'worker',
  'storage',
  'cdn',
  'load-balancer',
  'external-service',
  'actor',
  'generic',
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const PROTOCOLS = [
  'http',
  'grpc',
  'graphql',
  'websocket',
  'sql',
  'amqp',
  'kafka',
  'mqtt',
  'sqs',
  'redis',
  's3',
  'smtp',
  'tcp',
  'webhook',
  'event',
  'other',
] as const;
export type Protocol = (typeof PROTOCOLS)[number];

export const ASYNC_PROTOCOLS = new Set<Protocol>(['amqp', 'kafka', 'mqtt', 'sqs', 'webhook', 'event']);

export const GROUP_KINDS = ['layer', 'context', 'environment'] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

export const PROTOCOL_LABEL: Record<Protocol, string> = {
  http: 'HTTP',
  grpc: 'gRPC',
  graphql: 'GraphQL',
  websocket: 'WebSocket',
  sql: 'SQL',
  amqp: 'AMQP',
  kafka: 'Kafka',
  mqtt: 'MQTT',
  sqs: 'SQS',
  redis: 'Redis',
  s3: 'S3',
  smtp: 'SMTP',
  tcp: 'TCP',
  webhook: 'Webhook',
  event: 'Evento',
  other: '',
};

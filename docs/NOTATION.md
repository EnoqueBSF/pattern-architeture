# Notação

Especificação do formato de definição de diagrama (`.yaml`) e do significado visual de cada
elemento. Para o algoritmo de layout/roteamento, ver [LAYOUT.md](./LAYOUT.md). Para o fluxo de
uso, ver o [README](../README.md).

O contrato formal (JSON Schema, gerado a partir do Zod) fica em `schema/diagram.schema.json`
— rode `npm run schema` para regenerá-lo após mudar `src/schema/schema.ts`. Este documento é a
referência legível; em caso de divergência, o schema gerado é a fonte da verdade.

## Estrutura do arquivo

```yaml
version: 1               # obrigatorio, sempre 1
title: "..."              # obrigatorio
description: "..."        # opcional, 1 linha abaixo do titulo
direction: LR              # LR (padrao) | TB
locale: pt-BR               # pt-BR (padrao) | en
groups: [...]
nodes: [...]
edges: [...]
```

## `nodes[]`

| Campo | Obrigatório | Descrição |
|---|---|---|
| `id` | sim | minúsculas, dígitos, `- _ .` (ex.: `intera-bff`) |
| `label` | sim | nome exibido em negrito |
| `type` | sim | ver tabela de tipos abaixo |
| `status` | sim | `new` \| `changed` \| `unchanged` — **a decisão central do diagrama** |
| `tech` | não | string livre ou array de até 4 strings, junto com ` · ` — convenção: `Linguagem/Runtime · Framework · Motor/Hospedagem` |
| `group` | não | id de um grupo declarado em `groups[]` |
| `description` | não | vira `<title>` (tooltip) no SVG; **não é desenhado** — para texto visível, use `subtitle` |
| `icon` | não | chave do catálogo local de ícones (`npm run icons -- list`) — ver "Card com ícone" abaixo |
| `slug` | não | identificador técnico curto (ex.: `aws-bmg-apoio-operacoes`), sem espaços — linha discreta abaixo do nome |
| `subtitle` | não | descrição **visível** no card (diferente de `description`) |
| `badge` | não | selo de texto livre (ex.: `"100% Pronto"`), além do badge de status |
| `rank` / `order` | não | válvula de escape manual — ver LAYOUT.md §3–4 |

### Tipos de node → forma visual

| `type` | Forma | Uso típico |
|---|---|---|
| `microservice` | retângulo arredondado | serviço de aplicação |
| `api-gateway` | octógono | gateway/roteador de API |
| `frontend-web` | "navegador" (barra + pontos) | SPA/site |
| `mobile-app` | "celular" (cantos + notch) | app iOS/Android |
| `database` | cilindro | banco relacional/documental |
| `cache` | cilindro com anéis | Redis/Memcached |
| `message-broker` | hexágono | RabbitMQ/Kafka/SNS como broker |
| `queue` | "pipe" horizontal | fila individual |
| `worker` | cartões empilhados | consumidor assíncrono/job |
| `storage` | balde/trapézio | S3/Spaces/blob storage |
| `cdn` | paralelogramo | CDN/edge |
| `load-balancer` | pílula | LB/reverse proxy |
| `external-service` | nuvem | API de terceiro |
| `actor` | "pessoa" | usuário humano |
| `generic` | retângulo simples | qualquer coisa sem tipo melhor |

Adicionar um tipo novo: uma entrada em `src/schema/enums.ts` (`NODE_TYPES`), uma em
`src/shapes/registry.ts` (reaproveitando uma forma existente ou criando uma nova em
`src/shapes/*.ts`) e uma em `src/theme/i18n.ts` (`NODE_TYPE_LABEL`).

## Card com ícone

Quando `icon` está definido e resolve contra o catálogo local, o node **substitui** a forma
geométrica do seu `type` por um card no estilo:

```
┌──────────────────────────────────────────┐ [NOVO]
│ ┌──────┐  BANCO DE DADOS
│ │ icon │  Banco Checkout
│ │48x48 │  aws-bmg-checkout-db
│ └──────┘  PostgreSQL 16   (100% Pronto)
│ ────────────────────────────────────────
│ Interface para comunicacao com a dataprev
└──────────────────────────────────────────┘
```

- O **caption do tipo** (`BANCO DE DADOS`) continua aparecendo — o ícone mostra a *marca*
  (ex.: `nestjs`), não o *papel* do componente no sistema (que pode ser `microservice` ou
  `worker` com o mesmo ícone).
- `tech` continua sendo desenhado se presente. Convenção: com ícone, evite repetir a marca —
  prefira `tech: "Node.js 22 · ECS Fargate"` a `tech: "NestJS"` quando `icon: nestjs`.
- `slug`, `badge` e `subtitle` funcionam **tanto com quanto sem ícone** — no modo forma
  (sem ícone) eles ficam centralizados na pilha de texto de sempre; no card com ícone, ficam
  alinhados à esquerda ao lado do tile.
- **Fallback:** se `icon` não existir no catálogo, o CLI emite um `AVISO` (não um erro) e o
  node volta a desenhar a forma geométrica normal do seu `type`.
- A legenda "Tipos" do rodapé só lista as formas geométricas realmente desenhadas — nodes com
  ícone não entram nela (o ícone já é a própria legenda visual).

Fórmulas exatas de tamanho/posicionamento: [LAYOUT.md](./LAYOUT.md), seção "1b. Card com ícone".

Para começar já com esse padrão preenchido (em vez de copiar os 4 campos um por um): template
`templates/card-completo.template.yaml` — via CLI (`npm run diagram -- templates/card-completo.template.yaml`)
ou no [Studio](./STUDIO.md) (botão "Novo" → "Card completo (padrão ARB)").

## Catálogo de ícones

Fonte única: o conjunto [`logos`](https://icon-sets.iconify.design/logos/) do Iconify
(gilbarbara/logos, **licença CC0**) — cobre linguagens, frameworks, bancos, mensageria e
dezenas de serviços AWS específicos (`aws-rds`, `aws-lambda`, `aws-s3`...). Vendorizado
localmente em `assets/icons/catalog.json` (não depende de rede para gerar diagramas).

```bash
npm run icons -- list                    # lista o catalogo atual
npm run icons -- search <termo>          # busca no conjunto completo do Iconify
npm run icons -- add <chave>[=<nome>]    # adiciona um icone ao catalogo local
npm run icons -- add <chave> --file logo.svg   # a partir de um SVG proprio (ex.: logo de empresa)
npm run icons -- check                   # valida a integridade do catalogo
npm run icons -- preview                 # gera assets/icons/preview.png com todos os icones
```

Aliases já cadastrados: `azure→microsoft-azure`, `gcp`/`googlecloud→google-cloud`,
`node→nodejs`, `postgres→postgresql`, `golang→go`, `k8s→kubernetes`, `mongo→mongodb`,
`csharp→c-sharp`, `ios→apple`, `react-native→react`.

## `groups[]`

| Campo | Obrigatório | Descrição |
|---|---|---|
| `id` | sim | único, mesmo espaço de nomes dos nodes |
| `label` | sim | título do bloco (vira CAIXA ALTA no desenho) |
| `kind` | não (padrão `layer`) | `layer` (bloco sólido) \| `context` (bounded-context) \| `environment` (borda tracejada, ex.: "AWS prod") |
| `parent` | não | id de outro grupo — permite aninhar, até 3 níveis |
| `rank` / `order` | não | força a posição do grupo dentro do seu container pai |

## `edges[]`

| Campo | Obrigatório | Descrição |
|---|---|---|
| `from` / `to` | sim | ids de nodes existentes |
| `protocol` | sim | `http`, `grpc`, `graphql`, `websocket`, `sql`, `amqp`, `kafka`, `mqtt`, `sqs`, `redis`, `s3`, `smtp`, `tcp`, `webhook`, `event`, `other` |
| `label` | não | texto livre, some depois do protocolo: `"HTTP · /intera/*"` |
| `status` | não | por padrão: `new` se `from` OU `to` forem `new`; senão `unchanged`. Uma conexão nova entre dois nodes existentes deve declarar `status: new` explicitamente |
| `async` | não | por padrão, deduzido do `protocol` (`amqp`/`kafka`/`mqtt`/`sqs`/`webhook`/`event` = assíncrono) |
| `bidirectional` | não (padrão `false`) | desenha seta nas duas pontas |

### Convenção de direção da seta

- **Chamada síncrona** (`http`, `grpc`, `graphql`, `sql`, ...): `from` = quem chama, `to` = quem
  é chamado.
- **Mensageria** (`amqp`, `kafka`, `sqs`, ...): a seta segue o fluxo da mensagem — produtor →
  fila/tópico → consumidor (ou seja, pode haver duas edges: `produtor → fila` e `fila →
  consumidor`).

## Status — a semântica central

| Status | Significado | Borda do node | Badge |
|---|---|---|---|
| `new` | componente criado nesta mudança/fase | verde sólida | "NOVO" |
| `changed` | componente existente sendo alterado | âmbar tracejada | "ALTERADO" |
| `unchanged` | componente existente, só consumido, não tocado | cinza fina | sem badge |

A cor nunca é o único sinal: o estilo de borda (sólida/tracejada/fina) e o badge de texto se
repetem, então a semântica se mantém legível também em impressão P&B ou para quem não distingue
cores.

Arestas também têm status (verde/âmbar/cinza, seta cheia = síncrona, chevron aberto =
assíncrona), derivado automaticamente dos nodes que conecta a menos que seja declarado.

## Legenda e notas automáticas

Todo diagrama gerado inclui, no rodapé: a legenda de status, de estilos de conexão e dos tipos
de node realmente usados nesse diagrama (não a lista completa). Quando um rótulo de aresta não
cabe em nenhum ponto da rota sem sobrepor outro elemento, ele vira uma nota numerada
("N1 — HTTP (a → b)") listada em "Notas de conexão" — isso é esperado em diagramas densos e não
é um erro.

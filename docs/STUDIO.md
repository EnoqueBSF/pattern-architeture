# Pattern Studio

Frontend local para montar diagramas sem editar YAML à mão — formulário guiado + editor de
texto lado a lado, sincronizados, com drag-and-drop de **reordenação** (não posição livre) sobre
o mesmo motor determinístico do CLI. Para o formato do YAML em si, ver [NOTATION.md](./NOTATION.md);
para o algoritmo de layout, ver [LAYOUT.md](./LAYOUT.md).

## Rodar

```bash
npm run studio:install            # uma vez, instala as dependências do pacote studio/
npm run studio -- caminho/do/diagrama.yaml
```

Sobe um servidor local e abre o navegador. Sem arquivo inicial, abre vazio — use "Novo" na
toolbar para escolher um template (ver abaixo).

| Parâmetro | Efeito |
|---|---|
| `caminho/do/diagrama.yaml` (posicional, opcional) | abre esse arquivo já na inicialização |
| `--port <n>` | porta do servidor (padrão `4747`; incrementa sozinho se a porta estiver ocupada) |
| `--no-open` | não abre o navegador automaticamente |
| `--root <dir>` | libera abrir/salvar arquivos **fora** deste repo (ex.: `docs/architecture/` de outro projeto) — pode repetir ou combinar com o arquivo inicial |

```bash
npm run studio -- diagrams/meu-projeto/fluxo.yaml --port 5050 --no-open
npm run studio -- --root ../outro-repo/docs/architecture
```

## Templates (ponto de partida ao criar "Novo")

| Template | Quando usar |
|---|---|
| **Em branco** | esqueleto mínimo comentado, 2 nodes de exemplo — ponto de partida padrão |
| **Card completo (padrão ARB)** | já vem com `icon`/`slug`/`subtitle`/`badge` preenchidos num node de exemplo — use para começar já seguindo o padrão de card de um board de Change/ARB (ver "Card com ícone" em [NOTATION.md](./NOTATION.md)) |

A lista vem de `studio/server/templates.ts` + arquivos em `templates/*.yaml` na raiz do repo —
adicionar um template novo é uma entrada nesse array mais o `.yaml` correspondente.

## Arquitetura

- `studio/` é um **pacote npm separado** (não workspace) — mantém o CLI/motor core livre de
  dependências de frontend. `server/` (Node, importa `../../src/**` do motor) + `shared/` (TS
  puro, sem `node:*`/DOM) + `client/` (React 19 + Vite + CodeMirror 6 + Zustand).
- **Paridade garantida**: o SVG mostrado no canvas e o exportado são sempre gerados pela mesma
  `renderDocument`/`renderDiagramSource` do motor core — nunca reimplementados em React/Canvas.
- **Edição cirúrgica do YAML** (`shared/yaml-edit.ts`): toda mudança feita pelo formulário ou
  pelo drag edita o texto preservando formatação/comentários (não reserializa o arquivo
  inteiro), com fallback seguro quando a edição pontual não é possível.
- Servidor HTTP nativo do Node + Vite em modo middleware no mesmo processo — sem Express.

## Drag-and-drop: reordenação, não posição livre

Arrastar um node ou grupo **não** define coordenadas (x,y) livres. Ao soltar, o Studio infere a
intenção — outro rank (coluna/linha), outra posição dentro do rank, ou outro grupo — e o motor
recalcula o layout a partir desses hints, preservando a garantia de zero sobreposição por
construção que já existe no motor core. Um grupo só é arrastável pela **faixa de título**; o
resto da área fica livre para arrastar os nodes filhos.

Isso significa que um drop pode gravar `rank`/`order` explícitos no YAML (a "válvula de escape
manual" descrita em [NOTATION.md](./NOTATION.md)) — **mesmo que você nunca os tenha escrito à
mão**. O Studio minimiza isso automaticamente: depois de aplicar o movimento, ele tenta remover
cada hint recém-criado e só mantém os que o motor realmente precisa para reproduzir a posição
pedida; hints que já existiam no arquivo antes do drop nunca são tocados. Resultado: um drop
simples tende a acrescentar só o hint estritamente necessário, não um por item do container.

## Catálogo

Índice **aditivo** por cima dos arquivos: `.yaml`/`.svg`/`.png` em `diagrams/`/`examples/`
continuam a fonte de verdade no disco e no git, exatamente como antes. O catálogo é um
PostgreSQL **local e isolado** (Docker Compose, só para este projeto — nunca a infra Aviait real)
que guarda metadados pesquisáveis (título, descrição, projeto, tags, contagem de nodes/edges,
hash do YAML) para listar/buscar sem precisar navegar o filesystem. Toda escrita (Studio ou MCP)
grava os arquivos primeiro; o catálogo é atualizado como melhor esforço logo em seguida — se
estiver offline, o save continua funcionando normalmente, só não fica indexado até o próximo
save ou reindex manual.

```bash
npm run catalog:up          # sobe o Postgres local (Docker Compose), uma vez
npm run catalog:status      # confere se está ok e quantos diagramas estão indexados
npm run catalog:reindex     # reindexa a partir dos arquivos no disco (fonte de verdade)
npm run catalog:down        # derruba o container (os dados ficam em studio/data/, gitignored)
npm run catalog:reset       # apaga os dados e sobe limpo de novo -- pede --yes
```

Na UI, o diálogo "Abrir" tem duas abas: **Buscar** (catálogo — texto livre, filtro por chip de
projeto/tag, botão "Reindexar") e **Arquivos** (filesystem puro, sempre disponível mesmo com o
catálogo offline). Resultado com badge "desatualizado" = o YAML no disco mudou desde a última
indexação; "apagado" = o arquivo não existe mais (aparece até o próximo reindex, que remove).

`tags` é um campo opcional do próprio YAML (`tags: [checkout, pagamentos]`, ver
[NOTATION.md](./NOTATION.md)) — viaja com o arquivo (inclusive exportado em draw.io/.png como
metadado) e também é indexado no catálogo para filtro por chip.

## MCP

Para montar diagramas conversacionalmente (sem abrir o Studio nem escrever YAML à mão), ver
[MCP.md](./MCP.md) — servidor MCP que reaproveita a mesma lógica de edição cirúrgica e o mesmo
motor core deste Studio.

## Limitações conhecidas

- O catálogo de ícones (`assets/icons/catalog.json`) é carregado em memória **uma vez** quando o
  servidor do Studio sobe. Se você rodar `npm run icons -- add ...` (ou editar o catálogo) com o
  Studio já aberto, reinicie o servidor (`Ctrl+C` e `npm run studio -- ...` de novo) para o
  ícone novo aparecer no seletor — só reabrir a página no navegador não basta.
- **De forma geral, o processo do servidor (`studio/server/**`, `studio/catalog/**`) não recarrega
  sozinho** quando o código desses arquivos muda — só o `client/` tem hot-reload via Vite. Depois
  de editar `studio/server/` ou `studio/catalog/`, reinicie o processo do Studio (`Ctrl+C` e
  `npm run studio -- ...` de novo); um processo antigo rodando em background pode responder com o
  HTML de fallback do Vite em `/api/*` em vez de JSON — sintoma de que está desatualizado, não um
  bug no código atual.
- No macOS com Docker Desktop, `npm run catalog:up` pode falhar logo após um `npm run catalog:reset`
  com erro tipo `pg_wal: File exists` (latência de sincronização do bind mount). Se acontecer:
  `docker compose -f studio/catalog/compose.yaml down && rm -rf studio/data/ && npm run catalog:up`.
- Criar uma coluna/rank totalmente nova via drag não é suportado na v1 — o item sempre cai num
  rank já existente no container de destino (o mais próximo da posição onde foi solto). Para uma
  coluna nova, edite `rank`/`order` manualmente no YAML ou no formulário.
- Fora de escopo nesta versão: posição livre (x,y), múltiplos diagramas abertos na mesma janela,
  clicar numa aresta no canvas, autenticação/deploy, testes E2E automatizados em browser.

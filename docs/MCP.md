# Servidor MCP

Monta diagramas de arquitetura conversacionalmente — sem abrir o [Pattern Studio](./STUDIO.md)
nem escrever YAML à mão. Reaproveita 100% a lógica de edição cirúrgica (`studio/shared/`) e o
motor determinístico (`src/`) — nenhuma regra de validação/layout é reimplementada aqui; é o
mesmo caminho que o Studio usa para salvar.

## Registrar

Registrado em escopo **user** (global — funciona em qualquer projeto, não só dentro deste repo):

```bash
claude mcp add --scope user pattern-architeture -- "$(pwd)/node_modules/.bin/tsx" "$(pwd)/studio/mcp/main.ts"
```

(rode de dentro deste repo, para os caminhos absolutos ficarem corretos). O comando registrado é o
`tsx` direto, não `npm run mcp` — o `npm run <script>` sem `--silent` imprime um cabeçalho
(`> pattern-architeture@... mcp`) no próprio stdout antes de qualquer coisa, o que quebraria o
handshake JSON-RPC (stdout é o canal do protocolo, tem que ser só JSON-RPC). Para rodar
manualmente fora de um client MCP (debug local, inspecionar o handshake à mão):

```bash
npm run --silent mcp    # com --silent; sem ele, o cabeçalho do npm polui o stdout
```

### Diagramas fora deste repo

Por padrão só `diagrams/`, `examples/` e `templates/` deste repo são acessíveis. Para outro
projeto, passe `--root <dir>` (pode repetir) ao registrar, ou exporte `PATTERN_ARCH_ROOTS`
(diretórios absolutos separados por `:`) no ambiente onde o Claude Code roda:

```bash
claude mcp add --scope user pattern-architeture -e PATTERN_ARCH_ROOTS=/caminho/outro-repo/docs/architecture -- ...
```

## Tools

As mudanças (`node`/`group`/`edge`) não são uma tool por entidade — `diagram_create` e
`diagram_apply` recebem uma lista de `changes` (mesmo formato interno usado pelo Studio), cada
uma com um `action`. Isso é intencional: reduz a superfície de tools sem perder nada, já que a
validação de verdade (campos obrigatórios, enums, referências cruzadas) é sempre a do
`DiagramSchema` do core, que roda dentro de `diagram_create`/`diagram_apply` e devolve um erro
`INVALID` com a lista de problemas quando algo não bate.

| Tool | Para quê |
|---|---|
| `vocabulary_get` | valores válidos de `status`/`type`/`kind`/`protocol`/`direction`/`locale` — confira antes de montar um node/group/edge |
| `templates_list` | lista os templates em `templates/` (ponto de partida para `diagram_create`) |
| `catalog_search` | busca diagramas já catalogados (texto livre, filtro por `project`/`tag`); cai no fallback de listar arquivos do disco se o catálogo estiver offline |
| `catalog_reindex` | reindexa o catálogo a partir do disco |
| `diagram_read` | lê um diagrama existente: outline (nodes/groups/edges), `hash` atual (para `baseHash` de `diagram_apply`) |
| `diagram_create` | cria um diagrama novo (nunca sobrescreve um existente) — sem template, `changes` precisa ter ao menos 1 `add_node` |
| `diagram_apply` | aplica uma lista de `changes` a um diagrama existente, em lote atômico (se uma mudança falhar, nenhuma é gravada); aceita `baseHash` (falha com conflito se o arquivo mudou) e `dryRun` (valida sem gravar) |
| `diagram_preview` | devolve o PNG já gravado (gerado no último create/apply) como imagem, para inspeção visual |
| `diagram_export` | renderiza para um SVG/PNG à parte, sem reescrever o `.yaml` (`outPath` custom; `scale` diferente de 2 exige `outPath` explícito, para nunca sobrescrever o PNG canônico com outra escala) |

### `changes` (usado por `diagram_create` e `diagram_apply`)

Cada item tem um `action`: `set_meta`, `add_node`, `update_node`, `remove_node`, `add_group`,
`update_group`, `remove_group`, `add_edge`, `update_edge`, `remove_edge`, `clear_hints`.
`update_edge`/`remove_edge` identificam a edge por `{ id }`, `{ from, to, protocol? }` ou
`{ index }` — se a referência for ambígua (mais de uma edge bate), a tool devolve `BAD_REF` com
os índices candidatos.

```json
{
  "path": "diagrams/meu-projeto/fluxo.yaml",
  "title": "Checkout novo",
  "changes": [
    { "action": "add_node", "node": { "id": "api", "label": "API", "type": "api-gateway", "status": "new" } },
    { "action": "add_node", "node": { "id": "pg", "label": "Postgres", "type": "database", "status": "unchanged" } },
    { "action": "add_edge", "edge": { "from": "api", "to": "pg", "protocol": "sql" } }
  ]
}
```

## Erros

Toda tool devolve `isError: true` e `structuredContent.code` quando algo falha:

| Código | Quando |
|---|---|
| `INVALID` | o resultado final não passa no `DiagramSchema` (campo obrigatório ausente, enum inválido, referência cruzada quebrada) — `structuredContent.issues` lista cada problema |
| `CONFLICT` | `baseHash` informado não bate com o hash atual do arquivo em disco (alguém mudou por fora) |
| `NOT_FOUND` | path inexistente, ou `id`/`EdgeRef` que não existe no diagrama |
| `FORBIDDEN` | path fora dos diretórios permitidos (`allowedRoots`) |
| `EXISTS` | `diagram_create` para um path que já tem arquivo |
| `BAD_REF` | `EdgeRef` ambígua (mais de uma edge corresponde) |

## Regras do vocabulário

As mesmas do [NOTATION.md](./NOTATION.md), reforçadas nas `instructions` do servidor: todo
node/edge tem `status` (`new`/`changed`/`unchanged`) — é a decisão que importa, não assuma
`unchanged` por padrão; convenção de seta (`from` = quem chama / mensageria segue o fluxo da
mensagem); `icon` é sempre explícito, nunca inferido de `tech`; `rank`/`order` são válvula de
escape manual, não o caminho normal.

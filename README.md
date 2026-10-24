# pattern-architeture

Padrão próprio de diagrama de arquitetura: um YAML declarativo vira um PNG/SVG desenhado do
zero (motor próprio, sem Mermaid/Graphviz/Drawio), com layout determinístico — o mesmo YAML
sempre gera o mesmo desenho, sem sobreposição, sem precisar arrastar nada à mão.

A semântica central é o **status de cada componente**: `new` (verde), `changed` (âmbar
tracejado) ou `unchanged` (cinza) — fica óbvio o que está sendo criado, alterado ou só
consumido numa mudança. Cada node também pode trazer um **ícone de tecnologia real** (Node.js,
PostgreSQL, AWS RDS, Kong...) em vez de uma forma genérica — `npm run icons -- list` mostra o
catálogo disponível (ver `docs/NOTATION.md`, "Card com ícone").

## Quick start

```bash
npm install
npm run diagram -- templates/diagram.template.yaml   # copie este arquivo como ponto de partida
```

Isso gera `diagram.template.svg` e `.png` ao lado do YAML.

## Os 3 comandos

```bash
npm run diagram -- caminho/para/definicao.yaml     # gera .svg + .png ao lado do arquivo
npm run example                                     # regera os exemplos de referencia (examples/)
npm run check                                       # typecheck + testes
```

Opções do `diagram`: `-o <base>` (caminho/nome de saída), `-f svg,png` (formato), `--scale 2`
(resolução do PNG), `--validate` (só valida, não escreve arquivo).

De outro repositório, sem instalar nada ali:

```bash
npm --prefix /caminho/para/pattern-architeture run diagram -- /caminho/para/seu-diagrama.yaml
```

## Studio (montar sem editar YAML à mão)

```bash
npm run studio:install            # uma vez
npm run studio -- caminho/do/diagrama.yaml
```

Abre um frontend local (formulário guiado + editor de texto + canvas, sincronizados, com
drag-and-drop de reordenação) no navegador. Ver [docs/STUDIO.md](./docs/STUDIO.md).

## Onde cada coisa fica

- `templates/diagram.template.yaml` — esqueleto comentado, copie para começar.
- `docs/NOTATION.md` — todos os campos do YAML, tipos de node → forma, status → cor.
- `docs/LAYOUT.md` — como o algoritmo de layout/roteamento funciona (manutenção).
- `docs/STUDIO.md` — o frontend local (`studio/`): arquitetura, drag-and-drop, limitações.
- `examples/` — diagramas de referência já gerados (`.yaml` + `.svg` + `.png`).
- `schema/diagram.schema.json` — contrato formal (gerado via `npm run schema`), dá autocomplete
  no editor se o YAML começar com `# yaml-language-server: $schema=...`.
- `assets/icons/catalog.json` — catálogo local de ícones (CC0); `npm run icons -- <comando>`
  gerencia (`search`/`add`/`list`/`check`/`preview`).

## Para quem (ou o que) for gerar diagramas por aqui

Leia o [CLAUDE.md](./CLAUDE.md) — é o fluxo de "recebi um pedido de diagrama, o que eu faço".

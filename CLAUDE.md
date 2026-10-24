# CLAUDE.md — pattern-architeture

Este repo é o padrão pessoal do usuário para diagramas de arquitetura. Não é um projeto de
produto; é uma ferramenta interna que você (Claude) usa quando o usuário pede um diagrama de
um sistema/mudança, em qualquer repositório.

## Fluxo quando o usuário pedir um diagrama

1. **Copie `templates/diagram.template.yaml`** para `diagrams/<projeto>/<nome>.yaml` (dentro
   deste repo) ou para dentro do repo do projeto em questão, se fizer mais sentido lá (ex.:
   `docs/architecture/*.yaml`) — pergunte se não estiver óbvio onde o usuário quer.
2. **Escreva a definição** seguindo [docs/NOTATION.md](./docs/NOTATION.md): todo node precisa
   de um `status` (`new`/`changed`/`unchanged` — essa é a decisão que importa, não pule nem
   assuma `unchanged` por padrão sem confirmar). Use grupos para organizar visualmente (camada,
   bounded-context, ambiente). Campos opcionais que valem a pena considerar: `icon` (ver regra
   abaixo), `slug` (identificador técnico), `subtitle` (descrição visível) e `badge` (selo livre
   tipo "100% Pronto").
3. **Rode o gerador:**
   ```bash
   npm --prefix /caminho/para/pattern-architeture run diagram -- /caminho/completo/do/arquivo.yaml
   ```
   (ou `cd` para este repo e rode direto `npm run diagram -- caminho/relativo.yaml`).
4. **Confira a saída no terminal** antes de considerar pronto:
   - `OK valido: N nodes, M edges, K grupos`
   - `OK layout: WxHpx, 0 sobreposicoes` — se vier `FALHA layout`, é um bug do motor, não do
     YAML; investigue (não ignore).
   - `OK rotas X/Y; Z notas` — `Z notas` não é erro, é esperado em diagramas densos (vira a
     seção "Notas de conexão" no rodapé do SVG).
5. **Abra o `.png` gerado com a ferramenta Read** para inspecionar visualmente antes de entregar
   — formas certas, status com a cor esperada, rótulos legíveis. Isso é o passo que substitui
   "olhar o Drawio".

## Regras

- **Nunca edite o `.svg` gerado à mão.** Se o desenho está errado, o problema é no YAML (tipo
  errado, status errado) ou é um bug do gerador (código em `src/`) — não "conserte" editando o
  SVG, ele seria sobrescrito na próxima geração e o YAML ficaria mentindo.
- **`tech` é uma string livre**, não campos estruturados — convenção:
  `"Linguagem/Runtime · Framework · Motor/Hospedagem"` (ex.: `"Node.js 22 · NestJS"`,
  `"PostgreSQL 16 · AWS RDS"`). Pode ser array de até 4 strings se preferir montar por partes.
- **Convenção de seta:** chamada síncrona = `from` quem chama, `to` quem é chamado; mensageria =
  segue o fluxo da mensagem (produtor → fila → consumidor, como duas edges).
- **`rank`/`order` são válvula de escape manual**, não o caminho normal — só use se o layout
  automático (baricentro) deixar algo visualmente ruim num diagrama grande; para a maioria dos
  casos, a ordem de declaração no YAML + as dependências das edges já organizam bem.
- Diagrama com **15+ nodes numa coluna só**: o motor não quebra automaticamente colunas muito
  altas (ver docs/LAYOUT.md, "Limitações conhecidas") — considere usar grupos para dividir, ou
  `rank` manual.
- Commitar `.svg`/`.png` junto do `.yaml` que os gerou é o padrão deste repo (são determinísticos
  — rodar de novo sem mudar o YAML não deve gerar diff; se gerar, é um bug de determinismo).
- **`icon` é sempre explícito, nunca inferido** a partir de `tech` (seria ambíguo — "Node.js 22 ·
  NestJS" poderia virar `nodejs` ou `nestjs`). Se o CLI mostrar
  `AVISO: ... icone "X" nao esta no catalogo local`, **não ignore** — o node caiu de volta na
  forma geométrica do `type`, perdendo o ícone pedido. Procedimento:
  1. `npm run icons -- search <termo>` (ex.: o nome da tecnologia)
  2. `npm run icons -- add <chave>[=<nome-encontrado>]` (ou `--file logo.svg` para um SVG
     próprio, tipo logo de uma empresa/sistema interno sem ícone público)
  3. `npm run icons -- preview` e abra `assets/icons/preview.png` com Read para conferir
  4. gere o diagrama de novo
  5. commite `assets/icons/catalog.json` junto com o diagrama (o catálogo é compartilhado entre
     todos os diagramas futuros — adicionar um ícone uma vez beneficia todas as sessões depois)

## Studio (frontend local)

Alternativa ao fluxo acima quando faz mais sentido montar/ajustar visualmente em vez de editar o
YAML à mão: `npm run studio -- caminho/do/arquivo.yaml` (ver [docs/STUDIO.md](./docs/STUDIO.md)).
Duas coisas a ter em mente ao usar ou revisar um diagrama que passou pelo Studio:

- Um `rank`/`order` no YAML pode ter vindo de um **drag no Studio**, não de edição manual — o
  Studio grava esses hints automaticamente ao reordenar (e tenta removê-los de novo quando o
  motor já calcularia o mesmo valor sozinho). Não assuma que todo hint presente é intencional só
  porque está lá; a regra "válvula de escape, use só se o automático ficar ruim" (acima) ainda
  vale — se parecer desnecessário, pode simplesmente apagar e rodar `npm run diagram` de novo
  para conferir.
- Se adicionar um ícone novo (`npm run icons -- add ...`) com o Studio **já aberto**, reinicie o
  servidor dele — o catálogo de ícones é carregado em memória uma única vez ao subir; recarregar
  só a página no navegador não é suficiente para o ícone novo aparecer no seletor.

## Comandos úteis

```bash
npm run diagram -- arquivo.yaml [-o base] [-f svg,png] [--scale 2] [--validate]
npm run example      # regera examples/intera-bff, examples/showcase e examples/icon-cards
npm run check        # typecheck + testes (rode depois de mexer em src/)
npm run schema       # regera schema/diagram.schema.json a partir de src/schema/schema.ts
npm run icons -- search|add|list|check|preview   # ver "icone nao esta no catalogo" acima
npm run studio -- arquivo.yaml [--port N] [--no-open] [--root dir]   # frontend local, ver docs/STUDIO.md
```

## Se for mexer no código do gerador (`src/`)

Leia [docs/LAYOUT.md](./docs/LAYOUT.md) antes — explica o algoritmo (rank/ordem/posicionamento/
roteamento) o suficiente para não reimplementar nada às cegas. Depois de qualquer mudança, rode
`npm run check` (inclui `tests/golden.test.ts`, que trava o SVG de cada exemplo/diagrama byte a
byte — é a garantia real de "não quebrei nada que já existia") e `npm run example`, e confira
que `git status` não mostra diff nos `.svg`/`.png` de `examples/` (determinismo quebrado é
regressão).

## Se for mexer no código do Studio (`studio/`)

Leia [docs/STUDIO.md](./docs/STUDIO.md) antes — arquitetura (server/shared/client), por que é um
pacote `npm` separado, e por que a paridade com o CLI (mesmo `renderDiagramSource`, nunca
reimplementado) é inegociável. Depois de qualquer mudança, rode `npm --prefix studio run check`
(typecheck + testes do pacote, isolado da raiz) **e** `npm run check` na raiz (confirma que o
motor core continua intocado). Se mexer em `shared/yaml-edit.ts` ou `shared/drop-apply.ts`
(edição cirúrgica do YAML / cálculo de placements do drag), rode os testes exaustivos desses
arquivos com atenção — são a garantia de que o Studio nunca corrompe um YAML nem quebra a
garantia de zero sobreposição do motor core.

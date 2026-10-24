# Algoritmo de layout e roteamento

Referência de manutenção do motor de desenho. Para o formato de entrada, ver
[NOTATION.md](./NOTATION.md).

Tudo é determinístico (sem `Math.random`/`Date`): o mesmo YAML sempre produz o mesmo SVG,
byte a byte (garantido por `tests/render.test.ts`). Toda medida geométrica é múltipla de
**8px** (`GRID`, em `src/theme/theme.ts`).

## 1. Tamanho dos nodes (`src/layout/size.ts`)

1. Mede a largura natural de `label`/`tech`/`caption` (sem quebra), com a fonte Inter real via
   `opentype.js` (`src/text/measure.ts`) — não uma tabela de largura média de caractere.
2. `contentW = clamp(maior largura natural, 136, 216)`.
3. Quebra `label` (máx. 3 linhas) e `tech` (máx. 2 linhas) nessa largura, com reticências se
   ainda não couber.
4. `shape.outerSize(contentW, contentH)` converte a caixa de conteúdo no tamanho externo do
   node, de acordo com a forma (ver `src/shapes/*.ts` — cada forma declara seus próprios
   insets/proporções).
5. Arredonda para cima em múltiplos de 8 (`ceil8`).

### 1b. Card com ícone (`src/layout/icon-card.ts`)

Quando `node.icon` está resolvido, o tamanho e a geometria do node não vêm de `Shape.outerSize`
— vêm inteiramente de `computeIconCard`, que calcula a posição de cada elemento (tile, linhas
de texto, badge livre, divisor) explicitamente, em vez de uma única `contentBox`. A forma
(`src/shapes/card.ts`, `iconCardShape`) só desenha o corpo (retângulo com a cor do status) e o
contorno para roteamento — o conteúdo rico é desenhado à parte em `render/node.ts`, a partir
dessa geometria.

**Largura:**
1. `textW = clamp(maior largura natural entre caption/label/slug/tech/pílula do badge, 112, 184)`
   (`ICON_CARD.textWMin/textWMax`).
2. `rawW = padX + tile + gapTileText + textW + padX` (14 + 48 + 12 + textW + 14).
3. `w = ceil8(rawW)` — entre 200 e 272px.

**Altura da pilha de texto** (coluna ao lado do tile, alinhada à esquerda — diferente do modo
forma, que é centralizado):
- `stackH = caption + 2 + label(n linhas) + [2 + slug] + [4 + tech(n linhas)] + [6 + badge(18px)]`
  (cada bloco só soma seu gap se tiver conteúdo).
- `topRowH = max(tile (48), stackH)` — o tile e a pilha de texto ficam centralizados
  verticalmente nessa linha.

**Subtitle** (bloco separado, abaixo de um divisor, ocupando a largura total do card):
- Quebrado em `innerW = w - padX*2`, até 3 linhas (`ICON_CARD.subtitleMaxLines`).
- Bloco: `dividerGap + 1 (linha) + dividerGap + linhas × subtitleLH`.

**Altura final:** `h = ceil8(max(padY + topRowH + blocoSubtitle + padY, minHeight (72)))`; a
sobra do `ceil8` é dividida igualmente entre o topo e a base (mantém o conteúdo centralizado
verticalmente dentro do card).

**Ícone:** desenhado como um `<svg>` aninhado (`render/icon.ts`) dentro de um tile branco de
48×48 com borda cinza clara, o ícone ocupando 36×36 centralizado (folga de 6px) — o `viewBox`
usa `left/top/width/height` exatamente como vêm do catálogo (`assets/icons/catalog.json`), sem
reescalar manualmente; o `preserveAspectRatio` padrão do SVG centraliza e encaixa ícones não
quadrados (ex.: `go`, que é bem mais largo que alto). Os `id="__ID__n"` normalizados no
catálogo são prefixados por `node.id` na renderização (`ic-<nodeId>-N`), para que o mesmo
ícone usado em vários nodes do mesmo documento não colida (gradientes/máscaras referenciados
por `url(#...)`/`href="#..."` ficam únicos por node).

O tile é sempre branco — um logo colorido direto sobre o fundo verde/âmbar do status (sólido,
baixo contraste) ficaria "sujo"; o tile isola o ícone e o fundo do card continua comunicando o
status normalmente.

## 2. Árvore de containers (`src/layout/tree.ts`)

A raiz (`ROOT`) e cada `group` formam uma árvore (grupos podem aninhar via `parent`, até 3
níveis). Uma aresta entre dois nodes em containers diferentes é **elevada** até o container
ancestral comum mais profundo (LCA) — nesse nível, ela conecta os dois *itens* (node ou
subgrupo) que descem até cada lado, não os nodes originais. Isso é o que permite ao layout
decidir rank/ordem por grupo em vez de misturar tudo num grafo só.

## 3. Rank — coluna (LR) ou linha (TB) (`src/layout/rank.ts`)

Por container, processado em pós-ordem (filhos antes do pai, já que o tamanho de um grupo
depende de seus filhos estarem posicionados primeiro):

1. **Quebra de ciclos:** DFS em ordem de `declIndex`; uma aresta que fecha ciclo (aponta para
   um item ainda na pilha) é invertida só para efeito de rank.
2. **Longest-path:** rank = `max(rank dos predecessores) + 1`; fontes em 0.
3. **Hints (`rank`/`order` no YAML) vencem** — fixam o item, ignorando o cálculo automático.
4. **Puxar fontes:** item sem predecessor mas com sucessor é puxado para `min(rank dos
   sucessores) - 1`, evitando uma coluna 0 cheia de nodes "soltos".
5. Reindexado para `0..k` sem buracos.

## 4. Ordem dentro da coluna (`src/layout/order.ts`)

Sweeps alternados de baricentro (4 iterações, iniciando para frente), guardando a ordenação com
menos cruzamentos contados após cada sweep. Hints de `order` explícito travam a ordem daquele
rank (pula o baricentro nele).

## 5. Posicionamento (`src/layout/place.ts`)

Eixos abstratos `main` (direção do fluxo: x em LR, y em TB) e `cross` (perpendicular):

- **Gap entre colunas:** olha as arestas elevadas que atravessam aquele gap (mesmo as que saltam
  mais de uma coluna) e usa a maior largura de rótulo entre elas para abrir espaço — sem aresta
  cruzando, gap mínimo fixo.
- **Compactação no eixo cross — a garantia central de "sem sobreposição":** processa os itens de
  cada coluna em ordem; cada um é posicionado no `max(posição desejada pelos vizinhos da coluna
  anterior, cursor)`, e o cursor avança sempre por `tamanho + gap`. Como a posição nunca recua,
  dois itens da mesma coluna **nunca** se sobrepõem, por construção — não é uma checagem a
  posteriori.
- Grupos recebem padding (`GROUP_STYLE.padding`) + uma faixa de título
  (`GROUP_STYLE.titleBarHeight`) somados ao conteúdo.
- Coordenadas absolutas resolvidas top-down a partir da raiz (`resolveAbsolute` em
  `src/layout/layout.ts`), depois que todos os containers já têm tamanho calculado.

Verificado em runtime (CLI, a cada geração) e em teste (`tests/layout.test.ts`, incl. um grafo
de 30 nodes com seed fixa em `tests/fixtures/stress.ts`) via `src/verify/invariants.ts`.

## 6. Roteamento ortogonal (`src/route/*.ts`)

1. **Portas (`ports.ts`):** o lado de saída/entrada de cada aresta é decidido pela posição
   relativa dos centros dos dois nodes (ver NOTATION.md — mesma regra, espelhada em TB). Dentro
   de um lado, as portas das várias arestas são ordenadas pela posição do outro extremo e
   distribuídas na faixa central (70%) do lado. O ponto final de cada porta não é a borda do
   retângulo nominal — é a interseção real com `shape.outline()` (via `rayHitPolygon`), para que
   a linha saia exatamente do contorno visual (cilindro, nuvem, hexágono...).

2. **Grade (`grid.ts`):** células de 8px; uma célula é obstáculo se seu centro cair dentro do
   `bounds` de algum node inflado em 12px (`NODE_INFLATE`).

3. **Transição porta↔grade:** como o ponto de porta é fracionário (vem do contorno real da
   forma) e o centro de célula é sempre múltiplo de 8, a transição usa **dois segmentos
   ortogonais** (`transitionPoint` em `route.ts`): um avança na direção da normal até a coluna/
   linha da célula alvo, o outro ajusta a coordenada perpendicular até o centro da célula — nunca
   um segmento diagonal. O comprimento desse "stub" é calculado dinamicamente por porta
   (`stubLength`), não fixo: precisa ser grande o bastante para escapar do próprio `bounds`
   inflado do node de origem/destino, o que varia bastante para formas "afuniladas" como a nuvem.

4. **A\* (`astar.ts`):** estado `(célula, direção de chegada)`, para poder penalizar curvas
   (`ROUTE_COST.turn`). Busca primeiro numa caixa restrita ao redor das duas portas (mais rápido
   nos casos comuns); se falhar, tenta no grid inteiro antes de desistir. Heap binário próprio,
   desempate determinístico por ordem de inserção.

5. **Custos:** passo base 1, virada +6, reentrar numa célula já usada por outra aresta +10 (afasta
   rotas paralelas). Sem heurística de faixa de grupo/cruzamento perpendicular nesta versão —
   ver "Limitações conhecidas" abaixo.

6. **Ordem de roteamento e uso:** arestas mais curtas (distância Manhattan entre portas) primeiro;
   cada célula usada é registrada e penaliza reuso pelas arestas seguintes.

7. **Pós-processamento:** pontos colineares são removidos (`simplifyCollinear`); o `render/edge.ts`
   desenha a polilinha final com cantos arredondados (raio 8, limitado à metade de cada segmento).

## 7. Rótulos de aresta (`src/route/labels.ts`)

Para cada aresta, tenta encaixar a caixa do rótulo (`PROTOCOLO · rótulo`) num ponto candidato:
segmentos horizontais por comprimento decrescente, depois os verticais; em cada segmento,
`t ∈ [0.5, 0.33, 0.67, 0.2, 0.8]`. Um candidato é válido se não colide com nenhum `node.bounds`,
faixa de título de grupo ou rótulo já posicionado (margem de 4px). **Fallback garantido:** sem
posição válida, vira um marcador circular numerado ("N1") mais uma linha na seção "Notas de
conexão" do rodapé (`render/notes.ts`) — rótulo e node nunca se sobrepõem, mesmo em diagramas
densos.

## Limitações conhecidas (próximos incrementos, se necessário)

- Sem "quebra de coluna alta" (>8 itens numa coluna não é subdividida automaticamente) — use os
  hints `rank`/`order` manualmente nesse caso.
- O custo de roteamento não penaliza explicitamente atravessar um grupo que não contém nenhum
  dos extremos da aresta, nem a faixa de título — na prática o A* já tende a contornar por serem
  obstáculos dos próprios nodes vizinhos, mas não há garantia formal.
- Duas arestas paralelas na mesma pista por mais de ~16px não são ativamente separadas além do
  custo de reuso (`ROUTE_COST.reuseSameOrientation`).

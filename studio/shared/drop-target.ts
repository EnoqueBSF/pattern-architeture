import type { ViewItem } from './types.js';

export interface DropTarget {
  /** container (group id, ou o rootId passado) onde o item cairia */
  container: string;
  /** valor de rank onde o item cairia -- sempre um rank ja existente no container (ou 0 se o container estiver vazio) */
  rank: number;
  /** posicao (0-based) de insercao entre os itens desse rank/container: 0 = antes de todos, length = depois de todos */
  orderIndex: number;
}

interface InferOpts {
  items: ViewItem[];
  draggedId: string;
  direction: 'LR' | 'TB';
  rootId: string;
  /** posicao do ponteiro em coordenadas logicas (mesmo espaco de ViewItem.x/y, sem o deslocamento bodyY) */
  point: { x: number; y: number };
}

function isInside(item: ViewItem, point: { x: number; y: number }): boolean {
  return point.x >= item.x && point.x <= item.x + item.w && point.y >= item.y && point.y <= item.y + item.h;
}

/** ids do item arrastado e de todos os seus descendentes -- relevante quando o item arrastado e um grupo: nao se pode soltar dentro de si mesmo nem de um subgrupo proprio. */
function excludedIds(items: ViewItem[], draggedId: string): Set<string> {
  const excluded = new Set([draggedId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const it of items) {
      if (!excluded.has(it.id) && excluded.has(it.container)) {
        excluded.add(it.id);
        changed = true;
      }
    }
  }
  return excluded;
}

function centerOf(item: Pick<ViewItem, 'x' | 'y' | 'w' | 'h'>, axis: 'x' | 'y'): number {
  return axis === 'x' ? item.x + item.w / 2 : item.y + item.h / 2;
}

/**
 * Infere onde um item cairia -- container/rank/posicao -- a partir da posicao (logica, no espaco
 * do SVG) do ponteiro durante o arrasto. O motor recalcula o diagrama inteiro a cada drop (ver
 * CLAUDE.md do repo): esta funcao so decide a INTENCAO do usuario, nunca calcula geometria final.
 *
 * Decisao de escopo da v1: o item sempre cai num rank JA EXISTENTE no container de destino (o mais
 * proximo da posicao do ponteiro no eixo principal) -- nunca cria uma coluna/linha nova do zero.
 * Criar uma coluna vazia continua sendo um ajuste manual (rank/order no YAML ou no formulario); a
 * maioria das reordenacoes (mover para outra coluna existente, mudar a posicao dentro dela, mudar
 * de grupo) ja fica coberta.
 */
export function inferDropTarget(opts: InferOpts): DropTarget {
  const { items, draggedId, direction, rootId, point } = opts;
  const excluded = excludedIds(items, draggedId);
  const mainAxis = direction === 'LR' ? 'x' : 'y';
  const crossAxis = direction === 'LR' ? 'y' : 'x';

  const groupCandidates = items
    .filter((it) => it.kind === 'group' && !excluded.has(it.id) && isInside(it, point))
    .sort((a, b) => b.depth - a.depth); // o mais aninhado (maior depth) vence quando grupos se sobrepoem
  const container = groupCandidates[0]?.id ?? rootId;

  const siblings = items.filter((it) => it.container === container && !excluded.has(it.id));
  if (siblings.length === 0) return { container, rank: 0, orderIndex: 0 };

  const ranks = [...new Set(siblings.map((it) => it.rank))].sort((a, b) => a - b);
  const rankCenters = ranks.map((rank) => {
    const inRank = siblings.filter((it) => it.rank === rank);
    const sum = inRank.reduce((acc, it) => acc + centerOf(it, mainAxis), 0);
    return sum / inRank.length;
  });

  const pointMain = mainAxis === 'x' ? point.x : point.y;
  let rankIndex = 0;
  let bestDist = Infinity;
  rankCenters.forEach((center, i) => {
    const dist = Math.abs(center - pointMain);
    if (dist < bestDist) {
      bestDist = dist;
      rankIndex = i;
    }
  });
  const chosenRank = ranks[rankIndex]!;

  const inChosenRank = siblings.filter((it) => it.rank === chosenRank).sort((a, b) => a.order - b.order);
  const pointCross = crossAxis === 'x' ? point.x : point.y;
  let orderIndex = inChosenRank.length;
  for (let i = 0; i < inChosenRank.length; i++) {
    if (pointCross < centerOf(inChosenRank[i]!, crossAxis)) {
      orderIndex = i;
      break;
    }
  }

  return { container, rank: chosenRank, orderIndex };
}

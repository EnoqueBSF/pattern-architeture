import { useEffect, useRef, useState } from 'react';
import { inferDropTarget, type DropTarget } from '../../shared/drop-target';
import type { LayoutView, ViewItem } from '../../shared/types';
import { useStore } from '../store';

type Axis = 'x' | 'y';

interface DragState {
  item: ViewItem;
  label: string;
  /** deslocamento do clique inicial em relacao ao canto superior-esquerdo do item (coords logicas) -- mantem o ghost "grudado" no ponto onde o usuario clicou, em vez de saltar para o canto */
  grabDx: number;
  grabDy: number;
  /** posicao do ponteiro no inicio do drag (coords logicas) -- usada para distinguir um clique de um arrasto de verdade */
  startX: number;
  startY: number;
  /** posicao atual do ponteiro, em coordenadas logicas (mesmo espaco de ViewItem.x/y, incluindo bodyY) */
  pointerX: number;
  pointerY: number;
  dropTarget: DropTarget | null;
}

/** abaixo disso (em px logicos), um mousedown+mouseup conta como clique, nao como arrasto -- nao chama /api/drop */
const DRAG_THRESHOLD = 6;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function mainStartOf(it: Pick<ViewItem, 'x' | 'y'>, axis: Axis): number {
  return axis === 'x' ? it.x : it.y;
}
function mainSizeOf(it: Pick<ViewItem, 'w' | 'h'>, axis: Axis): number {
  return axis === 'x' ? it.w : it.h;
}
function crossEndOf(it: Pick<ViewItem, 'x' | 'y' | 'w' | 'h'>, crossAxis: Axis): number {
  return mainStartOf(it, crossAxis) + mainSizeOf(it, crossAxis);
}

const BAR_THICKNESS = 4;
const GAP = 6;

/** Barra fina indicando onde o item cairia: antes/depois do vizinho mais proximo no rank escolhido, ou ancorada no container quando o rank/container esta vazio. */
function computeIndicatorRect(view: LayoutView, drag: DragState): Rect {
  const { dropTarget, item } = drag;
  if (!dropTarget) return { x: 0, y: 0, w: 0, h: 0 };
  const { container, rank, orderIndex } = dropTarget;
  const mainAxis: Axis = view.direction === 'LR' ? 'x' : 'y';
  const crossAxis: Axis = mainAxis === 'x' ? 'y' : 'x';

  const siblings = view.items
    .filter((it) => it.container === container && it.rank === rank && it.id !== item.id)
    .sort((a, b) => a.order - b.order);
  const before = siblings[orderIndex - 1];
  const after = siblings[orderIndex];
  const ref = before ?? after;

  let crossPos: number;
  if (before && after) {
    crossPos = (crossEndOf(before, crossAxis) + mainStartOf(after, crossAxis)) / 2 - BAR_THICKNESS / 2;
  } else if (after) {
    crossPos = mainStartOf(after, crossAxis) - GAP - BAR_THICKNESS;
  } else if (before) {
    crossPos = crossEndOf(before, crossAxis) + GAP;
  } else {
    const containerItem = view.items.find((it) => it.id === container);
    crossPos = containerItem ? mainStartOf(containerItem, crossAxis) + view.titleBarHeight + GAP : GAP;
  }

  const mainStart = ref ? mainStartOf(ref, mainAxis) : GAP;
  const mainSize = ref ? mainSizeOf(ref, mainAxis) : mainSizeOf(item, mainAxis);

  return mainAxis === 'x' ? { x: mainStart, y: crossPos, w: mainSize, h: BAR_THICKNESS } : { x: crossPos, y: mainStart, w: BAR_THICKNESS, h: mainSize };
}

interface DragLayerProps {
  view: LayoutView;
}

/**
 * Overlay interativo por cima do SVG (que e sempre desenhado pelo motor, nunca reimplementado
 * aqui): um retangulo invisivel por item habilita o arrasto; durante o drag, mostra um "ghost" do
 * card seguindo o ponteiro e uma barra indicando onde ele cairia (container/rank/posicao), ambos
 * so visuais -- a aplicacao real (gravar no YAML) e o passo seguinte (/api/drop).
 */
export function DragLayer({ view }: DragLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  useEffect(() => {
    if (!drag) return;

    // coordenadas "de tela" do canvas (so convertidas pelo zoom) -- o mesmo espaco usado para
    // posicionar handles/ghost (item.y + view.bodyY). ViewItem.x/y (usado por inferDropTarget) NAO
    // inclui bodyY, entao o y precisa ser descontado antes de comparar com os itens do layout.
    function toCanvasPoint(e: MouseEvent): { x: number; y: number } {
      const rect = layerRef.current!.getBoundingClientRect();
      const { zoom } = useStore.getState();
      return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
    }

    function onMouseMove(e: MouseEvent) {
      const { render, meta } = useStore.getState();
      const currentView = render.result?.ok ? render.result.view : null;
      const point = toCanvasPoint(e);
      setDrag((prev) => {
        if (!prev) return prev;
        const dropTarget = currentView
          ? inferDropTarget({
              items: currentView.items,
              draggedId: prev.item.id,
              direction: currentView.direction,
              rootId: meta?.root ?? '__root__',
              point: { x: point.x, y: point.y - currentView.bodyY },
            })
          : null;
        return { ...prev, pointerX: point.x, pointerY: point.y, dropTarget };
      });
    }

    function onMouseUp() {
      const current = dragRef.current;
      setDrag(null);
      if (!current) return;

      const movedEnough = Math.hypot(current.pointerX - current.startX, current.pointerY - current.startY) >= DRAG_THRESHOLD;
      if (!movedEnough) {
        // clique sem arrasto de verdade -- nao polui o YAML com hints; sincroniza a selecao com a
        // Outline/Inspector em vez disso, como se tivesse clicado no item ali
        useStore.getState().select(current.item.kind === 'node' ? { kind: 'node', id: current.item.id } : { kind: 'group', id: current.item.id });
        return;
      }
      if (!current.dropTarget) return;

      const { source } = useStore.getState();
      const { container, rank, orderIndex } = current.dropTarget;
      setDropError(null);
      fetch('/api/drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, draggedId: current.item.id, container, rank, orderIndex }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { issues?: { message: string }[] } | null;
            const detail = body?.issues?.map((i) => i.message).join('; ');
            throw new Error(detail || `falha ao mover (HTTP ${res.status})`);
          }
          const body = (await res.json()) as { source: string };
          useStore.getState().setSource(body.source, { immediate: true });
        })
        .catch((err: unknown) => setDropError(err instanceof Error ? err.message : 'falha ao mover'));
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrag(null);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- so deve reatar quando um drag comeca/termina; dentro dos handlers le o estado atual via useStore.getState()
  }, [drag !== null]);

  function startDrag(item: ViewItem, e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = layerRef.current!.getBoundingClientRect();
    const { zoom, raw } = useStore.getState();
    const pointerX = (e.clientX - rect.left) / zoom;
    const pointerY = (e.clientY - rect.top) / zoom;
    const node = item.kind === 'node' ? raw?.nodes.find((n) => n.id === item.id) : raw?.groups?.find((g) => g.id === item.id);
    const label = (node?.label as string | undefined) ?? item.id;
    setDropError(null);
    setDrag({ item, label, grabDx: pointerX - item.x, grabDy: pointerY - item.y, startX: pointerX, startY: pointerY, pointerX, pointerY, dropTarget: null });
  }

  const indicatorRect = drag?.dropTarget ? computeIndicatorRect(view, drag) : null;

  return (
    <div className="drag-layer" ref={layerRef}>
      {view.items.map((item) => (
        <div
          key={item.id}
          data-item-id={item.id}
          // um grupo so e arrastavel pela faixa de titulo -- o resto da area dele fica livre para
          // os handles dos nodes filhos (que vem antes no array, "por baixo" no DOM); sem essa
          // restricao, o handle do grupo (desenhado por cima) bloquearia o arrasto de qualquer node
          // dentro dele
          className={`drag-handle${item.kind === 'group' ? ' drag-handle-group' : ''}${drag?.item.id === item.id ? ' dragging-source' : ''}`}
          style={{ left: item.x, top: item.y + view.bodyY, width: item.w, height: item.kind === 'group' ? view.titleBarHeight : item.h }}
          onMouseDown={(e) => startDrag(item, e)}
        />
      ))}

      {drag && (
        <div className="drag-ghost" style={{ left: drag.pointerX - drag.grabDx, top: drag.pointerY - drag.grabDy + view.bodyY, width: drag.item.w, height: drag.item.h }}>
          {drag.label}
        </div>
      )}

      {drag && indicatorRect && <div className="drop-indicator" style={{ left: indicatorRect.x, top: indicatorRect.y + view.bodyY, width: indicatorRect.w, height: indicatorRect.h }} />}

      {dropError && (
        <div className="drop-error-toast">
          {dropError}
          <button type="button" onClick={() => setDropError(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}

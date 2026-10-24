import { useEffect, useRef } from 'react';
import { DragLayer } from './DragLayer';
import { useStore } from '../store';

export function DiagramCanvas() {
  const svgHostRef = useRef<HTMLDivElement>(null);
  const render = useStore((s) => s.render);
  const zoom = useStore((s) => s.zoom);

  useEffect(() => {
    if (!svgHostRef.current) return;
    if (render.result?.ok) {
      svgHostRef.current.innerHTML = render.result.svg;
    }
    // quando invalido/erro, mantem o ultimo SVG renderizado no DOM (nao limpa) -- so aplica opacidade via classe
  }, [render.result]);

  const dimmed = render.status === 'invalid' || render.status === 'error';
  const view = render.result?.ok ? render.result.view : null;

  return (
    <div className="canvas-viewport">
      <div className={`canvas-host${dimmed ? ' canvas-dimmed' : ''}`} style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
        <div ref={svgHostRef} />
        {view && !dimmed && <DragLayer view={view} />}
      </div>
    </div>
  );
}

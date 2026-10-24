import type { RenderResult } from '../shared/types';

export interface RenderSchedulerCallbacks {
  onResult: (result: RenderResult) => void;
  onError: (message: string) => void;
}

const MIN_DEBOUNCE_MS = 120;
const MAX_DEBOUNCE_MS = 1500;

/**
 * Agenda chamadas a POST /api/render com debounce adaptativo (ajustado ao tempo de resposta
 * observado) e single-flight: nunca mais de uma requisicao em voo; se uma fonte mais nova chega
 * enquanto uma requisicao esta em andamento, so a mais recente e disparada quando ela terminar.
 * Respostas desatualizadas (uma fonte mais nova ja foi agendada nesse meio-tempo) sao descartadas.
 */
export function createRenderScheduler(callbacks: RenderSchedulerCallbacks) {
  let seq = 0;
  let inFlight = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let currentDebounceMs = MIN_DEBOUNCE_MS;
  let latestSource = '';

  async function runRender(): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    const mySeq = seq;
    const source = latestSource;
    const start = performance.now();

    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      const result = (await res.json()) as RenderResult;
      if (mySeq === seq) {
        const ms = result.ok ? result.ms : performance.now() - start;
        currentDebounceMs = Math.min(Math.max(Math.round(ms), MIN_DEBOUNCE_MS), MAX_DEBOUNCE_MS);
        callbacks.onResult(result);
      }
    } catch (err) {
      if (mySeq === seq) callbacks.onError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight = false;
      if (seq !== mySeq) void runRender(); // uma fonte mais nova chegou durante a requisicao
    }
  }

  return {
    schedule(source: string, opts: { immediate?: boolean } = {}): void {
      seq++;
      latestSource = source;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (opts.immediate) {
        void runRender();
      } else {
        debounceTimer = setTimeout(() => void runRender(), currentDebounceMs);
      }
    },
  };
}

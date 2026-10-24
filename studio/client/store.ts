import { create } from 'zustand';
import { parse as parseYaml } from 'yaml';
import { createRenderScheduler } from './render-scheduler';
import { toRawDiagram, type RawDiagramLike } from '../shared/ops';
import { applyOps as applyYamlOps, type Op } from '../shared/yaml-edit';
import type { Meta, RenderResult } from '../shared/types';

export interface StudioFile {
  path: string;
  hash: string;
}

export type RenderStatus = 'idle' | 'pending' | 'ok' | 'invalid' | 'error';

export interface RenderState {
  status: RenderStatus;
  result?: RenderResult;
  error?: string;
}

export type Selection = { kind: 'node'; id: string } | { kind: 'group'; id: string } | { kind: 'edge'; index: number } | null;

export type FileDialogMode = 'open' | 'save-as' | 'new' | null;

export interface SaveConflict {
  currentHash: string;
}

const HISTORY_LIMIT = 100;

interface StudioState {
  file: StudioFile | null;
  source: string;
  savedSource: string;
  history: { past: string[]; future: string[] };
  render: RenderState;
  selection: Selection;
  zoom: number;
  meta: Meta | null;

  fileDialogMode: FileDialogMode;
  saving: boolean;
  saveConflict: SaveConflict | null;
  saveError: string | null;

  /** parsed e um "melhor esforco": undefined se o YAML nao parseia, sem exigir que seja valido contra o schema. */
  parsed: unknown;
  /** forma minima (nodes/groups/edges com ids) derivada de `parsed`, para os formularios calcularem Ops; null se o YAML nao tem nem essa forma minima. */
  raw: RawDiagramLike | null;

  setSource: (source: string, opts?: { immediate?: boolean; pushHistory?: boolean }) => void;
  applyOps: (ops: Op[]) => void;
  select: (sel: Selection) => void;
  setZoom: (zoom: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  openFile: (file: StudioFile, source: string) => void;
  newFromTemplate: (source: string) => void;
  markSaved: (path: string, hash: string) => void;
  isDirty: () => boolean;
  setMeta: (meta: Meta) => void;

  openFileDialog: (mode: 'open' | 'save-as' | 'new') => void;
  closeFileDialog: () => void;
  saveFile: (targetPath?: string, opts?: { overwrite?: boolean }) => Promise<void>;
  resolveConflict: (action: 'overwrite' | 'reload') => Promise<void>;
  dismissSaveError: () => void;
}

function tryParse(source: string): unknown {
  try {
    return parseYaml(source);
  } catch {
    return undefined;
  }
}

export const useStore = create<StudioState>((set, get) => {
  const scheduler = createRenderScheduler({
    onResult: (result) => set({ render: { status: result.ok ? 'ok' : 'invalid', result } }),
    onError: (message) => set({ render: { status: 'error', error: message } }),
  });

  function applySource(source: string, opts: { immediate?: boolean; pushHistory?: boolean } = {}) {
    const prev = get().source;
    const pushHistory = opts.pushHistory !== false && prev !== source;
    const parsed = tryParse(source);
    set((s) => ({
      source,
      parsed,
      raw: toRawDiagram(parsed),
      render: { status: 'pending' },
      history: pushHistory ? { past: [...s.history.past, prev].slice(-HISTORY_LIMIT), future: [] } : s.history,
    }));
    scheduler.schedule(source, { immediate: opts.immediate });
  }

  async function putFile(path: string, source: string, opts: { baseHash?: string; overwrite?: boolean }) {
    const res = await fetch('/api/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, source, ...opts }),
    });
    const body = (await res.json()) as unknown;
    return { ok: res.ok, status: res.status, body };
  }

  return {
    file: null,
    source: '',
    savedSource: '',
    history: { past: [], future: [] },
    render: { status: 'idle' },
    selection: null,
    zoom: 1,
    meta: null,
    fileDialogMode: null,
    saving: false,
    saveConflict: null,
    saveError: null,
    parsed: undefined,
    raw: null,

    setSource: (source, opts) => applySource(source, opts),

    applyOps: (ops) => {
      if (ops.length === 0) return;
      const { text } = applyYamlOps(get().source, ops);
      applySource(text);
    },

    select: (sel) => set({ selection: sel }),
    setZoom: (zoom) => set({ zoom: Math.min(2, Math.max(0.25, zoom)) }),
    setMeta: (meta) => set({ meta }),

    undo: () => {
      const { history, source } = get();
      const prev = history.past[history.past.length - 1];
      if (prev === undefined) return;
      const parsed = tryParse(prev);
      set({
        source: prev,
        parsed,
        raw: toRawDiagram(parsed),
        history: { past: history.past.slice(0, -1), future: [source, ...history.future] },
        render: { status: 'pending' },
      });
      scheduler.schedule(prev, { immediate: true });
    },
    redo: () => {
      const { history, source } = get();
      const next = history.future[0];
      if (next === undefined) return;
      const parsed = tryParse(next);
      set({
        source: next,
        parsed,
        raw: toRawDiagram(parsed),
        history: { past: [...history.past, source], future: history.future.slice(1) },
        render: { status: 'pending' },
      });
      scheduler.schedule(next, { immediate: true });
    },
    canUndo: () => get().history.past.length > 0,
    canRedo: () => get().history.future.length > 0,

    openFile: (file, source) => {
      const parsed = tryParse(source);
      set({
        file,
        source,
        savedSource: source,
        parsed,
        raw: toRawDiagram(parsed),
        history: { past: [], future: [] },
        render: { status: 'pending' },
        selection: null,
        fileDialogMode: null,
        saveConflict: null,
        saveError: null,
      });
      scheduler.schedule(source, { immediate: true });
    },
    newFromTemplate: (source) => {
      const parsed = tryParse(source);
      set({
        file: null,
        source,
        savedSource: '',
        parsed,
        raw: toRawDiagram(parsed),
        history: { past: [], future: [] },
        render: { status: 'pending' },
        selection: null,
        fileDialogMode: null,
        saveConflict: null,
        saveError: null,
      });
      scheduler.schedule(source, { immediate: true });
    },
    markSaved: (path, hash) => {
      set((s) => ({ file: { path, hash }, savedSource: s.source }));
    },
    isDirty: () => get().source !== get().savedSource,

    openFileDialog: (mode) => set({ fileDialogMode: mode, saveError: null }),
    closeFileDialog: () => set({ fileDialogMode: null }),

    saveFile: async (targetPath, opts = {}) => {
      const { file, source } = get();
      const path = targetPath ?? file?.path;
      if (!path) {
        set({ fileDialogMode: 'save-as' });
        return;
      }
      set({ saving: true, saveError: null });
      try {
        const { ok, status, body } = await putFile(path, source, {
          baseHash: targetPath ? undefined : file?.hash,
          overwrite: opts.overwrite,
        });
        if (ok) {
          const result = body as { hash: string };
          set({ saving: false, fileDialogMode: null, saveConflict: null });
          get().markSaved(path, result.hash);
          return;
        }
        if (status === 409) {
          const result = body as { reason: 'conflict' | 'exists'; currentHash?: string };
          if (result.reason === 'conflict' && result.currentHash) {
            set({ saving: false, saveConflict: { currentHash: result.currentHash } });
            return;
          }
          set({ saving: false, saveError: 'Ja existe um arquivo nesse caminho. Escolha outro nome ou confirme a sobrescrita.' });
          return;
        }
        if (status === 422) {
          set({ saving: false, saveError: 'O diagrama esta invalido e nao pode ser salvo (corrija os problemas na barra de status).' });
          return;
        }
        set({ saving: false, saveError: `Falha ao salvar (HTTP ${status}).` });
      } catch (err) {
        set({ saving: false, saveError: err instanceof Error ? err.message : 'falha de rede ao salvar' });
      }
    },

    resolveConflict: async (action) => {
      const { file, saveConflict } = get();
      if (!file || !saveConflict) return;
      if (action === 'overwrite') {
        await get().saveFile(file.path, { overwrite: true });
        return;
      }
      // reload: descarta as mudancas locais e recarrega o arquivo do disco
      set({ saveConflict: null });
      const res = await fetch(`/api/file?path=${encodeURIComponent(file.path)}`);
      if (!res.ok) {
        set({ saveError: `Falha ao recarregar o arquivo (HTTP ${res.status}).` });
        return;
      }
      const body = (await res.json()) as { path: string; source: string; hash: string };
      get().openFile({ path: body.path, hash: body.hash }, body.source);
    },

    dismissSaveError: () => set({ saveError: null }),
  };
});

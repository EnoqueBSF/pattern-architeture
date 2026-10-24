import { useEffect } from 'react';
import { DiagramCanvas } from './canvas/DiagramCanvas';
import { ConflictDialog, SaveErrorBanner } from './dialogs/ConflictDialog';
import { FileDialog } from './dialogs/FileDialog';
import { TemplateDialog } from './dialogs/TemplateDialog';
import { YamlPanel } from './panels/YamlPanel';
import { Sidebar } from './sidebar/Sidebar';
import { StatusBar } from './StatusBar';
import type { Meta } from '../shared/types';
import { useStore } from './store';
import { Toolbar } from './Toolbar';

export function App() {
  const openFile = useStore((s) => s.openFile);
  const setMeta = useStore((s) => s.setMeta);

  useEffect(() => {
    async function load() {
      const metaRes = await fetch('/api/meta');
      const meta = (await metaRes.json()) as Meta;
      setMeta(meta);
      if (!meta.initialFile) return;

      const fileRes = await fetch(`/api/file?path=${encodeURIComponent(meta.initialFile)}`);
      if (!fileRes.ok) {
        console.error(`falha ao ler o arquivo inicial: HTTP ${fileRes.status}`);
        return;
      }
      const file = (await fileRes.json()) as { path: string; source: string; hash: string };
      openFile({ path: file.path, hash: file.hash }, file.source);
    }
    load().catch((err: unknown) => console.error(err));
  }, [openFile, setMeta]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useStore.getState().undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        useStore.getState().redo();
      } else if (key === 's') {
        e.preventDefault();
        void useStore.getState().saveFile();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <SaveErrorBanner />
      <div className="app-body">
        <Sidebar />
        <div className="app-main">
          <DiagramCanvas />
          <StatusBar />
        </div>
        <div className="app-side">
          <YamlPanel />
        </div>
      </div>
      <FileDialog />
      <TemplateDialog />
      <ConflictDialog />
    </div>
  );
}

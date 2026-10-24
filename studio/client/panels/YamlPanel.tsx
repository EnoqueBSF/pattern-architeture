import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { yaml } from '@codemirror/lang-yaml';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { parseDocument } from 'yaml';
import { useStore } from '../store';

/** Lint de sintaxe pura do YAML (erros do parser); issues de validacao do schema aparecem no Inspector. */
const yamlSyntaxLinter = linter((view): Diagnostic[] => {
  const text = view.state.doc.toString();
  const doc = parseDocument(text);
  return doc.errors.map((err) => {
    const [from, to] = err.pos ?? [0, Math.min(1, text.length)];
    const safeFrom = Math.max(0, Math.min(from, text.length));
    const safeTo = Math.max(safeFrom + 1, Math.min(to, text.length));
    return { from: safeFrom, to: Math.min(safeTo, text.length), severity: 'error', message: err.message };
  });
});

export function YamlPanel() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isExternalUpdate = useRef(false);
  const source = useStore((s) => s.source);
  const setSource = useStore((s) => s.setSource);

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: source,
      extensions: [
        lineNumbers(),
        lintGutter(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        yaml(),
        yamlSyntaxLinter,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isExternalUpdate.current) {
            setSource(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: "'SF Mono', Menlo, monospace" },
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- o editor e criado uma unica vez; sincronizacao de `source` e feita no efeito abaixo
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === source) return;
    isExternalUpdate.current = true;
    view.dispatch({ changes: { from: 0, to: current.length, insert: source } });
    isExternalUpdate.current = false;
  }, [source]);

  return <div className="yaml-panel" ref={hostRef} />;
}

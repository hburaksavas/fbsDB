// The only entry point to Monaco. Without loader.config({monaco}), the React
// wrapper downloads the editor from a CDN at runtime; here it comes from the
// application bundle. Import this lazily: it is too large for the startup chunk.
import { createElement, useEffect, useRef } from 'react';
import { DiffEditor as WrappedDiffEditor, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker.js?worker';

self.MonacoEnvironment = {
  getWorker: (_moduleId, label) => (label === 'json' ? new JsonWorker() : new EditorWorker()),
};

loader.config({ monaco });
// The native regression suites drive the editor through this global.
window.monaco = monaco;

export { default } from '@monaco-editor/react';

// The wrapper disposes the models before the diff widget on unmount, which Monaco
// reports as an uncaught error. This cleanup runs first and detaches them, so the
// wrapper finds no model to dispose and only disposes the widget.
export function DiffEditor({ onMount, ...props }) {
  const editorRef = useRef(null);
  useEffect(() => () => {
    const editor = editorRef.current;
    const models = editor?.getModel();
    if (!models) return;
    editor.setModel(null);
    models.original.dispose();
    models.modified.dispose();
  }, []);
  return createElement(WrappedDiffEditor, {
    ...props,
    onMount: (editor, instance) => {
      editorRef.current = editor;
      onMount?.(editor, instance);
    },
  });
}

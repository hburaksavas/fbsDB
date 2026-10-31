import { useRef, useSyncExternalStore } from 'react';
import { createDocumentSessions } from './documentSessions.js';

export function useDocumentSessions(initialTabs) {
  const storeRef = useRef(null);
  if (!storeRef.current) storeRef.current = createDocumentSessions(initialTabs());
  const documents = storeRef.current;
  const state = useSyncExternalStore(documents.subscribe, documents.getSnapshot, documents.getSnapshot);
  const active = state.tabs.find(tab => tab.id === state.activeTabId);
  return { documents, tabs: state.tabs, activeTabId: state.activeTabId,
    sql: active?.content ?? '', fileName: active?.name ?? 'Untitled.sql',
    filePath: active?.path ?? null, fileDirty: active?.dirty ?? false,
    fileConnectionProfileId: active?.connectionProfileId ?? null };
}

import { useRef, useSyncExternalStore } from 'react';
import { createResultSessions } from './resultSessions.js';

export function useResultSessions() {
  const ref = useRef(null);
  if (!ref.current) ref.current = createResultSessions();
  const results = ref.current;
  const tabResults = useSyncExternalStore(results.subscribe, results.getSnapshot, results.getSnapshot);
  return { results, tabResults };
}

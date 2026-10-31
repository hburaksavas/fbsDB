export function editorSessionState({ inactive, connected, connecting, executing, fetching, rendering, cancelling, transactionPending, exporting, readOnlyAnalysis, stage }) {
  if (connecting) return { key: 'busy', text: 'Connecting', icon: 'loading' };
  if (cancelling) return { key: 'busy', text: 'Cancelling', icon: 'loading' };
  if (exporting) return { key: 'busy', text: 'Exporting', icon: 'download' };
  if (fetching) return { key: 'busy', text: 'Fetching rows', icon: 'download' };
  if (executing) return { key: 'busy', text: stage || 'Running SQL', icon: 'run' };
  if (rendering) return { key: 'busy', text: 'Rendering results', icon: 'loading' };
  if (inactive) return { key: 'offline', text: 'Inactive', icon: 'offline' };
  if (!connected) return { key: 'offline', text: 'Disconnected', icon: 'offline' };
  if (readOnlyAnalysis) return {key:'connected',text:'Read-only analysis',icon:'database'};
  if (transactionPending) return { key: 'pending', text: 'Transaction pending', icon: 'pending' };
  return { key: 'connected', text: 'Connected', icon: 'database' };
}


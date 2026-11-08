import { useEffect, useMemo, useState } from 'react';
import { sendNativeCommand, subscribeNativeMessages } from './nativeBridge';
import { pathKey } from './workspaceTree';
import { buildReferenceIndex, mergeIndexSources } from './plsqlReferenceIndex.js';

function positionIn(content, offset) {
  const before = String(content || '').slice(0, offset), line = before.split('\n').length;
  return { lineNumber: line, column: offset - before.lastIndexOf('\n') };
}

// Reads the workspace sources once, lays the current text of open editors over them and builds the reference index.
// open(place) turns an index location into what the app navigates to: a file position, or an offset in the unsaved active editor.
export function useWorkspaceReferenceIndex({ root, document, documents, onOpen }) {
  const [state, setState] = useState(() => ({ busy: Boolean(root), files: [], skipped: [], truncated: false }));
  useEffect(() => {
    if (!root) return undefined;
    let request;
    const unsubscribe = subscribeNativeMessages(message => {
      if (message.requestId !== request) return;
      if (message.type === 'workspace.sources' && pathKey(message.sources.root) === pathKey(root)) setState({ ...message.sources, busy: false });
      else if (message.type.endsWith('.error') || message.type === 'error') setState({ busy: false, files: [], skipped: [], truncated: false, error: message.message || 'Workspace sources could not be read.' });
    });
    request = sendNativeCommand('workspace.sources', { root });
    if (!request) setState({ busy: false, files: [], skipped: [], truncated: false });
    return unsubscribe;
  }, [root]);
  const activePath = document?.path || `Unsaved: ${document?.title || 'SQL'}`;
  const sources = useMemo(() => mergeIndexSources(state.files, [...(documents || []).filter(item => pathKey(item.path || '') !== pathKey(activePath)), { path: activePath, content: document?.content || '', dirty: document?.dirty }]), [state.files, documents, document, activePath]);
  const index = useMemo(() => state.busy || state.error ? null : buildReferenceIndex(sources, { skipped: state.skipped || [], truncated: state.truncated }), [state.busy, state.error, sources, state.skipped, state.truncated]);
  const contents = useMemo(() => new Map(sources.map(file => [pathKey(file.path), file.content])), [sources]);
  const open = place => {
    if (!place?.path || place.path.startsWith('Unsaved: ')) { onOpen({ path: null, start: place?.start ?? 0 }); return; }
    onOpen({ path: place.path, start: place.start, ...positionIn(contents.get(pathKey(place.path)), place.start) });
  };
  return { busy: state.busy, error: state.error, index, activePath, open, unsaved: sources.filter(file => file.unsaved).length, hasWorkspace: Boolean(root) };
}

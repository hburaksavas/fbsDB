import { sendNativeCommand, subscribeNativeMessages } from './nativeBridge.js';
import { pathKey } from './workspaceTree.js';
import { buildReferenceIndex, mergeIndexSources } from './plsqlReferenceIndex.js';
import { usageByRoutine } from './projectUsage.js';

// Project usage for completion details, rebuilt at most every 30 seconds. The workspace sources are read through the
// same bounded native command as the call hierarchy; open editors add their current text.
const MAX_AGE = 30_000;
let cache = null;

function workspaceSources(root) {
  if (!root) return Promise.resolve({ files: [], skipped: [], truncated: false });
  return new Promise(resolve => {
    let request;
    const timer = setTimeout(() => { unsubscribe(); resolve({ files: [], skipped: [], truncated: false }); }, 10_000);
    const unsubscribe = subscribeNativeMessages(message => {
      if (message.requestId !== request) return;
      clearTimeout(timer); unsubscribe();
      resolve(message.type === 'workspace.sources' && pathKey(message.sources.root) === pathKey(root) ? message.sources : { files: [], skipped: [], truncated: false });
    });
    request = sendNativeCommand('workspace.sources', { root });
    if (!request) { clearTimeout(timer); unsubscribe(); resolve({ files: [], skipped: [], truncated: false }); }
  });
}

export function projectUsage({ root, documents }) {
  if (cache && cache.root === (root || null) && Date.now() - cache.at < MAX_AGE) return cache.promise;
  const promise = workspaceSources(root).then(sources => {
    const merged = mergeIndexSources(sources.files, documents);
    return usageByRoutine(buildReferenceIndex(merged), merged);
  }).catch(() => new Map());
  cache = { root: root || null, at: Date.now(), promise };
  return promise;
}

export function forgetProjectUsage() { cache = null; }

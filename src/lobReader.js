import { sendNativeCommand, subscribeNativeMessages } from './nativeBridge';
import { createLobBuffer } from './lobValues';

function readChunk(lobId, offset, count, tabId) {
  return new Promise((resolve, reject) => {
    let requestId = null;
    const unsubscribe = subscribeNativeMessages(message => {
      if (message?.type !== 'sql.lobChunk' || message.requestId !== requestId) return;
      unsubscribe();
      if (message.error) reject(new Error(message.error)); else resolve(message);
    });
    requestId = sendNativeCommand('sql.readLob', { lobId, offset, count, ...(tabId ? { tabId } : {}) });
    if (!requestId) { unsubscribe(); reject(new Error('Large values are read through the desktop host.')); }
  });
}

// Loads chunks into buffer until it is complete, `until` units are loaded, or signal aborts between chunks.
export async function loadLob(value, buffer = createLobBuffer(value), { until = Infinity, signal, onProgress, tabId } = {}) {
  if (!value.lobId) throw new Error('This large value can no longer be read. Run the query again to read it.');
  while (!buffer.complete && buffer.loaded < until) {
    if (signal?.aborted) break;
    const { offset, count } = buffer.next();
    buffer.add(await readChunk(value.lobId, offset, count, tabId));
    onProgress?.(buffer.loaded, value.length);
  }
  return buffer;
}

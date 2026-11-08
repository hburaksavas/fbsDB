// Moving a SQL tab to another application window. The database session stays
// in the desktop process; the tab's documents, session view state and fetched
// results travel as transfer text from one window's page to another's.
import { reviveOracleTemporal } from './oracleTemporal.js';
import { parseDraftSnapshot } from './draftRecovery.js';

export const TRANSFER_VERSION = 1;

// Running work cannot change windows halfway. These session keys describe it.
export function tabMoveBlocker(session = {}, { gridDrafts = 0, paging = false, exporting = false } = {}) {
  if (session.scriptRun?.running) return 'Finish or cancel the running script before moving this tab.';
  if (session.executing || session.cancelling) return 'Wait for the running statement to finish, or cancel it, before moving this tab.';
  if (session.fetchingPage || paging) return 'Wait for the next page of rows before moving this tab.';
  if (session.connecting) return 'Wait for the connection to open before moving this tab.';
  if (exporting) return 'Finish or cancel the export before moving this tab.';
  if (gridDrafts) return `Apply or discard ${gridDrafts} unapplied grid edit${gridDrafts === 1 ? '' : 's'} before moving this tab.`;
  return null;
}

// Short-lived state of an operation in this window is not carried over.
const transientSessionKeys = ['executing', 'cancelling', 'connecting', 'fetchingPage', 'operationStartedAt', 'sqlStage', 'scriptRun', 'schemaReady'];

function plain(value) {
  return JSON.parse(JSON.stringify(value ?? null, (_key, item) =>
    typeof item === 'function' ? undefined : typeof item === 'bigint' ? String(item) : item instanceof Map ? Object.fromEntries(item) : item instanceof Set ? [...item] : item));
}

export function buildTabTransfer({ tabIds, documents, sessions = {}, results = {}, metadata = {}, activeId, from }) {
  const ids = new Set(tabIds);
  const moved = documents.filter(tab => ids.has(tab.id) || ids.has(tab.metadataOriginTabId));
  if (!moved.length) throw new Error('Nothing to move.');
  const sessionIds = [...new Set(moved.map(tab => tab.metadataOriginTabId || tab.id))];
  const session = Object.fromEntries(sessionIds.map(id => {
    const value = { ...(sessions[id] || {}) };
    for (const key of transientSessionKeys) delete value[key];
    return [id, plain(value)];
  }));
  return JSON.stringify({
    version: TRANSFER_VERSION, from,
    activeId: moved.some(tab => tab.id === activeId) ? activeId : moved[0].id,
    sessionIds,
    documents: plain(moved),
    sessions: session,
    results: Object.fromEntries(sessionIds.filter(id => results[id]).map(id => [id, plain(results[id])])),
    metadata: Object.fromEntries(sessionIds.filter(id => metadata[id]).map(id => [id, plain(metadata[id])])),
  });
}

function reviveCells(value) {
  if (Array.isArray(value)) return value.map(reviveCells);
  if (value && typeof value === 'object') {
    if (value.kind === 'temporal') return reviveOracleTemporal(value);
    for (const key of Object.keys(value)) value[key] = reviveCells(value[key]);
  }
  return value;
}

export function parseTabTransfer(text) {
  const data = typeof text === 'string' ? JSON.parse(text) : text;
  if (data?.version !== TRANSFER_VERSION || !Array.isArray(data.documents) || !data.documents.length) throw new Error('The moved tab could not be read.');
  const documents = data.documents.filter(tab => tab && typeof tab.id === 'string' && typeof tab.name === 'string')
    .map(tab => ({ ...tab, content: String(tab.content ?? '') }));
  if (!documents.length) throw new Error('The moved tab could not be read.');
  return {
    from: data.from || 'main', documents,
    activeId: documents.some(tab => tab.id === data.activeId) ? data.activeId : documents[0].id,
    sessionIds: Array.isArray(data.sessionIds) ? data.sessionIds.filter(id => typeof id === 'string') : [],
    sessions: data.sessions && typeof data.sessions === 'object' ? data.sessions : {},
    results: reviveCells(data.results && typeof data.results === 'object' ? data.results : {}),
    metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata : {},
  };
}

export const windowDraftKey = windowId => windowId === 'main' ? 'fbsdb.sqlDrafts' : `fbsdb.sqlDrafts.${windowId}`;

// Unsaved SQL of other windows is saved under their own keys. At start-up the
// main window folds them into its own recovery offer, once, without duplicates.
export function collectWindowDrafts(storage) {
  const keys = [];
  for (let index = 0; index < storage.length; index++) { const key = storage.key(index); if (key?.startsWith('fbsdb.sqlDrafts.')) keys.push(key); }
  const files = [], seen = new Set();
  let activeTabId = null, savedAt = 0;
  for (const key of ['fbsdb.sqlDrafts', ...keys]) {
    let data; try { data = JSON.parse(storage.getItem(key)); } catch { data = null; }
    if (data?.version !== 1 || !Array.isArray(data.files)) continue;
    for (const file of data.files) if (file?.id && !seen.has(file.id)) { seen.add(file.id); files.push(file); }
    activeTabId ??= data.activeTabId; savedAt = Math.max(savedAt, Number(data.savedAt) || 0);
  }
  if (keys.length) {
    for (const key of keys) storage.removeItem(key);
    if (files.length) storage.setItem('fbsdb.sqlDrafts', JSON.stringify({ version: 1, savedAt, activeTabId, files }));
  }
  return parseDraftSnapshot(storage.getItem('fbsdb.sqlDrafts'));
}

import { applyExternalFileChange } from './externalFileState.js';

export function documentSessionsReducer(state, action) {
  switch (action.type) {
    case 'replace': {
      const tabs = typeof action.tabs === 'function' ? action.tabs(state.tabs) : action.tabs;
      const activeTabId = action.activeTabId ?? state.activeTabId;
      return { tabs, activeTabId: tabs.some(tab => tab.id === activeTabId) ? activeTabId : tabs[0]?.id ?? null };
    }
    case 'open':
      return {
        tabs: state.tabs.some(tab => tab.id === action.document.id)
          ? state.tabs.map(tab => tab.id === action.document.id ? action.document : tab)
          : [...state.tabs, action.document],
        activeTabId: action.document.id,
      };
    case 'activate':
      return state.tabs.some(tab => tab.id === action.id) ? { ...state, activeTabId: action.id } : state;
    case 'patch':
    case 'edit':
      return { ...state, tabs: state.tabs.map(tab => {
        if (tab.id !== action.id || action.type === 'edit' && tab.readOnly) return tab;
        return { ...tab, ...(action.type === 'edit' ? { content: action.content, dirty: true } : action.patch) };
      }) };
    case 'externalChanges':
      return { ...state, tabs: state.tabs.map(tab => {
        const change = action.changes.find(change => change.path &&
          change.path.replace(/\\/g, '/').toLowerCase() === tab.path?.replace(/\\/g, '/').toLowerCase());
        return change ? applyExternalFileChange(tab, change) : tab;
      }) };
    case 'resolveExternal':
      return { ...state, tabs: state.tabs.map(tab => {
        if (tab.id !== action.id || !tab.externalChange || tab.externalChange.error) return tab;
        const change = tab.externalChange;
        if (action.reload && change.missing) return tab;
        return { ...tab, content: action.reload ? change.content : tab.content,
          dirty: !action.reload, path: !action.reload && change.missing ? null : tab.path,
          diskVersion: change.version, externalChange: null };
      }) };
    default:
      return state;
  }
}

// React and asynchronous callbacks read the same reducer state. There are no
// independently writable copies of the active document or its text.
export function createDocumentSessions(initialTabs, activeTabId = initialTabs[0]?.id ?? null) {
  let state = { tabs: initialTabs, activeTabId };
  const listeners = new Set();
  const store = {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispatch(action) {
      const next = documentSessionsReducer(state, action);
      if (next !== state) { state = next; for (const listener of listeners) listener(); }
    },
    get tabs() { return state.tabs; },
    get activeId() { return state.activeTabId; },
    get active() { return state.tabs.find(tab => tab.id === state.activeTabId) ?? null; },
    get text() { return store.active?.content ?? ''; },
    setTabs(tabs) { store.dispatch({ type: 'replace', tabs }); },
    replace(tabs, activeTabId) { store.dispatch({ type: 'replace', tabs, activeTabId }); },
    open(document) { store.dispatch({ type: 'open', document }); },
    activate(id) { store.dispatch({ type: 'activate', id }); },
    patch(id, patch) { store.dispatch({ type: 'patch', id, patch }); },
    edit(content) { store.dispatch({ type: 'edit', id: store.activeId, content }); },
  };
  return store;
}

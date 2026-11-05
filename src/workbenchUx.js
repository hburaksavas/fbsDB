import { getSqlStatements } from './sqlStatements.js';

const searchText = value => String(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replaceAll('ı','i');

export const searchKinds = ['All', 'Open editors', 'Files', 'Symbols', 'Oracle objects', 'Connections', 'History', 'Settings', 'Commands'];

export function workbenchSearch({ mode = 'files', query = '', category = 'All', files = [], objects = [], connections = [], history = [], commands = [], outline = [], settings = [] }) {
  const entries = mode === 'outline' ? outline.map(item => ({ ...item, id: `outline:${item.start}:${item.depth}`, label: item.name, detail: item.kind, kind: 'outline', category: 'Outline' })) : [
    ...files.map(item => ({ ...item, id: `file:${item.tabId || item.path}`, label: item.name || item.relativePath, detail: [item.path, item.profileName || item.connectionProfileId].filter(Boolean).join(' · '), kind: 'file', category: item.tabId ? 'Open editors' : 'Files' })),
    ...objects.map(item => ({ ...item, id: `object:${item.owner}.${item.name}:${item.type}`, label: `${item.owner}.${item.name}`, detail: item.type, kind: 'object', category: 'Oracle objects' })),
    ...connections.map(item => ({ ...item, id: `connection:${item.id}`, profileId: item.id, label: item.name || item.id, detail: item.env, kind: 'connection', category: 'Connections' })),
    ...history.map(item => ({ ...item, id: `history:${item.id}`, label: item.sql.replace(/\s+/g, ' ').slice(0, 120), detail: `${item.profile} · ${item.status}`, kind: 'history', category: 'History' })),
    ...outline.map(item=>({...item,id:`symbol:${item.start}:${item.depth}`,label:item.name,detail:item.kind+' · current source',kind:'outline',category:'Symbols'})),
    ...settings.map(item=>({...item,id:'setting:'+item.id,settingId:item.id,kind:'setting',category:'Settings'})),
    ...commands.map(item => ({ ...item, kind: 'command', category: 'Commands' })),
  ];
  const words = searchText(query.trim()).split(/\s+/).filter(Boolean);
  const matches = entries.filter(item => (category === 'All' || item.category === category) && words.every(word => searchText(`${item.label} ${item.detail || ''} ${item.settingId||''} ${item.kind === 'history' ? item.sql : ''}`).includes(word)));
  const groups = mode === 'commands' ? ['Commands', ...searchKinds.slice(1, -1)] : mode === 'outline' ? ['Outline'] : searchKinds.slice(1);
  // Give each source a bounded share, so large schemas cannot bury other types.
  return groups.flatMap(group => matches.filter(item => item.category === group).slice(0, category === 'All' ? 40 : 300));
}

export function filterEditorTabs(tabs, query) {
  const words = searchText(query.trim()).split(/\s+/).filter(Boolean);
  return tabs.filter(tab => words.every(word => searchText(`${tab.name} ${tab.path || ''} ${tab.profileName || ''} ${tab.connectionProfileId || ''}`).includes(word)));
}

export function executionTarget(text, { start = 0, end = start, caret = start, override } = {}) {
  if (override == null && end > start) return { sql: text.slice(start, end), start, end, kind: 'selection' };
  const statements = getSqlStatements(text);
  const selected = statements.find(s => s.end === caret) || statements.find(s => caret < s.end) || statements.at(-1);
  if (override != null) {
    const matching = statements.filter(s => s.sql === override.trim());
    const match = matching.find(s => s.start <= caret && caret <= s.end) || (matching.length === 1 ? matching[0] : null);
    return match ? { ...match, kind: 'statement' } : { sql: override, start: null, end: null, kind: 'generated SQL' };
  }
  return selected ? { ...selected, kind: 'statement' } : null;
}

export function actionableState({ connected, error = '', hasItems = false, filtered = false }) {
  if (!connected) return { title: 'No Oracle connection', detail: 'Connect this SQL tab to load accessible Oracle objects.', action: 'Connect', command: 'connect' };
  if (error) return /ORA-0*1031\b|ORA-41900\b|insufficient privileges|permission denied/i.test(error)
    ? { title: 'Oracle access denied', detail: error, action: 'Choose another profile', command: 'connect' }
    : /ORA-0*942\b/i.test(error) ? { title: 'Oracle object missing or inaccessible', detail: error, action: 'Retry metadata', command: 'retry' }
    : { title: 'Metadata unavailable', detail: error, action: 'Retry metadata', command: 'retry' };
  if (filtered && !hasItems) return { title: 'No matching objects', detail: 'Try a different name or clear the current filters.', action: 'Clear filters', command: 'clear' };
  return { title: 'No accessible Oracle objects', detail: 'No objects were returned for this user. You can retry loading metadata.', action: 'Refresh objects', command: 'retry' };
}

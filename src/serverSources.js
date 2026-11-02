const sourceTypes = ['PACKAGE', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'TYPE'];
const groupLabels = { PACKAGE: 'Packages', PROCEDURE: 'Procedures', FUNCTION: 'Functions', TRIGGER: 'Triggers', TYPE: 'Types' };
const extensions = { 'PACKAGE': 'pks', 'PACKAGE BODY': 'pkb', 'PROCEDURE': 'prc', 'FUNCTION': 'fnc', 'TRIGGER': 'trg', 'TYPE': 'tps', 'TYPE BODY': 'tpb' };

export const serverSourceNotice = 'Server definitions are read from the database and opened read-only. They are not files in this workspace.';

// Virtual file name shown for a server definition; the "server:" prefix keeps it visibly apart from local files.
export function virtualSourceName(owner, name, type) { return `${owner}.${name}.${extensions[type] || 'sql'}`; }

// Builds the virtual tree from the loaded schema objects: packages list specification and body separately when both exist.
export function serverSourceTree(objects, { query = '', defaultOwner = '' } = {}) {
  const needle = String(query).trim().toLowerCase();
  const byKey = new Map(), known = new Set();
  for (const item of objects || []) { const type = String(item.type || '').toUpperCase(); if (item.name && (sourceTypes.includes(type) || type === 'PACKAGE BODY' || type === 'TYPE BODY')) known.add(`${item.owner || defaultOwner}.${item.name}|${type}`); }
  for (const item of objects || []) {
    const type = String(item.type || '').toUpperCase();
    if (!item.name || !sourceTypes.includes(type)) continue;
    const owner = item.owner || defaultOwner;
    if (needle && !`${owner}.${item.name}`.toLowerCase().includes(needle)) continue;
    const key = `${owner}.${item.name}|${type}`;
    if (byKey.has(key)) continue;
    const parts = [{ type, body: false, label: type === 'PACKAGE' || type === 'TYPE' ? 'Specification' : 'Source', file: virtualSourceName(owner, item.name, type) }];
    const bodyType = type === 'PACKAGE' || type === 'TYPE' ? `${type} BODY` : null;
    if (bodyType && known.has(`${owner}.${item.name}|${bodyType}`)) parts.push({ type, body: true, label: 'Body', file: virtualSourceName(owner, item.name, bodyType) });
    byKey.set(key, { key, owner, name: item.name, type, parts: parts.map(part => ({ ...part, target: { owner, name: item.name, type, body: part.body } })) });
  }
  const groups = sourceTypes.map(type => ({ type, label: groupLabels[type], items: [...byKey.values()].filter(entry => entry.type === type).sort((a, b) => a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name)) })).filter(group => group.items.length);
  return { groups, count: byKey.size };
}

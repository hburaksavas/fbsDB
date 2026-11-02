export const groupColors = Object.freeze(['teal', 'amber', 'rose']);
export const tabGroupsStorageKey = 'fbsdb.tabGroups';
const maxName = 40;

const valid = group => group && typeof group.id === 'string' && typeof group.name === 'string' && Array.isArray(group.members);

export function normalizeTabGroups(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set(), groups = [];
  for (const group of value.filter(valid)) {
    const members = [...new Set(group.members.filter(id => typeof id === 'string' && !seen.has(id)))];
    members.forEach(id => seen.add(id));
    groups.push({ id: group.id, name: String(group.name).slice(0, maxName), color: groupColors.includes(group.color) ? group.color : 'teal', collapsed: group.collapsed === true, members });
  }
  return groups;
}

export function loadTabGroups(storage) {
  try { return normalizeTabGroups(JSON.parse(storage?.getItem(tabGroupsStorageKey) || '[]')); } catch { return []; }
}
export function saveTabGroups(storage, groups) {
  try { storage?.setItem(tabGroupsStorageKey, JSON.stringify(normalizeTabGroups(groups))); } catch { /* grouping is a convenience */ }
}

export const groupOf = (groups, tabId) => groups.find(group => group.members.includes(tabId)) || null;

// Group names are trimmed, 1-40 characters and unique ignoring case; the error is shown where the name is edited.
export function validateGroupName(groups, name, exceptId = null) {
  const text = String(name || '').trim();
  if (!text) return { error: 'Enter a group name.' };
  if (text.length > maxName) return { error: `Use at most ${maxName} characters.` };
  if (groups.some(group => group.id !== exceptId && group.name.toLowerCase() === text.toLowerCase())) return { error: 'Another group already has this name.' };
  return { name: text };
}

const withoutMembers = (groups, ids) => groups.map(group => ({ ...group, members: group.members.filter(id => !ids.includes(id)) })).filter(group => group.members.length);

export function createGroup(groups, tabIds, { name, color, id = `group-${Date.now().toString(36)}-${groups.length}` } = {}) {
  const checked = validateGroupName(groups, name ?? `Group ${groups.length + 1}`);
  if (checked.error) return { groups, error: checked.error };
  const chosen = groupColors.includes(color) ? color : groupColors[groups.length % groupColors.length];
  return { groups: [...withoutMembers(groups, tabIds), { id, name: checked.name, color: chosen, collapsed: false, members: [...new Set(tabIds)] }], id };
}

export function addToGroup(groups, groupId, tabIds) {
  if (!groups.some(group => group.id === groupId)) return groups;
  return groups.map(group => group.id === groupId ? { ...group, members: [...new Set([...group.members, ...tabIds])] } : { ...group, members: group.members.filter(id => !tabIds.includes(id)) }).filter(group => group.members.length);
}

export const removeFromGroups = (groups, tabIds) => withoutMembers(groups, tabIds);
export const ungroup = (groups, groupId) => groups.filter(group => group.id !== groupId);
export const toggleCollapsed = (groups, groupId) => groups.map(group => group.id === groupId ? { ...group, collapsed: !group.collapsed } : group);
export const setGroupColor = (groups, groupId, color) => groupColors.includes(color) ? groups.map(group => group.id === groupId ? { ...group, color } : group) : groups;

export function renameGroup(groups, groupId, name) {
  const checked = validateGroupName(groups, name, groupId);
  if (checked.error) return { groups, error: checked.error };
  return { groups: groups.map(group => group.id === groupId ? { ...group, name: checked.name } : group) };
}

// Closed tabs leave their groups; empty groups disappear.
export function pruneGroups(groups, order) {
  const pruned = groups.map(group => ({ ...group, members: group.members.filter(id => order.includes(id)) })).filter(group => group.members.length);
  return pruned.length === groups.length && pruned.every((group, index) => group.members.length === groups[index].members.length) ? groups : pruned;
}

// Visible tab order: group members stay together after the first member's slot; collapsed groups show only their active tab.
export function arrangeTabs(order, groups, activeId) {
  const placed = new Set(), result = [];
  for (const id of order) {
    if (placed.has(id)) continue;
    const group = groupOf(groups, id);
    if (!group) { placed.add(id); result.push({ id, group: null, first: false }); continue; }
    const members = order.filter(item => group.members.includes(item));
    members.forEach(item => placed.add(item));
    const shown = group.collapsed ? members.filter(item => item === activeId) : members;
    if (!shown.length) { result.push({ id: null, group, first: true, header: true, count: members.length }); continue; }
    shown.forEach((item, index) => result.push({ id: item, group, first: index === 0, count: members.length }));
  }
  return result;
}

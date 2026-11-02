// Views group documents without changing their identity or lifecycle.
export function packageTabViews(tabs, activeId, groups = []) {
  const byId = new Map(tabs.map(tab => [tab.id, tab]));
  const membership = new Map();
  for (const ids of groups) {
    const members = ids.map(id => byId.get(id)).filter(Boolean);
    if (members.length !== 2 || members.some(member => membership.has(member.id))) continue;
    members.forEach(member => membership.set(member.id, members));
  }
  const seen = new Set();
  return tabs.flatMap(tab => {
    if (seen.has(tab.id)) return [];
    const members = membership.get(tab.id);
    if (!members) return [tab];
    members.forEach(member => seen.add(member.id));
    const selected = members.find(member => member.id === activeId) || members[0];
    return [{ ...selected, viewId: `package:${members[0].id}:${members[1].id}`, packageMembers: members,
      dirty: members.some(member => member.dirty), sourceEdited:members.some(member=>member.sourceEdited), queryFailed: members.some(member => member.queryFailed) }];
  });
}

export const packageViewIds = view => view.packageMembers?.map(member => member.id) || [view.id];

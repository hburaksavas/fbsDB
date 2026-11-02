export const PANEL_IDS = ['editors', 'files', 'connections', 'objects'];
export const PANEL_LABELS = { editors: 'Open Editors', files: 'Explorer', connections: 'Connections', objects: 'Object Explorer' };
const clamp = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
export function defaultDockLayout() {
  const groups = PANEL_IDS.map((panel, i) => ({ id: `group-${panel}`, side: 'left', panels: [panel], active: panel, height: [100, 220, 220, 280][i] }));
  return { version: 1, locked:false, visible: true, hidden: [], widths: { left: 258, right: 258 }, inspectorWidth: 280, expandedPaths: {}, resultsHeight: 34, resultsCollapsed: false, groups, trees: { left: dockSplit('y', groups.map(group => dockLeaf(group.id)), groups.map(group => group.height)), right: null } };
}
export function normalizeDockLayout(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.groups)) return defaultDockLayout();
  const defaults = defaultDockLayout(), seen = new Set(), ids = new Set(), groups = [];
  for (const group of value.groups.slice(0, 12)) {
    if (!group || !['left', 'right'].includes(group.side) || !Array.isArray(group.panels)) continue;
    const panels = group.panels.filter(panel => PANEL_IDS.includes(panel) && !seen.has(panel) && (seen.add(panel), true));
    if (!panels.length) continue;
    let id = typeof group.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(group.id) ? group.id : `group-${panels[0]}`;
    if (ids.has(id)) id = `group-${panels[0]}`;
    while (ids.has(id)) id += '-1';
    ids.add(id);
    groups.push({ id, side: group.side, panels, active: panels.includes(group.active) ? group.active : panels[0], height: clamp(group.height, 70, 2000, 220) });
  }
  for (const panel of PANEL_IDS) if (!seen.has(panel)) {
    let id = `recovered-${panel}`; while (ids.has(id)) id += '-1'; ids.add(id);
    groups.push({ id, side: 'left', panels: [panel], active: panel, height: 180 });
  }
  const expandedPaths = value.expandedPaths && typeof value.expandedPaths === 'object' && !Array.isArray(value.expandedPaths) ? Object.fromEntries(Object.entries(value.expandedPaths).filter(([path, open]) => path.length < 2000 && open === true).slice(0, 2000)) : {};
  const trees = Object.fromEntries(['left','right'].map(side => [side, repairDockTree(value.trees?.[side], groups.filter(group => group.side === side))]));
  return { version: 1, locked:value.locked===true, visible: value.visible !== false, hidden: [...new Set((Array.isArray(value.hidden) ? value.hidden : []).filter(panel => PANEL_IDS.includes(panel)))], widths: { left: clamp(value.widths?.left, 180, 520, defaults.widths.left), right: clamp(value.widths?.right, 180, 520, defaults.widths.right) }, inspectorWidth: clamp(value.inspectorWidth, 220, 560, 280), expandedPaths, resultsHeight: clamp(value.resultsHeight, 15, 70, 34), resultsCollapsed: value.resultsCollapsed === true, groups, trees };
}
export function migrateDockLayout(storage) {
  const next = defaultDockLayout();
  try { next.widths.left = clamp(Number(storage.getItem('fbsdb.sidebarWidth')), 180, 520, 258) || 258; if (!storage.getItem('fbsdb.sidebarWidth')) next.widths.left = 258; } catch {}
  try { const raw = storage.getItem('fbsdb.resultsHeight'); if (raw) next.resultsHeight = clamp(Number(raw), 15, 70, 34); } catch {}
  try { const sizes = JSON.parse(storage.getItem('fbsdb.explorerSectionHeights') || '{}'); next.groups.forEach((group, i) => { group.height = clamp(sizes[['workspace', 'files', 'connections', 'objects'][i]], 70, 2000, group.height); }); } catch {}
  try { const width = storage.getItem('fbsdb.resultsInspectorWidth'); if (width) next.inspectorWidth = clamp(Number(width), 220, 560, 280); next.expandedPaths = JSON.parse(storage.getItem('fbsdb.explorerExpandedPaths') || '{}'); } catch {}
  next.trees = Object.fromEntries(['left','right'].map(side=>[side,repairDockTree(null,next.groups.filter(group=>group.side===side))]));
  return normalizeDockLayout(next);
}
export function moveDockPanel(layout, panel, side, targetId = null, placement = 'end', tabIndex = null) {
  const next = normalizeDockLayout(layout);
  if (next.locked) return next;
  if (!PANEL_IDS.includes(panel) || !['left', 'right'].includes(side)) return next;
  const source = next.groups.find(group => group.panels.includes(panel)), target = next.groups.find(group => group.id === targetId);
  if (target === source && (source.panels.length === 1 || placement === 'merge' && tabIndex == null)) return next;
  const previousIndex = source.panels.indexOf(panel);
  source.panels = source.panels.filter(item => item !== panel); source.active = source.panels.includes(source.active) ? source.active : source.panels[0];
  if (!source.panels.length) for (const edge of ['left','right']) next.trees[edge] = removeDockLeaf(next.trees[edge], source.id);
  next.groups = next.groups.filter(group => group.panels.length);
  if (target && next.groups.includes(target) && placement === 'merge') {
    let index = Number.isInteger(tabIndex) ? tabIndex : target.panels.length;
    if (source === target && previousIndex < tabIndex) index--;
    target.panels.splice(Math.max(0, Math.min(target.panels.length, index)), 0, panel); target.active = panel;
  }
  else {
    let id = `group-${panel}`; while (next.groups.some(group => group.id === id)) id += '-1';
    const group = { id, side, panels: [panel], active: panel, height: 220 };
    const index = next.groups.findIndex(group => group.id === targetId);
    if (index >= 0) next.groups.splice(index + (['before','top','left'].includes(placement) ? 0 : 1), 0, group); else next.groups.push(group);
    if (target && index >= 0) next.trees[side] = insertDockLeaf(next.trees[side], target.id, dockLeaf(id), placement);
    else next.trees[side] = dockSplit('y', placement === 'start' ? [dockLeaf(id), next.trees[side]] : [next.trees[side], dockLeaf(id)]);
  }
  next.visible = true; next.hidden = next.hidden.filter(id => id !== panel); return next;
}
import { dockLeaf, dockSplit, removeDockLeaf, insertDockLeaf, repairDockTree } from './dockTree.js';

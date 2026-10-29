export const dockLeaf = id => ({ kind: 'group', id });
export function dockSplit(axis, children, weights = children.map(() => 1)) {
  const kept = children.map((node, i) => ({ node, weight: weights[i] })).filter(item => item.node);
  if (!kept.length) return null;
  if (kept.length === 1) return kept[0].node;
  return { kind: 'split', axis, children: kept.map(item => item.node), weights: kept.map(item => Number.isFinite(item.weight) && item.weight > 0 ? Math.max(.01,Math.min(100000,item.weight)) : 1) };
}
export function removeDockLeaf(node, id) {
  if (!node || node.kind === 'group') return node?.id === id ? null : node;
  return dockSplit(node.axis, node.children.map(child => removeDockLeaf(child, id)), node.weights);
}
export function insertDockLeaf(node, targetId, added, placement) {
  if (!node) return added;
  if (node.kind === 'group') {
    if (node.id !== targetId) return node;
    const first = placement === 'left' || placement === 'top' || placement === 'before';
    return dockSplit(['left', 'right'].includes(placement) ? 'x' : 'y', first ? [added, node] : [node, added]);
  }
  return { ...node, children: node.children.map(child => insertDockLeaf(child, targetId, added, placement)) };
}
export function normalizeDockTree(value, groups, seen = new Set(), depth = 0) {
  if (!value || depth > 12) return null;
  if (value.kind === 'group') {
    if (!groups.some(group => group.id === value.id) || seen.has(value.id)) return null;
    seen.add(value.id); return dockLeaf(value.id);
  }
  if (value.kind !== 'split' || !['x', 'y'].includes(value.axis) || !Array.isArray(value.children)) return null;
  return dockSplit(value.axis, value.children.slice(0, 8).map(child => normalizeDockTree(child, groups, seen, depth + 1)), value.weights || []);
}
export function repairDockTree(value, groups) {
  const seen = new Set(), tree = normalizeDockTree(value, groups, seen);
  return dockSplit('y', [tree, ...groups.filter(group => !seen.has(group.id)).map(group => dockLeaf(group.id))], [groups.filter(group=>seen.has(group.id)).reduce((sum,group)=>sum+group.height,0)||1, ...groups.filter(group => !seen.has(group.id)).map(group => group.height)]);
}
export function updateDockWeights(node, path, weights) {
  if (!node || node.kind !== 'split') return node;
  if (!path.length) return { ...node, weights };
  return { ...node, children: node.children.map((child, i) => i === path[0] ? updateDockWeights(child, path.slice(1), weights) : child) };
}

export function dockNodeVisible(node, groups, hidden) {
  return Boolean(node && (node.kind === 'group' ? groups.find(group=>group.id===node.id)?.panels.some(panel=>!hidden.includes(panel)) : node.children.some(child=>dockNodeVisible(child,groups,hidden))));
}
export function dockNodeMinimum(node, groups, hidden) {
  if(!dockNodeVisible(node,groups,hidden))return {width:0,height:0};
  if(node.kind==='group')return {width:80,height:64};
  const sizes=node.children.filter(child=>dockNodeVisible(child,groups,hidden)).map(child=>dockNodeMinimum(child,groups,hidden)),gap=(sizes.length-1)*5;
  return {width:node.axis==='x'?sizes.reduce((sum,size)=>sum+size.width,0)+gap:Math.max(...sizes.map(size=>size.width)),height:node.axis==='y'?sizes.reduce((sum,size)=>sum+size.height,0)+gap:Math.max(...sizes.map(size=>size.height))};
}
// Match the rendered flex split, including minimum sizes and five-pixel dividers.
export function projectDockTree(node, rect, groups, hidden, result = {}) {
  if(!dockNodeVisible(node,groups,hidden))return result;
  if(node.kind==='group'){result[node.id]=rect;return result;}
  const indices=node.children.map((child,index)=>dockNodeVisible(child,groups,hidden)?index:null).filter(index=>index!==null),dimension=node.axis==='x'?'width':'height';
  const sizes={},remaining=new Set(indices);let available=rect[dimension]-(indices.length-1)*5;
  while(remaining.size){
    const weight=[...remaining].reduce((sum,index)=>sum+node.weights[index],0);
    const constrained=[...remaining].filter(index=>available*node.weights[index]/weight<dockNodeMinimum(node.children[index],groups,hidden)[dimension]);
    if(!constrained.length){for(const index of remaining)sizes[index]=available*node.weights[index]/weight;break;}
    for(const index of constrained){sizes[index]=dockNodeMinimum(node.children[index],groups,hidden)[dimension];available-=sizes[index];remaining.delete(index);}
  }
  let offset=0;
  for(const index of indices){const child={...rect,[dimension]:sizes[index]};if(node.axis==='x')child.x+=offset;else child.y+=offset;projectDockTree(node.children[index],child,groups,hidden,result);offset+=sizes[index]+5;}
  return result;
}

const inside = (point, rect) => rect && point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
const half = (rect, placement) => ({ x: rect.x + (placement === 'right' ? (rect.width + 5) / 2 : 0), y: rect.y + (placement === 'bottom' ? (rect.height + 5) / 2 : 0), width: ['left', 'right'].includes(placement) ? Math.max(0,(rect.width - 5) / 2) : rect.width, height: ['top', 'bottom'].includes(placement) ? Math.max(0,(rect.height - 5) / 2) : rect.height });
// Spatial intent comes from the pointer's actual position, not invisible thirds.
export function resolveDockDrop(point, bounds, groups, widths) {
  if (!inside(point, bounds)) return null;
  const sideAt = point.x < bounds.x + Math.max(28, widths.left || 0) ? 'left' : point.x > bounds.x + bounds.width - Math.max(28, widths.right || 0) ? 'right' : null;
  if (sideAt) {
    const sideWidth = widths[sideAt] || 258;
    const sideRect = { x: sideAt === 'left' ? bounds.x : bounds.x + bounds.width - sideWidth, y: bounds.y, width: sideWidth, height: bounds.height };
    const outerEdge = point.x < bounds.x + 28 || point.x > bounds.x + bounds.width - 28;
    const cornerTop = point.y < bounds.y + 28 && outerEdge;
    if (point.y > bounds.y + bounds.height - 28 && outerEdge || cornerTop) {
      const end = !cornerTop, existing = groups.some(group => group.side === sideAt);
      return { side: sideAt, groupId: null, placement: end ? 'end' : 'start', rect: existing ? half(sideRect, end ? 'bottom' : 'top') : sideRect };
    }
  }
  const group = groups.find(item => inside(point, item.rect));
  if (group) {
    if (inside(point, group.header) && point.x > group.rect.x + 20 && point.x < group.rect.x + group.rect.width - 20) {
      const tabIndex = group.tabs?.findIndex(tab => point.x < tab.rect.x + tab.rect.width / 2);
      return { side: group.side, groupId: group.id, placement: 'merge', tabIndex: tabIndex >= 0 ? tabIndex : group.tabs?.length, rect: group.rect };
    }
    const distances = [['left', point.x - group.rect.x], ['right', group.rect.x + group.rect.width - point.x], ['top', point.y - group.rect.y], ['bottom', group.rect.y + group.rect.height - point.y]];
    const placement = distances.sort((a, b) => a[1] - b[1])[0][0];
    return { side: group.side, groupId: group.id, placement, rect: half(group.rect, placement) };
  }
  if (!sideAt) return null;
  const rect = { x: sideAt === 'left' ? bounds.x : bounds.x + bounds.width - (widths.right || 258), y: bounds.y, width: widths[sideAt] || 258, height: bounds.height };
  return { side: sideAt, groupId: null, placement: 'end', rect };
}

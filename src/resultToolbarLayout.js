export function resultToolbarLayout(groups,capacity) {
  const all=groups.flat();
  const limit=Number.isFinite(capacity)?Math.max(1,Math.floor(capacity)):all.length;
  const visible=all.slice(0,limit),overflow=all.slice(limit);
  return {visibleIds:new Set(visible.map(item=>item[0])),overflow};
}

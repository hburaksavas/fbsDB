export function resultToolbarLayout(groups,capacity,hidden=[]) {
  const hiddenIds=new Set(hidden),all=groups.flat();
  const limit=Number.isFinite(capacity)?Math.max(1,Math.floor(capacity)):all.length;
  const priority=['view','edit','filter','sort','export','load','copy'];
  const ranked=[...all].sort((a,b)=>{const rank=id=>priority.includes(id)?priority.indexOf(id):priority.length;return rank(a[0])-rank(b[0])});
  const chosen=new Set(ranked.filter(item=>!hiddenIds.has(item[0])).slice(0,limit).map(item=>item[0]));
  const visible=all.filter(item=>chosen.has(item[0])),overflow=all.filter(item=>!chosen.has(item[0]));
  return {visibleIds:new Set(visible.map(item=>item[0])),overflow};
}

export function batchClosePlan(tabs,ids,choices,snapshots=[]) {
 for(const snapshot of snapshots){const current=tabs.find(tab=>tab.id===snapshot.id);if(current&&current.content!==snapshot.content)throw Error('A reviewed document changed. Cancel and reopen the close review.');}
 return [...new Set(ids)].flatMap(id=>{
  const tab=tabs.find(tab=>tab.id===id);if(!tab)return [];
  const action=!tab.dirty||tab.readOnly?'close':['save','discard','keep'].includes(choices[id])?choices[id]:'keep';
  return action==='keep'?[]:[{id,action}];
 });
}

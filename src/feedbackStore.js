// Notifications outlive the menu/form which produced them. Progress is owned by
// its producer and is removed when it ends or reaches its absolute deadline.
let entries=[],sequence=0,scopeNames={};
const timers=new Map(),suppressedProgress=new Set();
let durations={info:5,success:4,warning:10,error:15,progress:60,max:60};
function schedule(item){
  clearTimeout(timers.get(item.id));
  const ms=Math.min(durations[item.kind]||durations.info,durations.max)*1000;
  timers.set(item.id,setTimeout(()=>dismissFeedback(item.id),Math.max(0,item.startedAt+ms-Date.now())));
  timers.get(item.id)?.unref?.();
}
export function configureFeedback(next){durations={...durations,...next};for(const item of entries)schedule(item)}
export function setFeedbackScopes(value){scopeNames=value}
const listeners=new Set();
export const feedbackSnapshot=()=>entries;
export const subscribeFeedback=listener=>{listeners.add(listener);return()=>listeners.delete(listener)};
const publish=()=>{for(const listener of listeners)listener()};
export function dismissFeedback(id){const item=entries.find(item=>item.id===id);if(!item)return;if(item.kind==='progress')suppressedProgress.add(id);clearTimeout(timers.get(id));timers.delete(id);entries=entries.filter(item=>item.id!==id);publish()}
export function notifyFeedback(value){
  const message=String(value.message??'').trim();
  if(!message&&!value.content)return null;
  const id=value.id||`feedback-${++sequence}`,kind=value.kind||'info';
  if(kind==='progress'&&suppressedProgress.has(id))return null;
  if(kind!=='progress')suppressedProgress.delete(id);
  const duplicate=kind!=='progress'&&entries.find(item=>item.id!==id&&item.kind===kind&&(kind==='error'||item.title===value.title)&&item.message===message&&item.scope===value.scope);
  if(duplicate)return duplicate.id;
  const previous=entries.find(item=>item.id===id);
  if(previous?.message===message&&previous?.kind===kind&&previous?.title===value.title&&previous?.scope===value.scope&&previous?.revision===(value.revision??message))return id;
  const item={...value,scopeLabel:value.scopeLabel||scopeNames[value.scope],id,message,kind,startedAt:previous?.kind===kind?previous.startedAt:Date.now(),createdAt:Date.now(),revision:value.revision??message};
  entries=[...entries.filter(item=>item.id!==id),item];schedule(item);publish();return id;
}

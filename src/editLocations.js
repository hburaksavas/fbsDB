import {getSqlStatements} from './sqlStatements.js';

export function transformEditOffset(offset,changes) {
 let delta=0;
 for(const change of [...changes].sort((a,b)=>a.rangeOffset-b.rangeOffset)){
  if(offset<change.rangeOffset)break;
  if(offset<=change.rangeOffset+change.rangeLength)return change.rangeOffset+delta+change.text.length;
  delta+=change.text.length-change.rangeLength;
 }
 return Math.max(0,offset+delta);
}
export class EditLocations {
 constructor(){this.items=[];this.index=0;}
 record(tabId,changes,length,now=Date.now()){
  if(!changes.length)return;
  this.items=this.items.map(item=>item.tabId===tabId?{...item,offset:Math.min(length,transformEditOffset(item.offset,changes))}:item);
  for(const change of changes){
   const offset=Math.min(length,transformEditOffset(change.rangeOffset+change.rangeLength,changes)),last=this.items.at(-1);
   const item={tabId,offset,at:now};
   if(last?.tabId===tabId&&now-last.at<1500&&Math.abs(last.offset-offset)<80)this.items[this.items.length-1]=item;else this.items.push(item);
  }
  this.items=this.items.slice(-100);this.index=this.items.length;
 }
 move(direction,available){
  let index=this.index+direction;
  while(index>=0&&index<this.items.length){if(available(this.items[index])){this.index=index;return this.items[index]}index+=direction}
  return null;
 }
 last(available){this.index=this.items.length;return this.move(-1,available)}
 forget(tabId){this.items=this.items.filter(item=>item.tabId!==tabId);this.index=Math.min(this.index,this.items.length)}
}
export function currentExecutionOffset(context,document){
 if(!context)return null;
 if(context.editorSnapshot===document.content&&Number.isInteger(context.statementOffset))return context.statementOffset;
 const matches=getSqlStatements(document.content||'').filter(item=>item.sql===context.executedSql);
 return matches.length===1?matches[0].start:null;
}

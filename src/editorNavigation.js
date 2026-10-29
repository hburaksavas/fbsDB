import { getSqlStatements } from './sqlStatements.js';
import { lexOracle } from './oracleLexer.js';
import { parsePlsql } from './plsqlStructure.js';

export function sqlOutline(source) {
  const items = [];
  for (const [index,statement] of getSqlStatements(source).entries()) {
    const tokens = lexOracle(statement.sql).filter(token => !['comment','string'].includes(token.kind));
    const title = statement.sql.split(/\r?\n/)[0].trim().slice(0,100);
    items.push({name:title || `Statement ${index+1}`,kind:'Statement',start:statement.start,end:statement.end,depth:0});
    for (let at=0;at<tokens.length-2;at++) {
      const token=tokens[at], next=tokens[at+1];
      if ((token.value.toUpperCase()==='WITH'||token.value===',')&&next.kind==='identifier') {
        let cursor=at+2;
        if(tokens[cursor]?.value==='('){const depth=tokens[cursor].depth;while(cursor<tokens.length&&!(tokens[cursor].value===')'&&tokens[cursor].depth===depth))cursor++;cursor++;}
        if(tokens[cursor]?.value?.toUpperCase()==='AS'&&tokens[cursor+1]?.value==='(') {
          const close=tokens.slice(cursor+2).find(item=>item.value===')'&&item.depth===tokens[cursor+1].depth);
          items.push({name:next.value,kind:'CTE',start:statement.start+next.start,end:statement.start+(close?.end||statement.sql.length),depth:1});
        }
      }
    }
    const walk=(node,depth)=>{
      if(node.kind==='routine'||node.kind==='block') {
        const header=source.slice(statement.start+node.start,statement.start+(node.headerEnd||node.begin||node.start+90)).split(/\r?\n/)[0].trim();
        items.push({name:header||node.routineKind||'BEGIN / END',kind:node.routineKind||'Block',start:statement.start+node.start,end:statement.start+node.end,depth});
        depth++;
      }
      for(const child of [...(node.declarations||[]),...(node.children||[])])walk(child,depth);
    };
    if(tokens.some(token=>['DECLARE','BEGIN','PROCEDURE','FUNCTION','PACKAGE','TRIGGER'].includes(token.value.toUpperCase())))walk(parsePlsql(statement.sql),1);
  }
  return items.filter(item=>Number.isFinite(item.start)&&Number.isFinite(item.end)).sort((a,b)=>a.start-b.start||a.depth-b.depth);
}

export class EditorNavigationHistory {
  constructor(){this.items=[];this.index=-1;}
  push(location){
    if(!location?.tabId)return;
    const previous=this.items[this.index];
    if(previous&&previous.tabId===location.tabId&&previous.lineNumber===location.lineNumber&&previous.column===location.column)return;
    this.items=this.items.slice(0,this.index+1);this.items.push({...location});
    if(this.items.length>100)this.items.shift();this.index=this.items.length-1;
  }
  move(direction,available){
    let index=this.index+direction;
    while(index>=0&&index<this.items.length){if(available(this.items[index])){this.index=index;return this.items[index]}index+=direction;}
    return null;
  }
}

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
      if(node.kind==='declaration') {
        const declaration=lexOracle(statement.sql.slice(node.start,node.end)).filter(token=>token.kind!=='comment');
        const kind=declaration[0]?.quoted?null:declaration[0]?.value.toUpperCase();
        if(['CURSOR','TYPE','SUBTYPE'].includes(kind)&&declaration[1]?.kind==='identifier')
          items.push({name:declaration[1].value,kind,start:statement.start+node.start,end:statement.start+node.end,depth});
      }
      if(node.kind==='routine'||node.kind==='block') {
        const header=source.slice(statement.start+node.start,statement.start+(node.headerEnd||node.begin||node.start+90)).split(/\r?\n/)[0].trim();
        items.push({name:header||node.routineKind||'BEGIN / END',kind:node.routineKind||'Block',start:statement.start+node.start,end:statement.start+node.end,depth});
        depth++;
      }
      for(const child of [...(node.declarations||[]),...(node.children||[])])walk(child,depth);
    };
    if(tokens.some(token=>['DECLARE','BEGIN','PROCEDURE','FUNCTION','PACKAGE','TRIGGER','TYPE'].includes(token.value.toUpperCase())))walk(parsePlsql(statement.sql),1);
  }
  const regions=[];
  for(const token of lexOracle(source)){
    if(token.kind!=='comment'||!token.value.startsWith('--')||source.slice(source.lastIndexOf('\n',token.start-1)+1,token.start).trim())continue;
    const open=/^--\s*#region(?:\s+(.+))?\s*$/i.exec(token.value),close=/^--\s*#endregion\s*$/i.test(token.value);
    if(open)regions.push({name:open[1]?.trim()||'Region',start:token.start,depth:regions.length});
    else if(close&&regions.length){const region=regions.pop();items.push({...region,kind:'Region',end:token.end})}
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


export function sourceLineEnding(source){return /\r\n|\n/.exec(source)?.[0]||'\n'}
export function sourcePositionAt(source,offset){
 const prefix=source.slice(0,Math.max(0,Math.min(source.length,offset))),lines=prefix.split(/\r\n|\r|\n/);
 return {lineNumber:lines.length,column:lines.at(-1).length+1};
}

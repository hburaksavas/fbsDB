import {lexOracle} from './oracleLexer.js';
import {parsePlsql} from './plsqlStructure.js';
import {getSqlStatements} from './sqlStatements.js';

const word=token=>token?.kind==='identifier'&&!token.quoted?token.value.toUpperCase():null;
const fail=error=>({error});
const lineStart=(source,at)=>source.lastIndexOf('\n',at-1)+1;
const lineEnd=(source,at)=>{const end=source.indexOf('\n',at);return end<0?source.length:end+1};

function movePlsql(source,cursor,direction){
  const model=parsePlsql(source);if(!model.complete)return null;
  const lists=[];const walk=node=>{if(node.children?.length){lists.push(node.children);node.children.forEach(walk)}if(node.branches)node.branches.forEach(branch=>walk(branch));if(node.handlers)walk(node.handlers)};walk(model);
  for(const list of lists.reverse()){
    const at=list.findIndex(node=>node.start<=cursor&&cursor<=node.end);
    if(at<0)continue;
    const other=at+direction;if(other<0||other>=list.length)continue;
    const first=list[Math.min(at,other)],second=list[Math.max(at,other)];
    if(!['statement','block','if','case','loop'].includes(first.kind)||!['statement','block','if','case','loop'].includes(second.kind))return fail('Only sibling PL/SQL statements and blocks can be moved.');
    const a=lineStart(source,first.start),b=lineStart(source,second.start),end=lineEnd(source,second.end);
    if(a===b||source.slice(lineEnd(source,first.end),b).trim()||source.slice(a,first.start).trim()||source.slice(b,second.start).trim()||source.slice(first.end,lineEnd(source,first.end)).trim()||source.slice(second.end,end).trim())return fail('Place each statement or block on its own lines.');
    if(source.slice(a,first.start)!==source.slice(b,second.start))return fail('Sibling indentation must match.');
    const firstText=source.slice(a,b),secondText=source.slice(b,end);
    return {kind:'PL/SQL statement',edit:{start:a,end,before:source.slice(a,end),after:secondText+firstText},cursor:a+(direction<0?0:secondText.length)};
  }
  return null;
}

function moveSql(source,cursor,direction){
  const statement=getSqlStatements(source).find(item=>item.start<=cursor&&cursor<=item.end);if(!statement)return null;
  const tokens=lexOracle(source.slice(statement.start,statement.end)).map(token=>({...token,start:token.start+statement.start,end:token.end+statement.start}));
  if(tokens.some(token=>token.kind==='comment'))return fail('Comments in this SQL statement require manual movement.');
  const select=tokens.findIndex(token=>word(token)==='SELECT'&&token.depth===0);
  if(select<0)return null;
  const from=tokens.findIndex((token,at)=>at>select&&word(token)==='FROM'&&token.depth===0);
  if(from<0)return null;
  let kind,start,end,delimiters;
  if(cursor>=tokens[select].end&&cursor<tokens[from].start){kind='SELECT expression';start=select+1;end=from;delimiters=new Set([',']);if(['DISTINCT','ALL','UNIQUE'].includes(word(tokens[start])))return fail('SELECT modifiers require manual movement.');}
  else{
    const where=tokens.findIndex((token,at)=>at>from&&word(token)==='WHERE'&&token.depth===0);
    if(where<0||cursor<tokens[where].end)return null;
    const stop=tokens.findIndex((token,at)=>at>where&&token.depth===0&&['GROUP','ORDER','HAVING','UNION','MINUS','INTERSECT','FETCH','CONNECT','START','FOR'].includes(word(token)));
    kind='WHERE condition';start=where+1;end=stop<0?tokens.length:stop;if(tokens[end-1]?.value===';')end--;delimiters=new Set(['AND']);
    if(tokens.slice(start,end).some(token=>token.depth===0&&['OR','BETWEEN'].includes(word(token))))return fail('OR and BETWEEN conditions require manual movement.');
  }
  const items=[],separators=[];let begin=start;
  for(let i=start;i<=end;i++){
    const token=tokens[i],boundary=i===end||token.depth===0&&(kind==='SELECT expression'?delimiters.has(token.value):delimiters.has(word(token)));
    if(!boundary)continue;
    if(i===begin)return fail('An empty list item requires manual review.');
    items.push({start:tokens[begin].start,end:tokens[i-1].end});
    if(i<end)separators.push(i);begin=i+1;
  }
  const at=items.findIndex(item=>item.start<=cursor&&cursor<=item.end);if(at<0)return null;
  const other=at+direction;if(other<0||other>=items.length)return fail('No adjacent SQL item in that direction.');
  const joins=separators.map((index,at)=>source.slice(items[at].end,items[at+1].start));
  if(new Set(joins).size!==1)return fail('List separators differ; move these items manually.');
  const texts=items.map(item=>source.slice(item.start,item.end));[texts[at],texts[other]]=[texts[other],texts[at]];
  const range={start:items[0].start,end:items.at(-1).end};
  return {kind,edit:{...range,before:source.slice(range.start,range.end),after:texts.join(joins[0])},cursor:items[other].start};
}

export function planStatementMove(source,cursor,direction){
  if(source.length>100000)return fail('Statement movement is limited to 100,000 source characters.');
  if(![-1,1].includes(direction))return fail('Choose up or down.');
  return movePlsql(source,cursor,direction)||moveSql(source,cursor,direction)||fail('Place the caret on a supported PL/SQL statement, SELECT expression or WHERE condition.');
}

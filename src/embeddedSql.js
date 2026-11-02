import {lexOracle} from './oracleLexer.js';

const word=token=>token?.kind==='identifier'&&!token.quoted?token.value.toUpperCase():null;
const fail=error=>({error});

export function embeddedSqlAt(source,cursor){
  if(source.length>100000)return fail('Embedded SQL editing is limited to 100,000 source characters.');
  const tokens=lexOracle(source).filter(token=>token.kind!=='comment');
  for(let i=0;i<tokens.length-1;i++){
    if(word(tokens[i])!=='EXECUTE'||word(tokens[i+1])!=='IMMEDIATE')continue;
    const literal=tokens[i+2];
    if(cursor<tokens[i].start||cursor>(literal?.end??tokens[i+1].end))continue;
    if(!literal||literal.kind!=='string'||literal.open)return fail('EXECUTE IMMEDIATE must use one complete static SQL string literal. Dynamic expressions need manual editing.');
    if(tokens[i+3]?.value==='|'&&tokens[i+4]?.value==='|')return fail('Concatenated dynamic SQL fragments need manual editing.');
    const raw=source.slice(literal.start,literal.end);
    if(!raw.startsWith("'")||!raw.endsWith("'"))return fail('Only ordinary single-quoted Oracle literals are supported.');
    return {start:literal.start,end:literal.end,sql:raw.slice(1,-1).replace(/''/g,"'"),scope:'One static EXECUTE IMMEDIATE literal. Bind clauses remain in the parent source; concatenated and dynamic fragments are excluded.'};
  }
  return fail('Place the caret on EXECUTE IMMEDIATE or its static SQL literal.');
}

export function planEmbeddedSqlWrite(source,context,sql){
  if(typeof sql!=='string'||!sql.trim())return fail('Enter SQL before applying.');
  if(sql.includes('\0'))return fail('NUL characters cannot be stored in an Oracle SQL literal.');
  const current=embeddedSqlAt(source,context.start+1);
  if(current.error||current.start!==context.start||current.end!==context.end)return fail('The embedded SQL literal changed. Reopen the editor.');
  const after=`'${sql.replace(/'/g,"''")}'`;
  return {edit:{start:context.start,end:context.end,before:source.slice(context.start,context.end),after}};
}

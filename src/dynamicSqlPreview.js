import {lexOracle} from './oracleLexer.js';

const word=token=>token?.kind==='identifier'&&!token.quoted?token.value.toUpperCase():null;
const fail=error=>({error});

export function previewDynamicSql(source,cursor){
  if(source.length>100000)return fail('Dynamic SQL preview is limited to 100,000 source characters.');
  const tokens=lexOracle(source).filter(token=>token.kind!=='comment');
  for(let i=0;i<tokens.length-1;i++){
    if(word(tokens[i])!=='EXECUTE'||word(tokens[i+1])!=='IMMEDIATE')continue;
    const start=i+2;let end=start;
    while(end<tokens.length&&!(tokens[end].depth===tokens[i].depth&&(tokens[end].value===';'||['USING','INTO','RETURNING'].includes(word(tokens[end])))))end++;
    if(cursor<tokens[i].start||cursor>tokens[end]?.end&&cursor>tokens[end-1]?.end)continue;
    if(end===start)return fail('EXECUTE IMMEDIATE has no expression to preview.');
    const groups=[];let begin=start;
    for(let at=start;at<=end;at++){
      const separator=at<end&&tokens[at].depth===tokens[i].depth&&tokens[at].value==='|'&&tokens[at+1]?.value==='|';
      if(!separator&&at!==end)continue;
      if(at===begin)return fail('An empty dynamic SQL fragment needs manual review.');
      groups.push(tokens.slice(begin,at));
      begin=at+2;at++;
    }
    if(groups.length>32)return fail('Only the first 32 concatenated fragments can be previewed.');
    const fragments=groups.map(group=>{
      const raw=source.slice(group[0].start,group.at(-1).end);
      if(group.length===1&&group[0].kind==='string'&&!group[0].open&&raw.startsWith("'")&&raw.endsWith("'"))return {kind:'literal',source:raw,value:raw.slice(1,-1).replace(/''/g,"'")};
      return {kind:'unresolved',source:raw,value:`⟦unresolved: ${raw.slice(0,100)}${raw.length>100?'…':''}⟧`};
    });
    const preview=fragments.map(fragment=>fragment.value).join('');
    if(preview.length>20000)return fail('The preview would exceed 20,000 characters.');
    return {preview,fragments,complete:fragments.every(fragment=>fragment.kind==='literal'),scope:'Static literal fragments are decoded locally. Unresolved expressions, bind values and runtime SQL are not evaluated; nothing is executed.'};
  }
  return fail('Place the caret on an EXECUTE IMMEDIATE statement.');
}

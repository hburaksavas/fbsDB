import {lexOracle} from './oracleLexer.js';
import {parsePlsql} from './plsqlStructure.js';
import {oracleSymbolInfo,languageObjects} from './oracleLanguageService.js';
export {semanticTokenTypes} from './semanticTokensLegend.js';
export function semanticHighlights(source,start,end,options={}){
 const scope='Current visible source range; unresolved symbols are left unchanged. At most 2,000 identifiers and 64 metadata resolutions per request.';
 if(source.length>100000)return {tokens:[],scope,truncated:true,reason:'Semantic highlighting is limited to 100,000 source characters.'};
 const objects=languageObjects(options);
 const all=lexOracle(source).filter(token=>!['comment','string'].includes(token.kind)),parsed=parsePlsql(source),tokens=[];let identifiers=0,metadata=0,truncated=false;
 for(let index=0;index<all.length;index++){
  const token=all[index];if(token.kind!=='identifier'||token.start<start||token.end>end)continue;
  if(++identifiers>2000){truncated=true;break}
  const key=token.quoted?token.value:token.value.toUpperCase(),qualified=all[index-1]?.value==='.';
  let local;
  if(!qualified)for(const scope of parsed.scopes.filter(scope=>scope.start<=token.start&&token.start<=scope.end).sort((a,b)=>b.start-a.start)){
   local=[...scope.symbols].reverse().find(symbol=>symbol.key===key&&symbol.start<=token.end);if(local)break;
  }
  let type=local?.kind==='parameter'?'parameter':['variable','constant','cursor'].includes(local?.kind)?'variable':local?.kind==='routine'?'method':null;
  if(!type&&metadata<64){
   // Resolve qualified members and SQL columns through the same identities as F12/hover.
   const possible=qualified||objects.some(object=>object.columns?.some(column=>column.name===key));
   if(possible){metadata++;const info=oracleSymbolInfo(source,token.start+1,options);type=info?.target?.member?'method':info?.target?.column?'property':qualified&&info?.localStart!=null?'property':null;}
  }else if(!type&&qualified)truncated=true;
  if(type)tokens.push({start:token.start,end:token.end,type});
 }
 return {tokens,scope,truncated};
}

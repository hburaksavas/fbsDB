import {lexOracle} from './oracleLexer.js';
import {getOracleVocabulary} from './oracleCompletion.js';
import {oracleReferenceLocations,oracleSymbolInfo} from './oracleLanguageService.js';

const validName=name=>/^[A-Za-z][A-Za-z0-9_$#]*$/.test(name)&&new TextEncoder().encode(name).length<=128;
const keywords=new Set(getOracleVocabulary(19).filter(item=>item.kind==='keyword').map(item=>item.name));

export function planLocalRename(source,cursor,newName,options={}){
  if(source.length>100000)return {error:'Local rename is limited to 100,000 source characters.'};
  const symbol=oracleSymbolInfo(source,cursor,options);
  if(!symbol||!['variable','parameter'].includes(symbol.localKind)||symbol.localStart==null)return {error:'Place the caret on a local variable or parameter.'};
  const original=source.slice(symbol.start,symbol.end);
  if(!validName(newName)||keywords.has(newName.toUpperCase()))return {error:'Enter a non-keyword Oracle identifier up to 128 bytes.'};
  if(original===newName)return {error:'Enter a different name.'};
  const report=oracleReferenceLocations(source,cursor,options);
  if(report.truncated||report.reason||!report.locations.length)return {error:report.reason||'Reference analysis is incomplete; select a smaller source.'};
  const tokens=lexOracle(source);
  const collision=tokens.filter(token=>token.kind==='identifier'&&token.value.toUpperCase()===newName.toUpperCase()).some(token=>{
    const found=oracleSymbolInfo(source,token.start+1,options);
    return found?.localStart!=null&&found.localStart!==symbol.localStart&&['variable','parameter'].includes(found.localKind);
  });
  if(collision)return {error:'Another local variable or parameter already uses this name.'};
  const edits=report.locations.filter(location=>!tokens.some(token=>token.end===location.start&&token.value===':')).map(location=>({...location,before:source.slice(location.start,location.end),after:newName}));
  if(!edits.some(edit=>edit.declaration))return {error:'The declaration could not be verified.'};
  return {original,newName,edits,scope:report.scope};
}

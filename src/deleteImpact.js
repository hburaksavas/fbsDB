import {oracleReferenceLocations,oracleSymbolInfo} from './oracleLanguageService.js';

export function deleteImpactSeed(source,cursor,options={}){
  const symbol=oracleSymbolInfo(source,cursor,options);
  if(!symbol||!['routine','parameter'].includes(symbol.localKind)||symbol.localStart==null)return {error:'Place the caret on a local procedure, function or parameter.'};
  const report=oracleReferenceLocations(source,cursor,options);
  return {name:symbol.lookupName,kind:symbol.localKind,localReferences:report.locations.filter(item=>!item.declaration).length,localComplete:!report.truncated&&!report.reason,localReason:report.reason||null,scope:report.scope};
}

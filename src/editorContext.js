import {lexOracle} from './oracleLexer.js';
import {oracleSymbolInfo} from './oracleLanguageService.js';
export function editorContextObject(source,start,end,caret,objects,schema){
 const selected=end>start?source.slice(start,end):'';
 if(selected){
  const tokens=lexOracle(selected);
  if(!tokens.length||tokens.length>5||tokens.some((token,index)=>index%2?token.value!=='.':token.kind!=='identifier'))return null;
  const names=tokens.filter((_,index)=>index%2===0).map(token=>token.quoted?token.value:token.value.toUpperCase());
  const candidates=names.length>2?[]:objects.filter(object=>object.name===names.at(-1)&&(names.length<2||object.owner===names.at(-2)));
  const exact=candidates.find(object=>object.owner===schema)||(candidates.length===1?candidates[0]:null);
  if(exact)return exact;
  if(candidates.length>1)return null;
 }
 const symbol=oracleSymbolInfo(source,selected?Math.min(end-1,start+selected.length-1):caret,{objects,currentSchema:schema});
 return symbol?.target?objects.find(object=>object.name===symbol.target.name&&object.owner===symbol.target.owner&&object.type===symbol.target.type)||null:null;
}

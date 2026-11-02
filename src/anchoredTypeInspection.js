import {lexOracle} from './oracleLexer.js';
import {plsqlVisibleSymbols} from './plsqlStructure.js';
const key=t=>t.quoted?t.value:t.value.toUpperCase();
export function anchoredColumnType(column){
 const type=column.type||'Type unavailable';if(type.includes('('))return type;
 if(type==='NUMBER'&&Number.isInteger(column.precision))return `NUMBER(${column.precision}${Number.isInteger(column.scale)?','+column.scale:''})`;
 if(['VARCHAR2','CHAR','NVARCHAR2','NCHAR'].includes(type)){
  const size=column.lengthUnit==='CHAR'?column.characterLength:column.length;
  if(Number.isInteger(size))return `${type}(${size}${['VARCHAR2','CHAR'].includes(type)&&column.lengthUnit?' '+column.lengthUnit:''})`;
 }
 return type;
}
export function metadataFreshness(object,now=Date.now()){
 if(!object)return 'Metadata unavailable; connect and refresh Oracle metadata.';
 if(object.metadataExpiresAt&&object.metadataExpiresAt<=now)return 'Stale metadata snapshot · refresh Oracle metadata before relying on this type.';
 return object.metadataFetchedAt?`Metadata snapshot retrieved ${new Date(object.metadataFetchedAt).toISOString()}. Refresh after schema DDL; current server freshness is unverified.`:'Metadata age unknown · refresh Oracle metadata; current server freshness is unverified.';
}
export function inspectAnchoredType(reference,source,cursor,objects=[],currentSchema='',visited=new Set()){
 if(!/%(?:ROWTYPE|TYPE)$/i.test(reference||''))return null;
 if(visited.has(reference)||visited.size>=24)return {reference,error:'Cyclic or unsupported anchored type reference.'};
 visited=new Set(visited).add(reference);
 const parts=lexOracle(reference).filter(t=>t.kind==='identifier').map(key),row=parts.at(-1)==='ROWTYPE',names=parts.slice(0,-1);
 if(!row&&names.length===1){
  const local=[...plsqlVisibleSymbols(source,cursor)].reverse().find(s=>s.key===names[0]);
  if(!local)return {reference,error:'Local anchored declaration is unavailable.'};
  const nested=inspectAnchoredType(local.type,source,local.start,objects,currentSchema,visited);
  return nested?{...nested,reference}: {reference,resolvedType:local.type,local:true};
 }
 const relationParts=row?names:names.slice(0,-1),name=relationParts.at(-1),owner=relationParts.length===2?relationParts[0]:currentSchema;
 if(!name||relationParts.length>2)return {reference,error:'Unsupported anchored object path.'};
 const candidates=objects.filter(o=>o.name===name&&(!owner||o.owner===owner)&&['TABLE','VIEW','MATERIALIZED VIEW','SYNONYM'].includes(o.type));
 if(candidates.length!==1)return {reference,error:candidates.length?'Ambiguous anchored object identity.':'Anchored object metadata is unavailable.'};
 const object=candidates[0];
 if(!object.columns?.length)return {reference,object,error:'Column metadata is unavailable or inaccessible.'};
 if(row)return {reference,object,fields:object.columns.slice(0,200).map(column=>({...column,displayType:anchoredColumnType(column)})),truncated:object.columns.length>200};
 const column=object.columns.find(c=>c.name===names.at(-1));
 return column?{reference,object,resolvedType:anchoredColumnType(column),column}:{reference,object,error:'Anchored column metadata is unavailable.'};
}

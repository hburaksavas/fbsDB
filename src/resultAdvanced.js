import {ExactDecimal} from './exactDecimal.js';
import { matchesCondition, sqlIdentifier } from './resultFeatures.js';
export function filterTreeMatches(row, options = {}) {
 const groups=options.filterGroups||[], rules=options.filters||[];
 const evaluate=(id,seen=new Set())=>{
  if(seen.has(id))return true;
  const next=new Set([...seen,id]);
  const items=[...rules.filter(r=>(r.group||'root')===id).map(r=>matchesCondition(row[r.column],{caseSensitive:options.caseSensitive,locale:options.sortLocale,...r})),...groups.filter(g=>(g.parent||'root')===id).map(g=>evaluate(g.id,next)).filter(value=>value!==null)];
  if(!items.length)return id==='root'?true:null;
  return (id==='root'?options.filterLogic:groups.find(g=>g.id===id)?.logic)==='or'?items.some(Boolean):items.every(Boolean);
 };
 return evaluate('root');
}
export function groupedResultSummary(rows,columns,groupColumns=[],valueColumn=0){
 const groups=new Map();for(const {row} of rows){const key=JSON.stringify(groupColumns.map(i=>row[i]??null));if(!groups.has(key))groups.set(key,{values:groupColumns.map(i=>row[i]),count:0,numeric:[],exact:false});const group=groups.get(key);group.count++;if(row[valueColumn]!=null&&row[valueColumn]!==''){try{group.numeric.push(new ExactDecimal(row[valueColumn]));group.exact ||= typeof row[valueColumn]==='string'}catch{}}}
 return {columns:[...groupColumns.map(i=>columns[i]),...['COUNT','SUM','AVG','MIN','MAX'].map(name=>({name,type:'NUMBER'}))],rows:[...groups.values()].map((g,index)=>{const sum=g.numeric.reduce((a,b)=>a.add(b),new ExactDecimal(0)),value=d=>g.exact?d.toString():Number(d.toString());return {index,row:[...g.values,g.count,g.numeric.length?value(sum):null,g.numeric.length?value(sum.div(g.numeric.length)):null,g.numeric.length?value(g.numeric.reduce((a,b)=>a.compare(b)<=0?a:b)):null,g.numeric.length?value(g.numeric.reduce((a,b)=>a.compare(b)>=0?a:b)):null]}})};
}
export function visibleWhitespace(text){return String(text).replace(/ /g,'·').replace(/\t/g,'→\t').replace(/\r\n|\r|\n/g,'↵\n')}
export function textLengths(value){const text=String(value??'');return {characters:Array.from(text).length,utf16:text.length,utf8:new TextEncoder().encode(text).length}}
export function blobBytes(value){if(value?.kind==='binary')return Uint8Array.from(atob(value.base64),x=>x.charCodeAt(0));return null}
export function binaryMime(bytes){if(bytes[0]===137&&bytes[1]===80)return'image/png';if(bytes[0]===255&&bytes[1]===216)return'image/jpeg';if(String.fromCharCode(...bytes.slice(0,3))==='GIF')return'image/gif';if(String.fromCharCode(...bytes.slice(0,4))==='%PDF')return'application/pdf';return'application/octet-stream'}
export function buildServerFilter(sql, columns, options={}, existingParameters=[]) {
 const text=String(sql||'').trim().replace(/;\s*$/,'');
 if(!/^(SELECT|WITH)\b/i.test(text))throw new Error('Server filtering requires a SELECT result.');
 const names=columns.map(c=>c.name.toUpperCase());if(new Set(names).size!==names.length)throw new Error('Give duplicate result columns unique SQL aliases before server filtering.');
 const parameters=[...existingParameters],prefix='fbs_filter_'+Date.now().toString(36)+'_';
 const bind=(value,kind='text')=>{const name=prefix+parameters.length;parameters.push({name,type:kind==='number'?'NUMBER':kind==='date'?'DATE':'VARCHAR2',value:String(value??'')});return ':'+name};
 const condition=rule=>{
  if(!columns[rule.column])throw new Error('Filter column no longer exists.');
  const column=sqlIdentifier(columns[rule.column].name),op=rule.op;
  if(op==='null')return column+' IS NULL';if(op==='notNull')return column+' IS NOT NULL';
  if(op==='regex'){new RegExp(rule.value||'');return `REGEXP_LIKE(${column}, ${bind(rule.value)}, '${rule.caseSensitive??options.caseSensitive?'c':'i'}')`}
  const insensitive=!(rule.caseSensitive??options.caseSensitive)&&(!rule.kind||rule.kind==='text');
  const left=insensitive?`LOWER(${column})`:column;
  const right=value=>{const b=bind(value,rule.kind);return insensitive?`LOWER(${b})`:b};
  if(op==='in'){const values=(rule.values||[]).slice(0,1000);const list=values.length?`${column} IN (${values.map(value=>bind(value)).join(', ')})`:'';return [list,rule.includeNull?`${column} IS NULL`:''].filter(Boolean).join(' OR ').replace(/^(.* OR .*)$/,'($1)')||'1 = 0'}
  if(op==='between')return `${left} BETWEEN ${right(rule.value)} AND ${right(rule.to)}`;
  const operators={equals:'=',notEquals:'<>',gt:'>',gte:'>=',lt:'<',lte:'<='};
  if(operators[op])return `${left} ${operators[op]} ${right(rule.value)}`;
  const escape=value=>String(value??'').replace(/[\\%_]/g,m=>'\\'+m);
  const value=(op==='ends'||op==='contains'?'%':'')+escape(rule.value)+(op==='starts'||op==='contains'?'%':'');
  return `${left} LIKE ${right(value)} ESCAPE '\\'`;
 };
 const groups=options.filterGroups||[];
 const group=(id,seen=new Set())=>{if(seen.has(id))throw new Error('Circular filter group.');const next=new Set([...seen,id]);const parts=[...(options.filters||[]).filter(r=>(r.group||'root')===id).map(condition),...groups.filter(g=>(g.parent||'root')===id).map(g=>group(g.id,next)).filter(Boolean)];const logic=(id==='root'?options.filterLogic:groups.find(g=>g.id===id)?.logic)==='or'?' OR ':' AND ';return parts.length?'('+parts.join(logic)+')':''};
 const where=group('root');if(!where)throw new Error('Add at least one filter first.');
 return {sql:`SELECT * FROM (\n${text}\n) fbs_result\nWHERE ${where}`,parameters};
}

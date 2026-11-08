import { oracleTemporalSqlLiteral } from './oracleTemporal.js';
import {ExactDecimal,compileArithmetic} from './exactDecimal.js';
import {sqlIdentifier,sqlLiteral} from './resultFeatures.js';
export function extractJsonPath(input,path){
 const root=typeof input==='string'?JSON.parse(input):input;if(typeof path!=='string'||!path.startsWith('$'))throw new Error('JSONPath must start with $');
 let values=[root],offset=1,plural=false;
 const descendants=(value,includeSelf=false)=>{const result=[];const seen=new Set();const visit=node=>{if(!node||typeof node!=='object'||seen.has(node))return;seen.add(node);for(const child of Object.values(node)){result.push(child);visit(child)}};if(includeSelf)result.push(value);visit(value);return result};
 while(offset<path.length){
  if(path.startsWith('..',offset)){
   offset+=2;let key='*';if(path[offset]==='*')offset++;else{const match=path.slice(offset).match(/^[A-Za-z_$][\w$-]*/);if(!match)throw new Error('Expected a property name or * after .. at '+offset);key=match[0];offset+=key.length}plural=true;
   values=values.flatMap(value=>descendants(value).flatMap(node=>key==='*'?[node]:node&&typeof node==='object'&&Object.hasOwn(node,key)?[node[key]]:[]));continue;
  }
  let key,match;
  if(path[offset]==='.'){
   offset++;if(path[offset]==='*'){key='*';offset++}else{match=path.slice(offset).match(/^[A-Za-z_$][\w$-]*/);if(!match)throw new Error('Expected a property name or * at '+offset);key=match[0];offset+=key.length}
  }else if(path[offset]==='['){
   const token=/^\[(?:(\d+)|\*|'([^']*)'|"([^"]*)")\]/.exec(path.slice(offset));if(!token)throw new Error('Unsupported JSONPath selector at '+offset);key=token[1]??token[2]??token[3]??'*';offset+=token[0].length;
  }else throw new Error('Unsupported JSONPath at '+offset);
  if(key==='*')plural=true;
  values=values.flatMap(value=>key==='*'?value&&typeof value==='object'?Array.isArray(value)?value:Object.values(value):[]:value!=null&&Object.hasOwn(Object(value),key)?[value[key]]:[]);
 }
 return plural?values:values[0]??null;
}
export function deriveResultData(rows,baseColumns,definitions=[]){const columns=[...baseColumns],evaluators=[];for(const definition of definitions){if(!definition.name?.trim())continue;if(columns.some(c=>c.name.toUpperCase()===definition.name.toUpperCase()))throw new Error('Duplicate derived column '+definition.name);const source=definition.source??0;const fn=definition.kind==='json'?row=>{if(row[source]==null)return null;const value=extractJsonPath(row[source],definition.expression);return value!=null&&typeof value==='object'?JSON.stringify(value):value}:compileArithmetic(definition.expression,columns);evaluators.push(fn);columns.push({name:definition.name,type:definition.kind==='json'?(definition.type||'VARCHAR2'):'NUMBER',derived:true,expression:definition.expression})}return {columns,rows:(rows||[]).map(row=>{const output=[...row];for(const evaluate of evaluators){try{output.push(evaluate(output))}catch(error){output.push('#ERROR: '+error.message)}}return output})}}
export function pivotResult(rows,columns,options={}){const keys=options.pivotRows||[],pivot=Number(options.pivotColumn||0),value=Number(options.pivotValue||0),aggregate=options.pivotAggregate||'sum',labels=[...new Map(rows.map(({row})=>[JSON.stringify(row[pivot]??null),row[pivot]??null])).values()];if(labels.length>100)throw new Error('Pivot has more than 100 distinct columns; filter the result first.');const groups=new Map();for(const {row} of rows){const key=JSON.stringify(keys.map(i=>row[i]??null)),p=JSON.stringify(row[pivot]??null);if(!groups.has(key))groups.set(key,{values:keys.map(i=>row[i]),cells:new Map()});const cells=groups.get(key).cells;if(!cells.has(p))cells.set(p,[]);if(aggregate==='count'||row[value]!=null)cells.get(p).push(row[value])}const calculate=items=>{if(aggregate==='count')return items.length;if(!items.length)return null;try{const values=items.map(v=>new ExactDecimal(v));if(aggregate==='min'||aggregate==='max')return values.reduce((a,b)=>a.compare(b)*(aggregate==='min'?1:-1)<=0?a:b).toString();const sum=values.reduce((a,b)=>a.add(b),new ExactDecimal(0));return aggregate==='avg'?sum.div(values.length).toString():sum.toString()}catch{return null}};return {columns:[...keys.map(i=>columns[i]),...labels.map(label=>({name:String(label??'NULL'),type:'NUMBER'}))],rows:[...groups.values()].map((group,index)=>({index,row:[...group.values,...labels.map(label=>calculate(group.cells.get(JSON.stringify(label))||[]))]}))}}
export function estimateResultMemory(result){if(!result)return 0;let bytes=(result.columns?.length||0)*150;for(const row of result.rows||[]){bytes+=row.length*16;for(const value of row){bytes+=typeof value==='string'?value.length*2:value?.kind==='binary'?(value.base64?.length||0)*2:value?.kind==='lob'?String(value.preview??'').length*2+96:8}}return bytes}
export function exportMetadata(columns){return columns.map((column,index)=>({position:index+1,...column}))}
export function csvText(rows,columns,options={}){const delimiter=options.delimiter==='tab'?'\t':options.delimiter||',',newline=options.newline==='lf'?'\n':'\r\n';const field=value=>{const text=value==null?(options.nullValue??''):value?.kind==='binary'?value.base64:String(value);return options.quote==='always'||text.includes(delimiter)||/["\r\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text};return [...(options.headers===false?[]:[columns.map(c=>c.name)]),...rows].map(row=>row.map(field).join(delimiter)).join(newline)}
export function qualifiedIdentifier(text){const parts=[];let value='',quoted=false,wasQuoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++}else{quoted=!quoted;wasQuoted=true}}else if(ch==='.'&&!quoted){parts.push({value:value.trim(),quoted:wasQuoted});value='';wasQuoted=false}else value+=ch}if(quoted)throw new Error('Unclosed quoted identifier');parts.push({value:value.trim(),quoted:wasQuoted});if(parts.some(part=>!part.value||!part.quoted&&!/^[A-Za-z_][\w$#]*$/.test(part.value)))throw new Error('Invalid target identifier');return parts.map(part=>sqlIdentifier(part.value)).join('.')}
export function mergeDraftData(rows,columns,keys,table,excludeLargeBinary=false){
 if(!keys.length||keys.some(i=>!Number.isInteger(i)||i<0||i>=columns.length))throw new Error('Choose valid matching columns.');
 const oversized=columns.map((_,i)=>i).filter(i=>rows.some(row=>row[i]?.kind==='binary'&&row[i].byteLength>2000||row[i]?.kind==='lob'));
 if(oversized.length&&!excludeLargeBinary)throw new Error('Binary values larger than 2,000 bytes cannot be embedded. Enable omission of large binary columns; omitted columns keep their values on UPDATE and use database defaults on INSERT.');
 if(oversized.some(i=>keys.includes(i)))throw new Error('A matching key contains large binary data and cannot be omitted. Choose another matching key.');
 const included=columns.map((_,i)=>i).filter(i=>!excludeLargeBinary||!oversized.includes(i));
 const sql=generateMerge(rows.map(row=>included.map(i=>row[i])),included.map(i=>columns[i]),keys.map(i=>included.indexOf(i)),table);
 const omitted=excludeLargeBinary?oversized.map(i=>columns[i].name):[];
 return (omitted.length?'-- Omitted binary columns: '+omitted.map(name=>String(name).replace(/[\r\n]/g,' ')).join(', ')+'\n-- UPDATE preserves these columns. INSERT uses database defaults; required columns without defaults may fail.\n\n':'')+sql;
}
export function typedSqlLiteral(value,column={}){
 if(value==null)return 'NULL';const type=column.type||'';
 if(value?.kind==='temporal')return oracleTemporalSqlLiteral(value,type);
 if(value?.kind==='lob')throw new Error('Load large values fully in the cell viewer, or exclude their columns, before creating MERGE drafts.');
 if(value?.kind==='binary'){if(value.byteLength>2000)throw new Error('Exclude binary values larger than 2,000 bytes from MERGE drafts.');const hex=Array.from(atob(value.base64),ch=>ch.charCodeAt(0).toString(16).padStart(2,'0')).join('');return /BLOB/i.test(type)?`TO_BLOB(HEXTORAW('${hex}'))`:`HEXTORAW('${hex}')`}
 if(/NUMBER|INT|DECIMAL|FLOAT/i.test(type)&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(String(value)))return String(value);
 if(/DATE|TIME/i.test(type)){const match=String(value).match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/);if(match){if(!match[2])return `TO_DATE('${match[1]}','YYYY-MM-DD')`;const zone=match[4]==='Z'?'+00:00':match[4];const timestamp=match[1]+' '+match[2]+(match[3]||'');return zone&&/TIME ZONE/i.test(type)?`TO_TIMESTAMP_TZ('${timestamp} ${zone}','YYYY-MM-DD HH24:MI:SS${match[3]?'.FF':''} TZH:TZM')`:`TO_TIMESTAMP('${timestamp}','YYYY-MM-DD HH24:MI:SS${match[3]?'.FF':''}')`}}
 return sqlLiteral(value);
}
export function generateMerge(rows,columns,keys,table){if(!keys.length||!table.trim())throw new Error('Choose a target table and matching columns.');const names=columns.map(c=>sqlIdentifier(c.sourceColumn||c.name)),target=qualifiedIdentifier(table);const literal=(value,i)=>typedSqlLiteral(value,columns[i]);return rows.map(row=>{if(keys.some(i=>row[i]==null))throw new Error('MERGE keys cannot be NULL.');const updates=names.map((name,i)=>keys.includes(i)?null:`t.${name} = s.${name}`).filter(Boolean);return `MERGE INTO ${target} t\nUSING (SELECT ${row.map((v,i)=>`${literal(v,i)} AS ${names[i]}`).join(', ')} FROM DUAL) s\nON (${keys.map(i=>`t.${names[i]} = s.${names[i]}`).join(' AND ')})\n${updates.length?`WHEN MATCHED THEN UPDATE SET ${updates.join(', ')}\n`:''}WHEN NOT MATCHED THEN INSERT (${names.join(', ')}) VALUES (${names.map(name=>'s.'+name).join(', ')});`}).join('\n\n')}

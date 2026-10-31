import {lexOracle} from './oracleLexer.js';

export const oracleInspectorTabs={
 TABLE:['Overview','Columns','Constraints','Indexes','Related tables','Definition','Grants','Dependencies','Impact'],
 VIEW:['Overview','Columns','Definition','Grants','Dependencies','Impact'],
 'MATERIALIZED VIEW':['Overview','Columns','Refresh','Definition','Grants','Dependencies','Impact'],
 SYNONYM:['Overview','Target','Columns','Definition'],
 PACKAGE:['Overview','Members','Specification','Body','Errors','Grants','Dependencies','Impact'],
 PROCEDURE:['Overview','Parameters','Source','Errors','Grants','Dependencies','Impact'],
 FUNCTION:['Overview','Parameters','Source','Errors','Grants','Dependencies','Impact'],
 TRIGGER:['Overview','Trigger','Source','Errors','Dependencies','Impact'],
 SEQUENCE:['Overview','Sequence','Definition','Grants','Dependencies','Impact'],
 INDEX:['Overview','Columns','Index','Definition','Dependencies','Impact'],
 CONSTRAINT:['Overview','Columns','Constraint'],
 TYPE:['Overview','Attributes','Methods','Specification','Body','Errors','Grants','Dependencies','Impact'],
 'DATABASE LINK':['Overview','Target'],
};
export const objectIdentifier=value=>`"${String(value).replaceAll('"','""')}"`;
export const qualifiedObject=object=>[object.owner,object.name].filter(Boolean).map(objectIdentifier).join('.');
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
function declarationType(type){
 if(!type||/[;\r\n]/.test(type))throw Error('A parameter type cannot be represented safely in a call template.');
 const scalar={'VARCHAR2':'VARCHAR2(32767)','NVARCHAR2':'NVARCHAR2(16383)','CHAR':'CHAR(1)','NCHAR':'NCHAR(1)','RAW':'RAW(32767)','PL/SQL BOOLEAN':'BOOLEAN','PL/SQL PLS INTEGER':'PLS_INTEGER','PL/SQL BINARY INTEGER':'BINARY_INTEGER'};
 return scalar[type.toUpperCase()]||type;
}

export function oracleObjectMenu(object,favorite=false){
 const type=object.type,tabs=oracleInspectorTabs[type]||['Overview'];
 const actions=[{id:'details:Overview',label:'Open details',icon:'details'}];
 if(['TABLE','VIEW','MATERIALIZED VIEW','SYNONYM'].includes(type))actions.push({id:'sql:select',label:'Open SELECT…',icon:'sql'});
 const generated=[];
 if(type==='TABLE')for(const kind of ['insert','update','merge'])generated.push({id:'sql:'+kind,label:kind.toUpperCase()+' template',icon:'sql'});
 if(['PACKAGE','PROCEDURE','FUNCTION'].includes(type))generated.push({id:'sql:call',label:type==='PACKAGE'?'Call member…':'Call block…',icon:'sql'});
 if(type==='SEQUENCE')generated.push({id:'sql:nextval',label:'NEXTVAL template',icon:'sql'});
 if(type==='DATABASE LINK')generated.push({id:'sql:remote',label:'Remote query template',icon:'sql'});
 if(generated.length)actions.push({id:'generate',label:'Generate SQL',icon:'sql',children:generated});
 actions.push({separator:true});
 for(const view of tabs.filter(tab=>!['Overview','Definition','Source'].includes(tab)))actions.push({id:'details:'+view,label:view==='Errors'?'Compilation errors':view,icon:'details'});
 if(type==='SYNONYM')actions.push({id:'target',label:'Go to target',icon:'link'});
 if(['INDEX','CONSTRAINT','TRIGGER'].includes(type))actions.push({id:'table',label:'Go to table',icon:'link'});
 const maintenance=[];
 if(['PACKAGE','TYPE'].includes(type))for(const part of ['body','specification'])maintenance.push({id:'sql:compile-'+part,label:'Compile '+part+' template',icon:'sql'});
 if(['PROCEDURE','FUNCTION','TRIGGER','VIEW'].includes(type))maintenance.push({id:'sql:compile',label:'Compile template',icon:'sql'});
 if(type==='TRIGGER')for(const state of ['enable','disable'])maintenance.push({id:'sql:'+state,label:state[0].toUpperCase()+state.slice(1)+' template',icon:'sql'});
 if(type==='INDEX')maintenance.push({id:'sql:rebuild',label:'Rebuild template',icon:'sql'});
 if(type==='MATERIALIZED VIEW')maintenance.push({id:'sql:refresh',label:'Refresh template',icon:'sql'});
 actions.push({separator:true});
 if(!['CONSTRAINT','DATABASE LINK'].includes(type))actions.push({id:'ddl',label:['PACKAGE','PROCEDURE','FUNCTION','TRIGGER','TYPE'].includes(type)?'Source / DDL':'DDL',icon:'source',children:[{id:'ddl:open',label:'Open in editor',icon:'source'},...(['PACKAGE','TYPE'].includes(type)?[{id:'ddl:body-open',label:'Open body in editor',icon:'source'}]:[]),{id:'ddl:copy',label:'Copy',icon:'copy'},{id:'ddl:save',label:'Save as…',icon:'source'}]});
 if(maintenance.length)actions.push({id:'maintenance',label:'Maintenance SQL',icon:'sql',children:maintenance});
 actions.push({id:'copy',label:'Copy',icon:'copy',children:[{id:'copy:name',label:'Object name',icon:'copy'},{id:'copy:qualified',label:'Qualified name',icon:'copy'}]}, {id:'favorite',label:favorite?'Remove from favorites':'Add to favorites',icon:'star'}, {id:'refresh',label:'Refresh metadata',icon:'refresh'});
 return actions;
}

export function objectSqlDraft(object,kind,metadata={}){
 const name=qualifiedObject(object),type=object.type;
 if(kind==='select'&&['TABLE','VIEW','MATERIALIZED VIEW','SYNONYM'].includes(type))return `SELECT *\nFROM ${name};\n`;
 if(kind==='nextval'&&type==='SEQUENCE')return `SELECT ${name}.NEXTVAL\nFROM dual;\n`;
 if(kind==='remote'&&type==='DATABASE LINK')return `-- Replace <schema> and <table> before running.\nSELECT *\nFROM <schema>.<table>@${objectIdentifier(object.name)};\n`;
 if(kind==='refresh'&&type==='MATERIALIZED VIEW')return `BEGIN\n  DBMS_MVIEW.REFRESH(list => ${literal(name)}, method => :refresh_method);\nEND;\n/\n`;
 if(kind==='rebuild'&&type==='INDEX')return `ALTER INDEX ${name} REBUILD;\n`;
 if(['enable','disable'].includes(kind)&&type==='TRIGGER')return `ALTER TRIGGER ${name} ${kind.toUpperCase()};\n`;
 if(['compile','compile-body','compile-specification'].includes(kind)&&['PACKAGE','TYPE','PROCEDURE','FUNCTION','TRIGGER','VIEW'].includes(type)&& (kind==='compile'||['PACKAGE','TYPE'].includes(type))){
  const part=kind==='compile-body'?' BODY':kind==='compile-specification'?' SPECIFICATION':'';
  return `ALTER ${type} ${name} COMPILE${part}${type==='VIEW'?'':' REUSE SETTINGS'};\n`;
 }
 if(['insert','update','merge'].includes(kind)&&type==='TABLE'){
  const all=metadata.columns||[],columns=all.filter(c=>c.writable!==false),keys=all.filter(c=>c.primaryKey);
  if(!columns.length)throw Error('No writable columns are available for this table.');
  const bind=c=>`:p${all.indexOf(c)+1}`,q=c=>objectIdentifier(c.name);
  if(kind==='insert')return `INSERT INTO ${name} (\n  ${columns.map(q).join(',\n  ')}\n) VALUES (\n  ${columns.map(bind).join(',\n  ')}\n);\n`;
  if(!keys.length)throw Error('A verified primary key is required for an UPDATE or MERGE template.');
  const changes=columns.filter(c=>!c.primaryKey);
  if(!changes.length)throw Error('No writable non-key columns are available.');
  if(kind==='update')return `UPDATE ${name}\nSET ${changes.map(c=>`${q(c)} = ${bind(c)}`).join(',\n    ')}\nWHERE ${keys.map(c=>`${q(c)} = ${bind(c)}`).join('\n  AND ')};\n`;
  const source=all.filter(c=>c.primaryKey||columns.includes(c));
  return `MERGE INTO ${name} t\nUSING (SELECT ${source.map(c=>`${bind(c)} AS ${q(c)}`).join(', ')} FROM dual) s\nON (${keys.map(c=>`t.${q(c)} = s.${q(c)}`).join(' AND ')})\nWHEN MATCHED THEN UPDATE SET\n  ${changes.map(c=>`t.${q(c)} = s.${q(c)}`).join(',\n  ')}\nWHEN NOT MATCHED THEN INSERT (${columns.map(q).join(', ')})\nVALUES (${columns.map(c=>`s.${q(c)}`).join(', ')});\n`;
 }
 if((kind==='call'||kind.startsWith('call:'))&&['PACKAGE','PROCEDURE','FUNCTION'].includes(type)){
  const routines=(metadata.members||[]).filter(r=>kind==='call'||String(r.subprogramId)===kind.slice(5));
  if(routines.length!==1)throw Error(routines.length?'Multiple overloads are available. Review Parameters before choosing a call signature.':'No accessible call signature is available.');
  const routine=routines[0],parameters=routine.parameters||[],declarations=[],argumentsList=[],isFunction=type==='FUNCTION'||type==='PACKAGE'&&Boolean(routine.returnType),callName=type==='PACKAGE'?name+'.'+objectIdentifier(routine.name):name;
  parameters.forEach((p,i)=>{
    declarations.push(`  v_arg${i+1} ${declarationType(p.type)}${p.mode==='OUT'?'':` := :p${i+1}`};`);
    argumentsList.push(`${objectIdentifier(p.name)} => v_arg${i+1}`);
  });
  if(isFunction){
    if(!routine.returnType||/[;\r\n]/.test(routine.returnType))throw Error('The return type is unavailable.');
    declarations.push(`  v_result ${declarationType(routine.returnType)};`);
  }
  return `${declarations.length?'DECLARE\n'+declarations.join('\n')+'\n':''}BEGIN\n  ${isFunction?'v_result := ':''}${callName}${argumentsList.length?'(\n    '+argumentsList.join(',\n    ')+'\n  )':''};\nEND;\n/\n`;
 }
 throw Error('This SQL action is not available for this object type.');
}

export function editableObjectDefinition(object,text){
 if(!text?.trim())throw Error('The definition is unavailable.');
 if(!['PACKAGE','PROCEDURE','FUNCTION','TRIGGER','TYPE'].includes(object.type))return text;
 const tokens=lexOracle(text).filter(t=>t.kind!=='comment');
 if(tokens[0]?.value.toUpperCase()==='CREATE')return text;
 if(tokens[0]?.value.toUpperCase()!==object.type)throw Error('The source declaration could not be identified.');
 const index=tokens[1]?.value.toUpperCase()==='BODY'?2:1,start=tokens[index]?.start;
 const end=tokens[index+1]?.value==='.'?tokens[index+2]?.end:tokens[index]?.end;
 if(start==null||end==null)throw Error('The source name is unavailable.');
 return `CREATE OR REPLACE ${text.slice(0,start)}${qualifiedObject(object)}${text.slice(end).trimEnd()}\n/\n`;
}

import {lexOracle} from './oracleLexer.js';
import {getSqlStatements} from './sqlStatements.js';
import {describeOracleSource} from './oracleSourceIdentity.js';

export function prepareSourceCompilation(document, rules) {
  const source=describeOracleSource(document,rules),original=document.content||'';
  if (document.readOnly||source.warning||!source.declaration||!['PACKAGE','PACKAGE BODY','PROCEDURE','FUNCTION','TRIGGER','TYPE','TYPE BODY'].includes(source.declaration.type)) return {error:source.warning||'Open a writable Oracle source declaration to compile.'};
  const tokens=lexOracle(original).filter(token=>token.kind!=='comment');
  let sql=original;
  for(const token of [...tokens].reverse()) {
    const start=original.lastIndexOf('\n',token.start-1)+1,end=original.indexOf('\n',token.end);
    if(token.value==='/'&&original.slice(start,end<0?original.length:end).trim()==='/')sql=sql.slice(0,token.start)+' '+sql.slice(token.end);
  }
  if(tokens[0]?.value.toUpperCase()!=='CREATE')sql='CREATE OR REPLACE '+sql;
  return {sql:sql.trim(),original,declaration:source.declaration,error:null};
}

export function sourceBaseline(snapshot) {
  const {owner,name,type,version,context,profileId}=snapshot;
  return {owner,name,type,version,context,profileId,capturedAt:new Date().toISOString()};
}

export function databaseSourceChanged(baseline, snapshot) {
  return sourceBaselineMatches(baseline,snapshot)&&baseline.version!==snapshot.version;
}

export function sourceBaselineMatches(baseline,snapshot) {
  return !!baseline&&baseline.owner===snapshot.owner&&baseline.name===snapshot.name&&baseline.type===snapshot.type&&baseline.profileId===snapshot.profileId&&baseline.context===snapshot.context;
}


export const sourceIdentity=declaration=>JSON.stringify([declaration.ownerKey,declaration.nameKey,declaration.type]);
export function sourceCompilationUnits(document,rules) {
  const direct=prepareSourceCompilation(document,rules);
  if(!direct.error)return [direct];
  if(document.readOnly||describeOracleSource(document,rules).warning)return [];
  return getSqlStatements(document.content||'').slice(0,2000).flatMap(statement=>{
    const prepared=prepareSourceCompilation({name:'script.sql',content:statement.sql},rules);
    return prepared.error?[]:[{...prepared,statementOffset:statement.start}];
  });
}

import {offsetAtOraclePosition} from './plsqlDiagnostics.js';

// ORA-06512 carries a program unit and line, but no compiled-source revision.
export function runtimeStackProblems(message, context = {}, tabId) {
  const frames=[];
  for (const text of String(message).slice(0,65536).split(/\r?\n/)) {
    if(frames.length>=128)break;
    const named=/^\s*ORA-06512:\s*[^"\r\n]*"([^"\r\n]+)"\s*,\s*[^0-9\r\n]*(\d+)\s*$/i.exec(text);
    const anonymous=!named&&/^\s*ORA-06512:\s*[^"0-9\r\n]*(\d+)\s*$/i.exec(text);
    const line=Number(named?.[2]||anonymous?.[1]);
    if(!Number.isSafeInteger(line)||line<1||line>2147483647)continue;
    const identity=named?.[1].split('.');
    if(named&&(identity.length!==2||identity.some(part=>!part||/[\u0000-\u001f]/.test(part))))continue;
    const local=anonymous&&/^\s*(?:BEGIN|DECLARE)\b/i.test(context.executedSql||'')?offsetAtOraclePosition(context.executedSql,line,1):null;
    const start=context.statementOffset;
    const offset=local!=null&&Number.isInteger(start)&&context.editorSnapshot?.slice(start,start+context.executedSql.length)===context.executedSql?start+local:null;
    const prefix=offset==null?null:context.editorSnapshot.slice(0,offset);
    frames.push({id:`${tabId}:stack:${frames.length}`,tabId,severity:'error',source:'Oracle stack',message:text.trim(),
      oracleLine:line,oracleColumn:1,offset,line:prefix==null?null:prefix.split('\n').length,column:offset==null?null:1,
      editorSnapshot:context.editorSnapshot,executedProfileId:context.executedProfileId,executedConnectionGeneration:context.executedConnectionGeneration,
      fileName:named?named[1]:context.fileName||'Anonymous block',
      versionStatus:named?'Execution source version unknown':offset!=null?'Exact submitted block snapshot':'Submitted source position unavailable',
      definition:named?{owner:identity[0],name:identity[1],type:'PLSQL FRAME',originTabId:tabId}:null});
  }
  return frames;
}

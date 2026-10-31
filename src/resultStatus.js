export const LONG_QUERY_MS=2000;
export function elapsedQueryTime(startedAt,now=Date.now()){
  return Number.isFinite(startedAt)?Math.max(0,now-startedAt):0;
}
export function formatQueryDuration(ms){
  const seconds=Math.floor(Math.max(0,ms)/1000);
  return seconds<60?`${seconds}s`:`${Math.floor(seconds/60)}m ${String(seconds%60).padStart(2,'0')}s`;
}
export function queryFailureDetails(outcome){
  const message=String(outcome?.message||'The statement could not be completed.'),code=message.match(/\b(?:ORA|PLS)-\d+\b/i)?.[0]?.toUpperCase();
  if(outcome?.kind==='cancelled')return {kind:'cancelled',title:'Query cancelled',message:'',hint:'',code:null};
  if(outcome?.kind==='timeout')return {kind:'timeout',title:'Query timed out',hint:'The configured query timeout was reached.',message,code};
  if(code==='ORA-00942')return {kind:'error',title:'Object missing or inaccessible',hint:'Check the object name, schema and access permissions.',message,code};
  if(code==='ORA-01031')return {kind:'error',title:'Insufficient privileges',hint:'This connection does not have permission for the statement.',message,code};
  return {kind:'error',title:'Query failed',hint:'Review the SQL and the database message below.',message,code};
}

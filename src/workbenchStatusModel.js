export function workbenchStatus({session={},connection={},selection,error=''}){
 if(session.cancelling)return {kind:'busy',text:'Cancelling SQL'};
 if(session.connecting)return {kind:'busy',text:'Connecting'};
 if(session.exporting)return {kind:'busy',text:'Exporting result'};
 if(session.scriptRun?.awaitingSourceReview)return {kind:'warning',text:`Source review required · statement ${session.scriptRun.awaitingSourceReview.index+1}`};
 if(session.fetchingPage)return {kind:'busy',text:'Fetching result rows'};
 if(session.executing||session.scriptRun?.running)return {kind:'busy',text:session.sqlStage||'Executing SQL'};
 if(session.rendering)return {kind:'busy',text:'Rendering result'};
 const failure=error||(['error','timeout'].includes(session.queryOutcome?.kind)?session.queryOutcome.message:'')||session.connectionError;
 if(failure)return {kind:'error',text:String(failure).split(/\r?\n/)[0],detail:String(failure)};
 if(session.transactionPending&&!session.analysisReadOnly)return {kind:'warning',text:session.connectionLost?'Transaction state unverified · disconnected':'Transaction pending'};
 if(selection?.cells)return {kind:'selection',text:`${selection.cells} cells · ${selection.rows} rows · ${selection.columns} columns · ${selection.scope}`};
 if(session.inactive)return {kind:'offline',text:'Session inactive'};
 if(connection.state!=='connected')return {kind:'offline',text:'Disconnected'};
 return {kind:'ready',text:session.analysisReadOnly?'Read-only analysis':'Ready'};
}
export function transactionStatus(session={}){
 if(session.analysisReadOnly)return 'Read-only analysis';
 if(session.connectionLost&&session.transactionPending)return 'Transaction state unverified';
 return (session.autoCommit?'Auto commit':'Manual commit')+(session.transactionPending?' · not committed':'');
}

export const nativeUxFixture=`(()=>{
 const listeners=new Set(),commands=[];const nativePost=chrome.webview.postMessage.bind(chrome.webview);
 const nativeAdd=chrome.webview.addEventListener.bind(chrome.webview),nativeRemove=chrome.webview.removeEventListener.bind(chrome.webview);
 chrome.webview.addEventListener=(name,listener)=>{if(name==='message')listeners.add(listener);nativeAdd(name,listener)};
 chrome.webview.removeEventListener=(name,listener)=>{if(name==='message')listeners.delete(listener);nativeRemove(name,listener)};
 const emit=message=>{for(const listener of [...listeners])listener({data:message})};
 const profiles=[{id:'UX_DEV',name:'UX Development',env:'DEV',host:'fixture.local',service:'DEVDB',port:'1521',hasSavedCredentials:true},{id:'UX_PROD',name:'UX Production',env:'PROD',host:'fixture.local',service:'PRODDB',port:'1521',hasSavedCredentials:true}];
 chrome.webview.postMessage=value=>{
  const message=JSON.parse(value);commands.push(message);if(['ui.setZoom','ui.setTheme'].includes(message.command))nativePost(value);
  const reply=data=>setTimeout(()=>emit({...data,requestId:message.id,tabId:message.tabId}),10);
  if(message.type==='ui.ready'){reply({type:'connection.profiles',profiles,aliases:[]});reply({type:'workspace.state',root:'D:/ux-fixture',name:'UX fixture',files:[{name:'invoice.sql',path:'D:/ux-fixture/invoice.sql',relativePath:'invoice.sql'}],entries:[],recent:[]})}
  if(message.command==='connection.connect'){const profile=profiles.find(p=>p.id===message.payload.profileId);reply({type:'connection.connected',profile,serverVersion:'23'});reply({type:'schema.loaded',schema:'APP',objects:[{owner:'APP',name:'INVOICES',type:'TABLE',columns:[]}]})}
  if(message.command==='session.context')reply({type:'session.context',epoch:message.payload.epoch,context:{profileId:message.payload.tabId==='tab-1'?'UX_DEV':'UX_PROD',schema:'APP',container:message.tabId==='tab-1'?'DEV_PDB':'PROD_PDB',edition:'ORA$BASE'}});
  if(message.command==='tab.close')reply({type:'tab.closed'});
  if(message.command==='sql.fetchNext')reply({type:'sql.page',resultId:message.payload.resultId,offset:1,rows:[],hasMore:false});
 };
 const result=(request,rows=[['123456789012345678901234567890','A'],['2','B']],hasMore=false)=>emit({type:'sql.result',tabId:request.tabId,requestId:request.id,resultId:'result-'+request.id,columns:[{name:'ID',type:'NUMBER'},{name:'NAME',type:'VARCHAR2'}],rows,returnedRows:rows.length,rowsAffected:null,elapsedMs:12,hasMore,transactionPending:false,output:[]});
 const phaseLog=[];const observer=new MutationObserver(()=>{const status=document.querySelector('.connection-control-summary');if(status)phaseLog.push(status.getAttribute('aria-label'))});document.addEventListener('DOMContentLoaded',()=>observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label']}),{once:true});
 window.__uxFixture={commands,emit,result,phaseLog};
 localStorage.removeItem('fbsdb.sqlDrafts');
 localStorage.setItem('fbsdb.queryHistory',JSON.stringify([{id:'ux-history',sql:'SELECT historic_invoice FROM dual',profile:'UX_DEV',status:'Succeeded',startedAt:1,detail:'Fixture'}]));
})()`;


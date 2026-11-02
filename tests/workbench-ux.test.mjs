import test from 'node:test';
import assert from 'node:assert/strict';
import { actionableState, executionTarget, filterEditorTabs, workbenchSearch } from '../src/workbenchUx.js';
import { removeResultScope, resultScopeItems } from '../src/resultScope.js';
import { resultToolbarLayout } from '../src/resultToolbarLayout.js';
import { editorSessionState } from '../src/editorSessionState.js';

test('unified search reserves space for each source and can filter each type', () => {
  const source={files:[{tabId:'a',name:'invoice.sql',profileName:'Finance PROD'},{path:'D:/invoice.sql',name:'invoice.sql'}],objects:Array.from({length:2000},(_,i)=>({owner:'APP',name:'INVOICE_'+i,type:'TABLE'})),connections:[{id:'finance',name:'Finance invoice',env:'PROD'}],history:[{id:'h',sql:'SELECT invoice_id FROM invoices',profile:'finance',status:'Succeeded'}]};
  const all=workbenchSearch({...source,query:'invoice'});
  assert.deepEqual([...new Set(all.map(i=>i.category))],['Open editors','Files','Oracle objects','Connections','History']);
  assert.equal(all.filter(i=>i.category==='Oracle objects').length,40);
  assert.equal(workbenchSearch({...source,category:'Connections',query:'invoice'}).length,1);
  assert.equal(workbenchSearch({...source,category:'Open editors',query:'finance prod'}).length,1);
  const item=workbenchSearch({...source,category:'History'})[0];
  assert.equal(item.sql,'SELECT invoice_id FROM invoices');
  assert.equal(workbenchSearch({...source,query:'not-found'}).length,0);
});

test('open editor search matches all words across file path, object name and profile', () => {
  const tabs=[{id:'a',name:'report.sql',path:'D:/finance/report.sql',profileName:'DEV Oracle'},{id:'o',name:'APP.CUSTOMERS',connectionProfileId:'PROD'}];
  assert.deepEqual(filterEditorTabs(tabs,'finance dev').map(t=>t.id),['a']);
  assert.deepEqual(filterEditorTabs(tabs,'customers prod').map(t=>t.id),['o']);
  assert.equal(filterEditorTabs(tabs,'missing').length,0);
});

test('execution target preserves exact selected SQL, caret ranges and repeated statement ownership', () => {
  const text='SELECT 1 FROM dual;\nSELECT :id FROM dual;\nSELECT 1 FROM dual;';
  const start=text.indexOf('SELECT :id');
  assert.deepEqual(executionTarget(text,{start,end:start+7}),{sql:'SELECT ',start,end:start+7,kind:'selection'});
  const caret=executionTarget(text,{caret:start+10});
  assert.equal(caret.sql,'SELECT :id FROM dual;');assert.equal(caret.start,start);
  const last=executionTarget(text,{caret:text.length-3,override:'SELECT 1 FROM dual;'});
  assert.equal(last.start,text.lastIndexOf('SELECT 1'));
  assert.equal(executionTarget(text,{override:'SELECT 9 FROM dual'}).start,null);
  assert.equal(executionTarget('',{}),null);
});

test('removing one result scope leaves other filters, groups, sorts and display options intact', () => {
  const options={filters:[{column:0,op:'equals',value:'A'},{column:1,op:'gt',value:'4'}],sorts:[{column:0,direction:'desc'}],filterGroups:[{id:'a',logic:'or'}],filterLogic:'or',markedOnly:true,decimals:9};
  const removed=removeResultScope(options,'filter:0');
  assert.deepEqual(removed.filters,[options.filters[1]]);assert.equal(removed.sorts,options.sorts);assert.equal(removed.filterGroups,options.filterGroups);assert.equal(removed.decimals,9);
  assert.equal(removeResultScope(options,'markedOnly').markedOnly,false);assert.equal(options.markedOnly,true);
  const chips=resultScopeItems({options,columns:[{name:'NAME'},{name:'AMOUNT'}],filter:'find',sortColumn:1,serverFilter:{ruleCount:2}});
  assert.deepEqual(chips.map(c=>c.id),['search','filter:0','filter:1','headerSort','sort:0','markedOnly','server']);
});

test('narrow toolbar retains frequent actions without duplicating or reordering visible commands', () => {
  const groups=[[['view'],['pivot'],['filter'],['sort']],[['find'],['copy']],[['load'],['export'],['clear']]];
  const layout=resultToolbarLayout(groups,4);
  assert.deepEqual([...layout.visibleIds],['view','filter','sort','export']);
  assert.equal(layout.overflow.some(c=>c[0]==='pivot'),true);
});

test('metadata empty states distinguish disconnected, denied, failed and empty searches', () => {
  assert.equal(actionableState({connected:false}).command,'connect');
  assert.equal(actionableState({connected:true,error:'ORA-01031: insufficient privileges'}).title,'Oracle access denied');
  assert.equal(actionableState({connected:true,error:'ORA-00942: table or view does not exist'}).title,'Oracle object missing or inaccessible');
  assert.equal(actionableState({connected:true,error:'Network interrupted'}).command,'retry');
  assert.equal(actionableState({connected:true,filtered:true}).command,'clear');
  assert.equal(editorSessionState({connected:true,rendering:true}).text,'Rendering results');
  assert.equal(editorSessionState({connected:true,rendering:true,cancelling:true}).text,'Cancelling');
});


test('Search Everywhere includes bounded current symbols, settings IDs and commands in ordinary Ctrl P mode',()=>{
 const results=workbenchSearch({query:'invoice',outline:[{name:'invoice_total',kind:'FUNCTION',start:20,depth:2}],settings:[{id:'invoice.format',label:'Invoice formatting',detail:'results'}],commands:[{id:'invoice-run',label:'Run invoice',disabled:true}],objects:Array.from({length:2000},(_,index)=>({owner:'APP',name:'INVOICE_'+index,type:'TABLE'}))});
 assert.ok(results.some(item=>item.category==='Symbols'&&item.start===20));assert.ok(results.some(item=>item.category==='Settings'&&item.settingId==='invoice.format'));assert.ok(results.some(item=>item.category==='Commands'&&item.disabled));
 assert.equal(workbenchSearch({query:'editor.lineHeight',settings:[{id:'editor.lineHeight',label:'Line height',detail:'editor'}]})[0].kind,'setting');
});

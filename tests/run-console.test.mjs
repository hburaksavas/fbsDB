import test from 'node:test';
import assert from 'node:assert/strict';
import {consoleLimits,createConsoleEntry,createConsoleStore,rerunPlan} from '../src/runConsole.js';
const base={sql:'SELECT :id, :password FROM dual',ok:true,elapsedMs:12.4,rows:1,profile:'DEV',executedAt:'2026-11-02T10:00:00Z'};
test('bind values are not retained by default and sensitive names never are',()=>{
 const parameters=[{name:'ID',type:'NUMBER',value:'7'},{name:'PASSWORD',value:'s3cret'}];
 const hidden=createConsoleEntry({...base,parameters});
 assert.deepEqual(hidden.parameters,[{name:'ID',type:'NUMBER',hidden:true},{name:'PASSWORD',type:'VARCHAR2',hidden:true}]);
 const retained=createConsoleEntry({...base,parameters},{retainValues:true});
 assert.deepEqual(retained.parameters,[{name:'ID',type:'NUMBER',value:'7',hidden:false},{name:'PASSWORD',type:'VARCHAR2',hidden:true}]);
 assert.equal(JSON.stringify(retained).includes('s3cret'),false);
});
test('output, error text and elapsed time are bounded and recorded per execution',()=>{
 const entry=createConsoleEntry({...base,parameters:[],output:Array.from({length:300},(_,i)=>'x'.repeat(900)+i),ok:false,message:'ORA-00942: table or view does not exist'});
 assert.equal(entry.output.length,consoleLimits.outputLines);assert.equal(entry.output[0].length,consoleLimits.outputChars);assert.equal(entry.outputTruncated,true);
 assert.equal(entry.ok,false);assert.match(entry.message,/ORA-00942/);assert.equal(entry.elapsedMs,12);
});
test('store keeps the newest entries per tab and rerun needs input unless values were retained',()=>{
 const store=createConsoleStore();
 for(let i=0;i<60;i++)store.record('a',createConsoleEntry({...base,sql:`select ${i}`,parameters:[]}));
 assert.equal(store.list('a').length,consoleLimits.entries);assert.equal(store.list('a')[0].sql,'select 59');assert.deepEqual(store.list('b'),[]);store.clear('a');assert.equal(store.list('a').length,0);
 const hidden=createConsoleEntry({...base,parameters:[{name:'ID',value:'7'}]}),kept=createConsoleEntry({...base,parameters:[{name:'ID',type:'NUMBER',value:'7'}]},{retainValues:true});
 assert.deepEqual([rerunPlan(hidden).needsInput,rerunPlan(hidden).values],[true,null]);
 assert.deepEqual(rerunPlan(kept),{sql:base.sql,values:[{name:'ID',value:'7',type:'NUMBER'}],needsInput:false});
 assert.deepEqual(rerunPlan(createConsoleEntry({...base,parameters:[]})),{sql:base.sql,values:null,needsInput:false});
});

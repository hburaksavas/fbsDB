import test from 'node:test';
import assert from 'node:assert/strict';
import {editorContextObject} from '../src/editorContext.js';
const objects=[{owner:'APP',name:'INVOICES',type:'TABLE',columns:[{name:'ID',type:'NUMBER'}]},{owner:'APP',name:'CaseSensitive',type:'VIEW',columns:[]}];
test('selected objects resolve quoted names and owners without treating SQL selections as an object',()=>{
 for(const text of ['invoices','APP.INVOICES','"APP"."INVOICES"'])assert.equal(editorContextObject(text,0,text.length,text.length,objects,'APP')?.name,'INVOICES');
 const quoted='"CaseSensitive"';assert.equal(editorContextObject(quoted,0,quoted.length,quoted.length,objects,'APP')?.name,'CaseSensitive');
 const sql='SELECT * FROM invoices';assert.equal(editorContextObject(sql,0,sql.length,sql.length,objects,'APP'),null);
 assert.equal(editorContextObject('unknown',0,7,7,objects,'APP'),null);
 const ambiguous=[{owner:'A',name:'T',type:'TABLE'},{owner:'B',name:'T',type:'TABLE'}];assert.equal(editorContextObject('T',0,1,1,ambiguous,'APP'),null);
});
test('caret and selected query aliases use the loaded Oracle symbol resolver',()=>{
 const sql='SELECT i.ID FROM invoices i';assert.equal(editorContextObject(sql,0,0,sql.indexOf('invoices')+3,objects,'APP')?.name,'INVOICES');
});

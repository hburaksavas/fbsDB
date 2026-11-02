import test from 'node:test';
import assert from 'node:assert/strict';
import {bindAtOffset,bindMenuActions} from '../src/bindContext.js';
const sql="SELECT :id, ':not' x, a::b, :Name FROM t WHERE id = :ID -- :c";
test('binds are found by offset with their repeat count; strings, casts and comments are ignored',()=>{
 const bind=bindAtOffset(sql,sql.indexOf(':id')+2);
 assert.deepEqual([bind.name,bind.occurrences,sql.slice(bind.start,bind.end)],['ID',2,':id']);
 assert.equal(bindAtOffset(sql,sql.indexOf(':not')+1),null);
 assert.equal(bindAtOffset(sql,sql.indexOf('a::b')+2),null);
 assert.equal(bindAtOffset(sql,sql.indexOf(':c')+1),null);
 assert.equal(bindAtOffset(sql,sql.indexOf('FROM')),null);
 assert.equal(bindAtOffset(sql,sql.indexOf(':ID')).name,'ID');
});
test('menu shows type choices without the current type, plus find, copy and an explicit run',()=>{
 const bind=bindAtOffset(sql,sql.indexOf(':Name')+1),actions=bindMenuActions(bind,'NUMBER');
 assert.match(actions[0].label,/Bind :NAME · NUMBER · 1 use/);assert.equal(actions[0].disabled,true);
 assert.deepEqual(actions.filter(item=>item.id.startsWith('bind:type:')).filter(item=>!item.disabled).map(item=>item.id),['bind:type:VARCHAR2','bind:type:DATE','bind:type:TIMESTAMP','bind:type:CLOB']);
 assert.ok(actions.some(item=>item.id==='bind:run'&&item.label.includes('…')));
 assert.ok(bindMenuActions(bind,'DATE',{readOnly:true}).filter(item=>item.id.startsWith('bind:type:')).every(item=>item.disabled));
 assert.deepEqual(bindMenuActions(null),[]);
});

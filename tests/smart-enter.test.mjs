import test from 'node:test';
import assert from 'node:assert/strict';
import {smartEnter} from '../src/smartEnter.js';
const run=(text,index,options)=>smartEnter(text.split('\n'),index,options);
test('IF and ELSIF gain THEN, a body line and END IF only when missing',()=>{
 assert.deepEqual(run('  IF a > 1',0),{lines:['  IF a > 1 THEN','    ','  END IF;'],cursor:{line:1,column:5}});
 assert.deepEqual(run('  IF a > 1\n    x := 1;\n  END IF;',0).lines,['  IF a > 1 THEN','    ']);
 assert.deepEqual(run('ELSIF b',0).lines,['ELSIF b THEN','  ']);
 assert.deepEqual(run('IF a THEN',0).lines,['IF a THEN','  ','END IF;']);
});
test('loops, blocks and CASE get their closers; parentheses are balanced first',()=>{
 assert.deepEqual(run('FOR r IN (SELECT id FROM t',0).lines,['FOR r IN (SELECT id FROM t) LOOP','  ','END LOOP;']);
 assert.deepEqual(run('WHILE i < 10',0,{indent:'    '}).lines,['WHILE i < 10 LOOP','    ','END LOOP;']);
 assert.deepEqual(run('BEGIN',0).lines,['BEGIN','  ','END;']);
 assert.deepEqual(run('CASE x',0).lines,['CASE x','  ','END CASE;']);
});
test('plain statements are terminated once; comments and open lists are left alone',()=>{
 assert.deepEqual(run('  x := NVL(y, 0',0),{lines:['  x := NVL(y, 0);','  '],cursor:{line:1,column:3}});
 assert.deepEqual(run('UPDATE t SET a = 1;',0).lines,['UPDATE t SET a = 1;','']);
 assert.deepEqual(run('SELECT a,',0).lines,['SELECT a,','']);
 assert.deepEqual(run("x := 'it''s; ok' -- note",0).lines,["x := 'it''s; ok';",'']);
 assert.equal(run('   ',0),null);
});
test('comment markers inside literals are kept',()=>{
 assert.deepEqual(smartEnter(["msg := 'a--b'"],0).lines,["msg := 'a--b';",'']);
});

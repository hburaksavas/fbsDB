import test from 'node:test';
import assert from 'node:assert/strict';
import { sqlOutline, EditorNavigationHistory,sourceLineEnding,sourcePositionAt } from '../src/editorNavigation.js';

test('outline retains exact CTE and PL/SQL block offsets without treating literals as structure',()=>{
  const source="-- header\nWITH first_cte AS (SELECT 'WITH false AS (' x FROM dual), second_cte(x) AS (SELECT 2 FROM dual) SELECT * FROM first_cte;\nDECLARE\n x NUMBER;\n PROCEDURE nested IS BEGIN NULL; END;\nBEGIN NULL; END;\n/";
  const outline=sqlOutline(source);
  assert.equal(outline.filter(item=>item.kind==='Statement').length,2);
  assert.deepEqual(outline.filter(item=>item.kind==='CTE').map(item=>item.name),['first_cte','second_cte']);
  for(const item of outline){assert.ok(item.start>=0&&item.end<=source.length&&item.end>item.start);}
  assert.ok(outline.some(item=>item.kind==='PROCEDURE'&&source.slice(item.start).startsWith('PROCEDURE nested')));
});

test('navigation skips closed tabs, preserves forward entries and truncates only on a new jump',()=>{
  const history=new EditorNavigationHistory();
  for(const [tabId,lineNumber] of [['a',1],['a',20],['b',3],['c',7]])history.push({tabId,lineNumber,column:1});
  assert.equal(history.move(-1,item=>item.tabId!=='b').lineNumber,20);
  assert.equal(history.move(-1,()=>true).lineNumber,1);
  assert.equal(history.move(1,()=>true).lineNumber,20);
  history.push({tabId:'a',lineNumber:99,column:1});
  assert.equal(history.move(1,()=>true),null);
  assert.equal(history.move(-1,()=>true).lineNumber,20);
});


test('package structure includes nested routines, cursors, record types and subtypes at original offsets',()=>{
 const source=`-- package header
CREATE OR REPLACE PACKAGE BODY billing AS
 TYPE row_t IS RECORD(id NUMBER);
 SUBTYPE id_t IS NUMBER;
 CURSOR invoices IS SELECT 1 FROM dual;
 PROCEDURE run IS
   CURSOR nested IS SELECT 2 FROM dual;
   FUNCTION local_value RETURN NUMBER IS BEGIN RETURN 1; END;
 BEGIN NULL; END;
END;
/`;
 const outline=sqlOutline(source);
 for(const [kind,name] of [['TYPE','row_t'],['SUBTYPE','id_t'],['CURSOR','invoices'],['CURSOR','nested']]){
  const item=outline.find(item=>item.kind===kind&&item.name===name);assert.ok(item,`${kind} ${name}`);assert.ok(source.slice(item.start).startsWith(kind));
 }
 assert.ok(outline.some(item=>item.kind==='FUNCTION'&&item.name.includes('local_value')));
 assert.equal(outline.filter(item=>item.kind==='CURSOR').length,2);
});


test('source positions and line-ending detection retain native-file offsets across LF/CRLF models',()=>{
 for(const ending of ['\n','\r\n']){
  const source=['-- header','CREATE PACKAGE BODY demo AS',' PROCEDURE second IS BEGIN NULL; END;','END;'].join(ending);
  assert.equal(sourceLineEnding(source),ending);assert.deepEqual(sourcePositionAt(source,source.indexOf('PROCEDURE second')),{lineNumber:3,column:2});
 }
 assert.deepEqual(sourcePositionAt('one\r\ntwo\nthree',9),{lineNumber:3,column:1});
});

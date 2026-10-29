import test from 'node:test';
import assert from 'node:assert/strict';
import { sqlOutline, EditorNavigationHistory } from '../src/editorNavigation.js';

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

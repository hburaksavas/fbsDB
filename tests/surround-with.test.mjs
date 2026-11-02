import test from 'node:test';
import assert from 'node:assert/strict';
import {surroundOptions,surroundScope,surroundSnippet} from '../src/surroundWith.js';
const plain=snippet=>snippet.replace(/\$\{\d+:([^}]*)\}/g,'$1').replace(/\$0$/,'').replace(/\\([\\$}])/g,'$1');
test('scope decides which transforms are offered',()=>{
 assert.equal(surroundScope('-- c\nselect * from t'),'query');
 assert.equal(surroundScope('UPDATE t SET a = 1;'),'statements');
 assert.equal(surroundScope('   '),null);
 assert.deepEqual(surroundOptions('WITH x AS (SELECT 1 FROM dual) SELECT * FROM x').map(item=>item.id),['cursorLoop']);
 assert.deepEqual(surroundOptions('x := 1;').map(item=>item.id),['block','if','loop','timing']);
});
test('statement wrapping keeps base indentation, nests the body and terminates DML',()=>{
 const snippet=surroundSnippet('if','    UPDATE t\n    SET a = 1\n');
 assert.equal(plain(snippet),'    IF condition THEN\n      UPDATE t\n      SET a = 1;\n    END IF;');
 assert.match(snippet,/^    IF \$\{1:condition\} THEN/);
 assert.equal(plain(surroundSnippet('block','x := 1;')),'BEGIN\n  x := 1;\nEXCEPTION\n  WHEN OTHERS THEN\n    RAISE;\nEND;');
});
test('cursor loops drop the query terminator; snippet syntax in user text is escaped',()=>{
 assert.equal(plain(surroundSnippet('cursorLoop','SELECT id\nFROM t;')),'FOR rec IN (\n  SELECT id\n  FROM t\n) LOOP\n  NULL;\nEND LOOP;');
 const escaped=surroundSnippet('loop',"msg := '${x} \\\\';",{indent:'\t'});
 assert.match(escaped,/\\\$\{x\\\}/);assert.equal(plain(escaped),"FOR i IN 1..10 LOOP\n\tmsg := '${x} \\\\';\nEND LOOP;");
 assert.throws(()=>surroundSnippet('nope','x'),/Unknown/);
});

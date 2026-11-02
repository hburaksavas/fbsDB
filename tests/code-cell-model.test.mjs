import test from 'node:test';
import assert from 'node:assert/strict';
import {codeCellLimit,codeCellText,detectCodeLanguage} from '../src/codeCellModel.js';
test('language detection recognizes JSON, XML, SQL and PL/SQL starts',()=>{
 assert.equal(detectCodeLanguage(' {"a":[1,2]}'),'json');
 assert.equal(detectCodeLanguage('[1, 2'),'plaintext');
 assert.equal(detectCodeLanguage('<?xml version="1.0"?><a/>'),'xml');
 assert.equal(detectCodeLanguage('-- header\nselect * from dual'),'sql');
 assert.equal(detectCodeLanguage('BEGIN NULL; END;'),'sql');
 assert.equal(detectCodeLanguage('"SELECT" is quoted'),'plaintext');
 assert.equal(detectCodeLanguage('Plain note'),'plaintext');
});
test('cell text guards null, binary and oversized values',()=>{
 assert.match(codeCellText(null).error,/NULL/);
 assert.match(codeCellText({kind:'binary'}).error,/Binary/);
 assert.match(codeCellText('x'.repeat(codeCellLimit+1)).error,/2 MB/);
 assert.deepEqual(codeCellText(42),{text:'42'});
});

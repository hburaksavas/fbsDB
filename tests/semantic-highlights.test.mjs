import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticHighlights} from '../src/semanticHighlights.js';
const objects=[{owner:'APP',name:'T',type:'TABLE',columns:[{name:'ID',type:'NUMBER'}]},{owner:'APP',name:'PKG',type:'PACKAGE',members:[{name:'ACT',parameters:[]}]}];
test('semantic ranges distinguish parameters, shadowed locals, known columns and package members; literals and comments stay untouched',()=>{
 const source=`CREATE PROCEDURE run(p_id NUMBER) IS v NUMBER; BEGIN v := p_id; DECLARE p_id VARCHAR2(20); BEGIN p_id := 'p_id'; END; pkg.act; END;`;
 const result=semanticHighlights(source,0,source.length,{objects,currentSchema:'APP'}),at=(text,which='first')=>{const start=which==='last'?source.lastIndexOf(text):source.indexOf(text);return result.tokens.find(token=>token.start===start)};
 assert.equal(at('p_id NUMBER').type,'parameter');assert.equal(at('p_id VARCHAR2').type,'variable');assert.equal(at('p_id :=').type,'variable');assert.equal(at('v := p_id').type,'variable');assert.equal(at('act;').type,'method');assert.ok(!result.tokens.some(token=>token.start>source.indexOf("'p_id'")&&token.start<source.indexOf("'p_id'")+6));
 const sql='SELECT a.id FROM app.t a WHERE a.id = 1 -- a.id';const cols=semanticHighlights(sql,0,sql.length,{objects,currentSchema:'APP'});assert.equal(cols.tokens.filter(t=>t.type==='property').length,2);
});
test('semantic analysis honors the visible range and bounds large documents',()=>{
 const source='DECLARE x NUMBER; BEGIN x := 1; END;';const start=source.indexOf('BEGIN'),result=semanticHighlights(source,start,source.length,{});
 assert.ok(result.tokens.every(token=>token.start>=start));assert.equal(result.tokens.length,1);
 assert.equal(semanticHighlights(' '.repeat(100001),0,100001).truncated,true);
});

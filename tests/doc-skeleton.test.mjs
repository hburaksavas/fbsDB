import test from 'node:test';
import assert from 'node:assert/strict';
import {docSkeletonAt,routineHeaders} from '../src/docSkeleton.js';
const plain=text=>text.replace(/\$\{\d+:([^}]*)\}/g,'$1');
const source="CREATE OR REPLACE PACKAGE BODY pkg AS\n  FUNCTION total(p_id IN NUMBER, p_scale NUMBER DEFAULT 2, p_note OUT NOCOPY VARCHAR2) RETURN NUMBER IS\n  BEGIN RETURN 1; END;\n  PROCEDURE reset IS BEGIN NULL; END;\nEND;";
test('headers expose names, parameter modes, types, defaults and return type',()=>{
 const [total,reset]=routineHeaders(source);
 assert.deepEqual(total.params.map(p=>[p.name,p.mode,p.type,p.defaultValue]),[['p_id','IN','NUMBER',null],['p_scale','IN','NUMBER','2'],['p_note','OUT NOCOPY','VARCHAR2',null]]);
 assert.equal(total.returns,'NUMBER');assert.deepEqual([reset.name,reset.params.length,reset.returns],['reset',0,null]);
});
test('skeleton lists every parameter and the return value with tab stops, indented like the declaration',()=>{
 const result=docSkeletonAt(source,source.indexOf('total')+1);
 assert.equal(plain(result.snippet),"  /**\n   * Describe total.\n   *\n   * @param p_id    IN NUMBER - description\n   * @param p_scale IN NUMBER (default 2) - description\n   * @param p_note  OUT NOCOPY VARCHAR2 - description\n   * @return NUMBER - description\n   */\n");
 assert.match(result.snippet,/\$\{1:Describe total\.\}/);assert.equal(result.insertAt,source.indexOf('  FUNCTION'));
 assert.equal(plain(docSkeletonAt(source,source.indexOf('PROCEDURE')).snippet),"  /**\n   * Describe reset.\n   */\n");
});
test('cursor on the line above a routine targets it; existing comments and non-routines are refused',()=>{
 const text="-- note\nPROCEDURE p IS BEGIN NULL; END;\n\nPROCEDURE q IS BEGIN NULL; END;";
 assert.match(docSkeletonAt(text,text.indexOf('PROCEDURE p')+2).error,/already has a comment/);
 assert.equal(docSkeletonAt(text,text.indexOf('PROCEDURE q')).target.name,'q');
 assert.match(docSkeletonAt('SELECT 1 FROM dual',3).error,/PROCEDURE or FUNCTION/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mapApplyErrors,parseOracleError} from '../src/oracleErrorMap.js';
test('Oracle errors are read for the column or constraint they name',()=>{
 assert.deepEqual([parseOracleError('ORA-12899: value too large for column "APP"."CUSTOMERS"."NAME" (actual: 9, maximum: 5)').kind,parseOracleError('ORA-12899: value too large for column "APP"."CUSTOMERS"."NAME" (actual: 9, maximum: 5)').column],['too-long','NAME']);
 const notNull=parseOracleError('ORA-01400: cannot insert NULL into ("APP"."CUSTOMERS"."EMAIL")');assert.deepEqual([notNull.kind,notNull.column],['not-null','EMAIL']);
 assert.equal(parseOracleError('ORA-01407: cannot update ("APP"."T"."C") to NULL').column,'C');
 const unique=parseOracleError('ORA-00001: unique constraint (APP.CUSTOMERS_UK) violated');assert.deepEqual([unique.kind,unique.constraint],['unique','APP.CUSTOMERS_UK']);
 assert.equal(parseOracleError('ORA-02290: check constraint (APP.POS_CHK) violated').kind,'check');assert.equal(parseOracleError('ORA-02291: integrity constraint (APP.FK) violated - parent key not found').kind,'foreign-key');
 assert.equal(parseOracleError('ORA-01722: invalid number').kind,'format');assert.equal(parseOracleError('plain failure').code,null);
 assert.equal(parseOracleError('Database error\nORA-00054: resource busy').text.startsWith('ORA-00054'),true);
});
test('failed statements map to a cell when the column is in the result, otherwise to the row',()=>{
 const columns=[{name:'ID',sourceColumn:'ID'},{name:'NAME',sourceColumn:'NAME'}];
 const statements=[{kind:'update',row:3},{kind:'delete',row:5},{kind:'insert',id:2},{kind:'update',row:7}];
 const outcomes=[{index:0,status:'failed',error:'ORA-12899: value too large for column "A"."T"."NAME" (actual: 9, maximum: 5)'},{index:1,status:'failed',error:'ORA-02292: integrity constraint (A.FK) violated - child record found'},{index:2,status:'failed',error:'ORA-01400: cannot insert NULL into ("A"."T"."EMAIL")'},{index:3,status:'applied'}];
 const errors=mapApplyErrors(statements,outcomes,columns);
 assert.deepEqual(errors.map(item=>[item.row,item.col,item.insertId,item.constraint]),[[3,1,null,null],[5,null,null,'A.FK'],[null,null,2,null]]);
});
import {constraintGuidance,splitConstraint} from '../src/oracleErrorMap.js';
test('constraint names are split and the database definition is explained in one sentence',()=>{
 assert.deepEqual(splitConstraint('APP.POS_CHK'),{owner:'APP',name:'POS_CHK'});assert.deepEqual(splitConstraint('POS_CHK','APP'),{owner:'APP',name:'POS_CHK'});
 assert.equal(constraintGuidance({found:true,name:'POS_CHK',constraintType:'C',condition:'qty > 0',columns:['QTY']}),'POS_CHK requires: qty > 0');
 assert.equal(constraintGuidance({found:true,name:'UK',constraintType:'U',columns:['A','B']}),'UK requires unique values in (A, B).');
 assert.match(constraintGuidance({found:true,name:'FK',constraintType:'R',columns:['PID'],referenced:'PARENT_PK'}),/match an existing parent row \(PARENT_PK\)/);
 assert.equal(constraintGuidance({found:false}),null);assert.equal(constraintGuidance(null),null);
});

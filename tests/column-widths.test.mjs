import test from 'node:test';
import assert from 'node:assert/strict';
import {distributeColumnSpace,equalizeColumnWidths} from '../src/columnWidths.js';
const widths={0:100,1:200,2:330,3:90};
test('equalize uses the average width of the selected columns only',()=>{
 assert.deepEqual(equalizeColumnWidths([0,1,2],widths).sizes,{0:210,1:210,2:210});
 assert.match(equalizeColumnWidths([1],widths).error,/two columns/);
 assert.deepEqual(equalizeColumnWidths([0,3],{0:20,3:30}).sizes,{0:70,3:70});
});
test('distribute splits remaining grid space across selected columns within limits',()=>{
 assert.deepEqual(distributeColumnSpace([0,3],widths,823).sizes,{0:152,3:141});
 assert.match(distributeColumnSpace([0],widths,700).error,/no remaining/);
 assert.deepEqual(distributeColumnSpace([1],widths,5000).sizes,{1:700});
 assert.match(distributeColumnSpace([],widths,5000).error,/at least one/);
});

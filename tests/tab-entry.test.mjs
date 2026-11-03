import test from 'node:test';
import assert from 'node:assert/strict';
import {newRowFieldOrder,nextEditableCell} from '../src/tabEntry.js';
const grid={rowCount:3,visible:[0,1,2,3],isEditable:col=>col!==0&&col!==2};
test('Tab skips locked columns and wraps to the next row',()=>{
 assert.deepEqual(nextEditableCell(grid,{r:0,c:0},1),{r:0,c:1});assert.deepEqual(nextEditableCell(grid,{r:0,c:1},1),{r:0,c:3});
 assert.deepEqual(nextEditableCell(grid,{r:0,c:3},1),{r:1,c:1});assert.deepEqual(nextEditableCell(grid,{r:0,c:2},1),{r:0,c:3},'from a locked cell it goes to the next editable one');
});
test('Shift+Tab walks back and stops at the start',()=>{
 assert.deepEqual(nextEditableCell(grid,{r:1,c:1},-1),{r:0,c:3});assert.deepEqual(nextEditableCell(grid,{r:0,c:3},-1),{r:0,c:1});assert.deepEqual(nextEditableCell(grid,{r:0,c:1},-1),{start:true});
});
test('past the last editable cell the end is reported so a new row can start',()=>{
 assert.deepEqual(nextEditableCell(grid,{r:2,c:3},1),{end:true});assert.deepEqual(nextEditableCell({...grid,rowCount:0},{r:0,c:0},1),{none:true});assert.deepEqual(nextEditableCell({...grid,isEditable:()=>false},{r:0,c:0},1),{none:true});
});
test('new rows are filled required fields first',()=>{
 const columns=[{name:'ID',nullable:false,identity:true},{name:'NAME',nullable:false},{name:'NOTE',nullable:true},{name:'KIND',nullable:false,hasDefault:true},{name:'EMAIL',nullable:false}];
 assert.deepEqual(newRowFieldOrder(columns,columns.map(()=>({editable:true}))),[1,4,0,2,3]);
 assert.deepEqual(newRowFieldOrder(columns,[{editable:false},{editable:true},{editable:true},{editable:false},{editable:true}]),[1,4,2]);
});

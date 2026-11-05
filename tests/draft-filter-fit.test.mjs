import test from 'node:test';
import assert from 'node:assert/strict';
import {outsideFilterNote,rowLeavesFilters} from '../src/draftFilterFit.js';
import {buildResultDisplay} from '../src/resultPresentationData.js';

const columns=[{name:'ID',type:'NUMBER'},{name:'NAME',type:'VARCHAR2'}];
test('an edited row is flagged only when its edited values fall outside what is filtered on',()=>{
  assert.equal(rowLeavesFilters([1,'changed'],'',{}),false,'No filter, nothing to leave');
  assert.equal(rowLeavesFilters([1,'alpha'],'alph',{}),false);
  assert.equal(rowLeavesFilters([1,'changed'],'alph',{}),true,'Search');
  assert.equal(rowLeavesFilters([1,null],'NULL',{}),false,'A NULL is searched as NULL, as the grid does');
  const options={filters:[{column:1,op:'equals',value:'alpha'}]};
  assert.equal(rowLeavesFilters([1,'alpha'],'',options),false);
  assert.equal(rowLeavesFilters([1,'changed'],'',options),true,'Column filter');
  assert.equal(rowLeavesFilters([1,'changed'],'',{highlightedOnly:true,rules:[{column:1,op:'equals',value:'alpha'}]}),true,'Highlighted rows');
  assert.equal(rowLeavesFilters([1,'changed'],'',{markedOnly:true,marks:[0]}),false,'A mark does not depend on the value');
});
test('the flag agrees with what the same filter shows for those values',()=>{
  const rows=[[1,'alpha'],[2,'beta']];
  for(const [search,options] of [['alph',{}],['',{filters:[{column:1,op:'equals',value:'alpha'}]}],['',{filters:[{column:1,op:'contains',value:'ET'}],caseSensitive:false}]])
    for(const row of rows)assert.equal(rowLeavesFilters(row,search,options),!buildResultDisplay([row],columns,options,search).rows.length,JSON.stringify({search,options,row}));
});
test('the note counts rows and says nothing when none left',()=>{
  assert.equal(outsideFilterNote(0),'');
  assert.match(outsideFilterNote(1),/^1 edited row no longer matches the current filter\. It stays visible/);
  assert.match(outsideFilterNote(3),/^3 edited rows no longer match the current filter\. They stay visible/);
});

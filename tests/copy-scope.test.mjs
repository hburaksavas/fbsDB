import test from 'node:test';
import assert from 'node:assert/strict';
import {copyScopeDescription} from '../src/copyScope.js';
test('copy scope reports selection size and header inclusion per format',()=>{
 const summary={cells:6,rows:3,columns:2,scope:'current page'};
 assert.equal(copyScopeDescription(summary).size,'3 rows × 2 columns · 6 cells');
 assert.equal(copyScopeDescription(summary,{headers:true}).header,'Header row included');
 assert.equal(copyScopeDescription(summary,{format:'csv'}).header,'No header row');
 assert.match(copyScopeDescription(summary,{format:'json'}).header,/JSON keys/);
 assert.match(copyScopeDescription(summary,{format:'in'}).header,/Values only/);
 assert.equal(copyScopeDescription({cells:1,rows:1,columns:1,scope:'current page'}).size,'1 row × 1 column · 1 cell');
});
test('copy scope states page and fetched-row limits explicitly',()=>{
 const page=copyScopeDescription({cells:2,rows:2,columns:1,scope:'current page'},{pages:3,hasMore:true});
 assert.equal(page.scope,'Selected cells on the current page; other pages are not included; rows not yet fetched are not included');
 const loaded=copyScopeDescription({cells:1200,rows:1200,columns:1,scope:'loaded rows'},{pages:3});
 assert.equal(loaded.scope,'All 1,200 loaded rows in this view');
 assert.equal(copyScopeDescription(null),null);assert.equal(copyScopeDescription({cells:0}),null);
});

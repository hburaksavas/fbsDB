import test from 'node:test';
import assert from 'node:assert/strict';
import {liveResultAppearance} from '../src/resultLiveAppearance.js';
test('live appearance preserves result filters, numeric formats and per-view rules without accepting data changes',()=>{
 const options={filters:[{column:0,op:'equals',value:'1'}],columnFormats:{0:{decimals:4}},summaryView:{density:'compact',filters:[{column:1,op:'null'}]},pivotView:{nullLabel:'N/A'}};
 const next=liveResultAppearance(options,{density:'comfortable',nullLabel:'∅',rows:[],filters:[],columnFormats:{}});
 assert.equal(next.density,'comfortable');assert.equal(next.nullLabel,'∅');assert.equal(next.summaryView.density,'comfortable');assert.equal(next.pivotView.nullLabel,'∅');assert.deepEqual(next.filters,options.filters);assert.deepEqual(next.columnFormats,options.columnFormats);assert.deepEqual(next.summaryView.filters,options.summaryView.filters);assert.ok(!('rows' in next));assert.equal(options.summaryView.density,'compact');
});

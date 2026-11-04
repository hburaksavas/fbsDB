import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldShowSkeleton,skeletonDelayMs,skeletonWidths} from '../src/skeletonTiming.js';
test('the placeholder waits for the delay, needs an empty list and goes away when loading ends',()=>{
 assert.equal(shouldShowSkeleton({loading:true,hasItems:false,waitedMs:0}),false);
 assert.equal(shouldShowSkeleton({loading:true,hasItems:false,waitedMs:skeletonDelayMs-1}),false);
 assert.equal(shouldShowSkeleton({loading:true,hasItems:false,waitedMs:skeletonDelayMs}),true);
 assert.equal(shouldShowSkeleton({loading:true,hasItems:true,waitedMs:1000}),false);
 assert.equal(shouldShowSkeleton({loading:false,hasItems:false,waitedMs:1000}),false);
});
test('the bars vary in width but stay inside the row',()=>{
 const widths=skeletonWidths(7);
 assert.equal(widths.length,7);assert.ok(new Set(widths).size>3);assert.ok(widths.every(width=>width>=55&&width<=95));
});

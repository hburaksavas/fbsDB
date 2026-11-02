import test from 'node:test';
import assert from 'node:assert/strict';
import {rowMarkerPositions} from '../src/rowMarkers.js';
const rows=Array.from({length:100},(_,index)=>({index}));
test('markers follow the current view order and count marks outside it',()=>{
 const sorted=[...rows].reverse();
 const {markers,outside}=rowMarkerPositions(sorted.slice(0,50),[99,0,60],{height:500});
 assert.deepEqual(markers.map(item=>[item.index,item.r,item.top]),[[99,0,5],[60,39,395]]);
 assert.equal(outside,1);
});
test('nearby markers merge, limits apply and empty inputs are safe',()=>{
 const {markers}=rowMarkerPositions(rows,[10,11,50],{height:100});
 assert.deepEqual(markers.map(item=>[item.index,item.count]),[[10,2],[50,1]]);
 assert.equal(rowMarkerPositions(rows,rows.map(item=>item.index),{height:10000,limit:5,minGap:0}).markers.length,5);
 assert.deepEqual(rowMarkerPositions(rows,[],{height:100}),{markers:[],outside:0});
 assert.deepEqual(rowMarkerPositions([],[3],{height:100}),{markers:[],outside:1});
});

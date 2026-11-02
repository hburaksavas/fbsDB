import test from 'node:test';
import assert from 'node:assert/strict';
import {cellOverlayPlacement,cellOverlayText} from '../src/cellTextOverlay.js';
const viewport={width:1000,height:800};
test('overlay anchors to the cell, widens narrow cells and stays inside the viewport',()=>{
 assert.deepEqual(cellOverlayPlacement({left:100,top:200,bottom:224,width:80},viewport),{left:100,width:220,maxHeight:320,top:200});
 const right=cellOverlayPlacement({left:950,top:200,bottom:224,width:80},viewport);
 assert.equal(right.left+right.width<=994,true);
 const narrow=cellOverlayPlacement({left:0,top:10,bottom:30,width:900},{width:300,height:800});
 assert.equal(narrow.width,288);assert.equal(narrow.left,6);
});
test('overlay flips above cells near the bottom edge',()=>{
 const placed=cellOverlayPlacement({left:100,top:760,bottom:784,width:120},viewport);
 assert.equal(placed.top,undefined);assert.equal(placed.bottom,16);assert.equal(placed.maxHeight,320);
});
test('overlay text keeps null as empty and bounds very large values',()=>{
 assert.deepEqual(cellOverlayText(null),{text:'',truncated:false,length:0});
 const large=cellOverlayText('x'.repeat(25),10);assert.equal(large.text.length,10);assert.equal(large.truncated,true);assert.equal(large.length,25);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {isClipped,treeOverlayRect} from '../src/treeNameOverlayModel.js';
test('overlay aligns with the label and wraps only when the viewport is too narrow',()=>{
 assert.deepEqual(treeOverlayRect({left:40,top:100,height:22},180.4,800),{left:40,top:100,minHeight:22,width:183,wraps:false});
 const narrow=treeOverlayRect({left:700,top:10,height:20},400,800);
 assert.equal(narrow.width,94);assert.equal(narrow.wraps,true);
 assert.equal(treeOverlayRect({left:-5,top:0,height:20},50,800).left,6);
});
test('clipping detection requires overflowing visible text',()=>{
 assert.equal(isClipped({scrollWidth:200,clientWidth:120,textContent:'LONG_TABLE_NAME'}),true);
 assert.equal(isClipped({scrollWidth:121,clientWidth:120,textContent:'x'}),false);
 assert.equal(isClipped({scrollWidth:300,clientWidth:10,textContent:'  '}),false);
 assert.equal(isClipped(null),false);
});

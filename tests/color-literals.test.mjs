import test from 'node:test';
import assert from 'node:assert/strict';
import {colorPresentation,findColors} from '../src/colorLiterals.js';
test('hex and rgb colors are found only inside string literals and comments',()=>{
 const sql="SELECT '#ff8800' c, '#abc' d, 'rgb(10, 20, 30)' e, '#12345678' f FROM t -- #00f\nWHERE x = #fff /* rgba(255,0,0,.5) */";
 const colors=findColors(sql);
 assert.deepEqual(colors.map(item=>sql.slice(item.start,item.end)),['#ff8800','#abc','rgb(10, 20, 30)','#12345678','#00f','rgba(255,0,0,.5)']);
 assert.equal(colors[0].red,1);assert.ok(Math.abs(colors[0].green-0x88/255)<1e-9);assert.equal(colors[1].blue,0xcc/255);
 assert.ok(Math.abs(colors[3].alpha-0x78/255)<1e-9);assert.equal(colors[5].alpha,0.5);
});
test('lookalikes are ignored',()=>{
 for(const text of ["SELECT '#ggg' FROM t","SELECT '#12345' FROM t","SELECT 'rgb(300, 0, 0)' FROM t","SELECT 'color#abcdefg' FROM t","SELECT '#abcd' FROM t"])assert.deepEqual(findColors(text),[],text);
});
test('the picker writes back the notation that was used',()=>{
 assert.equal(colorPresentation({red:1,green:0.5,blue:0,alpha:1},'hex'),'#ff8000');assert.equal(colorPresentation({red:0,green:0,blue:1,alpha:0.5},'hex'),'#0000ff80');
 assert.equal(colorPresentation({red:0.04,green:0.08,blue:0.12,alpha:1},'rgb'),'rgb(10, 20, 31)');assert.equal(colorPresentation({red:1,green:0,blue:0,alpha:0.5},'rgb'),'rgba(255, 0, 0, 0.5)');
});

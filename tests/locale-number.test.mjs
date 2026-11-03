import test from 'node:test';
import assert from 'node:assert/strict';
import {numberSeparators,parseLocaleNumber} from '../src/localeNumber.js';
const tr={decimal:',',group:'.'},en={decimal:'.',group:','};
test('separators come from the platform formatter',()=>{
 assert.deepEqual(numberSeparators('tr-TR'),tr);assert.deepEqual(numberSeparators('en-US'),en);assert.equal(typeof numberSeparators(undefined).decimal,'string');
 assert.deepEqual(numberSeparators('not a locale!!'),{decimal:'.',group:','});
});
test('numbers typed the Turkish way are converted to database form',()=>{
 assert.deepEqual(parseLocaleNumber('1.234,56',tr),{value:'1234.56',converted:true,note:'Read “1.234,56” as 1234.56'});
 assert.equal(parseLocaleNumber('19,99',tr).value,'19.99');assert.equal(parseLocaleNumber('-1.000',tr).value,'-1000');assert.equal(parseLocaleNumber('0,5',tr).value,'0.5');
 assert.equal(parseLocaleNumber('1.234',tr).value,'1234','a dot followed by exactly three digits is a thousands group in this locale');
});
test('plain database form and English input are accepted as they are',()=>{
 assert.deepEqual(parseLocaleNumber('1234.56',en),{value:'1234.56',converted:false});assert.equal(parseLocaleNumber('1,234.56',en).value,'1234.56');
 assert.equal(parseLocaleNumber('+5',en).value,'5');assert.equal(parseLocaleNumber('1e3',en).value,'1e3');assert.equal(parseLocaleNumber('19.99',tr).value,'19.99','a Turkish user may still type 19.99');
});
test('malformed or ambiguous input is rejected with a reason',()=>{
 for(const [text,separators] of [['',tr],['abc',tr],['1,2,3',tr],['12.34.5',tr],['1.23,4.5',tr],['1,2345,6',en],['12a',en]])assert.ok(parseLocaleNumber(text,separators).error,text);
 assert.match(parseLocaleNumber('1,2,3',tr).error,/at most one decimal comma/);
});

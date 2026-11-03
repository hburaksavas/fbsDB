import test from 'node:test';
import assert from 'node:assert/strict';
import {dateFromInput,formatDate,parseDate,tokenizeFormat} from '../src/dateFormat.js';
const sample=dateFromInput('2026-11-02 14:05:09.123456').date;
const format=(model,language)=>formatDate(sample,tokenizeFormat(model).tokens,language);
test('numeric elements print like TO_CHAR',()=>{
 assert.equal(format('YYYY-MM-DD HH24:MI:SS'),'2026-11-02 14:05:09');assert.equal(format('DD/MM/YY'),'02/11/26');
 assert.equal(format('HH12:MI AM'),'02:05 PM');assert.equal(format('hh:mi pm'),'02:05 pm');assert.equal(format('HH24:MI:SS.FF3'),'14:05:09.123');assert.equal(format('FF9'),'123456000');
 assert.equal(format('DDD'),'306');assert.equal(format('Q'),'4');assert.equal(format('D'),'2');
});
test('names follow the date language and the case of the element; FM removes padding',()=>{
 assert.equal(format('DD MONTH YYYY'),'02 NOVEMBER  2026','MONTH is blank-padded to nine characters');assert.equal(format('Month'),'November ');assert.equal(format('FMMonth'),'November');assert.equal(format('month'),'november ');
 assert.equal(format('DAY, DD MON'),'MONDAY   , 02 NOV');assert.equal(format('Dy'),'Mon');assert.equal(format('FMDD/FMMM/YYYY'),'2/11/2026');
 assert.equal(format('DD MONTH','tr').trim(),'02 KASIM');assert.equal(format('Mon DY','tr'),'Kas PZT');
});
test('quoted text and unsupported elements are handled explicitly',()=>{
 assert.equal(format('"Year" YYYY'),'Year 2026');
 assert.match(tokenizeFormat('YYYY-XYZ').error,/“XYZ” is not a supported format element/);assert.match(tokenizeFormat('"open').error,/not closed/);assert.equal(tokenizeFormat('').error,'Enter a format model.');
});
test('text is read back with the same model and impossible dates are refused',()=>{
 const read=(text,model,language)=>parseDate(text,tokenizeFormat(model).tokens,language);
 assert.deepEqual(read('02/11/2026 14:05:09','DD/MM/YYYY HH24:MI:SS').date,{year:2026,month:11,day:2,hour:14,minute:5,second:9,fraction:''});
 assert.equal(read('2 Kasım 2026','DD MONTH YYYY','tr').date.month,11);assert.equal(read('02-NOV-26','DD-MON-YY').date.year,2026);
 assert.equal(read('11:30 PM','HH12:MI PM').date.hour,23);assert.equal(read('12:00 AM','HH12:MI AM').date.hour,0);
 assert.match(read('31/02/2026','DD/MM/YYYY').error,/not a real date/);assert.match(read('02/11/2026 x','DD/MM/YYYY').error,/longer than the format/);assert.match(read('ab','YYYY').error,/Expected digits/);
 assert.match(read('Monday','DAY').error,/cannot be read back/);assert.match(read('13:00 PM','HH12:MI PM').error,/12-hour clock/);
});
test('sample input must be a real timestamp',()=>{
 assert.match(dateFromInput('2026-02-30').error,/not a real date/);assert.match(dateFromInput('tomorrow').error,/Use YYYY/);assert.equal(dateFromInput('2026-11-02').date.hour,0);
});

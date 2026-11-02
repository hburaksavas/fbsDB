import test from 'node:test';
import assert from 'node:assert/strict';
import {formatInstant,offsetMinutes,timezoneLens} from '../src/timezoneLens.js';
const temporal=(oracleType,value,extra={})=>({kind:'temporal',oracleType,value,...extra});
test('stored offsets produce UTC, local and region conversions with the original fraction',()=>{
 const lens=timezoneLens(temporal('TIMESTAMP WITH TIME ZONE','2026-11-02 10:15:30.123456789',{offset:'+03:00',region:'Europe/Istanbul'}),{localZone:'UTC'});
 assert.equal(lens.stored,'2026-11-02 10:15:30.123456789 +03:00 Europe/Istanbul');
 assert.equal(lens.basis,'Stored offset');
 assert.equal(lens.conversions[0].text,'2026-11-02 07:15:30.123456789 +00:00');
 assert.match(lens.conversions.find(item=>item.label.startsWith('Stored region')).text,/^2026-11-02 10:15:30\.123456789 \+03:00 Europe\/Istanbul$/);
});
test('timezone-free values never get an instant without an explicit assumption',()=>{
 const value=temporal('TIMESTAMP','2026-01-01 00:00:00');
 const lens=timezoneLens(value,{localZone:'Europe/Istanbul'});
 assert.equal(lens.instant,null);assert.equal(lens.timezoneFree,true);assert.match(lens.note,/explicit assumption/);
 const assumed=timezoneLens(value,{assumption:'-05:00'});
 assert.equal(assumed.basis,'Assumed -05:00 (not stored)');assert.equal(assumed.conversions[0].text,'2026-01-01 05:00:00 +00:00');
 assert.equal(timezoneLens(temporal('DATE','2026-01-01 00:00:00'),{assumption:'bogus'}).instant,null);
});
test('local time zone values use the session offset when it is known',()=>{
 const known=timezoneLens(temporal('TIMESTAMP WITH LOCAL TIME ZONE','2026-06-01 12:00:00',{sessionTimeZone:'+02:00'}));
 assert.equal(known.conversions[0].text,'2026-06-01 10:00:00 +00:00');assert.match(known.basis,/Session time zone/);
 const region=timezoneLens(temporal('TIMESTAMP WITH LOCAL TIME ZONE','2026-06-01 12:00:00',{sessionTimeZone:'Europe/Paris'}));
 assert.equal(region.instant,null);assert.match(region.note,/session time zone offset is unknown/);
});
test('offset parsing and invalid values',()=>{
 assert.equal(offsetMinutes('-09:30'),-570);assert.equal(offsetMinutes('Z'),0);assert.equal(offsetMinutes('+15:00'),null);
 assert.equal(formatInstant(0,'Not/AZone'),null);assert.equal(timezoneLens('not a date'),null);
});

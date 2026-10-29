import test from 'node:test';
import assert from 'node:assert/strict';
import {reviveOracleTemporal,oracleTemporalText,compareOracleTemporal,formatOracleTemporal,oracleTemporalSqlLiteral} from '../src/oracleTemporal.js';
import {formatResultValue,copyResultData,matchesCondition} from '../src/resultFeatures.js';
import {getVisibleResultRows} from '../src/resultRows.js';

const temporal=(oracleType,value,extra={})=>reviveOracleTemporal({kind:'temporal',oracleType,value,...extra});
test('DATE and TIMESTAMP keep their wall clock and never acquire a browser time zone',()=>{
 const date=temporal('DATE','2024-03-10T02:30:00'),stamp=temporal('TIMESTAMP','2024-03-10T02:30:00.123456789');
 assert.equal(formatResultValue(date,'DATE',{dateFormat:'iso',timeZone:'America/New_York'}),'2024-03-10T02:30:00');
 assert.equal(formatResultValue(stamp,'TIMESTAMP',{dateFormat:'iso',timeZone:'Asia/Tokyo'}),'2024-03-10T02:30:00.123456789');
 for(const timeZone of ['UTC','Europe/Istanbul','America/New_York'])assert.match(formatOracleTemporal(stamp,'TIMESTAMP',{dateFormat:'local',locale:'tr-TR',timeZone}),/02:30:00,123456789/);
 assert.ok(Object.isFrozen(date));assert.equal(String(date),'2024-03-10T02:30:00');
});
test('DST overlap offsets and nine-digit fractions survive sorting, filtering and copy/export',()=>{
 const first=temporal('TIMESTAMP WITH TIME ZONE','2024-11-03T01:30:00.123456789',{offset:'-04:00',region:'America/New_York'});
 const second=temporal('TIMESTAMP WITH TIME ZONE','2024-11-03T01:30:00.123456790',{offset:'-05:00',region:'America/New_York'});
 assert.equal(compareOracleTemporal(first,second),-1);
 const columns=[{name:'T',type:'TIMESTAMP WITH TIME ZONE'}];
 assert.deepEqual(getVisibleResultRows([[second],[first]],columns,'',0).map(item=>item.row[0]),[first,second]);
 assert.equal(matchesCondition(second,{kind:'date',op:'gt',value:first}),true);
 assert.match(formatOracleTemporal(first,columns[0].type,{dateFormat:'local',locale:'en-US',timeZone:'UTC'}),/05:30:00\.123456789/);
 const copied=copyResultData([[first]],columns,'tsv');assert.equal(copied,'2024-11-03T01:30:00.123456789-04:00[America/New_York]');
 assert.match(copyResultData([[first]],columns,'json'),/123456789-04:00\[America\/New_York\]/);
 assert.match(oracleTemporalSqlLiteral(first),/TIMESTAMP '2024-11-03 01:30:00.123456789 -04:00' AT TIME ZONE 'America\/New_York'/);
});
test('LTZ preserves session wall time without inventing an offset for an ambiguous local hour',()=>{
 const local=temporal('TIMESTAMP WITH LOCAL TIME ZONE','2024-11-03T01:30:00.123456789',{sessionTimeZone:'America/New_York'});
 assert.equal(oracleTemporalText(local),'2024-11-03T01:30:00.123456789[session:America/New_York]');
 assert.match(formatOracleTemporal(local,local.oracleType,{dateFormat:'local',locale:'en-US',timeZone:'UTC'}),/01:30:00\.123456789.*session:America\/New_York/);
 assert.throws(()=>oracleTemporalSqlLiteral(local),/unambiguous offset/);
});
test('nanosecond ordering and early years do not pass through JavaScript millisecond rounding',()=>{
 assert.equal(compareOracleTemporal('2024-01-01T00:00:00.000000001','2024-01-01T00:00:00.000000002'),-1);
 assert.equal(formatOracleTemporal('0001-01-01T03:04:05','DATE',{dateFormat:'iso'}),'0001-01-01T03:04:05');
 assert.equal(oracleTemporalSqlLiteral(temporal('DATE','2024-01-02T03:04:05')),"CAST(TIMESTAMP '2024-01-02 03:04:05' AS DATE)");
});

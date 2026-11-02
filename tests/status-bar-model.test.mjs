import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultStatusIndicators,normalizeStatusIndicators,statusIndicatorContent,toggleStatusIndicator} from '../src/statusBarModel.js';
test('stored indicators are validated, deduplicated and fall back to the defaults',()=>{
 assert.deepEqual(normalizeStatusIndicators(undefined),[...defaultStatusIndicators]);
 assert.deepEqual(normalizeStatusIndicators(['branch','nope','branch','schema','position']),['branch','schema']);
 assert.deepEqual(normalizeStatusIndicators([]),[]);
});
test('toggling keeps the catalogue order and ignores unknown ids',()=>{
 assert.deepEqual(toggleStatusIndicator(['language','spaces'],'schema'),['schema','spaces','language']);
 assert.deepEqual(toggleStatusIndicator(['schema','spaces'],'schema'),['spaces']);
 assert.deepEqual(toggleStatusIndicator(['spaces'],'overview'),['spaces']);
});
test('indicators describe live context and hide when data is missing',()=>{
 assert.equal(statusIndicatorContent('procedure',{}),null);assert.equal(statusIndicatorContent('branch',{}),null);assert.equal(statusIndicatorContent('oracleVersion',{}),null);
 assert.deepEqual(statusIndicatorContent('procedure',{procedure:'total'}).action,'outline');
 assert.equal(statusIndicatorContent('oracleVersion',{oracleVersion:23}).text,'Oracle 23');
 assert.equal(statusIndicatorContent('spaces',{tabSize:4,insertSpaces:true}).text,'Spaces: 4');assert.equal(statusIndicatorContent('spaces',{tabSize:4,insertSpaces:false}).text,'Tab size: 4');
 assert.match(statusIndicatorContent('lineEnding',{lineEnding:'CRLF'}).title,/to LF; this edits the document/);
 assert.equal(statusIndicatorContent('encoding').action,undefined);assert.equal(statusIndicatorContent('unknown',{}),null);
});

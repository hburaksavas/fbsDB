import test from 'node:test';
import assert from 'node:assert/strict';
import {exportProgressText,formatBytes} from '../src/exportProgress.js';
test('byte sizes use binary units and ignore invalid input',()=>{
 assert.equal(formatBytes(0),'0 B');assert.equal(formatBytes(1536),'1.5 KB');assert.equal(formatBytes(5*1024*1024),'5.0 MB');assert.equal(formatBytes(300*1024*1024),'300 MB');
 assert.equal(formatBytes(-1),'');assert.equal(formatBytes(undefined),'');assert.equal(formatBytes(1024**5*2),'2048 TB');
});
test('progress shows rows, size and rates only when they are known',()=>{
 assert.equal(exportProgressText({rowsWritten:12000,bytesWritten:3*1024*1024,elapsedMs:2000}),'12,000 rows · 3.0 MB · 1.5 MB/s · 6,000 rows/s · 2s');
 assert.equal(exportProgressText({rowsWritten:5}),'5 rows');
 assert.equal(exportProgressText({rowsWritten:5,bytesWritten:2048,elapsedMs:100}),'5 rows · 2.0 KB');
 assert.equal(exportProgressText(undefined),'0 rows');
 assert.match(exportProgressText({rowsWritten:9,bytesWritten:10,elapsedMs:65000}),/ · 1m 05s$/);
 assert.doesNotMatch(exportProgressText({rowsWritten:9,elapsedMs:900}),/\ds$/);
});

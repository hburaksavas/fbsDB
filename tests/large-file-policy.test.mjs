import test from 'node:test';
import assert from 'node:assert/strict';
import {LARGE_FILE_THRESHOLD,largeFilePolicy,lightweightEditorOptions} from '../src/largeFilePolicy.js';
test('large files default to bounded rendering and disabled analyses with separate per-feature opt-ins',()=>{
 const text=' '.repeat(LARGE_FILE_THRESHOLD),minimal=largeFilePolicy(text);
 assert.equal(minimal.large,true);for(const feature of ['completion','diagnostics','outline','source'])assert.equal(minimal[feature],false);
 const selective=largeFilePolicy(text,{outline:true,completion:'true'});assert.equal(selective.outline,true);assert.equal(selective.completion,false);assert.equal(lightweightEditorOptions(selective).folding,true);
 assert.equal(lightweightEditorOptions(minimal).maxTokenizationLineLength,2000);assert.equal(lightweightEditorOptions(minimal).minimap.enabled,false);
 const normal=largeFilePolicy('SELECT 1');assert.equal(normal.large,false);assert.equal(normal.completion,true);assert.equal(normal.diagnostics,true);assert.equal(lightweightEditorOptions(normal).maxTokenizationLineLength,20000);
});

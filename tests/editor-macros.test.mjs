import test from 'node:test';
import assert from 'node:assert/strict';
import {recordMacroStep,createEditorMacro} from '../src/editorMacros.js';

test('macro recording includes only supported local editor actions',()=>{
  let steps=[];steps=recordMacroStep(steps,'moveUp');steps=recordMacroStep(steps,'runSql');steps=recordMacroStep(steps,'comment');
  assert.deepEqual(steps,['moveUp','comment']);
  assert.equal(createEditorMacro('Arrange lines',steps).macro.name,'Arrange lines');
  assert.equal(createEditorMacro('Run query',['runSql']).error,'Record 1 to 20 supported editor actions.');
});

test('macro recording is bounded',()=>{
  let steps=[];for(let i=0;i<25;i++)steps=recordMacroStep(steps,'moveDown');
  assert.equal(steps.length,20);
  assert.match(createEditorMacro(' ',steps).error,/name/);
});

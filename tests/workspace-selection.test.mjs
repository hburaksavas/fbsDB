import test from 'node:test';
import assert from 'node:assert/strict';
import {selectWorkspacePaths,topLevelWorkspaceEntries,canDropWorkspaceEntries} from '../src/workspaceSelection.js';

test('workspace range/toggle selection preserves visible order and Windows path identity',()=>{
  const visible=['C:/sql/a.sql','C:/sql/b.sql','C:/sql/c.sql','C:/sql/d.sql'];
  assert.deepEqual(selectWorkspacePaths([visible[0]],visible,visible[2],{range:true,anchor:visible[0]}),visible.slice(0,3));
  assert.deepEqual(selectWorkspacePaths([visible[3]],visible,visible[0],{range:true,anchor:visible[2],toggle:true}),[visible[3],...visible.slice(0,3)]);
  assert.deepEqual(selectWorkspacePaths([visible[0],visible[1]],visible,'c:\\SQL\\A.sql',{toggle:true}),[visible[1]]);
  assert.deepEqual(selectWorkspacePaths([visible[1]],visible,visible[3],{range:true,anchor:'C:/sql/hidden.sql'}),[visible[3]]);
});
test('batch selection excludes descendants and invalid drop targets without confusing sibling prefixes',()=>{
  const parent={path:'C:/sql/queries',isDirectory:true},child={path:'C:/sql/queries/a.sql',isDirectory:false},sibling={path:'C:/sql/queries-old/a.sql',isDirectory:false};
  assert.deepEqual(topLevelWorkspaceEntries([child,parent,{...parent,path:'c:\\SQL\\queries'},sibling]),[{...parent,path:'c:\\SQL\\queries'},sibling]);
  assert.equal(canDropWorkspaceEntries([parent],'C:/sql/queries/child'),false);
  assert.equal(canDropWorkspaceEntries([parent],'C:/sql'),false);
  assert.equal(canDropWorkspaceEntries([parent,child],'C:/sql/target'),true);
  assert.equal(canDropWorkspaceEntries([],'C:/sql/target'),false);
});

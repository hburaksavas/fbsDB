import test from 'node:test';
import assert from 'node:assert/strict';
import {captureLayout,normalizeSavedLayouts,restoreLayout,layoutPresets} from '../src/savedLayouts.js';
import {defaultDockLayout} from '../src/dockLayout.js';
test('saved layouts retain geometry and lock but exclude workspace paths and preserve current expansion on restore',()=>{
 const current={...defaultDockLayout(),locked:true,widths:{left:340,right:300},expandedPaths:{'D:/private/project':true},resultsHeight:51};
 const captured=captureLayout(current,true);
 assert.deepEqual(captured.layout.expandedPaths,{});assert.equal(captured.focus,true);
 const restored=restoreLayout(captured,{...current,expandedPaths:{'D:/other':true}});
 assert.equal(restored.widths.left,340);assert.equal(restored.locked,true);assert.equal(restored.resultsHeight,51);assert.deepEqual(restored.expandedPaths,{'D:/other':true});
});
test('layout library validates identities, names, bounds and built-in arrangements',()=>{
 const entry={id:'one',name:'  Review  ',layout:defaultDockLayout()};
 const parsed=normalizeSavedLayouts({version:1,entries:[entry,entry,{...entry,id:'bad space'},{...entry,id:'empty',name:' '}]});
 assert.equal(parsed.entries.length,1);assert.equal(parsed.entries[0].name,'Review');
 assert.equal(normalizeSavedLayouts({version:2,entries:[entry]}).entries.length,0);
 assert.equal(normalizeSavedLayouts({version:1,entries:Array.from({length:20},(_,i)=>({...entry,id:`entry-${i}`}))}).entries.length,12);
 const presets=layoutPresets();assert.equal(presets.length,3);assert.equal(presets[0].focus,true);assert.equal(presets[1].layout.resultsCollapsed,false);assert.equal(presets[2].layout.groups.find(g=>g.panels.includes('objects')).side,'right');
});

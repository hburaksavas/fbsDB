import {defaultDockLayout,normalizeDockLayout,moveDockPanel} from './dockLayout.js';
export function captureLayout(layout,focus=false){
 const normalized=normalizeDockLayout(layout);
 // Expansion paths are workspace content, not part of a portable panel arrangement.
 return {layout:{...normalized,expandedPaths:{}},focus:focus===true};
}
export function normalizeSavedLayouts(value){
 if(!value||value.version!==1||!Array.isArray(value.entries))return {version:1,entries:[]};
 const seen=new Set();
 return {version:1,entries:value.entries.slice(0,12).filter(e=>e&&typeof e.id==='string'&&/^[a-z0-9_-]{1,60}$/i.test(e.id)&&!seen.has(e.id)&&(seen.add(e.id),true)&&typeof e.name==='string'&&e.name.trim()&&e.layout?.version===1).map(e=>({id:e.id,name:e.name.trim().slice(0,60),...captureLayout(e.layout,e.focus)}))};
}
export function layoutPresets(){
 const base=defaultDockLayout(),review=moveDockPanel(base,'objects','right');
 return [{id:'editing',name:'Focused editing',...captureLayout({...base,visible:false,resultsCollapsed:true},true)},
 {id:'results',name:'Code and results',...captureLayout(base)},
 {id:'review',name:'Review with objects',...captureLayout({...review,resultsHeight:25})}];
}
export function restoreLayout(saved,current){
 return normalizeDockLayout({...saved.layout,expandedPaths:current.expandedPaths});
}

import {useEffect,useRef,useState} from 'react';
import {LARGE_FILE_THRESHOLD} from './largeFilePolicy.js';
export function useEditorOverview(editor,monaco,document,client,theme,enabled){
 const [state,setState]=useState({ranges:[],coarse:false}),collection=useRef(null);
 const source=document?.content||'',stored=document?.savedContent;
 const before=typeof stored==='string'?stored:!document?.dirty?source:!document?.path?'':undefined;
 useEffect(()=>{if(!editor)return;collection.current=editor.createDecorationsCollection();return()=>{collection.current?.clear();collection.current=null}},[editor]);
 useEffect(()=>{
  setState({ranges:[],coarse:false});collection.current?.clear();
  if(!enabled||!editor||!monaco||!client||document?.readOnly||typeof before!=='string'||source.length>=LARGE_FILE_THRESHOLD||before.length>=LARGE_FILE_THRESHOLD)return;
  let cancelled=false;const model=editor.getModel(),version=model?.getVersionId();
  const timer=setTimeout(async()=>{
   const result=await client.request('changes',source,0,null,{before});
   if(cancelled||!result.changes||model?.isDisposed()||editor.getModel()!==model||model.getVersionId()!==version)return;
   const color=getComputedStyle(editor.getDomNode()).getPropertyValue('--warning').trim(),changes=result.changes;
   collection.current?.set(changes.ranges.map(range=>({range:new monaco.Range(range.start,1,range.end,1),options:{description:'fbsdb-local-change',overviewRuler:{color,position:monaco.editor.OverviewRulerLane.Left},hoverMessage:{value:changes.coarse?'Local changed span (coarse comparison)':'Local change since saved baseline'}}})));
   setState(changes);
  },200);
  return()=>{cancelled=true;clearTimeout(timer)};
 },[editor,monaco,document?.id,source,before,document?.readOnly,client,theme,enabled]);
 const next=()=>{if(!state.ranges.length)return;const line=editor?.getPosition()?.lineNumber||1,target=state.ranges.find(range=>range.start>line)||state.ranges[0];editor.setPosition({lineNumber:target.start,column:1});editor.revealLineInCenter(target.start);editor.focus()};
 const label=!enabled?'Overview off':source.length>=LARGE_FILE_THRESHOLD?'Changes paused · large file':typeof before!=='string'?'Change baseline unknown':`${state.ranges.length} local changes${state.coarse?' · coarse':''}`;
 return {...state,next,label,baselineKnown:typeof before==='string'};
}

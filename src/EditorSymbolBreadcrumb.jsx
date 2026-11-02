import { useEffect, useState } from 'react';
import {outlineBreadcrumbs} from './outlineModel';
import { ChevronRight } from 'lucide-react';

export function EditorSymbolBreadcrumb({editor,tabId,outline,onNavigate,schema,source}) {
  const [offset,setOffset]=useState(0);
  useEffect(()=>{
    if(!editor)return;
    const update=()=>{const position=editor.getPosition(),model=editor.getModel();if(position&&model)setOffset(model.getOffsetAt(position))};
    update();const listener=editor.onDidChangeCursorPosition(update);return()=>listener.dispose();
  },[editor,tabId,outline]);
  const {ancestors,neighbors}=outlineBreadcrumbs(outline,offset),current=ancestors.at(-1),owner=source?.owner||schema||(source?'Schema unknown':null);
  return ancestors.length||owner?<span className="editor-symbol-breadcrumb" aria-label="Source symbol path">
    {owner&&<span className="breadcrumb-schema"><ChevronRight size={12}/>{owner}</span>}
    {ancestors.map(item=><span key={`${item.start}:${item.kind}`}><ChevronRight size={12}/><button type="button" title={item.name} onClick={()=>onNavigate?.(item.start)}>{item.kind} · {item.name}</button></span>)}
    {neighbors.length>1&&<select aria-label="Navigate neighboring symbols" value={current?.start??''} onChange={event=>onNavigate?.(Number(event.target.value))}>{neighbors.map(item=><option key={`${item.start}:${item.kind}`} value={item.start}>{item.kind} · {item.name}</option>)}</select>}
  </span>:null;
}

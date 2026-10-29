import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';

export function EditorSymbolBreadcrumb({editor,tabId,outline}) {
  const [offset,setOffset]=useState(0);
  useEffect(()=>{
    if(!editor)return;
    const update=()=>{const position=editor.getPosition(),model=editor.getModel();if(position&&model)setOffset(model.getOffsetAt(position))};
    update();const listener=editor.onDidChangeCursorPosition(update);return()=>listener.dispose();
  },[editor,tabId,outline]);
  const symbol=outline.filter(item=>item.start<=offset&&item.end>=offset).sort((a,b)=>b.depth-a.depth)[0];
  return symbol?<span className="editor-symbol-breadcrumb" title={symbol.name}><ChevronRight size={12}/>{symbol.kind} · {symbol.name}</span>:null;
}

import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {getOracleBindNames} from './oracleBinds';
import {getSqlStatements} from './sqlStatements';
import {bindOccurrences} from './inlineBinds';
import {InlineBindBar} from './InlineBindBar';

// Keeps one Monaco view zone above the statement under the caret; it hosts the bind fields without touching the source text.
export function InlineBindZone({editor,enabled,store,scopeKey,onPick,refresh=0}) {
  const [version,setVersion]=useState(0),[info,setInfo]=useState({names:[],line:0,start:0,sql:''});
  const zone=useRef({id:null,node:null,root:null,line:0}),highlight=useRef(null),latest=useRef({});
  latest.current={info,scopeKey,version};
  const removeZone=()=>{
    const current=zone.current;
    if(current.id!=null&&editor)editor.changeViewZones(accessor=>accessor.removeZone(current.id));
    current.root?.unmount();zone.current={id:null,node:null,root:null,line:0};
  };
  useEffect(()=>{
    if(!editor||!enabled){removeZone();setInfo(current=>current.names.length?{names:[],line:0,start:0,sql:''}:current);return undefined}
    let timer=null;
    const sync=()=>{
      const model=editor.getModel(),position=editor.getPosition();
      if(!model||!position){setInfo({names:[],line:0,start:0,sql:''});return}
      const text=model.getValue(),caret=model.getOffsetAt(position),statement=getSqlStatements(text).find(item=>item.start<=caret&&caret<=item.end);
      const names=statement?getOracleBindNames(statement.sql):[];
      setInfo(current=>{
        const line=names.length?model.getPositionAt(statement.start).lineNumber:0;
        return current.line===line&&current.sql===(statement?.sql||'')&&current.names.join()===names.join()?current:{names,line,start:statement?.start||0,sql:statement?.sql||''};
      });
    };
    const schedule=()=>{clearTimeout(timer);timer=setTimeout(sync,120)};
    const subscriptions=[editor.onDidChangeCursorPosition(schedule),editor.onDidChangeModelContent(schedule),editor.onDidChangeModel(schedule)];
    sync();
    return()=>{clearTimeout(timer);subscriptions.forEach(item=>item.dispose());removeZone()};
  },[editor,enabled]);
  const focusName=name=>{
    highlight.current?.clear();highlight.current=null;
    const model=editor?.getModel();
    if(!name||!model)return;
    const base=latest.current.info.start,ranges=bindOccurrences(latest.current.info.sql).filter(item=>item.name===name).map(item=>{
      const from=model.getPositionAt(base+item.start),to=model.getPositionAt(base+item.end);
      return {range:{startLineNumber:from.lineNumber,startColumn:from.column,endLineNumber:to.lineNumber,endColumn:to.column},options:{inlineClassName:'inline-bind-usage',stickiness:1}};
    });
    highlight.current=editor.createDecorationsCollection(ranges);
  };
  useEffect(()=>{
    if(!editor||!enabled)return;
    const {names,line}=info;
    if(!names.length||!line){removeZone();return}
    const current=zone.current;
    if(current.id!=null&&current.line!==line)removeZone();
    if(zone.current.id==null){
      const node=document.createElement('div');node.className='inline-bind-zone';
      editor.changeViewZones(accessor=>{zone.current={id:accessor.addZone({afterLineNumber:line-1,heightInPx:34,domNode:node,suppressMouseDown:true}),node,root:createRoot(node),line}});
    }
    zone.current.root.render(<InlineBindBar names={names} entryFor={name=>store.get(scopeKey,name)} onChange={(name,patch)=>{store.set(scopeKey,name,patch);setVersion(value=>value+1)}} onFocusName={focusName} onPick={onPick}/>);
  },[info,version,enabled,editor,scopeKey,refresh]);
  useEffect(()=>{
    const focus=event=>{const input=zone.current.node?.querySelector(`[data-bind-input="${event.detail?.name}"]`);input?.focus()};
    window.addEventListener('fbsdb.inlineBind.focus',focus);return()=>window.removeEventListener('fbsdb.inlineBind.focus',focus);
  },[]);
  return null;
}

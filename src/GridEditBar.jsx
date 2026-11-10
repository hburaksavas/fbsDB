import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,Plus,Trash2,Undo2} from 'lucide-react';
import {fromCalendarValue,toCalendarValue} from './gridEditability';
import {registerGridActions} from './gridActionBridge';

// The whole edit workflow: change cells in the table, then Apply sends every change at once. Discard drops them.
// The four buttons sit in the result toolbar's own row, at its right end; only a reason why editing is not possible takes a line below it.
export function GridEditBar({editability,loading,editMode,onToggle,summary,applying=false,onApply,onDiscard,onNewRow,onDeleteRow,hasSelection,onDescriptions}) {
  const editable=!!editability?.editable,blocked=editability&&!editable;
  const canInsert=editable&&editability.canInsert!==false,canDelete=editable&&editability.canDelete!==false;
  const dirty=summary.total>0;
  // The command palette offers the same actions; it reads this list when it opens.
  const rootRef=useRef(null),paletteActions=useRef(null),[slot,setSlot]=useState(null);
  paletteActions.current=()=>[
    {id:'toggleEdit',label:editMode?'Leave edit mode (unapplied changes stay)':'Edit rows of this result',run:onToggle},
    {id:'descriptions',label:'Show descriptions beside key values…',run:onDescriptions},
    ...(editMode?[
      {id:'apply',label:'Apply the changes to Oracle',disabled:!dirty||applying,why:'Nothing to apply',run:onApply},
      {id:'discard',label:'Discard the unapplied changes',disabled:!dirty||applying,why:'Nothing to discard',run:onDiscard},
      {id:'newRow',label:'Add a new row',disabled:!canInsert,why:'This result cannot take new rows',run:onNewRow},
      {id:'deleteRow',label:'Mark the selected row for deletion',disabled:!canDelete||!hasSelection,why:'Select a row first',run:onDeleteRow}
    ]:[])
  ];
  useEffect(()=>registerGridActions({element:rootRef.current,get:()=>paletteActions.current()}),[]);
  // The toolbar of this result is the nearest one above the grid.
  useLayoutEffect(()=>{
    let node=rootRef.current?.parentElement,found=null;
    while(node&&!found){found=node.querySelector?.('[data-grid-edit-slot]')||null;node=node.parentElement}
    setSlot(found);
  },[editMode]);
  const buttons=editMode&&<div className="grid-edit-bar" role="toolbar" aria-label="Edit result rows">
    {loading&&<span role="status" className="grid-edit-note">Preparing…</span>}
    <button type="button" className="button-primary grid-edit-apply" disabled={!dirty||applying} title="Send every change to Oracle" onClick={onApply}><Check size={13}/>{applying?'Applying…':dirty?`Apply (${summary.total})`:'Apply'}</button>
    <button type="button" disabled={!dirty||applying} title="Drop every unapplied change" onClick={onDiscard}><Undo2 size={13}/>Discard</button>
    <button type="button" disabled={!canInsert||applying} title={editable&&!canInsert?'You have no INSERT privilege on this table':'Add a new row'} onClick={onNewRow}><Plus size={13}/>Row</button>
    <button type="button" disabled={!canDelete||!hasSelection||applying} title={editable&&!canDelete?'You have no DELETE privilege on this table':'Mark the selected row for deletion; press again to keep it'} onClick={onDeleteRow}><Trash2 size={13}/>Delete row</button>
  </div>;
  const limits=editMode&&editable&&editability.limits?.length>0,reasons=editMode&&blocked&&!loading&&editability.reasons.length>0;
  return <div ref={rootRef} className={limits||reasons||(buttons&&!slot)?'grid-edit-notes':'grid-edit-anchor'} aria-hidden={editMode?undefined:'true'}>
    {buttons&&(slot?createPortal(buttons,slot):buttons)}
    {limits&&<ul className="grid-edit-reasons" role="status" aria-label="What your privileges do not allow">{editability.limits.map(limit=><li key={limit}>{limit}</li>)}</ul>}
    {reasons&&<ul className="grid-edit-reasons" role="status" aria-label="Why this result cannot be edited">{editability.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
  </div>;
}

// Inline cell editor. Enter keeps the value (Ctrl+Enter in the multi-line editor), Tab keeps it and moves on, Escape cancels.
// `typed` is the character that opened the editor by typing: it replaces the old value instead of selecting it.
export function CellEditor({initial,kind='text',typed,onCommit,onCancel,onTab,onEnter}) {
  const ref=useRef(null);
  useEffect(()=>{ref.current?.focus();if(typed==null)ref.current?.select?.()},[]);
  const value=()=>kind==='datetime'?fromCalendarValue(ref.current.value):ref.current.value;
  const onKeyDown=event=>{
    event.stopPropagation();
    const multi=kind==='longtext';
    if(event.key==='Enter'&&(!multi||event.ctrlKey||event.metaKey)){event.preventDefault();onCommit(value());onEnter?.()}
    else if(event.key==='Escape'){event.preventDefault();onCancel()}
    else if(event.key==='Tab'){event.preventDefault();onCommit(value());onTab(event.shiftKey?-1:1)}
  };
  const start=typed??initial??'';
  const common={ref,className:`cell-editor cell-editor-${kind}`,'data-escape-local':true,'aria-label':'Cell value',onKeyDown,onBlur:()=>onCommit(value())};
  const field=kind==='datetime'?<input {...common} type="datetime-local" step="1" defaultValue={toCalendarValue(initial)}/>
    :kind==='longtext'?<textarea {...common} rows={4} title="Ctrl+Enter keeps the value" defaultValue={start}/>
    :<input {...common} defaultValue={start}/>;
  // The grid selects cells on pointer down; inside the editor the pointer belongs to the text.
  return <span className="cell-editor-wrap" onPointerDown={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()}>{field}</span>;
}

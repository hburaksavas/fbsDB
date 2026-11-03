import {useEffect,useRef} from 'react';
import {ChevronDown,Pencil,Pin,Redo2,Undo2} from 'lucide-react';
import {fromCalendarValue,toCalendarValue} from './gridEditability';
import {lengthMeter} from './cellValidation';
import {useState} from 'react';
import {layoutActions,loadPinned,savePinned,togglePinned} from './gridBarLayout';
import {chooseHint,dismissHint,loadHintPrefs,saveHintPrefs} from './editHints';
import {registerGridActions} from './gridActionBridge';

// The "More" menu keeps the rarely needed edit tools off the bar. Arrow keys move through it, Escape closes it and returns focus to its button.
function MoreMenu({items,pinned,onPin}) {
  const [open,setOpen]=useState(false),root=useRef(null),button=useRef(null);
  const close=returnFocus=>{setOpen(false);if(returnFocus)button.current?.focus()};
  useEffect(()=>{
    if(!open)return;
    const outside=event=>{if(!root.current?.contains(event.target))setOpen(false)};
    document.addEventListener('pointerdown',outside);
    root.current.querySelector('[data-menu-focus]:not(:disabled)')?.focus();
    return()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  const onKeyDown=event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    const focusable=[...root.current.querySelectorAll('[data-menu-focus]:not(:disabled)')];
    if(!focusable.length)return;
    event.preventDefault();
    const at=focusable.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?focusable.length-1:event.key==='ArrowDown'?(at+1)%focusable.length:(at<=0?focusable.length-1:at-1);
    focusable[next].focus();
  };
  return <span className="grid-edit-more" ref={root}>
    <button type="button" ref={button} className="grid-edit-more-button" aria-haspopup="menu" aria-expanded={open} title="More edit tools" onClick={()=>setOpen(value=>!value)}>More<ChevronDown size={12}/></button>
    {open&&<div className="grid-edit-menu" role="menu" aria-label="More edit tools" onKeyDown={onKeyDown}>
      {items.map(item=><div key={item.id} className="grid-edit-menu-row" role="none">
        {item.render?<label className="grid-edit-menu-field" role="none">{item.render(close)}</label>
          :<button type="button" data-menu-focus role={item.toggle?'menuitemcheckbox':'menuitem'} aria-checked={item.toggle?!!item.pressed:undefined} disabled={item.disabled} title={item.title} aria-label={item.ariaLabel} onClick={()=>{item.onClick();if(!item.keepOpen)close(true)}}>{item.label}</button>}
        {item.pinnable&&<button type="button" data-menu-focus className="grid-edit-pin" aria-pressed={pinned.includes(item.id)} aria-label={`${pinned.includes(item.id)?'Unpin':'Pin'} ${item.label} ${pinned.includes(item.id)?'from':'to'} the bar`} title={pinned.includes(item.id)?'Remove from the bar':'Keep on the bar'} onClick={()=>onPin(item.id)}><Pin size={11}/></button>}
      </div>)}
    </div>}
  </span>;
}

// Explicit edit mode: results are read-only until this is switched on, and the bar always says what is pending.
export function GridEditBar({editability,loading,editMode,onToggle,summary,canUndo,canRedo,onUndo,onRedo,onSetNull,onDeleteRow,onNewRow,tabAddsRow=false,onTabAddsRow,templates=[],onTemplate,onDuplicate,onBulk,onRecord,onPaste,onCheckboxes,onDrawer,drawerOpen,onStep,hasSelection,invalidCount=0,onInvalid,changesOnly=false,onChangesOnly,deletionsOnly=false,onDeletionsOnly,onDescriptions,selectedCells=0,selectedRows=0,applying=false,txText='',txState,onDismissTx,txLabel='',onTxLabel,onChecks,canUndoBatch,onUndoBatch,verification,canVerify,canRestore,canReceipt,onVerify,onRestore,onReceipt}) {
  const blocked = editability && !editability.editable;
  const editable = !!editability?.editable;
  const [pinned,setPinned]=useState(()=>loadPinned(globalThis.localStorage));
  const [hintPrefs,setHintPrefs]=useState(()=>loadHintPrefs(globalThis.localStorage));
  const changeHints=next=>{setHintPrefs(next);saveHintPrefs(globalThis.localStorage,next)};
  const hint=chooseHint({editMode,editable,selectedCells,selectedRows,pending:summary.total,applying},hintPrefs);
  const pin=id=>setPinned(current=>{const next=togglePinned(current,id);savePinned(globalThis.localStorage,next);return next});
  const actions={
    descriptions:{label:'Descriptions…',title:'Show a description beside key values, read with your own query',onClick:onDescriptions},
    record:{label:'Record view',disabled:!editable,title:'Edit one record as attribute / value pairs; Alt+PageUp/PageDown moves between records and keeps the field',onClick:onRecord},
    checkboxes:{label:'Checkbox columns…',disabled:!editable,title:'Show Y/N or 1/0 columns as checkboxes while editing',onClick:onCheckboxes},
    paste:{label:'Paste…',disabled:!editable||!hasSelection,title:'Paste spreadsheet data (Ctrl+V) from the active cell, with a preview',onClick:onPaste},
    bulk:{label:'Bulk edit…',disabled:!editable||!hasSelection,title:'Change all selected cells at once: set a value or NULL, find and replace, or arithmetic, with a preview',onClick:onBulk},
    duplicate:{label:'Duplicate row',disabled:!editable||!hasSelection,title:'Copy the selected row into a new row draft (keys and locked columns are left out)',onClick:onDuplicate},
    prevEdit:{label:'Previous edited cell',disabled:!summary.cells,title:'Previous edited cell',onClick:()=>onStep(-1),keepOpen:true},
    nextEdit:{label:'Next edited cell',disabled:!summary.cells,title:'Next edited cell',onClick:()=>onStep(1),keepOpen:true},
    changesOnly:{label:'Changes only',toggle:true,pressed:changesOnly,title:'Show only changed rows and columns, keeping the identifying key columns',onClick:onChangesOnly},
    deletionsOnly:{label:'Deletions only',toggle:true,pressed:deletionsOnly,disabled:!summary.deletes,title:'Review only the rows marked for deletion, with their identifying key columns',onClick:onDeletionsOnly},
    checks:{label:'Checks…',title:"Run your own SELECT checks inside the session's transaction",onClick:onChecks},
    tabAdds:{label:'Tab adds a row',toggle:true,pressed:tabAddsRow,disabled:!editable,ariaLabel:'Tab adds a row',keepOpen:true,title:'While editing a cell, Tab moves to the next editable cell. Past the last one, start a new row draft with the required fields first.',onClick:onTabAddsRow},
    template:{label:'New row from template',render:close=><select aria-label="New row from template" data-menu-focus disabled={!editable} value="" onChange={event=>{if(event.target.value){onTemplate(event.target.value);close(true)}}}><option value="">From template…</option>{templates.map(item=><option key={item.name} value={item.name}>{item.name}</option>)}</select>}
  };
  const {inline,menu}=layoutActions({editMode,pinned,active:[changesOnly&&'changesOnly',deletionsOnly&&'deletionsOnly'].filter(Boolean),hidden:templates.length?[]:['template']});
  const entry=id=>({id,pinnable:id!=='tabAdds'&&id!=='template',...actions[id]});
  // The command palette offers the same actions; it reads this list when it opens.
  const rootRef=useRef(null),paletteActions=useRef(null);
  const needs=!editable?'This result cannot be edited':'Select a cell or row first';
  paletteActions.current=()=>[
    {id:'toggleEdit',label:editMode?'Leave edit mode (pending edits stay)':'Edit rows of this result',run:onToggle},
    {id:'descriptions',label:'Show descriptions beside key values…',run:onDescriptions},
    ...(editMode?[
      {id:'setNull',label:'Set the selected cell to NULL',disabled:!editable||!hasSelection,why:needs,run:onSetNull},
      {id:'newRow',label:'Add a new row draft',disabled:!editable,why:needs,run:onNewRow},
      {id:'deleteRow',label:'Mark the selected row for deletion',disabled:!editable||!hasSelection,why:needs,run:onDeleteRow},
      {id:'undo',label:'Undo the last draft change',disabled:!canUndo,why:'Nothing to undo',run:onUndo},
      {id:'redo',label:'Redo the draft change',disabled:!canRedo,why:'Nothing to redo',run:onRedo},
      {id:'pending',label:'Review pending changes and their SQL',run:onDrawer},
      ...(invalidCount>0?[{id:'invalid',label:'Go to the next invalid cell',run:onInvalid}]:[]),
      ...['record','checkboxes','paste','bulk','duplicate','prevEdit','nextEdit','changesOnly','deletionsOnly','checks','tabAdds'].map(id=>({id,label:id==='record'?'Edit one record as attribute / value pairs':actions[id].label,disabled:actions[id].disabled,why:['prevEdit','nextEdit','deletionsOnly'].includes(id)?'Nothing staged yet':needs,run:actions[id].onClick}))
    ]:[])
  ];
  useEffect(()=>registerGridActions({element:rootRef.current,get:()=>paletteActions.current()}),[]);
  // Outside edit mode the bar takes no room; the Edit rows switch lives in the result toolbar. It stays mounted for the palette and stays open for applied-changes status.
  if(!editMode&&!txText&&!verification)return <div ref={rootRef} className="grid-edit-anchor" aria-hidden="true"/>;
  return <div ref={rootRef} className="grid-edit-bar" role="toolbar" aria-label="Edit result rows">
    <button type="button" className="grid-edit-toggle" aria-pressed={editMode} title={editMode?'Leave edit mode (pending edits stay until discarded)':'Edit rows of this result (explicit edit mode)'} onClick={onToggle}><Pencil size={13}/>{editMode?'Editing':'Edit rows'}</button>
    {editMode&&<>
      <button type="button" disabled={!editable||!hasSelection} title="Set the selected cell to NULL (an explicit value, different from empty text)" onClick={onSetNull}>Set NULL</button>
      <button type="button" disabled={!editable} title="Add a new row; omitted columns use their database defaults" onClick={onNewRow}>New row</button>
      <button type="button" disabled={!editable||!hasSelection} title="Mark the selected row for deletion (shown struck through until applied or discarded)" onClick={onDeleteRow}>Delete row</button>
      <button type="button" aria-label="Undo draft change" disabled={!canUndo} title="Undo the last unapplied edit (Ctrl+Z)" onClick={onUndo}><Undo2 size={13}/></button>
      <button type="button" aria-label="Redo draft change" disabled={!canRedo} title="Redo (Ctrl+Y)" onClick={onRedo}><Redo2 size={13}/></button>
    </>}
    {inline.map(id=>{const a=actions[id];return <button key={id} type="button" aria-pressed={a.toggle?!!a.pressed:undefined} disabled={a.disabled} title={a.title} onClick={a.onClick}>{a.label}</button>})}
    {editMode&&menu.length>0&&<MoreMenu items={menu.map(entry)} pinned={pinned} onPin={pin}/>}
    {editMode&&<>
      {invalidCount>0&&<button type="button" className="grid-edit-invalid" aria-label="Next invalid cell" title="Go to the next staged value that Oracle would reject" onClick={onInvalid}>⚠ {invalidCount} invalid</button>}
      <button type="button" aria-expanded={drawerOpen} aria-label="Pending changes" className="grid-edit-pending" title="Review pending changes and the SQL they would run" onClick={onDrawer}>Pending: {summary.total}{summary.total?` (${[summary.updates&&`${summary.updates} upd`,summary.inserts&&`${summary.inserts} ins`,summary.deletes&&`${summary.deletes} del`].filter(Boolean).join(', ')})`:''}</button>
      <span className="grid-edit-note">Local drafts only; nothing is sent to Oracle until you apply.</span>
    </>}
    {hint&&<p className="grid-edit-hint" role="note" data-hint={hint.id}>{hint.text}<button type="button" aria-label="Dismiss this tip" title="Do not show this tip again" onClick={()=>changeHints(dismissHint(hintPrefs,hint.id))}>Got it</button><button type="button" title="Stop showing tips under the edit bar" onClick={()=>changeHints({...hintPrefs,off:true})}>Turn off tips</button></p>}
    {txText&&<span className="grid-edit-tx" role="status" aria-label="Applied changes" data-state={txState}>{txText}{txState==='pending'&&<input className="grid-edit-label" aria-label="Label for this work" placeholder="Label this work (local note)" title="A note for you and for the receipt. It does not change what Commit or Rollback affects." value={txLabel} onChange={event=>onTxLabel(event.target.value)}/>}{canUndoBatch&&<button type="button" onClick={onUndoBatch} title="Roll Oracle back to just before the last Apply">Undo last Apply…</button>}{canReceipt&&<button type="button" onClick={onReceipt} title="Copy a summary of what this grid committed">Copy receipt</button>}{canVerify&&<button type="button" onClick={onVerify} title="Read the changed rows again and compare them with what was applied">Verify against the database</button>}{canRestore&&<button type="button" onClick={onRestore} title="Turn the rolled-back changes back into drafts you can correct and apply again">Keep my edits as drafts</button>}{txState!=='pending'&&<button type="button" aria-label="Dismiss applied changes note" onClick={onDismissTx}>×</button>}</span>}
    {verification&&<div className="grid-edit-verification" role="status" aria-label="Verification">{verification.running?'Reading the changed rows…':verification.error?verification.error:<><ul>{verification.results.map(result=><li key={result.label} data-status={result.status}>{result.message}</li>)}</ul><small>This is a read of the current data. A difference may also come from another session that changed the row after your commit; it does not mean the commit failed.</small></>}</div>}
    {editMode&&loading&&<span role="status" className="grid-edit-note">Checking the primary key…</span>}
    {editMode&&blocked&&<ul className="grid-edit-reasons" role="status" aria-label="Why this result cannot be edited">{editability.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
  </div>;
}

// Inline cell editor: Enter stages the value locally (Ctrl+Enter in the multi-line editor), Escape cancels, Tab stages and moves on.
export function CellEditor({initial,isNull,kind='text',column,suggestions,onCommit,onCancel,onTab}) {
  const ref=useRef(null),[text,setText]=useState(isNull?'':initial??'');
  useEffect(()=>{ref.current?.focus();ref.current?.select?.()},[]);
  const value=()=>kind==='datetime'?fromCalendarValue(ref.current.value):ref.current.value;
  const onKeyDown=event=>{
    event.stopPropagation();
    const multi=kind==='longtext';
    if(event.key==='Enter'&&(!multi||event.ctrlKey||event.metaKey)){event.preventDefault();onCommit(value())}
    else if(event.key==='Escape'){event.preventDefault();onCancel()}
    else if(event.key==='Tab'){event.preventDefault();onCommit(value());onTab(event.shiftKey?-1:1)}
  };
  const common={ref,className:`cell-editor cell-editor-${kind}`,'data-escape-local':true,'aria-label':'Cell value',placeholder:isNull?'NULL':'',onKeyDown,onBlur:()=>onCommit(value()),onChange:event=>setText(event.target.value)};
  const meter=kind!=='datetime'&&column?.size?lengthMeter(text,column):null;
  const field=kind==='datetime'?<input {...common} type="datetime-local" step="1" defaultValue={isNull?'':toCalendarValue(initial)}/>
    :kind==='longtext'?<textarea {...common} rows={4} title="Ctrl+Enter stages the value" defaultValue={isNull?'':initial}/>
    :<input {...common} defaultValue={isNull?'':initial} list={suggestions?.values.length?'cell-suggestions':undefined}/>;
  return <span className="cell-editor-wrap">{field}{suggestions?.values.length>0&&<datalist id="cell-suggestions">{suggestions.values.map(value=><option key={value} value={value}/>)}</datalist>}{suggestions?.values.length>0&&<small className="cell-suggest-note" role="note">{suggestions.scope}</small>}{meter&&<small className="cell-meter" data-over={meter.over||undefined} role="status">{meter.chars} chars · {meter.bytes} bytes{meter.limit!=null?` · limit ${meter.limit} ${meter.unit}`:''}{meter.over?' · too long':''}</small>}</span>;
}

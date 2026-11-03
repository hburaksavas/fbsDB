import {useEffect,useRef} from 'react';
import {Pencil,Redo2,Undo2} from 'lucide-react';
import {fromCalendarValue,toCalendarValue} from './gridEditability';
import {lengthMeter} from './cellValidation';
import {useState} from 'react';

// Explicit edit mode: results are read-only until this is switched on, and the bar always says what is pending.
export function GridEditBar({editability,loading,editMode,onToggle,summary,canUndo,canRedo,onUndo,onRedo,onSetNull,onDeleteRow,onNewRow,tabAddsRow=false,onTabAddsRow,templates=[],onTemplate,onDuplicate,onBulk,onRecord,onPaste,onCheckboxes,onDrawer,drawerOpen,onStep,hasSelection,invalidCount=0,onInvalid,changesOnly=false,onChangesOnly,deletionsOnly=false,onDeletionsOnly,onDescriptions,txText='',txState,onDismissTx,txLabel='',onTxLabel,onChecks,canUndoBatch,onUndoBatch,verification,canVerify,canRestore,canReceipt,onVerify,onRestore,onReceipt}) {
  const blocked = editability && !editability.editable;
  return <div className="grid-edit-bar" role="toolbar" aria-label="Edit result rows">
    <button type="button" className="grid-edit-toggle" aria-pressed={editMode} title={editMode?'Leave edit mode (pending edits stay until discarded)':'Edit rows of this result (explicit edit mode)'} onClick={onToggle}><Pencil size={13}/>{editMode?'Editing':'Edit rows'}</button>
    <button type="button" title="Show a description beside key values, read with your own query" onClick={onDescriptions}>Descriptions…</button>
    {editMode&&<>
      <button type="button" disabled={!editability?.editable||!hasSelection} title="Set the selected cell to NULL (an explicit value, different from empty text)" onClick={onSetNull}>Set NULL</button>
      <button type="button" disabled={!editability?.editable} title="Add a new row; omitted columns use their database defaults" onClick={onNewRow}>New row</button>
      <label className="grid-edit-option" title="While editing a cell, Tab moves to the next editable cell. Past the last one, start a new row draft with the required fields first."><input type="checkbox" aria-label="Tab adds a row" checked={tabAddsRow} disabled={!editability?.editable} onChange={onTabAddsRow}/>Tab adds a row</label>
      {templates.length>0&&<select aria-label="New row from template" disabled={!editability?.editable} value="" onChange={event=>{if(event.target.value)onTemplate(event.target.value)}}><option value="">From template…</option>{templates.map(item=><option key={item.name} value={item.name}>{item.name}</option>)}</select>}
      <button type="button" disabled={!editability?.editable} title="Edit one record as attribute / value pairs; Alt+PageUp/PageDown moves between records and keeps the field" onClick={onRecord}>Record view</button>
      <button type="button" disabled={!editability?.editable} title="Show Y/N or 1/0 columns as checkboxes while editing" onClick={onCheckboxes}>Checkbox columns…</button>
      <button type="button" disabled={!editability?.editable||!hasSelection} title="Paste spreadsheet data (Ctrl+V) from the active cell, with a preview" onClick={onPaste}>Paste…</button>
      <button type="button" disabled={!editability?.editable||!hasSelection} title="Change all selected cells at once: set a value or NULL, find and replace, or arithmetic, with a preview" onClick={onBulk}>Bulk edit…</button>
      <button type="button" disabled={!editability?.editable||!hasSelection} title="Copy the selected row into a new row draft (keys and locked columns are left out)" onClick={onDuplicate}>Duplicate row</button>
      <button type="button" disabled={!editability?.editable||!hasSelection} title="Mark the selected row for deletion (shown struck through until applied or discarded)" onClick={onDeleteRow}>Delete row</button>
      <button type="button" aria-label="Undo draft change" disabled={!canUndo} title="Undo the last unapplied edit (Ctrl+Z)" onClick={onUndo}><Undo2 size={13}/></button>
      <button type="button" aria-label="Redo draft change" disabled={!canRedo} title="Redo (Ctrl+Y)" onClick={onRedo}><Redo2 size={13}/></button>
      <button type="button" aria-label="Previous edited cell" disabled={!summary.cells} title="Previous edited cell" onClick={()=>onStep(-1)}>↑</button>
      <button type="button" aria-label="Next edited cell" disabled={!summary.cells} title="Next edited cell" onClick={()=>onStep(1)}>↓</button>
      <button type="button" aria-pressed={changesOnly} title="Show only changed rows and columns, keeping the identifying key columns" onClick={onChangesOnly}>Changes only</button>
      <button type="button" aria-pressed={deletionsOnly} disabled={!summary.deletes} title="Review only the rows marked for deletion, with their identifying key columns" onClick={onDeletionsOnly}>Deletions only</button>
      {invalidCount>0&&<button type="button" className="grid-edit-invalid" aria-label="Next invalid cell" title="Go to the next staged value that Oracle would reject" onClick={onInvalid}>⚠ {invalidCount} invalid</button>}
      <button type="button" title="Run your own SELECT checks inside the session's transaction" onClick={onChecks}>Checks…</button>
      <button type="button" aria-expanded={drawerOpen} aria-label="Pending changes" className="grid-edit-pending" title="Review pending changes and the SQL they would run" onClick={onDrawer}>Pending: {summary.total}{summary.total?` (${[summary.updates&&`${summary.updates} upd`,summary.inserts&&`${summary.inserts} ins`,summary.deletes&&`${summary.deletes} del`].filter(Boolean).join(', ')})`:''}</button>
      <span className="grid-edit-note">Local drafts only; nothing is sent to Oracle until you apply.</span>
    </>}
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

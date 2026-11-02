import {useMemo,useState} from 'react';
import {previewText} from './bulkEdit';

// Review of pasted spreadsheet data before it becomes drafts: the first line can be a header, and rows can be matched by position or by key.
export function PastePanel({pasted,canKey,keyName,planFor,onStage,onClose}) {
  const [header,setHeader]=useState(false),[mode,setMode]=useState('position');
  const plan=useMemo(()=>planFor({pasted,header,mode}),[pasted,header,mode,planFor]);
  const preview=previewText(plan);
  const width=Math.max(0,...pasted.map(row=>row.length));
  return <section className="bulk-edit-panel paste-panel" role="group" aria-label="Paste into the grid">
    <header><strong>Paste of {pasted.length} row{pasted.length===1?'':'s'} × {width} column{width===1?'':'s'}</strong><button type="button" aria-label="Close paste" onClick={onClose}>×</button></header>
    <label><input type="checkbox" aria-label="First pasted row is a header" checked={header} onChange={event=>setHeader(event.target.checked)}/>First row is a header</label>
    <label><input type="radio" name="paste-mode" aria-label="Fill from the active cell" checked={mode==='position'} onChange={()=>setMode('position')}/>Fill from the active cell</label>
    <label><input type="radio" name="paste-mode" aria-label="Match rows by key" disabled={!canKey} checked={mode==='key'} onChange={()=>setMode('key')}/>Match rows by key{canKey?` (first pasted column = ${keyName})`:' (needs a single key column)'}</label>
    {plan.error?<p role="alert">{plan.error}</p>:<div className="bulk-preview" role="status" aria-label="Paste preview"><b>{preview.summary}</b><ul>{preview.lines.map(line=><li key={line}>{line}</li>)}</ul>{preview.more>0&&<small>…and {preview.more} more.</small>}{plan.skipped.length>0&&<details><summary>{plan.skipped.length} skipped</summary><ul>{plan.skipped.slice(0,10).map((item,at)=><li key={at}>{item.name}: {item.reason}</li>)}</ul></details>}</div>}
    <footer><button type="button" className="button-primary" disabled={Boolean(plan.error)||!plan.changes.length} onClick={()=>{onStage(plan.changes);onClose()}}>Stage {plan.changes.length} edit{plan.changes.length===1?'':'s'}</button><button type="button" onClick={onClose}>Cancel</button></footer>
  </section>;
}

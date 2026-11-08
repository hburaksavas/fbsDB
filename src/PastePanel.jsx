import {useMemo,useState} from 'react';
import {previewText} from './bulkEdit';

// Review of pasted spreadsheet data before it becomes drafts: the first line can be a header, and rows can be matched by
// position or by key, or added as new rows with each pasted column mapped to a column of the result.
export function PastePanel({pasted,canKey,keyName,planFor,onStage,onClose,canInsert=false,insertReason,planInsert,onInsert,initialMode='position',initialHeader=false,columnNames=[]}) {
  const [header,setHeader]=useState(initialHeader),[mode,setMode]=useState(initialMode==='insert'&&!canInsert?'position':initialMode),[mapping,setMapping]=useState({});
  const insert=mode==='insert';
  const plan=useMemo(()=>insert?{changes:[],skipped:[]}:planFor({pasted,header,mode}),[pasted,header,mode,planFor,insert]);
  const insertPlan=useMemo(()=>insert?planInsert({pasted,header,mapping}):null,[pasted,header,mapping,planInsert,insert]);
  const preview=previewText(plan);
  const width=Math.max(0,...pasted.map(row=>row.length));
  const changeHeader=value=>{setHeader(value);setMapping({})};
  return <section className="bulk-edit-panel paste-panel" role="group" aria-label="Paste into the grid">
    <header><strong>Paste of {pasted.length} row{pasted.length===1?'':'s'} × {width} column{width===1?'':'s'}</strong><button type="button" aria-label="Close paste" onClick={onClose}>×</button></header>
    <label><input type="checkbox" aria-label="First pasted row is a header" checked={header} onChange={event=>changeHeader(event.target.checked)}/>First row is a header</label>
    <label><input type="radio" name="paste-mode" aria-label="Fill from the active cell" checked={mode==='position'} onChange={()=>setMode('position')}/>Fill from the active cell</label>
    <label><input type="radio" name="paste-mode" aria-label="Match rows by key" disabled={!canKey} checked={mode==='key'} onChange={()=>setMode('key')}/>Match rows by key{canKey?` (first pasted column = ${keyName})`:' (needs a single key column)'}</label>
    <label><input type="radio" name="paste-mode" aria-label="Add as new rows" disabled={!canInsert} checked={insert} onChange={()=>setMode('insert')}/>Add as new rows{canInsert?'':` (${insertReason||'new rows cannot be added to this result'})`}</label>
    {insert?insertPlan.error&&!insertPlan.mapping.length?<p role="alert">{insertPlan.error}</p>:<>
      <table className="paste-mapping" aria-label="Pasted columns">
        <thead><tr><th>Pasted column</th><th>Fills</th></tr></thead>
        <tbody>{insertPlan.mapping.map(item=><tr key={item.index}><td>{item.label}</td><td><select aria-label={`Column for ${item.label}`} value={item.col==null?'':String(item.col)} onChange={event=>setMapping(current=>({...current,[item.index]:event.target.value===''?null:Number(event.target.value)}))}><option value="">Skip</option>{insertPlan.targets.map(target=><option key={target.col} value={String(target.col)}>{target.name}</option>)}</select>{item.col==null&&item.reason&&<small> {item.reason}</small>}</td></tr>)}</tbody>
      </table>
      {insertPlan.error?<p role="alert">{insertPlan.error}</p>:<div className="bulk-preview" role="status" aria-label="Paste preview"><b>{insertPlan.rows.length} new row{insertPlan.rows.length===1?'':'s'} filling {insertPlan.mapping.filter(item=>item.col!=null).map(item=>columnNames[item.col]).join(', ')}</b>
        <ul><li>Empty cells are left out so the column default applies; the text NULL becomes NULL.</li>{insertPlan.missing.map(item=><li key={item.name}>{item.rows} row{item.rows===1?' leaves':'s leave'} the required column {item.name} empty; fill it before Apply.</li>)}</ul>
        {insertPlan.skipped.length>0&&<details><summary>{insertPlan.skipped.length} skipped</summary><ul>{insertPlan.skipped.slice(0,10).map((item,at)=><li key={at}>{item.name}: {item.reason}</li>)}</ul></details>}</div>}
    </>:plan.error?<p role="alert">{plan.error}</p>:<div className="bulk-preview" role="status" aria-label="Paste preview"><b>{preview.summary}</b><ul>{preview.lines.map(line=><li key={line}>{line}</li>)}</ul>{preview.more>0&&<small>…and {preview.more} more.</small>}{plan.skipped.length>0&&<details><summary>{plan.skipped.length} skipped</summary><ul>{plan.skipped.slice(0,10).map((item,at)=><li key={at}>{item.name}: {item.reason}</li>)}</ul></details>}</div>}
    <footer>{insert
      ?<button type="button" className="button-primary" disabled={Boolean(insertPlan.error)||!insertPlan.rows.length} onClick={()=>{onInsert(insertPlan.rows);onClose()}}>Add {insertPlan.rows.length} new row{insertPlan.rows.length===1?'':'s'}</button>
      :<button type="button" className="button-primary" disabled={Boolean(plan.error)||!plan.changes.length} onClick={()=>{onStage(plan.changes);onClose()}}>Stage {plan.changes.length} edit{plan.changes.length===1?'':'s'}</button>}<button type="button" onClick={onClose}>Cancel</button></footer>
  </section>;
}

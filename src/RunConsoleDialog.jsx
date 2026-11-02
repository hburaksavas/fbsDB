import {useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {formatElapsed} from './postExecution';

// Entries live in memory for this session only; rerunning always goes through the normal run path, so nothing runs by itself.
export function RunConsoleDialog({entries,retainValues,onLoad,onRerun,onClear,onClose}) {
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const [selectedId,setSelectedId]=useState(entries[0]?.id||null),selected=entries.find(entry=>entry.id===selectedId)||entries[0]||null;
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal run-console" role="dialog" aria-modal="true" aria-label="Run console">
   <header className="appearance-header"><div><h2>Run console</h2><p>Recent executions of this tab, kept in memory for this session. Bind values {retainValues?'are kept except for names that look sensitive':'are not kept'}.</p></div></header>
   <div className="run-console-body">
    <ol className="run-console-list" aria-label="Executions">{entries.length?entries.map(entry=><li key={entry.id}><button type="button" aria-pressed={entry===selected} data-ok={entry.ok} onClick={()=>setSelectedId(entry.id)}><b>{entry.ok?'✓':'✗'} {formatElapsed(entry.elapsedMs)}</b><span>{entry.sql.replace(/\s+/g,' ').slice(0,70)}</span><small>{new Date(entry.executedAt).toLocaleTimeString()}{entry.profile?` · ${entry.profile}`:''}</small></button></li>):<li><p>No executions yet in this tab.</p></li>}</ol>
    {selected&&<div className="run-console-detail" aria-label="Execution details">
     <dl><div><dt>Result</dt><dd>{selected.ok?(selected.rowsAffected!=null?`${selected.rowsAffected} rows affected`:`${selected.rows??0} rows`):'Failed'} · {formatElapsed(selected.elapsedMs)}</dd></div>{selected.message&&<div><dt>Error</dt><dd role="alert">{selected.message}</dd></div>}<div><dt>Parameters</dt><dd>{selected.parameters.length?selected.parameters.map(parameter=><code key={parameter.name}>:{parameter.name}{parameter.value!=null?` = ${parameter.value}`:parameter.hidden?' (value not kept)':''} </code>):'None'}</dd></div></dl>
     <h3>SQL</h3><pre>{selected.sql}</pre>
     <h3>DBMS_OUTPUT {selected.output.length?`(${selected.output.length}${selected.outputTruncated?'+':''} lines)`:''}</h3><pre>{selected.output.length?selected.output.join('\n'):'No output captured.'}</pre>
    </div>}
   </div>
   <footer className="appearance-footer"><button className="button-secondary" disabled={!entries.length} onClick={onClear}>Clear</button><button className="button-secondary" disabled={!selected} onClick={()=>onLoad(selected)}>Load into new editor</button><button className="button-secondary" disabled={!selected} title="Runs through the normal run path; the bind form asks for values again" onClick={()=>onRerun(selected)}>Rerun…</button><button className="button-primary" onClick={onClose}>Close</button></footer>
  </section></ModalBackdrop>;
}

import {useState} from 'react';
import {checkExpectations,prepareCheck} from './commitChecks';

// User-written SELECT checks, run only when asked, in this tab's session (so they see the pending work). They support the review; constraints stay the authority.
export function CommitChecksPanel({checks,onChange,results,running,onRun,onClose}) {
  const [draft,setDraft]=useState({name:'',sql:'',expect:'none'}),[problem,setProblem]=useState(''),[calls,setCalls]=useState([]),[accepted,setAccepted]=useState(false);
  const add=()=>{
    const prepared=prepareCheck(draft,checks);
    if(prepared.error){setProblem(prepared.error);setCalls([]);return}
    if(prepared.calls.length&&!accepted){setProblem('');setCalls(prepared.calls);return}
    onChange([...checks,prepared.check]);setDraft({name:'',sql:'',expect:'none'});setProblem('');setCalls([]);setAccepted(false);
  };
  return <section className="bulk-edit-panel commit-checks" role="group" aria-label="Pre-commit checks">
    <header><strong>Pre-commit checks</strong><button type="button" aria-label="Close checks" onClick={onClose}>×</button></header>
    <p className="grid-edit-note">Your own SELECT queries. They run only when you press Run, inside this session's transaction. They support your review and do not replace database constraints.</p>
    <ul className="commit-check-list">{checks.map(check=><li key={check.name}><b>{check.name}</b> <small>{checkExpectations.find(item=>item.id===check.expect)?.label}</small> <button type="button" aria-label={`Remove check ${check.name}`} onClick={()=>onChange(checks.filter(item=>item!==check))}>Remove</button></li>)}</ul>
    <button type="button" className="button-primary" disabled={!checks.length||running} onClick={onRun}>{running?'Running…':`Run ${checks.length} check${checks.length===1?'':'s'}`}</button>
    {results&&<ul className="commit-check-results" role="status" aria-label="Check results">{results.map(item=><li key={item.name} data-status={item.status}><b>{item.name}</b>: {item.message}{item.rows?.length>0&&<small> First row: {item.rows[0].map(cell=>cell==null?'NULL':String(cell)).join(' · ')}</small>}</li>)}</ul>}
    <fieldset className="commit-check-new"><legend>New check</legend>
      <label>Name<input aria-label="Check name" value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/></label>
      <label>Result<select aria-label="Check expectation" value={draft.expect} onChange={event=>setDraft({...draft,expect:event.target.value})}>{checkExpectations.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <textarea aria-label="Check query" rows={3} spellCheck={false} placeholder="SELECT id FROM child c WHERE NOT EXISTS (SELECT 1 FROM parent p WHERE p.id = c.parent_id)" value={draft.sql} onChange={event=>setDraft({...draft,sql:event.target.value})}/>
      {problem&&<p role="alert">{problem}</p>}
      {calls.length>0&&<label role="alert"><input type="checkbox" aria-label="I accept that these calls may have side effects" checked={accepted} onChange={event=>setAccepted(event.target.checked)}/>This query calls {calls.join(', ')}. Oracle cannot tell whether that has side effects; it would run in your transaction. I accept this.</label>}
      <button type="button" onClick={add}>Add check</button>
    </fieldset>
  </section>;
}

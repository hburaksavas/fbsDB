import {useMemo,useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {runRegex} from './regexWorkbench';

const operations=[{id:'substr',label:'REGEXP_SUBSTR'},{id:'replace',label:'REGEXP_REPLACE'},{id:'instr',label:'REGEXP_INSTR'},{id:'count',label:'REGEXP_COUNT'},{id:'like',label:'REGEXP_LIKE'}];
const quote=text=>`'${String(text).replaceAll("'","''")}'`;

export function callText(form) {
  const flags=form.parameter?`, ${quote(form.parameter)}`:'';
  switch(form.operation){
    case 'like': return `REGEXP_LIKE(<text>, ${quote(form.pattern)}${flags})`;
    case 'count': return `REGEXP_COUNT(<text>, ${quote(form.pattern)}, ${form.position}${flags})`;
    case 'instr': return `REGEXP_INSTR(<text>, ${quote(form.pattern)}, ${form.position}, ${form.occurrence}, ${form.returnOption}${flags})`;
    case 'replace': return `REGEXP_REPLACE(<text>, ${quote(form.pattern)}, ${quote(form.replacement)}, ${form.position}, ${form.occurrence}${flags})`;
    default: return `REGEXP_SUBSTR(<text>, ${quote(form.pattern)}, ${form.position}, ${form.occurrence}${flags}, ${form.subexpression})`;
  }
}

// Tries an Oracle regular expression against sample text without a database. Constructs Oracle lacks are refused with the reason.
export function RegexWorkbenchDialog({initialPattern,onInsert,onClose}) {
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const [form,setForm]=useState({operation:'substr',pattern:initialPattern||'[[:digit:]]+',text:'Order 1042 shipped on 2026-11-02',caseMode:'',dot:false,lines:false,position:1,occurrence:1,subexpression:0,replacement:'#',returnOption:0});
  const set=patch=>setForm(current=>({...current,...patch}));
  const parameter=`${form.caseMode}${form.dot?'n':''}${form.lines?'m':''}`;
  const full={...form,parameter};
  const result=useMemo(()=>runRegex({...full}),[form]);
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal regex-dialog" role="dialog" aria-modal="true" aria-label="Regex workbench">
   <header className="appearance-header"><div><h2>Oracle regular expression workbench</h2><p>Runs locally on the sample text; nothing is sent to Oracle. POSIX classes, back references and the match parameters are supported; lookaround, \b and named groups do not exist in Oracle and are refused.</p></div></header>
   <label className="date-format-row">Function<select aria-label="Regex function" value={form.operation} onChange={event=>set({operation:event.target.value})}>{operations.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
   <label className="date-format-row">Pattern<input aria-label="Regex pattern" spellCheck={false} value={form.pattern} onChange={event=>set({pattern:event.target.value})}/></label>
   <label className="date-format-row">Sample text<textarea aria-label="Regex sample" rows={3} value={form.text} onChange={event=>set({text:event.target.value})}/></label>
   <div className="date-format-row"><label><input type="checkbox" aria-label="Ignore case" checked={form.caseMode==='i'} onChange={event=>set({caseMode:event.target.checked?'i':''})}/>i ignore case</label><label><input type="checkbox" aria-label="Dot matches newline" checked={form.dot} onChange={event=>set({dot:event.target.checked})}/>n dot matches newline</label><label><input type="checkbox" aria-label="Multi-line anchors" checked={form.lines} onChange={event=>set({lines:event.target.checked})}/>m line anchors</label></div>
   <div className="date-format-row">{form.operation!=='like'&&<label>Position<input aria-label="Regex position" type="number" min="1" value={form.position} onChange={event=>set({position:Number(event.target.value)||1})}/></label>}{['substr','instr','replace'].includes(form.operation)&&<label>Occurrence<input aria-label="Regex occurrence" type="number" min={form.operation==='replace'?0:1} value={form.occurrence} onChange={event=>set({occurrence:Number(event.target.value)})}/></label>}{form.operation==='substr'&&<label>Group<input aria-label="Regex group" type="number" min="0" value={form.subexpression} onChange={event=>set({subexpression:Number(event.target.value)||0})}/></label>}{form.operation==='replace'&&<label>Replace with<input aria-label="Regex replacement" value={form.replacement} onChange={event=>set({replacement:event.target.value})}/></label>}</div>
   {result.error?<p role="alert">{result.error}</p>:<div className="date-format-result" role="status" aria-label="Regex result"><small>{operations.find(item=>item.id===form.operation).label} returns</small><output>{result.value==null?'NULL':result.value}</output><small>{result.matches.length} match{result.matches.length===1?'':'es'}{result.matches.slice(0,5).map(match=>` · @${match.index+1} “${match.text}”`).join('')}</small></div>}
   <footer className="appearance-footer"><button type="button" className="button-secondary" onClick={onClose}>Close</button><button type="button" className="button-primary" disabled={Boolean(result.error)} onClick={()=>onInsert(callText(full))}>Insert the call</button></footer>
  </section></ModalBackdrop>;
}

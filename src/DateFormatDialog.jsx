import {useMemo,useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {dateFromInput,dateLanguages,formatDate,parseDate,supportedElements,tokenizeFormat} from './dateFormat';

// Local preview of a date format model: TO_CHAR on a sample value and TO_DATE on typed text. It covers a stated subset and says when it cannot.
export function DateFormatDialog({initialFormat,onInsert,onClose}) {
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const [model,setModel]=useState(initialFormat||'YYYY-MM-DD HH24:MI:SS'),[sample,setSample]=useState('2026-11-02 14:05:09'),[language,setLanguage]=useState('en'),[text,setText]=useState('');
  const parsed=useMemo(()=>tokenizeFormat(model),[model]);
  const when=useMemo(()=>dateFromInput(sample),[sample]);
  const printed=parsed.tokens&&when.date?formatDate(when.date,parsed.tokens,language):null;
  const read=useMemo(()=>text&&parsed.tokens?parseDate(text,parsed.tokens,language):null,[text,parsed,language]);
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal date-format-dialog" role="dialog" aria-modal="true" aria-label="Date format designer">
   <header className="appearance-header"><div><h2>Date format designer</h2><p>Preview TO_CHAR and TO_DATE format models locally. Nothing is sent to Oracle; month and day names follow the date language you pick, which is a session setting (NLS_DATE_LANGUAGE) in Oracle.</p></div></header>
   <label className="date-format-row">Format model<input aria-label="Format model" spellCheck={false} value={model} onChange={event=>setModel(event.target.value)}/></label>
   {parsed.error&&<p role="alert">{parsed.error}</p>}
   <label className="date-format-row">Sample date<input aria-label="Sample date" value={sample} onChange={event=>setSample(event.target.value)}/></label>
   {when.error&&<p role="alert">{when.error}</p>}
   <label className="date-format-row">Date language<select aria-label="Date language" value={language} onChange={event=>setLanguage(event.target.value)}>{dateLanguages.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
   {printed!=null&&<div className="date-format-result" role="status" aria-label="TO_CHAR result"><small>TO_CHAR(sample, '{model}')</small><output>{printed}</output></div>}
   <label className="date-format-row">Text to read back (TO_DATE)<input aria-label="Text to read" value={text} onChange={event=>setText(event.target.value)} placeholder="Type a date written in this format"/></label>
   {read&&(read.error?<p role="alert">{read.error}</p>:<div className="date-format-result" role="status" aria-label="TO_DATE result"><small>TO_DATE reads it as</small><output>{read.date.year}-{String(read.date.month).padStart(2,'0')}-{String(read.date.day).padStart(2,'0')} {String(read.date.hour).padStart(2,'0')}:{String(read.date.minute).padStart(2,'0')}:{String(read.date.second).padStart(2,'0')}{read.date.fraction?`.${read.date.fraction}`:''}</output></div>)}
   <details><summary>Supported elements</summary><p>{supportedElements.join(', ')}</p></details>
   <footer className="appearance-footer"><button type="button" className="button-secondary" onClick={onClose}>Close</button><button type="button" className="button-primary" disabled={!parsed.tokens} onClick={()=>onInsert(model)}>Insert '{model}' into the editor</button></footer>
  </section></ModalBackdrop>;
}

import {useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';

export function ClipboardHistoryDialog({enabled,onEnabled,entries,onClear,onPaste,onClose}){
  const ref=useRef(null),[query,setQuery]=useState(''),[distribute,setDistribute]=useState(false),[error,setError]=useState('');useDialogFocus(ref,onClose);
  const shown=entries.filter(item=>item.text.toLowerCase().includes(query.toLowerCase()));
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal local-rename-dialog" role="dialog" aria-modal="true" aria-label="Clipboard history">
    <header className="appearance-header"><h2>Clipboard history</h2></header><div className="dialog-content"><label><input type="checkbox" checked={enabled} onChange={event=>onEnabled(event.target.checked)}/> Remember copies from this SQL editor for this app session</label>
      <p>Off by default. Up to 20 fragments stay in memory until cleared or the app closes. Copies from other apps are never collected.</p>
      <label>Search copied code<input aria-label="Search clipboard history" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <label><input type="checkbox" checked={distribute} onChange={event=>setDistribute(event.target.checked)}/> Distribute lines across multiple selections when counts match</label>
      <ul className="local-rename-preview">{shown.map(item=><li key={item.id}><button type="button" className="button-secondary" onClick={()=>{try{onPaste(item,distribute)}catch(failure){setError(failure.message)}}}><code>{item.text.slice(0,180)}{item.text.length>180?'…':''}</code></button></li>)}</ul>
      {!shown.length&&<p role="status">No saved fragments in this session.</p>}{error&&<p role="alert">{error}</p>}
    </div><footer className="appearance-footer"><button type="button" className="button-secondary" onClick={onClear} disabled={!entries.length}>Clear history</button><button type="button" className="button-secondary" onClick={onClose}>Close</button></footer>
  </section></ModalBackdrop>;
}

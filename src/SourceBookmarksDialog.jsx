import {useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
export function SourceBookmarksDialog({items,error,canAdd,position,file,onAdd,onOpen,onRemove,onClose}){
 const ref=useRef(null);useDialogFocus(ref,onClose);const [name,setName]=useState('');
 return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal source-bookmarks-dialog" role="dialog" aria-modal="true" aria-label="Source bookmarks"><header className="appearance-header"><h2>Source bookmarks</h2></header>
  <p>Named source positions in this workspace. Saved-file marks persist on this device; draft and server marks remain in this session.</p>{error&&<p role="alert">{error}</p>}
  <form onSubmit={event=>{event.preventDefault();if(canAdd&&name.trim()){onAdd(name,position);onClose()}}}><label>Bookmark name<input aria-label="Bookmark name" autoFocus maxLength={80} required value={name} onChange={event=>setName(event.target.value)}/></label><small>{file} · {position?.lineNumber}:{position?.column}</small><button className="button-primary" disabled={!canAdd||!name.trim()}>Add current position</button></form>
  <div className="source-bookmark-list">{items.map(mark=><div key={mark.id}><button type="button" onClick={()=>{onOpen(mark);onClose()}}><strong>{mark.name}</strong><small>{mark.path||'Session source'} · {mark.lineNumber}:{mark.column}</small></button><button type="button" aria-label={`Remove bookmark ${mark.name}`} onClick={()=>onRemove(mark.id)}>Remove</button></div>)}{!items.length&&<p>No bookmarks in this workspace.</p>}</div>
  <footer className="appearance-footer"><button className="button-secondary" onClick={onClose}>Close</button></footer>
 </section></ModalBackdrop>;
}

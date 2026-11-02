import {useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';

export function BatchCloseDialog({items,cleanCount=0,error,onApply,onClose}) {
 const ref=useRef(null);useDialogFocus(ref,onClose);
 const [choices,setChoices]=useState(()=>Object.fromEntries(items.map(item=>[item.id,'save'])));
 return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal feedback-dialog batch-close-dialog" role="alertdialog" aria-modal="true" aria-label="Review documents before closing">
  <header className="appearance-header"><h2>Close {items.length} unsaved editors?</h2></header>
  <p>Choose separately for each document. Saving waits for its acknowledgement. Pending database transactions require their own Commit or Rollback decision.</p>
  {cleanCount>0&&<p>{cleanCount} unchanged editor{cleanCount===1?'':'s'} will also close.</p>}
  {error&&<p role="alert">{error}</p>}
  <div className="batch-close-list">{items.map(item=><label className="batch-close-row" data-close-tab={item.id} key={item.id}><span><strong>{item.name}</strong><small title={item.path||'Unsaved draft'}>{item.path||'Unsaved draft'}</small></span><select aria-label={`Close action for ${item.path||item.name}`} value={choices[item.id]} onChange={event=>setChoices(current=>({...current,[item.id]:event.target.value}))}><option value="save">Save and close</option><option value="keep">Keep open</option><option value="discard">Discard and close</option></select></label>)}</div>
  <footer className="appearance-footer"><button className="button-secondary" onClick={onClose}>Cancel</button><button className="button-secondary danger" onClick={()=>onApply(Object.fromEntries(items.map(item=>[item.id,'discard'])))}>Discard All</button><button className="button-primary" onClick={()=>onApply(choices)}>Apply close choices</button></footer>
 </section></ModalBackdrop>;
}

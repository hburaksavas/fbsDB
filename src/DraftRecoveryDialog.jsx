import { useRef, useState } from 'react';
import { ModalBackdrop } from './ModalBackdrop';
import { useDialogFocus } from './ConnectionManager';

export function DraftRecoveryDialog({snapshot,onRestore,onDiscard}) {
  const ref=useRef(null);useDialogFocus(ref,onDiscard);
  const [selected,setSelected]=useState(()=>snapshot.files.map(file=>file.id)),[preview,setPreview]=useState(snapshot.activeTabId),[reconnect,setReconnect]=useState(true);
  const file=snapshot.files.find(item=>item.id===preview)||snapshot.files[0];
  return <ModalBackdrop onClose={onDiscard}><div ref={ref} className="appearance-modal draft-recovery" role="dialog" aria-modal="true" aria-label="Restore SQL drafts"><header className="appearance-header"><div><h2>Restore SQL drafts</h2><p>{new Date(snapshot.savedAt).toLocaleString()} · SQL is restored without execution.</p></div></header><div className="draft-recovery-body"><nav>{snapshot.files.map(item=><label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={event=>setSelected(current=>event.target.checked?[...current,item.id]:current.filter(id=>id!==item.id))}/><button onClick={()=>setPreview(item.id)}>{item.name}{item.dirty?' *':''}</button></label>)}</nav><pre>{file.content}</pre></div><label className="draft-reconnect"><input type="checkbox" checked={reconnect} onChange={event=>setReconnect(event.target.checked)}/>Reconnect the active file using its saved profile</label><footer className="appearance-footer"><button className="button-secondary" onClick={onDiscard}>Discard recovery</button><button className="button-primary" disabled={!selected.length} onClick={()=>onRestore(snapshot.files.filter(item=>selected.includes(item.id)),reconnect)}>Restore selected drafts</button></footer></div></ModalBackdrop>;
}

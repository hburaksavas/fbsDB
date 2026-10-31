import {useFeedbackState,Feedback,FeedbackDialog} from './Feedback';
import {useEffect,useRef,useState} from 'react';
import {Pencil,RefreshCw,Trash2,X,Check} from 'lucide-react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {sendNativeCommand,subscribeNativeMessages} from './nativeBridge';
import {pathKey} from './workspaceTree';

export function WorkspaceWorksets({root,getSnapshot,onOpened,onClose}) {
  const ref=useRef(null),request=useRef(null),open=useRef(onOpened);open.current=onOpened;useDialogFocus(ref,onClose);
  const [sets,setSets]=useState([]),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useFeedbackState('',{title:'Workset operation failed'}),[edit,setEdit]=useState(null),[confirm,setConfirm]=useState(null),[skipped,setSkipped]=useState([]),[creating,setCreating]=useState(false);
  function command(command,payload={}){setBusy(true);setError('');setSkipped([]);request.current=sendNativeCommand(command,{root,...payload})}
  useEffect(()=>{command('workspace.worksets')},[root]);
  useEffect(()=>subscribeNativeMessages(message=>{
    if(message.requestId!==request.current)return;
    if(message.type==='workspace.error'){request.current=null;setBusy(false);setError(message.message);return}
    if(pathKey(message.root)!==pathKey(root))return;
    if(message.type==='workspace.worksets'){request.current=null;setBusy(false);setSets(message.worksets||[]);setEdit(null);setConfirm(null);setName('');setCreating(false)}
    if(message.type==='workspace.worksetOpened'){request.current=null;setBusy(false);open.current(message);if(message.skipped?.length)setSkipped(message.skipped);else onClose()}
  }),[root,onClose]);
  function save(id=null,label=name){command('workspace.worksetSave',{id,name:label,...getSnapshot()})}
  return <ModalBackdrop onClose={()=>!busy&&onClose()}><section ref={ref} role="dialog" aria-modal="true" aria-label="Workspace worksets" className="appearance-modal workspace-worksets">
    <header><strong>Worksets</strong><button className="icon-button" aria-label="Close worksets" disabled={busy} onClick={onClose}><X size={15}/></button></header>
    <button className="button-secondary" disabled={busy} onClick={()=>setCreating(true)}>Save current tabs…</button>
    {creating&&<FeedbackDialog title="Save workset" busy={busy} onClose={()=>setCreating(false)}><form onSubmit={event=>{event.preventDefault();save()}}><label>Workset name<input autoFocus aria-label="New workset name" maxLength={80} value={name} disabled={busy} onChange={event=>setName(event.target.value)}/></label><footer><button type="button" onClick={()=>setCreating(false)} disabled={busy}>Cancel</button><button className="button-primary" disabled={busy||!name.trim()}>Save tabs</button></footer></form></FeedbackDialog>}
    {edit&&<FeedbackDialog title="Rename workset" busy={busy} onClose={()=>setEdit(null)}><form onSubmit={event=>{event.preventDefault();command('workspace.worksetSave',{id:edit.id,name:edit.name})}}><label>Workset name<input autoFocus aria-label="Rename workset" maxLength={80} disabled={busy} value={edit.name} onChange={event=>setEdit({...edit,name:event.target.value})}/></label><footer><button type="button" disabled={busy} onClick={()=>setEdit(null)}>Cancel</button><button className="button-primary" disabled={busy||!edit.name.trim()}>Save name</button></footer></form></FeedbackDialog>}
    {confirm&&<FeedbackDialog kind="warning" title={confirm.update?'Update workset?':'Delete workset?'} busy={busy} onClose={()=>setConfirm(null)} actions={<><button disabled={busy} onClick={()=>setConfirm(null)}>Cancel</button><button className="button-secondary" disabled={busy} onClick={()=>{const item=sets.find(s=>s.id===confirm.id);if(confirm.update)save(item.id,item.name);else command('workspace.worksetDelete',{id:confirm.id})}}>{confirm.update?'Update':'Delete'}</button></>}><p>{sets.find(s=>s.id===confirm.id)?.name}</p>{confirm.update?'Replace its saved file references with the current tabs?':'SQL files and open tabs are kept.'}</FeedbackDialog>}
    <div className="workset-list">{sets.map(set=><div key={set.id} className="workset-row"><><button className="workset-open" disabled={busy} title="Open files without connecting or running SQL; existing tabs and unsaved text are kept" onClick={()=>command('workspace.worksetOpen',{id:set.id})}><span>{set.name}</span><small>{set.files.length}</small></button><button disabled={busy} title="Update from current tabs" aria-label={`Update workset ${set.name}`} onClick={()=>setConfirm({id:set.id,update:true})}><RefreshCw size={13}/></button><button disabled={busy} title="Rename workset" aria-label={`Rename workset ${set.name}`} onClick={()=>setEdit({id:set.id,name:set.name})}><Pencil size={13}/></button><button disabled={busy} title="Delete workset definition" aria-label={`Delete workset ${set.name}`} onClick={()=>setConfirm({id:set.id})}><Trash2 size={13}/></button></></div>)}{!sets.length&&!busy&&<span className="workset-empty">No worksets</span>}</div>
    {busy&&<Feedback kind="progress" title="Worksets">Working…</Feedback>}{error&&<Feedback title="Workset operation failed">{error}</Feedback>}{skipped.length>0&&<Feedback kind="warning" title="Some files were not opened">{skipped.map(item=><div key={item}>{item}</div>)}</Feedback>}
  </section></ModalBackdrop>;
}

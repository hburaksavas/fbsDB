import {useFeedbackState,Feedback} from './Feedback';
import {useEffect,useRef,useState} from 'react';
import {FolderOpen,FolderPlus,Star,Settings2,X,MoreHorizontal} from 'lucide-react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {sendNativeCommand,subscribeNativeMessages,isNativeHost} from './nativeBridge';
import {WorkspaceMenu,workspaceContext,workspaceContextKey} from './WorkspaceMenu';

export function WorkspaceManager({workspace,onClose}) {
  const ref=useRef(null),request=useRef(null),pendingLocation=useRef(null);
  const [selected,setSelected]=useState(workspace.catalog?.find(w=>w.active)?.id||workspace.catalog?.[0]?.id);
  const [filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useFeedbackState('',{title:'Workspace operation failed'}),[status,setStatus]=useState(''),[menu,setMenu]=useState(null),[confirmation,setConfirmation]=useState(null),[discard,setDiscard]=useState(null);
  const records=workspace.catalog||[],item=records.find(w=>w.id===selected),dirty=!!item&&!!draft&&(draft.name!==item.name||draft.description!==item.description||draft.pinned!==item.pinned);
  const guard=action=>{if(busy)return;if(dirty)setDiscard(()=>action);else action()};
  const close=()=>guard(onClose);useDialogFocus(ref,close);
  useEffect(()=>{if(!records.some(w=>w.id===selected))setSelected(records.find(w=>w.active)?.id||records[0]?.id)},[workspace.catalog,selected]);
  useEffect(()=>{setDraft(item?{name:item.name,description:item.description,pinned:item.pinned}:null)},[item?.id,item?.name,item?.description,item?.pinned]);
  function command(name,payload){setError('');setStatus('');setBusy(true);request.current=sendNativeCommand(name,payload)}
  useEffect(()=>subscribeNativeMessages(message=>{
    if(message.requestId!==request.current)return;
    if(message.type==='workspace.error'){request.current=null;setBusy(false);setError(message.message)}
    if(message.type==='workspace.operation'){request.current=null;setBusy(false);setConfirmation(null);setStatus('Workspace updated.')}
    if(message.type==='workspace.location'){request.current=null;setBusy(false);if(message.path)setConfirmation({kind:'relocate',item:pendingLocation.current,path:message.path})}
  }),[]);
  const select=record=>guard(()=>{setSelected(record.id);setError('');setStatus('')});
  const pin=record=>command('workspace.update',{id:record.id,name:record.name,description:record.description,pinned:!record.pinned});
  const locate=record=>{pendingLocation.current=record;command('workspace.pickLocation',{})};
  const forget=record=>setConfirmation({kind:'forget',item:record});
  const copy=async path=>{try{await navigator.clipboard.writeText(path);setStatus('Path copied.')}catch{setError('Could not copy the path.')}};
  const menuItems=record=>[
    {label:record.active?'Active workspace':'Open workspace',disabled:record.active||!record.available,run:()=>guard(()=>sendNativeCommand('workspace.openRecent',{path:record.path}))},
    {label:record.pinned?'Unpin workspace':'Pin workspace',run:()=>guard(()=>pin(record))},
    {label:'Edit properties…',run:()=>select(record)},
    {separator:true},{label:'Open in Windows Explorer',disabled:!record.available,run:()=>command('workspace.reveal',{path:record.path})},
    {label:'Copy path',run:()=>copy(record.path)},
    {label:'Locate workspace…',run:()=>guard(()=>locate(record))},
    {separator:true},{label:'Forget from list…',run:()=>guard(()=>forget(record))}
  ];
  const visible=[...records].sort((a,b)=>filter==='recent'?new Date(b.lastOpened||0)-new Date(a.lastOpened||0):Number(b.pinned)-Number(a.pinned)||new Date(b.lastOpened||0)-new Date(a.lastOpened||0)).filter(w=>(filter!=='pinned'||w.pinned)&&(filter!=='missing'||!w.available)&&`${w.name} ${w.path} ${w.description}`.toLowerCase().includes(query.toLowerCase()));
  return <ModalBackdrop onClose={close}><section ref={ref} className="appearance-modal workspace-manager" role="dialog" aria-modal="true" aria-label="Workspace manager">
    <header className="appearance-header"><div><div className="eyebrow">WORKSPACES</div><h2>Workspace manager</h2><p>Manage local SQL folders. Switching workspaces keeps your SQL tabs and sessions open.</p></div><button className="icon-button" aria-label="Close workspace manager" disabled={busy} onClick={close}><X size={17}/></button></header>
    <div className="workspace-manager-toolbar"><button disabled={!isNativeHost||busy} onClick={()=>guard(()=>sendNativeCommand('workspace.create'))}><FolderPlus size={14}/>New workspace</button><button disabled={!isNativeHost||busy} onClick={()=>guard(()=>sendNativeCommand('workspace.open'))}><FolderOpen size={14}/>Open folder</button><input aria-label="Search workspaces" placeholder="Search names, paths, descriptions…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
    <div className="workspace-manager-body"><nav aria-label="Workspace filters">{[['all','All workspaces'],['pinned','Pinned'],['recent','Recent'],['missing','Unavailable']].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</nav>
      <div className="workspace-registration-list" role="list" aria-label="Registered workspaces">{visible.map(w=><div key={w.id} role="listitem" className={`workspace-registration ${selected===w.id?'selected':''}`} tabIndex={0} onClick={()=>select(w)} onKeyDown={e=>{if(workspaceContextKey(e,event=>setMenu(workspaceContext(event,w))))return;if(e.key==='Enter'){e.preventDefault();select(w)}}} onContextMenu={e=>setMenu(workspaceContext(e,w))}>
        <div><b>{w.pinned&&<Star size={12}/>} {w.name}</b><small title={w.path}>{w.path}</small><span>{w.active?'Active':!w.available?'Unavailable':w.lastOpened?new Date(w.lastOpened).toLocaleString():'Never opened'}</span></div><button className="icon-button" aria-label={`Actions for workspace ${w.name}`} disabled={busy} onClick={e=>{e.stopPropagation();setMenu(workspaceContext(e,w))}}><MoreHorizontal size={15}/></button>
      </div>)}{!visible.length&&<p className="workspace-manager-empty">No matching workspaces.</p>}</div>
      <div className="workspace-properties">{item&&draft?<form onSubmit={e=>{e.preventDefault();command('workspace.update',{id:item.id,...draft})}}><div className="eyebrow">WORKSPACE PROPERTIES</div><h3>{item.name}</h3><label>Display name<input aria-label="Workspace display name" maxLength={100} required value={draft.name} disabled={busy} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label>Description<textarea aria-label="Workspace description" maxLength={1000} rows={3} value={draft.description} disabled={busy} onChange={e=>setDraft({...draft,description:e.target.value})}/></label><label className="workspace-checkbox"><input type="checkbox" checked={draft.pinned} disabled={busy} onChange={e=>setDraft({...draft,pinned:e.target.checked})}/>Pin for quick switching</label><dl><dt>Folder</dt><dd>{item.path}</dd><dt>Status</dt><dd>{item.available?'Available':'Unavailable — locate the folder or retry'}</dd><dt>Workspace configuration</dt><dd>{item.path.replace(/[\\/]$/,'')}/.fbsdb/workspace.json</dd></dl><p className="workspace-manager-hint">The display name does not rename the folder. Name, description and pins are saved on this device.</p>
        <div className="workspace-manager-actions"><button className="button-primary" disabled={busy||!dirty||!draft.name.trim()}>Save properties</button><button type="button" disabled={busy||!dirty} onClick={()=>setDraft({name:item.name,description:item.description,pinned:item.pinned})}>Revert</button></div>
        <div className="workspace-manager-actions"><button type="button" disabled={busy||item.active||!item.available} onClick={()=>guard(()=>sendNativeCommand('workspace.openRecent',{path:item.path}))}>Open workspace</button><button type="button" disabled={busy} onClick={()=>guard(()=>locate(item))}>Locate folder…</button><button type="button" disabled={busy} onClick={()=>command('workspace.reveal',{path:item.path})}>Explorer</button><button type="button" disabled={busy} onClick={()=>copy(item.path)}>Copy path</button><button type="button" disabled={busy} onClick={()=>guard(()=>forget(item))}>Forget…</button></div>
      </form>:<div className="workspace-manager-empty"><Settings2 size={22}/><p>Select a workspace to edit its properties.</p></div>}</div>
    </div>
    {error&&<Feedback title="Workspace operation failed">{error}</Feedback>}
    <footer className="appearance-footer"><><Feedback kind={busy?"progress":"success"} title="Workspace">{busy?"Working…":status}</Feedback><span>{records.length} registered workspaces</span></><div className="workspace-manager-actions"><button disabled={!workspace.root||busy} onClick={()=>guard(()=>sendNativeCommand('workspace.close'))}>Close active workspace</button><button disabled={busy} onClick={()=>sendNativeCommand('workspace.refresh')}>Refresh</button><button disabled={busy} onClick={close}>Close</button></div></footer>
    {menu&&<WorkspaceMenu context={menu} items={menuItems(menu.item).map(m=>({...m,disabled:m.disabled||busy}))} onClose={()=>setMenu(null)}/>}
    {confirmation&&<ModalBackdrop onClose={()=>!busy&&setConfirmation(null)}><section className="appearance-modal workspace-confirm" role="dialog" aria-modal="true" aria-label={confirmation.kind==='forget'?'Forget workspace':'Confirm workspace location'}><h3>{confirmation.kind==='forget'?'Forget workspace?':'Use this workspace location?'}</h3><p>{confirmation.item.name}</p><p className="workspace-path">{confirmation.path||confirmation.item.path}</p><p>{confirmation.kind==='forget'?'Removes the registration and pin on this device. SQL files, .fbsdb configuration and open SQL tabs are kept.':'Confirm that this is the correct workspace folder. This updates its registered location; it does not move files. Open tabs keep their original file paths.'}</p>{error&&<Feedback title="Workspace operation failed">{error}</Feedback>}<footer><button disabled={busy} onClick={()=>setConfirmation(null)}>Cancel</button><button className="button-primary" disabled={busy} onClick={()=>confirmation.kind==='forget'?command('workspace.forget',{id:confirmation.item.id}):command('workspace.relocate',{id:confirmation.item.id,path:confirmation.path,confirmed:true})}>{confirmation.kind==='forget'?'Forget workspace':'Use this folder'}</button></footer></section></ModalBackdrop>}
    {discard&&<ModalBackdrop onClose={()=>setDiscard(null)}><section className="appearance-modal workspace-confirm" role="dialog" aria-modal="true" aria-label="Unsaved workspace properties"><h3>Unsaved workspace properties</h3><p>Discard these property changes to continue?</p><footer><button onClick={()=>setDiscard(null)}>Keep editing</button><button onClick={()=>{const action=discard;setDiscard(null);setDraft(item?{name:item.name,description:item.description,pinned:item.pinned}:null);action()}}>Discard changes</button></footer></section></ModalBackdrop>}
  </section></ModalBackdrop>;
}

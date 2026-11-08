import {useEffect,useRef,useState} from 'react';
import {Database,Folder,FolderOpen,Settings2,Star} from 'lucide-react';
import {folderOptions,validateConnectionName} from './connectionOrganization';
import {isNativeHost,sendNativeCommand,subscribeNativeMessages} from './nativeBridge';
import {connectionContextKey} from './ConnectionContextMenu';

export function ConnectionFolders({folders,selected,onSelect,onContext}){
 const entries=folderOptions(folders);
 const branch=(parent=null,depth=0)=>entries.filter(f=>(f.parentId||null)===parent).map(f=><div key={f.id}><button type="button" className="connection-folder-row" style={{paddingLeft:10+depth*14}} aria-pressed={selected===f.id} onClick={()=>onSelect(f.id)} onContextMenu={e=>onContext?.(e,"folder",f)} onKeyDown={e=>connectionContextKey(e,event=>onContext?.(event,"folder",f))}><Folder size={14}/><span>{f.name}</span></button>{branch(f.id,depth+1)}</div>);
 return <nav className="connection-folders" aria-label="Connection folders"><button type="button" className="connection-folder-row" aria-pressed={selected===''} onClick={()=>onSelect('')}><FolderOpen size={14}/>All connections</button><button type="button" className="connection-folder-row" aria-pressed={selected==='__root__'} onClick={()=>onSelect('__root__')}><Database size={14}/>Unfiled</button>{branch()}</nav>;
}

// Renames a connection where it is listed. Only the label changes, so sessions and saved credentials are untouched. Enter saves, Escape cancels, and a failure stays here.
function ConnectionRenameField({profile,items,onDone}){
 const [value,setValue]=useState(profile.name||profile.id),[state,setState]=useState({}),input=useRef(null),stop=useRef(null);
 useEffect(()=>{input.current?.focus();input.current?.select();return()=>stop.current?.()},[]);
 const save=()=>{
  if(state.saving)return;
  const checked=validateConnectionName(items,value,profile.id);
  if(checked.error){setState({error:checked.error});return}
  if(checked.name===(profile.name||profile.id)||!isNativeHost){onDone();return}
  setState({saving:true});
  const requestId=sendNativeCommand('connection.rename',{profileId:profile.id,name:checked.name});
  stop.current=subscribeNativeMessages(message=>{
   if(message.type!=='connection.managed'||message.requestId!==requestId)return;
   stop.current?.();stop.current=null;
   if(message.success)onDone();else{setState({error:message.message||'The name could not be saved.'});input.current?.focus()}
  });
 };
 return <span className="connection-rename"><input ref={input} aria-label={`Rename ${profile.name||profile.id}`} aria-invalid={Boolean(state.error)||undefined} disabled={state.saving} value={value} onChange={event=>{setValue(event.target.value);setState({})}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();save()}else if(event.key==='Escape'){event.preventDefault();onDone()}}}/>{state.error&&<small role="alert">{state.error}</small>}</span>;
}

export function ConnectionTree({items,organization,selected,favorites=[],onSelect,onManage,onToggleFavorite,onContext,contextId,renameRequest,onRenameHandled}){
 const entries=folderOptions(organization.folders);
 const [renaming,setRenaming]=useState(null);
 useEffect(()=>{if(renameRequest){setRenaming(renameRequest);onRenameHandled?.()}},[renameRequest]);
 const profiles=folder=>items.filter(p=>(p.folderId||null)===folder).map(p=>renaming===p.id?<div className="connection-tree-profile" key={p.id}><ConnectionRenameField profile={p} items={items} onDone={()=>{setRenaming(null);requestAnimationFrame(()=>document.querySelector(`[data-connection-profile="${CSS.escape(p.id)}"]`)?.focus())}}/></div>:<div className="connection-tree-profile" key={p.id}><button type="button" className="connection-tree-entry" data-connection-profile={p.id} data-context-selected={contextId===p.id||undefined} aria-current={selected?.id===p.id?'true':undefined} onClick={()=>onSelect(p)} onKeyDown={e=>{if(e.key==='F2'){e.preventDefault();e.stopPropagation();setRenaming(p.id);return}connectionContextKey(e,event=>onContext?.(event,"profile",p))}} onContextMenu={event=>{event.preventDefault();event.stopPropagation();onContext?.(event,"profile",p)}} title={[p.name||p.id,p.user,p.host,p.service,...p.groups||[]].filter(Boolean).join(' · ')+' · F2 to rename'}><Database size={13}/><span><b>{p.name||p.id}</b><small>{p.user||p.env}{p.groups?.length?` · ${p.groups.join(', ')}`:''}</small></span></button><button type="button" className="connection-tree-action" aria-label={`Edit ${p.name||p.id}`} title="Edit connection definition" onClick={()=>onManage(p)}><Settings2 size={12}/></button><button type="button" className="connection-tree-action" aria-label={`Favorite ${p.name||p.id}`} aria-pressed={favorites.includes(p.id)} onClick={()=>onToggleFavorite(p.id)}><Star size={12}/></button></div>);
 const branch=(parent=null,depth=0)=>depth>100?null:entries.filter(f=>(f.parentId||null)===parent).map(f=><details open key={f.id} className="connection-tree-folder"><summary data-context-selected={contextId===f.id||undefined} onContextMenu={e=>onContext?.(e,"folder",f)} onKeyDown={e=>connectionContextKey(e,event=>onContext?.(event,"folder",f))}><Folder size={13}/><span>{f.name}</span></summary><div>{profiles(f.id)}{branch(f.id,depth+1)}</div></details>);
 return <div className="connection-tree" aria-label="Saved connections" tabIndex={0} onContextMenu={e=>onContext?.(e,"background")} onKeyDown={e=>{if(e.target===e.currentTarget)connectionContextKey(e,event=>onContext?.(event,"background"))}}>{profiles(null)}{branch()}{!items.length&&<p className="connection-manager-hint">No matching connections.</p>}</div>;
}

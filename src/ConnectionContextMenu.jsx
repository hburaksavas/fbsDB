import {useFeedbackState,Feedback} from './Feedback';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {FilePlus2,PlugZap,Unplug,RefreshCw,Pencil,Copy,Star,FolderInput,Tags,Trash2,Plus,FolderPlus,Settings2,ChevronRight,ChevronLeft,Check,Database} from 'lucide-react';
import {folderOptions} from './connectionOrganization';
import {restoreFocus} from './focusManagement';
import {isNativeHost,sendNativeCommand,subscribeNativeMessages} from './nativeBridge';

export function connectionContext(event,kind,item){
 event.preventDefault();event.stopPropagation();const trigger=event.currentTarget,rect=trigger.getBoundingClientRect();
 return {kind,item,trigger,x:event.clientX||rect.left,y:event.clientY||rect.bottom};
}
export function connectionContextKey(event,open){
 if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){event.preventDefault();open(event)}
}

export function ConnectionContextMenu({context,organization,favorites=[],activeProfileId,usedProfileIds=[],connectionDisabled=false,newSqlDisabled=false,organizationDisabled=false,onAction,onPreviewOrganization,onClose}){
 const ref=useRef(null),request=useRef(null),requestFocus=useRef(null),closeRef=useRef(onClose);closeRef.current=onClose;
 const [panel,setPanel]=useState('main'),[busy,setBusy]=useState(false),[error,setError]=useFeedbackState('',{title:'Connection action failed'});
 const profile=context.kind==='profile'?context.item:null,folder=context.kind==='folder'?context.item:null;
 const assignment=profile?organization.assignments[profile.id]||{folderId:profile.folderId||null,groupIds:profile.groupIds||[]}:null;
 const current=profile?.id===activeProfileId,inUse=profile&&usedProfileIds.includes(profile.id);
 useLayoutEffect(()=>{const root=ref.current,r=root.getBoundingClientRect();root.style.left=`${Math.max(6,Math.min(context.x,innerWidth-r.width-6))}px`;root.style.top=`${Math.max(6,Math.min(context.y,innerHeight-r.height-6))}px`;root.querySelector('button:not(:disabled)')?.focus({preventScroll:true})},[context,panel,error]);
 useLayoutEffect(()=>{
  const root=ref.current;
  const dismiss=event=>{if(!root.contains(event.target))closeRef.current()};
  let typed='',timer;
  const key=event=>{
   const buttons=[...root.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
   if(event.key==='Escape'||event.key==='ArrowLeft'&&panel!=='main'){event.preventDefault();event.stopImmediatePropagation();if(panel==='main')closeRef.current();else{setPanel('main');setError('')}return}
   if(event.key==='Tab'){event.preventDefault();event.stopImmediatePropagation();closeRef.current();return}
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();return}
   if(event.key==='ArrowRight'&&document.activeElement?.getAttribute('aria-haspopup')==='menu'){event.preventDefault();event.stopImmediatePropagation();document.activeElement.click();return}
   if(event.key.length===1&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&event.key!==' '){typed+=event.key.toLocaleLowerCase();clearTimeout(timer);timer=setTimeout(()=>{typed=''},700);const match=buttons.find(b=>b.textContent.trim().toLocaleLowerCase().startsWith(typed));if(match){event.preventDefault();event.stopImmediatePropagation();match.focus()}}
  };
  // The modal captures Escape on document; the menu must handle it first.
  const resize=()=>closeRef.current();document.addEventListener('pointerdown',dismiss,true);window.addEventListener('keydown',key,true);window.addEventListener('resize',resize);
  return()=>{clearTimeout(timer);document.removeEventListener('pointerdown',dismiss,true);window.removeEventListener('keydown',key,true);window.removeEventListener('resize',resize)};
 },[context,panel]);
 useEffect(()=>{const previous=context.trigger,root=ref.current,owner=previous.closest('[role="dialog"]');return()=>restoreFocus(previous.isConnected?previous:owner?.isConnected?owner.querySelector('button:not(:disabled),input:not(:disabled)'):profile?document.querySelector(`[data-connection-profile="${CSS.escape(profile.id)}"]`):previous,root)},[context]);
 useLayoutEffect(()=>{if(!busy&&requestFocus.current){requestFocus.current.focus({preventScroll:true});requestFocus.current=null}},[busy]);
 useEffect(()=>subscribeNativeMessages(message=>{if(message.type!=='connection.organization'||message.requestId!==request.current)return;request.current=null;setBusy(false);if(!message.success){setError(message.message||'Could not update this connection.');return}if(panel!=='groups')closeRef.current()}),[panel]);
 const act=action=>{if(busy)return;closeRef.current();onAction(action,context)};
 const assign=patch=>{if(busy||organizationDisabled)return;const payload={operation:'profile.assign',profileId:profile.id,...assignment,...patch};setError('');if(!isNativeHost){try{onPreviewOrganization(payload);if(panel!=='groups')closeRef.current()}catch(e){setError(e.message)}return}requestFocus.current=document.activeElement;setBusy(true);request.current=sendNativeCommand('connection.organization',payload)};
 const copy=async value=>{try{await navigator.clipboard.writeText(value);closeRef.current()}catch{setError('Could not copy to the clipboard.')}};
 const button=(label,Icon,run,disabled=false,extra={})=><button type="button" role="menuitem" disabled={disabled||busy} onClick={run} {...extra}>{extra.children||<><Icon size={14}/><span>{label}</span></>}</button>;
 const submenu=(label,Icon,page)=>button(label,Icon,()=>{setPanel(page);setError('')},organizationDisabled,{'aria-haspopup':'menu','aria-expanded':panel===page,children:<><Icon size={14}/><span>{label}</span><ChevronRight size={12}/></>});
 const parent=context.trigger.closest('[role="dialog"]')||document.body,theme=context.trigger.closest('[data-theme]')?.dataset.theme||document.documentElement.dataset.theme||'default';
 return createPortal(<div ref={ref} style={{fontFamily:getComputedStyle(context.trigger).fontFamily}} className="connection-context-menu theme-scope" data-theme={theme} role="menu" aria-label="Connections context menu" aria-busy={busy||undefined} onContextMenu={event=>event.preventDefault()}>
  <header><Database size={13}/><span>{profile?.name||profile?.id||folder?.name||'Connections'}</span></header>
  {panel!=='main'&&button(panel==='folders'?'Move to folder':'Group labels',ChevronLeft,()=>{setPanel('main');setError('')} )}
  {panel==='main'&&<>{profile?<>
   {button('New SQL',FilePlus2,()=>act('newSql'),newSqlDisabled||profile.available===false)}<hr/>
   {button(current?'Reconnect current tab':'Connect',current?RefreshCw:PlugZap,()=>act(current?'reconnect':'connect'),connectionDisabled||profile.available===false)}
   {current&&button('Disconnect current tab',Unplug,()=>act('disconnect'),connectionDisabled)}
   <hr/>{button('Edit definition…',Pencil,()=>act('edit'))}{button('Duplicate…',Copy,()=>act('duplicate'))}
   {button(favorites.includes(profile.id)?'Remove from favorites':'Add to favorites',Star,()=>act('favorite'))}
   <hr/>{submenu('Move to folder',FolderInput,'folders')}{submenu('Group labels',Tags,'groups')}
   <hr/>{button('Copy connection name',Copy,()=>copy(profile.name||profile.id))}{button('Copy endpoint',Copy,()=>copy([profile.host,profile.port].filter(Boolean).join(':')+(profile.service?'/'+profile.service:'')),!profile.host)}
   <hr/>{button('Delete definition…',Trash2,()=>act('delete'),inUse||organizationDisabled,{'data-danger':true,title:inUse?'Disconnect this profile in every SQL tab before deleting it.':undefined})}
  </>:folder?<>{button('New connection here…',Plus,()=>act('newConnection'))}{button('New subfolder…',FolderPlus,()=>act('newFolder'),organizationDisabled)}<hr/>{button('Rename folder…',Pencil,()=>act('renameFolder'),organizationDisabled)}{button('Manage folder…',Settings2,()=>act('manageFolder'),organizationDisabled)}</>:<>{button('New connection…',Plus,()=>act('newConnection'))}{button('New folder…',FolderPlus,()=>act('newFolder'))}{button('New group…',Tags,()=>act('newGroup'),organizationDisabled)}<hr/>{button('Manage connections…',Settings2,()=>act('manage'))}{button('Refresh connections',RefreshCw,()=>act('refresh'))}</>}</>}
  {panel==='folders'&&<div className="connection-context-options">{[{id:null,path:'Unfiled'},...folderOptions(organization.folders)].map(f=><button type="button" role="menuitemradio" aria-checked={(assignment.folderId||null)===f.id} disabled={busy||organizationDisabled} key={f.id||'root'} onClick={()=>assign({folderId:f.id})}><span className="connection-context-check">{(assignment.folderId||null)===f.id&&<Check size={13}/>}</span><span>{f.path}</span></button>)}</div>}
  {panel==='groups'&&<div className="connection-context-options">{organization.groups.map(g=><button type="button" role="menuitemcheckbox" aria-checked={assignment.groupIds.includes(g.id)} disabled={busy||organizationDisabled} key={g.id} onClick={()=>assign({groupIds:assignment.groupIds.includes(g.id)?assignment.groupIds.filter(id=>id!==g.id):[...assignment.groupIds,g.id]})}><span className="connection-context-check">{assignment.groupIds.includes(g.id)&&<Check size={13}/>}</span><span>{g.name}</span></button>)}{!organization.groups.length&&<p>No group labels yet.</p>}{button('Manage group labels…',Settings2,()=>act('manage'))}</div>}
  {error&&<Feedback title="Connection action failed">{error}</Feedback>}{busy&&<Feedback kind="progress" title="Connection">Saving…</Feedback>}
 </div>,parent);
}

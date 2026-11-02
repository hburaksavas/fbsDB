import {ThemedIcon} from './ThemedIcon';
import {filterEditorTabs} from './workbenchUx.js';
import {useFeedbackState,Feedback} from './Feedback';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ChevronDown,ChevronRight,FileCode2,FilePlus2,Folder,FolderOpen,FolderPlus,MoreHorizontal,RefreshCw,ChevronsUp,Settings2,LocateFixed,X} from 'lucide-react';
import {isNativeHost,sendNativeCommand,subscribeNativeMessages} from './nativeBridge';
import {WorkspaceEntryDialog,workspaceJoin,workspaceParent,workspaceContains} from './WorkspaceEntryDialog';
import {WorkspaceMenu,workspaceContext,workspaceContextKey} from './WorkspaceMenu';
import {sourceFileName} from './oracleSourceFiles';
import {tabPathLabels} from './tabPathLabels';
import {EnvironmentBadge} from './ExecutionContextBadges';
import {projectOptions,projectAreaFiles} from './projectRules';
import {profileEnvironment} from './executionContext';
import {filteredWorkspaceTree,pathKey,remapWorkspacePath} from './workspaceTree';
import {selectWorkspacePaths,topLevelWorkspaceEntries,canDropWorkspaceEntries} from './workspaceSelection';

export function WorkspaceExplorer({workspace,activePath,onOpen,onPromote,onOpenWorkspace,onManage,onSearch,onReplace,onWorksets,onProjectRules,profiles=[],gitFiles=[],expandedPaths,onExpandedChange}) {
  const [area,setArea]=useState('all');
  const [query,setQuery]=useState(''),[children,setChildren]=useState({}),[selected,setSelected]=useState(null),[localExpanded,setLocalExpanded]=useState({}),[selection,setSelection]=useState([]),[dropTarget,setDropTarget]=useState(null);
  const anchor=useRef(null),drag=useRef(null);
  const expanded=expandedPaths??localExpanded,setExpanded=next=>onExpandedChange?onExpandedChange(next):setLocalExpanded(next),signature=JSON.stringify(expanded);
  const [rootOpen,setRootOpen]=useState(true),[menu,setMenu]=useState(null),[operation,setOperation]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useFeedbackState('',{title:'Workspace operation failed'}),[dismissedWorkspaceError,setDismissedWorkspaceError]=useState(false);
  const pending=useRef(new Map()),mutation=useRef(null),rootRef=useRef(workspace.root),treeRef=useRef(null),revealPath=useRef(null);
  rootRef.current=workspace.root;
  useEffect(()=>setDismissedWorkspaceError(false),[workspace.error,workspace.root]);
  const load=path=>{if(isNativeHost)pending.current.set(sendNativeCommand('workspace.children',{path,root:workspace.root}),path)};
  useEffect(()=>{const reset=()=>{setExpanded({});setRootOpen(true)};window.addEventListener('fbsdb.explorer.reset',reset);return()=>window.removeEventListener('fbsdb.explorer.reset',reset)},[]);
  useEffect(()=>{setArea('all');setChildren({});setSelected(null);setSelection([]);anchor.current=null;drag.current=null;setDropTarget(null);setQuery('');setRootOpen(true);setMenu(null);setOperation(null);setBusy(false);setError('');pending.current.clear();mutation.current=null;revealPath.current=null},[workspace.root]);
  useEffect(()=>{for(const path of Object.keys(expanded))if(expanded[path]&&workspaceContains(path,workspace.root))load(path)},[workspace.entries,signature]);
  useEffect(()=>subscribeNativeMessages(message=>{
    if(message.type==='workspace.children'&&pending.current.has(message.requestId)){
      pending.current.delete(message.requestId);if(pathKey(message.root)===pathKey(rootRef.current))setChildren(c=>({...c,[pathKey(message.path)]:message.entries||[]}));
    }else if(message.type==='workspace.changed'&&pathKey(message.root)===pathKey(rootRef.current)){
      const moves=message.moves||(message.source?[{source:message.source,destination:message.destination}]:[]),removed=message.removedPaths||(message.removed?[message.removed]:[]);
      if(moves.length){const remap=path=>moves.reduce((value,move)=>remapWorkspacePath(value,move.source,move.destination),path);setExpanded(current=>Object.fromEntries(Object.entries(current).map(([path,value])=>[remap(path),value])));setSelection(paths=>paths.map(remap));setChildren({})}
      if(removed.length){setChildren({});setSelected(null);setSelection(paths=>paths.filter(path=>!removed.some(root=>workspaceContains(path,root))));setExpanded(c=>Object.fromEntries(Object.entries(c).filter(([path])=>!removed.some(root=>workspaceContains(path,root)))))}
      if(message.requestId===mutation.current){mutation.current=null;setBusy(false);setOperation(null);setError(message.error||'');setSelected(message.entry||null)}
    }else if(message.type==='workspace.operation'&&message.requestId===mutation.current){mutation.current=null;setBusy(false)}
    else if(message.type==='workspace.error'){
      if(message.requestId===mutation.current){mutation.current=null;setBusy(false);setError(message.message)}
      else if(pending.current.has(message.requestId)){const path=pending.current.get(message.requestId);pending.current.delete(message.requestId);setExpanded(current=>Object.fromEntries(Object.entries(current).filter(([entry])=>!workspaceContains(entry,path))));setError(message.message)}
    }
  }),[signature]);
  useEffect(()=>{if(!revealPath.current)return;const row=[...treeRef.current?.querySelectorAll('[data-path]')||[]].find(e=>e.dataset.path===pathKey(revealPath.current));if(row){row.scrollIntoView({block:'nearest'});row.focus({preventScroll:true});revealPath.current=null}},[children,signature,query,rootOpen]);
  const searchEntries=useMemo(()=>query.trim()||area!=='all'?filteredWorkspaceTree(projectAreaFiles(workspace.files,workspace.root,area,workspace.projectRules),query.trim()):null,[workspace.files,workspace.root,workspace.projectRules,query,area]);
  const git=useMemo(()=>new Map(gitFiles.map(file=>[pathKey(file.path),file.status])),[gitFiles]);
  const allEntries=[...(workspace.entries||[]),...Object.values(children).flat(),...(searchEntries||[])];
  const selectedEntries=topLevelWorkspaceEntries(selection.map(path=>allEntries.find(entry=>pathKey(entry.path)===pathKey(path))).filter(Boolean));
  const visiblePaths=()=>[...treeRef.current?.querySelectorAll('[role="treeitem"]')||[]].map(row=>allEntries.find(entry=>pathKey(entry.path)===row.dataset.path)?.path).filter(Boolean);
  function choose(entry,event={}){setSelected(entry);setSelection(paths=>selectWorkspacePaths(paths,visiblePaths(),entry.path,{toggle:event.ctrlKey||event.metaKey,range:event.shiftKey,anchor:anchor.current}));if(!event.shiftKey)anchor.current=entry.path;}
  const start=(mode,entry=selected,entries=null)=>{setError('');setOperation({mode,entry,entries,parent:entry?entry.isDirectory?entry.path:workspaceParent(entry.path):workspace.root})};
  function command(name,payload={}){setError('');setBusy(true);mutation.current=sendNativeCommand(name,{root:workspace.root,...payload})}
  function submit({name,destination}){
    const {mode,entry,parent,entries}=operation;
    if(entries?.length>1&&['move','recycle'].includes(mode)){command(mode==='move'?'workspace.moveEntries':'workspace.recycleEntries',{paths:entries.map(item=>item.path),destination,confirmed:true});return;}
    if(['file','folder'].includes(mode))command('workspace.createEntry',{parent,name:mode==='file'?sourceFileName(name):name,directory:mode==='folder'});
    else if(mode==='duplicate')command('workspace.duplicateEntry',{path:entry.path,name:sourceFileName(name)});
    else if(mode==='recycle')command('workspace.recycleEntry',{path:entry.path,confirmed:true});
    else command('workspace.moveEntry',{path:entry.path,destination:workspaceJoin(mode==='rename'?workspaceParent(entry.path):destination,mode==='rename'?name:entry.name)});
  }
  function revealActive(){
    setArea('all');
    if(!workspaceContains(activePath,workspace.root))return;setQuery('');setRootOpen(true);revealPath.current=activePath;
    const next={...expanded};let parent=workspaceParent(activePath);
    while(parent&&workspaceContains(parent,workspace.root)&&pathKey(parent)!==pathKey(workspace.root)){next[parent]=true;load(parent);parent=workspaceParent(parent)}setExpanded(next);setSelected({path:activePath});
  }
  const copy=async value=>{try{await navigator.clipboard.writeText(value)}catch{setError('Could not copy the path.')}};
  const openMenu=(event,entry=null,kind='entry')=>{if(entry){setSelected(entry);if(!selection.some(path=>pathKey(path)===pathKey(entry.path))){setSelection([entry.path]);anchor.current=entry.path;}}setMenu({...workspaceContext(event,entry),kind})};
  function startDrag(event,entry){
    if(busy)return event.preventDefault();event.stopPropagation();
    const entries=topLevelWorkspaceEntries(selection.some(path=>pathKey(path)===pathKey(entry.path))?selectedEntries:[entry]);
    if(!entries.length)return event.preventDefault();setSelection(entries.map(item=>item.path));drag.current={root:workspace.root,entries};event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-fbsdb-workspace',JSON.stringify({root:workspace.root,paths:entries.map(item=>item.path)}));
  }
  function over(event,path){if(!drag.current||busy)return;event.preventDefault();event.stopPropagation();const valid=pathKey(drag.current.root)===pathKey(workspace.root)&&canDropWorkspaceEntries(drag.current.entries,path);event.dataTransfer.dropEffect=valid?'move':'none';setDropTarget(valid?path:null);}
  function drop(event,path){event.preventDefault();event.stopPropagation();setDropTarget(null);const current=drag.current;drag.current=null;if(!current||busy||pathKey(current.root)!==pathKey(workspace.root)||!canDropWorkspaceEntries(current.entries,path))return;command('workspace.moveEntries',{paths:current.entries.map(item=>item.path),destination:path});}
  function endDrag(){drag.current=null;setDropTarget(null);}

  function menuItems(){
    if(menu.kind==='empty')return [{label:'Open workspace…',disabled:!isNativeHost,run:onOpenWorkspace},{label:'New workspace…',disabled:!isNativeHost,run:()=>sendNativeCommand('workspace.create')},{label:'Manage workspaces…',run:onManage}];
    if(menu.kind==='switch')return [
      ...(workspace.catalog||[]).map(w=>({id:w.id,label:`${w.pinned?'★ ':''}${w.name}${w.active?' · Active':''}${!w.available?' · Unavailable':''}`,detail:w.path,disabled:w.active||!w.available,run:()=>sendNativeCommand('workspace.openRecent',{path:w.path})})),
      {separator:true},{label:'Open workspace…',run:onOpenWorkspace},{label:'New workspace…',run:()=>sendNativeCommand('workspace.create')},{label:'Manage workspaces…',run:onManage}
    ];
    const multiple=menu.item&&selection.some(path=>pathKey(path)===pathKey(menu.item.path))&&selectedEntries.length>1;
    if(multiple)return [{label:`Move ${selectedEntries.length} items to folder…`,disabled:busy,run:()=>start('move',selectedEntries[0],selectedEntries)},{label:'Copy relative paths',run:()=>copy(selectedEntries.map(item=>item.relativePath).join('\n'))},{separator:true},{label:`Recycle ${selectedEntries.length} items…`,danger:true,disabled:busy,run:()=>start('recycle',selectedEntries[0],selectedEntries)}];
    const entry=menu.item,root=menu.kind==='root',folder=entry?.isDirectory,scope=root?workspace.root:folder?entry.path:null;
    return [
      ...(!entry||folder?[{label:'New Oracle source file…',run:()=>start('file',entry)},{label:'New folder…',run:()=>start('folder',entry)}]:[{label:'Open',run:()=>onOpen(entry)},{label:'Open in new SQL tab',run:()=>onOpen({...entry,newTab:true})},{label:'Duplicate…',run:()=>start('duplicate',entry)}]),
      ...(!entry||folder?[{separator:true},{label:folder?'Find in this folder…':'Find in SQL files…',run:()=>onSearch(scope||workspace.root)},{label:folder?'Replace in this folder…':'Replace in SQL files…',run:()=>onReplace(scope||workspace.root)}]:[]),
      ...(entry?[{separator:true},{label:'Rename…',run:()=>start('rename',entry)},{label:'Move to folder…',run:()=>start('move',entry)}]:[]),
      {separator:true},{label:entry&&!folder?'Show in Windows Explorer':'Open in Windows Explorer',run:()=>command('workspace.reveal',{path:entry?.path||workspace.root})},
      {label:'Copy full path',run:()=>copy(entry?.path||workspace.root)},...(entry?[{label:'Copy relative path',run:()=>copy(entry.relativePath)}]:[]),
      ...(!entry?[{separator:true},{label:'Project rules…',run:onProjectRules},{label:'Worksets…',run:onWorksets},{label:'Select all visible items',disabled:!visiblePaths().length,run:()=>setSelection(visiblePaths())},{label:'Refresh workspace',run:()=>sendNativeCommand('workspace.refresh')},{label:'Collapse all folders',run:()=>setExpanded({})},{label:'Reveal active SQL file',disabled:!workspaceContains(activePath,workspace.root),run:revealActive}]:[]),
      ...(root?[{separator:true},{label:'Workspace properties…',run:onManage},{label:'Switch workspace…',run:onManage},{label:'Close workspace',run:()=>sendNativeCommand('workspace.close')}]:[]),
      ...(menu.kind==='background'?[{separator:true},{label:'Open workspace…',run:onOpenWorkspace},{label:'Switch workspace…',run:onManage},{label:'Manage workspaces…',run:onManage}]:[]),
      ...(entry?[{separator:true},{label:'Move to Recycle Bin…',danger:true,run:()=>start('recycle',entry)}]:[])
    ].map(item=>({...item,disabled:item.disabled||busy||!isNativeHost}));
  }
  function toggle(entry){setSelected(entry);setExpanded(c=>({...c,[entry.path]:!c[entry.path]}))}
  function keyboard(event,entry){
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();setSelection(visiblePaths());return;}
    if(event.key===' '){event.preventDefault();choose(entry,{ctrlKey:true});return;}
    if(workspaceContextKey(event,e=>openMenu(e,entry)))return;
    const rows=[...treeRef.current.querySelectorAll('[role="treeitem"]')],index=rows.indexOf(event.currentTarget);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const row=rows[event.key==='Home'?0:event.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,index+(event.key==='ArrowDown'?1:-1)))];if(row){const target=allEntries.find(item=>pathKey(item.path)===row.dataset.path);if(target){if(!anchor.current)anchor.current=entry.path;if(!event.ctrlKey&&!event.metaKey||event.shiftKey)choose(target,{shiftKey:event.shiftKey,ctrlKey:event.ctrlKey||event.metaKey});}row.focus()}}
    else if(event.key==='ArrowRight'&&entry.isDirectory&&!expanded[entry.path]){event.preventDefault();toggle(entry)}
    else if(event.key==='ArrowLeft'){event.preventDefault();if(entry.isDirectory&&expanded[entry.path])toggle(entry);else rows.find(row=>row.dataset.path===pathKey(workspaceParent(entry.path)))?.focus()}
    else if(event.key==='F2'&&!busy){event.preventDefault();start('rename',entry)}
    else if(event.key==='Delete'&&!busy){event.preventDefault();const entries=selection.some(path=>pathKey(path)===pathKey(entry.path))?selectedEntries:[entry];start('recycle',entry,entries)}
  }
  const fileProfiles=new Map(Object.entries(workspace.fileConnections||{}).map(([path,profile])=>[pathKey(path),profiles.find(item=>item.id?.toLowerCase()===profile.toLowerCase())||(profile?{id:profile,name:profile,env:'UNKNOWN'}:null)]));
  function render(entries,depth=1){return [...entries].sort((a,b)=>Number(b.isDirectory)-Number(a.isDirectory)||a.name.localeCompare(b.name)).map(entry=>{
    const open=Boolean(searchEntries||expanded[entry.path]),current=selection.length?selection.some(path=>pathKey(path)===pathKey(entry.path)):pathKey(selected?.path||activePath)===pathKey(entry.path),nested=searchEntries?searchEntries.filter(item=>pathKey(workspaceParent(item.path))===pathKey(entry.path)):children[pathKey(entry.path)];
    return <div key={entry.path} role="none"><div role="treeitem" aria-label={entry.name} aria-level={depth} aria-expanded={entry.isDirectory?open:undefined} aria-selected={current} tabIndex={0} data-path={pathKey(entry.path)} className={`workspace-tree-row${current?' selected':''}`} style={{paddingLeft:7+depth*12}} onFocus={()=>setSelected(entry)} draggable={!busy} data-drop-target={pathKey(dropTarget)===pathKey(entry.path)||undefined} onDragStart={event=>startDrag(event,entry)} onDragEnd={endDrag} onDragOver={entry.isDirectory?event=>over(event,entry.path):undefined} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget))setDropTarget(null)}} onDrop={entry.isDirectory?event=>drop(event,entry.path):undefined} onClick={event=>{choose(entry,event);if(event.ctrlKey||event.metaKey||event.shiftKey)return;if(entry.isDirectory)toggle(entry);else onOpen(entry,{preview:true})}} onDoubleClick={()=>{if(!entry.isDirectory)onPromote?.(entry)}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();choose(entry);if(entry.isDirectory)toggle(entry);else onOpen(entry)}else keyboard(event,entry)}} onContextMenu={event=>openMenu(event,entry)}>
      {entry.isDirectory?open?<ChevronDown size={12}/>:<ChevronRight size={12}/>:<span className="tree-chevron-spacer"/>}{entry.isDirectory?open?<ThemedIcon slot="FOLDER_OPEN" size={14}><FolderOpen size={14}/></ThemedIcon>:<ThemedIcon slot="FOLDER" size={14}><Folder size={14}/></ThemedIcon>:<ThemedIcon slot="FILE" size={14}><FileCode2 size={14}/></ThemedIcon>}<span className="tree-entry-name">{entry.name}</span>{!entry.isDirectory&&fileProfiles.get(pathKey(entry.path))&&<EnvironmentBadge environment={profileEnvironment(fileProfiles.get(pathKey(entry.path)))} profileName={fileProfiles.get(pathKey(entry.path)).name} saved/>}{git.has(pathKey(entry.path))&&<small className="workspace-git-marker">{git.get(pathKey(entry.path))}</small>}<button className="tree-entry-menu" aria-label={`Actions for ${entry.name}`} onKeyDown={event=>event.stopPropagation()} onClick={event=>openMenu(event,entry)}><MoreHorizontal size={13}/></button>
    </div>{entry.isDirectory&&open&&<div role="group">{nested?nested.length?render(nested,depth+1):<div className="workspace-tree-hint" style={{paddingLeft:31+depth*12}}>Empty folder</div>:<div className="workspace-tree-hint" style={{paddingLeft:31+depth*12}}>Loading…</div>}</div>}</div>
  })}
  return <>
    <div className="workspace-tree-toolbar"><button className="workspace-switcher" aria-label="Switch workspace" aria-haspopup="menu" onClick={e=>openMenu(e,null,'switch')} title={workspace.root||'Open a workspace'}><span>{workspace.root?workspace.name:'No workspace'}</span><ChevronDown size={12}/></button><div>
      <button aria-label="Manage workspaces" title="Manage workspaces" onClick={onManage}><Settings2 size={14}/></button>{!workspace.root&&<button aria-label="Open workspace" title="Open workspace" disabled={!isNativeHost} onClick={onOpenWorkspace}><FolderOpen size={14}/></button>}{workspace.root&&<><button title="New Oracle source file in selected folder" aria-label="New workspace SQL file" disabled={!workspace.root||busy} onClick={()=>start('file')}><FilePlus2 size={14}/></button><button title="New folder" aria-label="New workspace folder" disabled={!workspace.root||busy} onClick={()=>start('folder')}><FolderPlus size={14}/></button><button title="Reveal active SQL file" aria-label="Reveal active SQL file" disabled={!workspaceContains(activePath,workspace.root)} onClick={revealActive}><LocateFixed size={13}/></button><button title="Refresh workspace" aria-label="Refresh workspace" disabled={!workspace.root} onClick={()=>sendNativeCommand('workspace.refresh')}><RefreshCw size={13}/></button><button title="Collapse folders" aria-label="Collapse workspace folders" disabled={!workspace.root} onClick={()=>setExpanded({})}><ChevronsUp size={14}/></button></>}
    </div></div>
    {workspace.root?<><select aria-label="Project area" value={area} onChange={event=>{setArea(event.target.value);setSelection([]);setRootOpen(true)}}><option value="all">All project files</option>{Object.entries(projectOptions(workspace.projectRules).areas).map(([key,path])=><option key={key} value={key}>{key} · {path}</option>)}</select><label className="explorer-search"><input aria-label="Filter workspace SQL files" placeholder="Filter SQL files…" value={query} onChange={e=>setQuery(e.target.value)}/></label><div ref={treeRef} role="tree" aria-label="Workspace files" aria-multiselectable="true" tabIndex={0} className="workspace-tree" onDragOver={event=>{if(event.target===event.currentTarget)over(event,workspace.root)}} onDrop={event=>drop(event,workspace.root)} onContextMenu={e=>openMenu(e,null,'background')} onKeyDown={e=>{if(e.target===e.currentTarget)workspaceContextKey(e,event=>openMenu(event,null,'background'))}}>
      <button className="workspace-tree-root" data-drop-target={pathKey(dropTarget)===pathKey(workspace.root)||undefined} onDragOver={event=>over(event,workspace.root)} onDrop={event=>drop(event,workspace.root)} aria-expanded={rootOpen||Boolean(searchEntries)} onClick={()=>{setSelected(null);setRootOpen(v=>!v)}} onContextMenu={e=>openMenu(e,null,'root')} onKeyDown={e=>workspaceContextKey(e,event=>openMenu(event,null,'root'))} title={workspace.root}>{rootOpen||searchEntries?<ChevronDown size={12}/>:<ChevronRight size={12}/>}<FolderOpen size={14}/><b>{workspace.name}</b></button>
      {(rootOpen||searchEntries)&&(searchEntries?render(searchEntries.filter(e=>!e.relativePath.includes('/'))):render(workspace.entries||[]))}{(rootOpen||searchEntries)&&!(searchEntries||workspace.entries||[]).length&&<div className="explorer-empty">{searchEntries?'No matching SQL files':workspace.error?'Workspace unavailable':'No SQL files yet'}</div>}
    </div></>:<div className="workspace-empty panel-empty-actions" aria-label="Workspace files — no folder open" tabIndex={0} onContextMenu={e=>openMenu(e,null,'empty')} onKeyDown={e=>workspaceContextKey(e,event=>openMenu(event,null,'empty'))}><div className="panel-empty-button-group" role="group" aria-label="Workspace actions"><button type="button" disabled={!isNativeHost} onClick={()=>sendNativeCommand('workspace.create')}>New workspace</button><button type="button" disabled={!isNativeHost} onClick={onOpenWorkspace}>Open workspace</button></div></div>}
    {(error||!dismissedWorkspaceError&&workspace.error)&&!operation&&<Feedback title="Workspace operation failed">{error||workspace.error}</Feedback>}
    {selection.length>1&&<div className="workspace-selection-status" role="status">{selection.length} selected</div>}
    {menu&&<WorkspaceMenu context={menu} items={menuItems()} onClose={()=>setMenu(null)}/>}
    {operation&&<WorkspaceEntryDialog key={`${operation.mode}:${operation.entry?.path||operation.parent}`} operation={operation} associations={workspace.projectRules?.associations} root={workspace.root} busy={busy} error={error} onClose={()=>!busy&&setOperation(null)} onSubmit={submit}/>}
  </>;
}

export function OpenEditors({tabs,activeId,onActivate,onClose}) {
  const [query,setQuery]=useState(''),ref=useRef(null);
  const pathLabels=tabPathLabels(tabs),filtered=filterEditorTabs(tabs,query);
  return <div className="open-editors-vertical" ref={ref} onKeyDown={event=>{
    if(event.key==='Escape'&&query){event.preventDefault();setQuery('');ref.current.querySelector('input').focus();return}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)||event.target.tagName==='INPUT'&&['Home','End'].includes(event.key))return;
    const items=[...ref.current.querySelectorAll('.open-editor-item')],at=items.indexOf(document.activeElement);event.preventDefault();
    items[event.key==='Home'?0:event.key==='End'?items.length-1:at<0?(event.key==='ArrowUp'?items.length-1:0):(at+(event.key==='ArrowDown'?1:items.length-1))%items.length]?.focus();
  }}><label className="open-editors-filter"><input aria-label="Filter vertical editor tabs" placeholder="File, path or connection…" value={query} onChange={event=>setQuery(event.target.value)}/></label><div className="open-editors-list">{filtered.map(tab=><div key={tab.id} className={`open-editor-row${tab.id===activeId?' selected':''}`}><button className="open-editor-item" title={tab.path||'Unsaved SQL draft'} aria-current={tab.id===activeId?'page':undefined} onClick={()=>onActivate(tab.id)}><FileCode2 size={14}/><span>{tab.name}</span>{pathLabels.has(tab.id)&&<small className="open-editor-path">{pathLabels.get(tab.id)}</small>}{tab.dirty&&<span className="dirty-dot" aria-label="Unsaved changes"/>}{tab.readOnly&&<small>read-only</small>}</button><button className="open-editor-close" title={`Close ${tab.name}`} aria-label={`Close editor ${tab.name}`} onClick={()=>onClose(tab.id)}><X size={12}/></button></div>)}{!filtered.length&&<p className="menu-search-hint">No matching editors</p>}</div></div>;
}

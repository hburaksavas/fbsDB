import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { isNativeHost, sendNativeCommand } from './nativeBridge';
import {translate as t} from './localeProfile';

export function FileMenu({ workspace, onNew, onOpen, onSave, onOpenWorkspace, onManageWorkspaces, children,connectionControl,language='en' }) {
  const [open, setOpen] = useState(false), root = useRef(null), trigger = useRef(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = event => {
      if (event.type === 'keydown') { if (event.key !== 'Escape') return; event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
      else if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', dismiss, true);
    root.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss, true); };
  }, [open]);
  const run = action => { setOpen(false); action(); };
  return <nav className="ide-menubar" aria-label="Application menu"><div className="ide-file-menu" ref={root}>
    <button ref={trigger} className={open ? 'active' : ''} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>{t('File',language)}</button>
    {open && <div role="menu" aria-label="File" className="ide-file-popover" onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const items = [...root.current.querySelectorAll('[role="menuitem"]:not(:disabled)')], index = items.indexOf(document.activeElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    }}>
      <button role="menuitem" onClick={() => run(onNew)}>{t('New SQL File',language)}<kbd>Ctrl+N</kbd></button>
      <button role="menuitem" onClick={() => run(onOpen)}>{t('Open SQL File…',language)}<kbd>Ctrl+Shift+O</kbd></button>
      <button role="menuitem" onClick={() => run(onSave)}>{t('Save SQL File',language)}<kbd>Ctrl+S</kbd></button><hr/>
      <button role="menuitem" disabled={!isNativeHost} onClick={() => run(onOpenWorkspace)}>{t('Open workspace…',language)}</button>
      <button role="menuitem" disabled={!isNativeHost} onClick={() => run(() => sendNativeCommand('workspace.create'))}>{t('New Workspace Folder…',language)}</button>
      <button role="menuitem" onClick={()=>run(onManageWorkspaces)}>Manage workspaces…</button>
      <div className="recent-workspaces-label">{t('Recent Workspaces',language)}<ChevronRight size={11}/></div>
      {(workspace.catalog || (workspace.recent||[]).map(path=>({id:path,path,name:path.split(/[\\/]/).filter(Boolean).at(-1),available:true}))).slice(0,10).map(item => <button key={item.id} role="menuitem" className="recent-workspace-item" title={item.path} disabled={!item.available||item.active} onClick={() => run(() => sendNativeCommand('workspace.openRecent', { path:item.path }))}><span>{item.pinned?'★ ':''}{item.name}{!item.available?' · Unavailable':''}</span><small>{item.path}</small></button>)}
      {!workspace.recent?.length && <div className="recent-workspaces-empty">{t('No recent workspaces',language)}</div>}
      <hr/><button role="menuitem" disabled={!workspace.root || !isNativeHost} onClick={() => run(() => sendNativeCommand('workspace.close'))}>{t('Close Workspace',language)}</button>
    </div>}
  </div>{children}{connectionControl&&<div className="ide-menubar-center">{connectionControl}</div>}</nav>;
}

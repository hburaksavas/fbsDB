import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileCode2, FilePlus2, Folder, FolderOpen, FolderPlus, MoreHorizontal, RefreshCw, ChevronsUp, X } from 'lucide-react';
import { isNativeHost, sendNativeCommand, subscribeNativeMessages } from './nativeBridge';
import { ModalBackdrop } from './ModalBackdrop';
import { useDialogFocus } from './ConnectionManager';
import { filteredWorkspaceTree, pathKey, remapWorkspacePath } from './workspaceTree';

function EntryDialog({ operation, onClose, onSubmit, busy, error }) {
  const [name, setName] = useState(operation.mode === 'rename' ? operation.entry.name : operation.mode === 'move' ? operation.entry.relativePath : '');
  const ref = useRef(null); useDialogFocus(ref, onClose);
  const title = { file: 'New SQL file', folder: 'New folder', rename: 'Rename', move: 'Move to workspace path' }[operation.mode];
  return <ModalBackdrop onClose={onClose} onMouseDown={event => event.target === event.currentTarget && onClose()}><section ref={ref} className="appearance-modal workspace-entry-dialog" role="dialog" aria-modal="true" aria-label={title}>
    <header className="appearance-header"><h2>{title}</h2><button className="icon-button" aria-label="Close" onClick={onClose}><X size={16}/></button></header>
    <form onSubmit={event => { event.preventDefault(); onSubmit(name); }}><label>{operation.mode === 'move' ? 'Destination path, relative to workspace' : 'Name'}<input aria-label={operation.mode === 'move' ? 'Destination path' : 'Name'} value={name} placeholder={operation.mode === 'file' ? 'query.sql' : operation.mode === 'folder' ? 'queries' : ''} onChange={event => setName(event.target.value)} disabled={busy} required/></label>
      <p className="workspace-operation-path">{operation.entry?.relativePath || operation.parent}</p>{error && <p role="alert" className="auth-error">{error}</p>}
      <footer className="appearance-footer"><button type="button" onClick={onClose}>Cancel</button><button className="run-button" disabled={busy || !name.trim()}>{busy ? 'Working…' : title}</button></footer>
    </form></section></ModalBackdrop>;
}

export function WorkspaceExplorer({ workspace, activePath, onOpen, onOpenWorkspace, gitFiles = [], expandedPaths, onExpandedChange }) {
  const [query, setQuery] = useState(''), [children, setChildren] = useState({}), [selected, setSelected] = useState(null);
  const [localExpanded, setLocalExpanded] = useState({});
  const expanded = expandedPaths ?? localExpanded;
  const expandedSignature = JSON.stringify(expanded);
  const setExpanded = next => onExpandedChange ? onExpandedChange(next) : setLocalExpanded(next);
  const [rootOpen, setRootOpen] = useState(true), [menu, setMenu] = useState(null), [operation, setOperation] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(new Map()), mutation = useRef(null), rootRef = useRef(workspace.root), treeRef = useRef(null), menuRef = useRef(null);
  rootRef.current = workspace.root;
  useEffect(() => { const reset = () => { setExpanded({}); setRootOpen(true); }; window.addEventListener('fbsdb.explorer.reset', reset); return () => window.removeEventListener('fbsdb.explorer.reset', reset); }, []);
  const load = path => { if (isNativeHost) pending.current.set(sendNativeCommand('workspace.children', { path }), path); };
  useEffect(() => {
    setChildren({}); setSelected(null); setQuery(''); setRootOpen(true); setMenu(null); setOperation(null); setBusy(false); setError(''); pending.current.clear();
  }, [workspace.root]);
  useEffect(() => {
    for (const path of Object.keys(expanded)) if (expanded[path] && pathKey(path).startsWith(`${pathKey(workspace.root)}/`)) load(path);
  }, [workspace.entries, expandedSignature]);
  useEffect(() => subscribeNativeMessages(message => {
    if (message.type === 'workspace.children' && pending.current.has(message.requestId)) {
      pending.current.delete(message.requestId);
      if (pathKey(message.root) === pathKey(rootRef.current)) setChildren(current => ({ ...current, [pathKey(message.path)]: message.entries || [] }));
    } else if (message.type === 'workspace.changed') {
      if (message.source) {
        setExpanded(current => Object.fromEntries(Object.entries(current).map(([path, value]) => [remapWorkspacePath(path, message.source, message.destination), value])));
        setChildren({});
      }
      if (message.requestId === mutation.current) { mutation.current = null; setBusy(false); setOperation(null); setError(''); setSelected(message.entry || null); }
    } else if (message.type === 'workspace.error') {
      if (message.requestId === mutation.current) { mutation.current = null; setBusy(false); setError(message.message); }
      else if (pending.current.has(message.requestId)) { const path = pending.current.get(message.requestId); pending.current.delete(message.requestId); setExpanded(current => { const next = { ...current }; delete next[path]; return next; }); setError(message.message); }
      else setError(message.message);
    }
  }), [expandedSignature]);
  useEffect(() => {
    if (!menu) return;
    const close = event => { if (event.type === 'keydown' && event.key !== 'Escape') return; if (event.type === 'pointerdown' && menuRef.current?.contains(event.target)) return; setMenu(null); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', close);
    menuRef.current?.querySelector('button')?.focus();
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [menu]);
  const searchEntries = useMemo(() => query.trim() ? filteredWorkspaceTree(workspace.files, query.trim()) : null, [workspace.files, query]);
  const git = useMemo(() => new Map(gitFiles.map(file => [pathKey(file.path), file.status])), [gitFiles]);
  const parentPath = selected ? selected.isDirectory ? selected.path : selected.path.replace(/[\\/][^\\/]+$/, '') : workspace.root;
  const start = (mode, entry = selected) => { setMenu(null); setError(''); setOperation({ mode, entry, parent: entry ? entry.isDirectory ? entry.path : entry.path.replace(/[\\/][^\\/]+$/, '') : workspace.root }); };
  function submit(value) {
    let command, payload;
    if (['file', 'folder'].includes(operation.mode)) { command = 'workspace.createEntry'; payload = { parent: operation.parent, name: operation.mode === 'file' && !value.toLowerCase().endsWith('.sql') ? `${value}.sql` : value, directory: operation.mode === 'folder' }; }
    else {
      command = 'workspace.moveEntry';
      const separator = workspace.root.includes('\\') ? '\\' : '/';
      const destination = operation.mode === 'rename' ? operation.entry.path.replace(/[^\\/]+$/, '') + value : workspace.root.replace(/[\\/]$/, '') + separator + value.replace(/[\\/]/g, separator);
      payload = { path: operation.entry.path, destination };
    }
    mutation.current = sendNativeCommand(command, payload); setBusy(true);
  }
  function toggle(entry) { setSelected(entry); setExpanded(current => ({ ...current, [entry.path]: !current[entry.path] })); }
  function keyboard(event, entry) {
    const rows = [...treeRef.current.querySelectorAll('[role="treeitem"]')], index = rows.indexOf(event.currentTarget);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') { event.preventDefault(); rows[event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus(); }
    else if (event.key === 'ArrowRight' && entry.isDirectory && !expanded[entry.path]) { event.preventDefault(); toggle(entry); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); if (entry.isDirectory && expanded[entry.path]) toggle(entry); else { const parent = pathKey(entry.path.replace(/[\\/][^\\/]+$/, '')); rows.find(row => row.dataset.path === parent)?.focus(); } }
    else if (event.key === 'F2') { event.preventDefault(); start('rename', entry); }
  }
  function render(entries, depth = 1) {
    return [...entries].sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name)).map(entry => {
      const open = Boolean(searchEntries || expanded[entry.path]), current = pathKey(selected?.path || activePath) === pathKey(entry.path);
      const nested = searchEntries ? searchEntries.filter(item => pathKey(item.path.replace(/[\\/][^\\/]+$/, '')) === pathKey(entry.path)) : children[pathKey(entry.path)];
      return <div key={entry.path} role="none"><div role="treeitem" aria-label={entry.name} aria-level={depth} aria-expanded={entry.isDirectory ? open : undefined} aria-selected={current} tabIndex={0} data-path={pathKey(entry.path)}
        className={`workspace-tree-row${current ? ' selected' : ''}`} style={{ paddingLeft: 7 + depth * 12 }} onFocus={() => setSelected(entry)}
        onClick={() => { setSelected(entry); if (entry.isDirectory) toggle(entry); else onOpen(entry); }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (entry.isDirectory) toggle(entry); else onOpen(entry); } else keyboard(event, entry); }}
        onContextMenu={event => { event.preventDefault(); setSelected(entry); setMenu({ entry, x: Math.min(event.clientX, window.innerWidth - 180), y: Math.min(event.clientY, window.innerHeight - 180) }); }}>
        {entry.isDirectory ? open ? <ChevronDown size={12}/> : <ChevronRight size={12}/> : <span className="tree-chevron-spacer"/>}
        {entry.isDirectory ? open ? <FolderOpen size={14}/> : <Folder size={14}/> : <FileCode2 size={14}/>}
        <span className="tree-entry-name">{entry.name}</span>{git.has(pathKey(entry.path)) && <small className="workspace-git-marker">{git.get(pathKey(entry.path))}</small>}
        <button className="tree-entry-menu" aria-label={`Actions for ${entry.name}`} onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setMenu({ entry, x: Math.min(rect.left, window.innerWidth - 180), y: Math.min(rect.bottom, window.innerHeight - 180) }); }}><MoreHorizontal size={13}/></button>
      </div>{entry.isDirectory && open && <div role="group">{nested ? nested.length ? render(nested, depth + 1) : <div className="workspace-tree-hint" style={{ paddingLeft: 31 + depth * 12 }}>Empty folder</div> : <div className="workspace-tree-hint" style={{ paddingLeft: 31 + depth * 12 }}>Loading…</div>}</div>}</div>;
    });
  }
  return <>
    <div className="workspace-tree-toolbar"><span title={workspace.root || undefined}>{workspace.root ? 'SQL workspace' : 'No folder opened'}</span><div>
      <button title="New SQL file in selected folder" aria-label="New workspace SQL file" disabled={!workspace.root || busy} onClick={() => start('file')}><FilePlus2 size={14}/></button>
      <button title="New folder" aria-label="New workspace folder" disabled={!workspace.root || busy} onClick={() => start('folder')}><FolderPlus size={14}/></button>
      <button title="Refresh workspace" aria-label="Refresh workspace" disabled={!workspace.root} onClick={() => sendNativeCommand('workspace.refresh')}><RefreshCw size={13}/></button>
      <button title="Collapse folders" aria-label="Collapse workspace folders" disabled={!workspace.root} onClick={() => setExpanded({})}><ChevronsUp size={14}/></button>
    </div></div>
    {workspace.root ? <><label className="explorer-search"><input aria-label="Filter workspace SQL files" placeholder="Filter SQL files…" value={query} onChange={event => setQuery(event.target.value)}/></label>
      <div ref={treeRef} role="tree" aria-label="Workspace files" className="workspace-tree"><button className="workspace-tree-root" aria-expanded={rootOpen || Boolean(searchEntries)} onClick={() => { setSelected(null); setRootOpen(value => !value); }} title={workspace.root}>{rootOpen || searchEntries ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}<FolderOpen size={14}/><b>{workspace.name}</b></button>
        {(rootOpen || searchEntries) && (searchEntries ? render(searchEntries.filter(entry => !entry.relativePath.includes('/'))) : render(workspace.entries || []))}
        {(rootOpen || searchEntries) && !(searchEntries || workspace.entries || []).length && <div className="explorer-empty">{searchEntries ? 'No matching SQL files' : 'No SQL files yet'}</div>}
      </div></> : <div className="workspace-welcome"><FolderOpen size={24}/><p>Open a folder to browse your SQL project.</p><button disabled={!isNativeHost} onClick={onOpenWorkspace}>Open Folder</button><small>SQL tabs work without a workspace.</small></div>}
    {error && !operation && <div className="oracle-explorer-error explorer-dismissable-error" role="alert"><span>{error}</span><button aria-label="Dismiss workspace error" onClick={() => setError('')}><X size={12}/></button></div>}
    {menu && <div ref={menuRef} className="workspace-context-menu" role="menu" style={{ left: menu.x, top: menu.y }} onKeyDown={event => { const buttons = [...menuRef.current.querySelectorAll('button')]; const index = buttons.indexOf(document.activeElement); if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus(); } }}>
      {menu.entry.isDirectory && <><button role="menuitem" onClick={() => start('file', menu.entry)}>New SQL file</button><button role="menuitem" onClick={() => start('folder', menu.entry)}>New folder</button></>}
      <button role="menuitem" disabled={busy} onClick={() => start('rename', menu.entry)}>Rename</button><button role="menuitem" disabled={busy} onClick={() => start('move', menu.entry)}>Move…</button>
    </div>}
    {operation && <EntryDialog key={`${operation.mode}:${operation.entry?.path || parentPath}`} operation={operation} busy={busy} error={error} onClose={() => setOperation(null)} onSubmit={submit}/>}
  </>;
}

export function OpenEditors({ tabs, activeId, onActivate, onClose }) {
  return <div className="open-editors-list">{tabs.map(tab => <div key={tab.id} className={`open-editor-row${tab.id === activeId ? ' selected' : ''}`}>
    <button className="open-editor-item" title={tab.path || 'Unsaved SQL draft'} aria-current={tab.id === activeId ? 'page' : undefined} onClick={() => onActivate(tab.id)}><FileCode2 size={14}/><span>{tab.name}</span>{tab.dirty && <span className="dirty-dot" aria-label="Unsaved changes"/>}{tab.readOnly && <small>read-only</small>}</button>
    <button className="open-editor-close" title={`Close ${tab.name}`} aria-label={`Close editor ${tab.name}`} onClick={() => onClose(tab.id)}><X size={12}/></button>
  </div>)}</div>;
}

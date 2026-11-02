import {TabPreview} from './TabPreview.jsx';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { addToGroup, arrangeTabs, createGroup, groupOf, loadTabGroups, pruneGroups, removeFromGroups, renameGroup, saveTabGroups, toggleCollapsed, ungroup } from './tabGroups';
import { AlertCircle, Check, ChevronDown, ChevronLeft, ChevronRight, Database, FileCode2, Plus, X } from 'lucide-react';
import { filterEditorTabs } from './workbenchUx';
import {packageTabViews, packageViewIds} from './packageTabViews';
import {tabPathLabels} from './tabPathLabels';
import {EnvironmentBadge,TabConnectionBadge} from './ExecutionContextBadges';
import {NewQuerySplitButton} from './NewQuerySplitButton.jsx';
import {pruneSelection,selectTabs,selectionMenuItems} from './tabSelection';

export function EditorTabs({ tabs, activeId, onActivate, onPromote, onPromoteScratch, onClose, onCloseMany, onNew, newOptions = null, children, packageGroups = [] }) {
  const allViews = packageTabViews(tabs, activeId, packageGroups);
  const pathLabels=tabPathLabels(allViews);
  const [groups, setGroups] = useState(() => loadTabGroups(typeof localStorage === 'undefined' ? null : localStorage));
  const [renaming, setRenaming] = useState(null);
  const viewById = new Map(allViews.map(view => [view.id, view]));
  const arranged = arrangeTabs(allViews.map(view => view.id), groups, activeId);
  const views = arranged.filter(item => item.id != null).map(item => viewById.get(item.id));
  const arrangedById = new Map(arranged.filter(item => item.id != null).map(item => [item.id, item]));
  const allIds = allViews.map(view => view.id).join('|');
  useEffect(() => { if (allViews.length) setGroups(current => pruneGroups(current, allViews.map(view => view.id))); }, [allIds]);
  useEffect(() => { saveTabGroups(typeof localStorage === 'undefined' ? null : localStorage, groups); }, [groups]);
  const startRename = group => setRenaming({ id: group.id, value: group.name, error: '' });
  const commitRename = () => setRenaming(current => { if (!current) return current; const result = renameGroup(groups, current.id, current.value); if (result.error) return { ...current, error: result.error }; setGroups(result.groups); return null; });
  const groupAction = (kind, ids, groupId) => {
    if (kind === 'new') {
      let n = groups.length + 1; while (groups.some(group => group.name.toLowerCase() === `group ${n}`)) n++;
      const created = createGroup(groups, ids, { name: `Group ${n}` });
      if (created.error) return;
      setGroups(created.groups); setRenaming({ id: created.id, value: `Group ${n}`, error: '' });
    } else if (kind === 'add') setGroups(current => addToGroup(current, groupId, ids));
    else if (kind === 'remove') setGroups(current => removeFromGroups(current, ids));
    else if (kind === 'ungroup') setGroups(current => ungroup(current, groupId));
    else if (kind === 'rename') { const group = groups.find(item => item.id === groupId); if (group) startRename(group); }
    setSelection({ selected: [], anchor: null });
  };
  const chip = item => {
    const group = item.group, editing = renaming?.id === group.id, size = group.members.length;
    return <div key={`chip-${group.id}`} className="tab-group-chip" data-group-color={group.color} data-tab-group-chip={group.id} role="group" aria-label={`Tab group ${group.name}`}>
      {editing
        ? <span className="tab-group-edit"><input autoFocus aria-label="Group name" aria-invalid={Boolean(renaming.error) || undefined} value={renaming.value} onChange={event => setRenaming({ ...renaming, value: event.target.value, error: '' })} onFocus={event => event.target.select()} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); commitRename(); } if (event.key === 'Escape') { event.preventDefault(); setRenaming(null); } }} onBlur={() => setRenaming(null)}/>{renaming.error && <small role="alert">{renaming.error}</small>}</span>
        : <button type="button" className="tab-group-toggle" aria-expanded={!group.collapsed} title={`${group.name}: ${size} tab${size === 1 ? '' : 's'}. Click to ${group.collapsed ? 'expand' : 'collapse'}, F2 or double-click to rename`} onClick={() => setGroups(current => toggleCollapsed(current, group.id))} onDoubleClick={() => startRename(group)} onKeyDown={event => { if (event.key === 'F2') { event.preventDefault(); startRename(group); } }}>{group.collapsed ? <ChevronRight size={11}/> : <ChevronDown size={11}/>}<span>{group.name}</span><small>{size}</small></button>}
    </div>;
  };
  const [context, setContext] = useState(null);
  const [selection, setSelection] = useState({ selected: [], anchor: null });
  const viewOrder = views.map(view => view.id);
  useEffect(() => { setSelection(current => { const kept = pruneSelection(viewOrder, current.selected); return kept.length === current.selected.length ? current : { selected: kept, anchor: current.anchor }; }); }, [viewOrder.join('|')]);
  const [preview,setPreview]=useState(null),previewTimer=useRef(null);
  const clearPreview=()=>{clearTimeout(previewTimer.current);setPreview(null)};
  useEffect(()=>()=>clearTimeout(previewTimer.current),[]);
  useEffect(()=>{clearPreview()},[activeId,context]);
  useEffect(()=>{const hide=event=>{if(event.type!=='keydown'||event.key==='Escape')clearPreview()};window.addEventListener('resize',hide);window.addEventListener('keydown',hide,true);return()=>{window.removeEventListener('resize',hide);window.removeEventListener('keydown',hide,true)}},[]);

  useEffect(()=>{
    if(!context)return;const element=root.current.querySelector('[aria-label="Tab actions"]'),r=element.getBoundingClientRect();element.style.left=`${Math.max(6,Math.min(context.x,innerWidth-r.width-6))}px`;element.style.top=`${Math.max(6,Math.min(context.y,innerHeight-r.height-6))}px`;element.querySelector('button:not(:disabled)')?.focus();
    const dismiss=event=>{if(event.type==='pointerdown'){if(!element.contains(event.target))setContext(null);return}if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();setContext(null);tabElements.current.get(context.id)?.querySelector('[role=tab]')?.focus();return}if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();const buttons=[...element.querySelectorAll('button:not(:disabled)')],at=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus()}};
    document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',dismiss,true);return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',dismiss,true)};
  },[context]);
  const track = useRef(null), root = useRef(null), menu = useRef(null), menuButton = useRef(null), tabElements = useRef(new Map()), active = useRef(activeId);
  active.current = activeId;
  const sizingKey = views.map(tab => `${tab.id}:${tab.name}:${pathLabels.get(tab.id)||''}:${tab.connection?.short||''}:${tab.connection?.environment||''}:${tab.sourceEdited ? 1 : 0}:${tab.queryFailed ? 1 : 0}:${tab.dirty ? 1 : 0}`).join('|');
  const [overflow, setOverflow] = useState({ present: false, left: false, right: false }), [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filteredTabs = filterEditorTabs(tabs, query);
  function measure() {
    const element = track.current; if (!element) return;
    const next = { present: element.scrollWidth > element.clientWidth + 1, left: element.scrollLeft > 1, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 };
    setOverflow(current => current.present === next.present && current.left === next.left && current.right === next.right ? current : next);
  }
  function revealActive() {
    const element = tabElements.current.get(active.current), viewport = track.current;
    if (!element || !viewport || !viewport.clientWidth) return;
    const tab = element.getBoundingClientRect(), visible = viewport.getBoundingClientRect();
    if (tab.left < visible.left) viewport.scrollLeft += tab.left - visible.left;
    else if (tab.right > visible.right) viewport.scrollLeft += tab.right - visible.right;
  }
  useLayoutEffect(() => { revealActive(); measure(); }, [activeId, sizingKey]);
  useEffect(() => {
    const element = track.current; if (!element) return;
    const wheel = event => { if (element.scrollWidth <= element.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return; event.preventDefault(); element.scrollLeft += event.deltaY; };
    const resize = () => { revealActive(); measure(); };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(element); element.addEventListener('wheel', wheel, { passive: false });
    return () => { observer?.disconnect(); element.removeEventListener('wheel', wheel); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const dismiss = event => {
      if (event.type === 'keydown') { if (event.key !== 'Escape' || document.querySelector('.modal-backdrop')) return; event.preventDefault(); event.stopImmediatePropagation(); setOpen(false); menuButton.current?.focus(); }
      else if (!menu.current?.contains(event.target) && !menuButton.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', dismiss, true);
    const available = root.current.closest('.editor-workspace')?.getBoundingClientRect().bottom - root.current.getBoundingClientRect().bottom - 8;
    if (menu.current && Number.isFinite(available)) menu.current.style.maxHeight = `${Math.max(60, Math.min(360, available))}px`;
    setQuery(''); menu.current?.querySelector('input')?.focus({ preventScroll: true });
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss, true); };
  }, [open]);
  function navigate(event, index) {
    if(event.altKey&&event.key==='ArrowDown'){event.preventDefault();const anchor=event.currentTarget;clearTimeout(previewTimer.current);setPreview({id:views[index].id,anchor});return;}
    if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){event.preventDefault();const r=event.currentTarget.getBoundingClientRect();setOpen(false);setContext({id:views[index].id,x:r.left,y:r.bottom});return;}
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : views.length - 1)) % views.length;
    onActivate(views[next].id); requestAnimationFrame(() => tabElements.current.get(views[next].id)?.querySelector('[role="tab"]')?.focus());
  }
  const actionViews = context?.individual ? tabs : views;
  return <div ref={root} className="editor-tabs compact-editor-tabs" onDoubleClick={event => { if (event.target === root.current || event.target === track.current) { event.preventDefault(); onNew(); } }}>
    {preview&&views.find(tab=>tab.id===preview.id)&&preview.anchor.isConnected&&<TabPreview tab={views.find(tab=>tab.id===preview.id)} anchor={preview.anchor} theme={root.current?.closest('[data-theme]')?.dataset.theme||'default'}/>}
    {context && <div role="menu" aria-label="Tab actions" className="editor-tabs-menu" style={{position:'fixed',left:context.x,top:context.y,right:'auto',width:190}} onPointerDown={event=>event.stopPropagation()}>{[...(views.find(view=>view.id===context.id)?.isScratch?[['Promote to project file…',[]]]:[]),...(selection.selected.includes(context.id)?selectionMenuItems(selection.selected,id=>packageViewIds(actionViews.find(view=>view.id===id)||{id})).map(item=>[item.label,item.ids]):[]),['Close',packageViewIds(actionViews.find(view=>view.id===context.id)||{id:context.id})],['Close Others',actionViews.filter(view=>view.id!==context.id).flatMap(packageViewIds)],['Close Left',actionViews.slice(0,actionViews.findIndex(view=>view.id===context.id)).flatMap(packageViewIds)],['Close Right',actionViews.slice(actionViews.findIndex(view=>view.id===context.id)+1).flatMap(packageViewIds)],['Close All',tabs.map(t=>t.id)]].map(([label,ids])=><button type="button" role="menuitem" key={label} disabled={!ids.length&&label!=='Promote to project file…'} onClick={()=>{const id=context.id;setContext(null); if(label==='Promote to project file…'){onPromoteScratch?.(id);return}if(onCloseMany)onCloseMany([...ids]);else ids.forEach(id=>onClose(id));}}>{label}</button>)}{(() => { const targets = selection.selected.includes(context.id) ? selection.selected : [context.id], current = groupOf(groups, context.id); const act = (kind, groupId) => () => { setContext(null); groupAction(kind, targets, groupId); }; return <><div role="separator" className="editor-tabs-menu-separator"/><button type="button" role="menuitem" onClick={act('new')}>{targets.length > 1 ? `Group ${targets.length} tabs…` : 'Add to new group'}</button>{groups.filter(group => group.id !== current?.id).map(group => <button type="button" role="menuitem" key={group.id} title={`Add to group ${group.name}`} onClick={act('add', group.id)}>{`Add to “${group.name}”`}</button>)}{targets.some(id => groupOf(groups, id)) && <button type="button" role="menuitem" onClick={act('remove')}>Remove from group</button>}{current && <><button type="button" role="menuitem" onClick={act('rename', current.id)}>Rename group</button><button type="button" role="menuitem" onClick={act('ungroup', current.id)}>Ungroup</button></>}</>; })()}</div>}
    <div ref={track} className="editor-tabs-track" role="tablist" aria-label="Editor tabs" onScroll={()=>{measure();clearPreview()}} onKeyDown={event=>{if(event.key==='Escape'&&selection.selected.length)setSelection({selected:[],anchor:null})}} onContextMenu={event=>{const tab=event.target.closest('[data-editor-tab]');if(!tab)return;event.preventDefault();setOpen(false);setContext({id:tab.dataset.editorTab,x:Math.min(event.clientX,innerWidth-170),y:Math.min(event.clientY,innerHeight-170)});}}>
      {arranged.map(item => { if (item.id == null) return chip(item); const tab = viewById.get(item.id), index = views.indexOf(tab); return <Fragment key={tab.viewId || tab.id}>{item.first && chip(item)}<div data-tab-group={item.group?.id || undefined} data-group-color={item.group?.color || undefined} ref={element => { if (element) tabElements.current.set(tab.id, element); else tabElements.current.delete(tab.id); }} className={`file-tab${tab.id === activeId ? ' active' : ''}${selection.selected.includes(tab.id) ? ' multi-selected' : ''}${tab.preview ? ' preview' : ''}${tab.isScratch ? ' scratch' : ''}`} data-preview={tab.preview || undefined} data-scratch={tab.isScratch || undefined} data-multi-selected={selection.selected.includes(tab.id) || undefined} data-editor-tab={tab.id} data-env={tab.connection?.environment} data-dirty={tab.dirty||undefined} role="presentation">
        <button type="button" className="file-tab-select" role="tab" aria-selected={tab.id === activeId} tabIndex={tab.id === activeId ? 0 : -1} aria-label={`${tab.name}${pathLabels.has(tab.id)?', '+pathLabels.get(tab.id):''}${tab.dirty ? ', unsaved' : ''}${tab.queryFailed ? ', query failed' : ''}${tab.sourceEdited?', edited since execution':''}${tab.packageMembers?', package specification and body':''}${selection.selected.includes(tab.id)?', selected':''}${tab.preview?', preview (opens in place of the next preview; edit or double-click to keep)':''}${tab.isScratch?', scratch file, not part of the project':''}${tab.connection?', '+tab.connection.text:''}`} title={`${tab.path || tab.name} · Alt+Down for source preview`} onMouseEnter={event=>{const anchor=event.currentTarget;clearTimeout(previewTimer.current);previewTimer.current=setTimeout(()=>setPreview({id:tab.id,anchor}),400)}} onMouseLeave={clearPreview} onBlur={clearPreview} onDoubleClick={() => { if (tab.preview) onPromote?.(tab.id); }} onClick={event => {clearPreview();if(event.ctrlKey||event.metaKey||event.shiftKey){setSelection(selectTabs({order:viewOrder,...selection,active:activeId},tab.id,{ctrl:event.ctrlKey||event.metaKey,shift:event.shiftKey}));return}setSelection({selected:[],anchor:tab.id});if(tab.id !== activeId)onActivate(tab.id)}} onKeyDown={event => navigate(event, index)}>
          {tab.kind === 'object' ? <Database size={12}/> : <FileCode2 size={12}/>}<span className="file-tab-name">{tab.name}</span>{tab.dirty&&<span className="dirty-dot" aria-hidden="true"/>}{pathLabels.has(tab.id)&&<small className="file-tab-path" title={tab.path||'Independent editor view'}>{pathLabels.get(tab.id)}</small>}
          <span className="file-tab-status"><EnvironmentBadge compact environment={tab.connection?.environment} profileName={tab.connection?.profileName}/><TabConnectionBadge connection={tab.connection} otherPending={tab.packageMembers?.some(member=>member.id!==tab.id&&member.connection?.pending)}/>{tab.queryFailed&&<span className="file-tab-error" title="Last query failed" aria-hidden="true"><AlertCircle size={11}/></span>}</span>
        </button>
        <button type="button" className="file-tab-close" tabIndex={tab.id === activeId ? 0 : -1} title={tab.packageMembers?'Close both package sources':`Close ${tab.name}`} aria-label={tab.packageMembers?'Close both package sources':`Close ${tab.name}`} onClick={() => {const ids=packageViewIds(tab);if(onCloseMany)onCloseMany(ids);else ids.forEach(onClose)}}><X size={11}/></button>
      </div></Fragment>; })}
    </div>
    <div className="editor-tabs-actions">
      {overflow.present && <><button type="button" className="editor-tab-action" aria-label="Scroll tabs left" title="Scroll tabs left" disabled={!overflow.left} onClick={() => track.current?.scrollBy({ left: -track.current.clientWidth * .7 })}><ChevronLeft size={13}/></button><button type="button" className="editor-tab-action" aria-label="Scroll tabs right" title="Scroll tabs right" disabled={!overflow.right} onClick={() => track.current?.scrollBy({ left: track.current.clientWidth * .7 })}><ChevronRight size={13}/></button></>}
      <button type="button" className="editor-tab-action" ref={menuButton} title={`Open editors (${tabs.length})`} aria-label={`Open editors (${tabs.length})`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(current => !current)}><ChevronDown size={13}/></button>
      {newOptions?<NewQuerySplitButton {...newOptions} onNew={onNew}/>:<button type="button" className="editor-tab-action add-tab" title="New SQL file (Ctrl+N)" aria-label="New SQL file" onClick={onNew}><Plus size={14}/></button>}
      {children}
    </div>
    {open && <div className="editor-tabs-menu" ref={menu} role="menu" aria-label="Open editors" onKeyDown={event => {
      if(event.key==='Tab'){setOpen(false);menuButton.current?.focus();return;}
      if(event.key==='Enter'&&event.target.tagName==='INPUT'){event.preventDefault();const first=menu.current.querySelector('[role="menuitem"]');first?.click();return;}
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || event.target.tagName==='INPUT'&&['Home','End'].includes(event.key)) return;
      event.preventDefault(); const buttons = [...menu.current.querySelectorAll('[role="menuitem"]')], index = buttons.indexOf(document.activeElement), next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index<0 ? (event.key==='ArrowUp'?buttons.length-1:0) : (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length;
      buttons[next]?.focus(); buttons[next]?.scrollIntoView({ block: 'nearest' });
    }}><label className="editor-tabs-search"><input aria-label="Search open editors" placeholder="File, object or connection…" value={query} onChange={event=>setQuery(event.target.value)}/></label>{filteredTabs.map(tab => <button key={tab.id} type="button" role="menuitem" onContextMenu={event=>{event.preventDefault();const r=event.currentTarget.getBoundingClientRect();setOpen(false);setContext({individual:true,id:tab.id,x:Math.max(6,Math.min(event.clientX||r.left,innerWidth-170)),y:Math.max(6,Math.min(event.clientY||r.bottom,innerHeight-170))})}} onKeyDown={event=>{if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){event.preventDefault();const r=event.currentTarget.getBoundingClientRect();setOpen(false);setContext({individual:true,id:tab.id,x:Math.max(6,r.left),y:Math.max(6,Math.min(r.bottom,innerHeight-170))})}}} aria-current={tab.id === activeId ? 'page' : undefined} title={tab.path || tab.name} onClick={() => { setOpen(false); onActivate(tab.id); }}>{tab.kind === 'object' ? <Database size={12}/> : <FileCode2 size={12}/>}<span><b>{tab.name}</b><small>{[tab.path?.replace(/[\\/][^\\/]+$/, ''),tab.profileName||tab.connectionProfileId].filter(Boolean).join(' · ')}</small></span>{tab.dirty && <span className="dirty-dot"/>}{tab.id === activeId && <Check size={12}/>}</button>)}{!filteredTabs.length&&<div className="editor-tabs-empty">No matching editors<button role="menuitem" onClick={()=>setQuery('')}>Clear search</button></div>}</div>}
  </div>;
}

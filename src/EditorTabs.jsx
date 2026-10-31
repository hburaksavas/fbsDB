import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronLeft, ChevronRight, Database, FileCode2, Plus, X } from 'lucide-react';
import { filterEditorTabs } from './workbenchUx';

export function EditorTabs({ tabs, activeId, onActivate, onClose, onCloseMany, onNew, children }) {
  const [context, setContext] = useState(null);
  useEffect(()=>{
    if(!context)return;const element=root.current.querySelector('[aria-label="Tab actions"]'),r=element.getBoundingClientRect();element.style.left=`${Math.max(6,Math.min(context.x,innerWidth-r.width-6))}px`;element.style.top=`${Math.max(6,Math.min(context.y,innerHeight-r.height-6))}px`;element.querySelector('button:not(:disabled)')?.focus();
    const dismiss=event=>{if(event.type==='pointerdown'){if(!element.contains(event.target))setContext(null);return}if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();setContext(null);tabElements.current.get(context.id)?.querySelector('[role=tab]')?.focus();return}if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();const buttons=[...element.querySelectorAll('button:not(:disabled)')],at=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus()}};
    document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',dismiss,true);return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',dismiss,true)};
  },[context]);
  const track = useRef(null), root = useRef(null), menu = useRef(null), menuButton = useRef(null), tabElements = useRef(new Map()), active = useRef(activeId);
  active.current = activeId;
  const sizingKey = tabs.map(tab => `${tab.id}:${tab.name}:${tab.dirty ? 1 : 0}`).join('|');
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
    if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){event.preventDefault();const r=event.currentTarget.getBoundingClientRect();setOpen(false);setContext({id:tabs[index].id,x:r.left,y:r.bottom});return;}
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    onActivate(tabs[next].id); requestAnimationFrame(() => tabElements.current.get(tabs[next].id)?.querySelector('[role="tab"]')?.focus());
  }
  return <div ref={root} className="editor-tabs compact-editor-tabs" onDoubleClick={event => { if (event.target === root.current || event.target === track.current) { event.preventDefault(); onNew(); } }}>
    {context && <div role="menu" aria-label="Tab actions" className="editor-tabs-menu" style={{position:'fixed',left:context.x,top:context.y,right:'auto',width:160}} onPointerDown={event=>event.stopPropagation()}>{[['Close',[context.id]],['Close Others',tabs.filter(t=>t.id!==context.id).map(t=>t.id)],['Close Left',tabs.slice(0,tabs.findIndex(t=>t.id===context.id)).map(t=>t.id)],['Close Right',tabs.slice(tabs.findIndex(t=>t.id===context.id)+1).map(t=>t.id)],['Close All',tabs.map(t=>t.id)]].map(([label,ids])=><button type="button" role="menuitem" key={label} disabled={!ids.length} onClick={()=>{setContext(null); if(onCloseMany)onCloseMany([...ids]);else ids.forEach(id=>onClose(id));}}>{label}</button>)}</div>}
    <div ref={track} className="editor-tabs-track" role="tablist" aria-label="Editor tabs" onScroll={measure} onContextMenu={event=>{const tab=event.target.closest('[data-editor-tab]');if(!tab)return;event.preventDefault();setOpen(false);setContext({id:tab.dataset.editorTab,x:Math.min(event.clientX,innerWidth-170),y:Math.min(event.clientY,innerHeight-170)});}}>
      {tabs.map((tab, index) => <div key={tab.id} ref={element => { if (element) tabElements.current.set(tab.id, element); else tabElements.current.delete(tab.id); }} className={`file-tab${tab.id === activeId ? ' active' : ''}`} data-editor-tab={tab.id} role="presentation">
        <button type="button" className="file-tab-select" role="tab" aria-selected={tab.id === activeId} tabIndex={tab.id === activeId ? 0 : -1} aria-label={`${tab.name}${tab.dirty ? ', unsaved' : ''}${tab.queryFailed ? ', query failed' : ''}`} title={tab.path || tab.name} onClick={() => tab.id !== activeId && onActivate(tab.id)} onKeyDown={event => navigate(event, index)}>
          {tab.kind === 'object' ? <Database size={12}/> : <FileCode2 size={12}/>}<span className="file-tab-name">{tab.name}</span>{tab.queryFailed&&tab.id!==activeId&&<span className="file-tab-error" title="Last query failed" aria-hidden="true"><AlertCircle size={11}/></span>}{tab.dirty && <span className="dirty-dot" aria-hidden="true"/>}
        </button>
        <button type="button" className="file-tab-close" tabIndex={tab.id === activeId ? 0 : -1} title={`Close ${tab.name}`} aria-label={`Close ${tab.name}`} onClick={() => onClose(tab.id)}><X size={11}/></button>
      </div>)}
    </div>
    <div className="editor-tabs-actions">
      {overflow.present && <><button type="button" className="editor-tab-action" aria-label="Scroll tabs left" title="Scroll tabs left" disabled={!overflow.left} onClick={() => track.current?.scrollBy({ left: -track.current.clientWidth * .7 })}><ChevronLeft size={13}/></button><button type="button" className="editor-tab-action" aria-label="Scroll tabs right" title="Scroll tabs right" disabled={!overflow.right} onClick={() => track.current?.scrollBy({ left: track.current.clientWidth * .7 })}><ChevronRight size={13}/></button></>}
      <button type="button" className="editor-tab-action" ref={menuButton} title={`Open editors (${tabs.length})`} aria-label={`Open editors (${tabs.length})`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(current => !current)}><ChevronDown size={13}/></button>
      <button type="button" className="editor-tab-action add-tab" title="New SQL file (Ctrl+N)" aria-label="New SQL file" onClick={onNew}><Plus size={14}/></button>
      {children}
    </div>
    {open && <div className="editor-tabs-menu" ref={menu} role="menu" aria-label="Open editors" onKeyDown={event => {
      if(event.key==='Tab'){setOpen(false);menuButton.current?.focus();return;}
      if(event.key==='Enter'&&event.target.tagName==='INPUT'){event.preventDefault();const first=menu.current.querySelector('[role="menuitem"]');first?.click();return;}
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || event.target.tagName==='INPUT'&&['Home','End'].includes(event.key)) return;
      event.preventDefault(); const buttons = [...menu.current.querySelectorAll('[role="menuitem"]')], index = buttons.indexOf(document.activeElement), next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index<0 ? (event.key==='ArrowUp'?buttons.length-1:0) : (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length;
      buttons[next]?.focus(); buttons[next]?.scrollIntoView({ block: 'nearest' });
    }}><label className="editor-tabs-search"><input aria-label="Search open editors" placeholder="File, object or connection…" value={query} onChange={event=>setQuery(event.target.value)}/></label>{filteredTabs.map(tab => <button key={tab.id} type="button" role="menuitem" onContextMenu={event=>{event.preventDefault();const r=event.currentTarget.getBoundingClientRect();setOpen(false);setContext({id:tab.id,x:Math.max(6,Math.min(event.clientX||r.left,innerWidth-170)),y:Math.max(6,Math.min(event.clientY||r.bottom,innerHeight-170))})}} onKeyDown={event=>{if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){event.preventDefault();const r=event.currentTarget.getBoundingClientRect();setOpen(false);setContext({id:tab.id,x:Math.max(6,r.left),y:Math.max(6,Math.min(r.bottom,innerHeight-170))})}}} aria-current={tab.id === activeId ? 'page' : undefined} title={tab.path || tab.name} onClick={() => { setOpen(false); onActivate(tab.id); }}>{tab.kind === 'object' ? <Database size={12}/> : <FileCode2 size={12}/>}<span><b>{tab.name}</b><small>{[tab.path?.replace(/[\\/][^\\/]+$/, ''),tab.profileName||tab.connectionProfileId].filter(Boolean).join(' · ')}</small></span>{tab.dirty && <span className="dirty-dot"/>}{tab.id === activeId && <Check size={12}/>}</button>)}{!filteredTabs.length&&<div className="editor-tabs-empty">No matching editors<button role="menuitem" onClick={()=>setQuery('')}>Clear search</button></div>}</div>}
  </div>;
}

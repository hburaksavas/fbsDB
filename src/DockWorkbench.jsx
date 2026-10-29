import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileCode2, FolderOpen, Database, Layers3, MoreHorizontal } from 'lucide-react';
import { PANEL_IDS, PANEL_LABELS, moveDockPanel } from './dockLayout';
import { resolveDockDrop, updateDockWeights, dockNodeMinimum, dockNodeVisible, projectDockTree } from './dockTree';
const icons = { editors: FileCode2, files: FolderOpen, connections: Database, objects: Layers3 };

function PanelSlot({ panel, hosts, active, fallback }) {
  const ref = useRef(null);
  useLayoutEffect(() => { if (hosts[panel] && ref.current && hosts[panel].parentNode !== ref.current) ref.current.appendChild(hosts[panel]); }, [hosts, panel]);
  return <div ref={ref} className="dock-panel-slot" data-panel-id={panel} hidden={!active}>{!hosts[panel] && fallback}</div>;
}

function DockDivider({ axis, value, onCommit, label, children }) {
  const drag = useRef(null), frame = useRef(null);
  const cancel = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null;
    const current = drag.current; if (!current) return;
    const property = axis === 'x' ? 'width' : 'flex';
    if (current.original) current.element.style.setProperty(property, current.original); else current.element.style.removeProperty(property);
    drag.current = null;
  };
  useEffect(() => { const escape = event => { if (event.key === 'Escape' && drag.current) { event.preventDefault(); event.stopImmediatePropagation(); cancel(); } }; document.addEventListener('keydown', escape, true); window.addEventListener('blur', cancel); return () => { cancel(); document.removeEventListener('keydown', escape, true); window.removeEventListener('blur', cancel); }; }, []);
  return <div className={`dock-divider dock-divider-${axis}`} role="separator" aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'} aria-label={label} tabIndex={0} aria-valuenow={Math.round(value)} aria-valuemin={axis === 'x' ? 180 : 70} aria-valuemax={axis === 'x' ? 520 : 2000}
    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); const element = axis === 'x' ? event.currentTarget.closest('.dock-side') : event.currentTarget.closest('.dock-group-pair'); const available = axis === 'x' ? 520 : element.parentElement.clientHeight - [...element.parentElement.children].filter(sibling => sibling !== element && !sibling.hidden).reduce((sum, sibling) => sum + 70 + (sibling.querySelector('.dock-divider-y') ? 6 : 0), 0); drag.current = { element, original: element.style.getPropertyValue(axis === 'x' ? 'width' : 'flex'), maximum: Math.max(axis === 'x' ? 180 : 70, available), origin: axis === 'x' ? event.clientX : event.clientY, next: value, start: axis === 'x' ? element.getBoundingClientRect().width : element.getBoundingClientRect().height, sign: axis === 'x' && element.dataset.side === 'right' ? -1 : 1 }; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => { const current = drag.current; if (!current) return; current.next = Math.max(axis === 'x' ? 180 : 70, Math.min(current.maximum, current.start + ((axis === 'x' ? event.clientX : event.clientY) - current.origin) * current.sign)); if (frame.current === null) frame.current = requestAnimationFrame(() => { frame.current = null; if (axis === 'x') current.element.style.width = `${current.next}px`; else current.element.style.flex = `0 0 ${current.next}px`; }); }}
    onPointerUp={event => { if (!drag.current) return; const next = drag.current.next; cancel(); onCommit(next); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={cancel} onLostPointerCapture={cancel}
    onKeyDown={event => { const keys = axis === 'x' ? { ArrowLeft: -16, ArrowRight: 16 } : { ArrowUp: -16, ArrowDown: 16 }; if (event.key in keys) { event.preventDefault(); onCommit(Math.max(axis === 'x' ? 180 : 70, Math.min(axis === 'x' ? 520 : 2000, value + keys[event.key]))); } }}>{children}</div>;
}

function SplitDivider({ axis, weights, onCommit }) {
  const drag = useRef(null), frame = useRef(null);
  const paint = () => { frame.current = null; const current = drag.current; if (current) { current.before.style.flex = `0 0 ${current.next}px`; current.after.style.flex = `0 0 ${current.total-current.next}px`; } };
  const cancel = () => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; const current = drag.current; if (current) { current.before.style.flex = current.originalBefore; current.after.style.flex = current.originalAfter; } drag.current = null; };
  const sizes = split => [...split.children].filter(child => child.classList.contains('dock-branch') && !child.hidden).map(child => ({ index: Number(child.dataset.index), size: axis === 'x' ? child.getBoundingClientRect().width : child.getBoundingClientRect().height }));
  const commit = measured => { const total = measured.reduce((sum,item)=>sum+item.size,0), oldTotal = measured.reduce((sum,item)=>sum+weights[item.index],0); const next = weights.map(weight=>weight*total/(oldTotal||1)); measured.forEach(item=>{next[item.index]=item.size}); onCommit(next); };
  useEffect(() => { const escape = event => { if (event.key==='Escape'&&drag.current) {event.preventDefault();event.stopImmediatePropagation();cancel()} }; document.addEventListener('keydown',escape,true);window.addEventListener('blur',cancel);return()=>{cancel();document.removeEventListener('keydown',escape,true);window.removeEventListener('blur',cancel)} }, []);
  function pair(element) { let before=element.previousElementSibling,after=element.nextElementSibling;while(before?.hidden)before=before.previousElementSibling;while(after?.hidden)after=after.nextElementSibling;return {before,after}; }
  return <div className={`dock-split-divider dock-split-divider-${axis}`} role="separator" aria-label={`Resize docked panels ${axis==='x'?'horizontally':'vertically'}`} aria-orientation={axis==='x'?'vertical':'horizontal'} tabIndex={0}
    onPointerDown={event=>{if(event.button!==0)return;const {before,after}=pair(event.currentTarget);if(!before||!after)return;event.preventDefault();const start=axis==='x'?before.getBoundingClientRect().width:before.getBoundingClientRect().height,total=start+(axis==='x'?after.getBoundingClientRect().width:after.getBoundingClientRect().height);drag.current={before,after,originalBefore:before.style.flex,originalAfter:after.style.flex,start,total,next:start,origin:axis==='x'?event.clientX:event.clientY,split:event.currentTarget.parentElement};event.currentTarget.setPointerCapture(event.pointerId)}}
    onPointerMove={event=>{const current=drag.current;if(!current)return;const minimum=Math.min(axis==='x'?80:64,current.total/2);current.next=Math.max(minimum,Math.min(current.total-minimum,current.start+(axis==='x'?event.clientX:event.clientY)-current.origin));if(frame.current===null)frame.current=requestAnimationFrame(paint)}}
    onPointerUp={event=>{if(!drag.current)return;if(frame.current!==null)cancelAnimationFrame(frame.current);paint();const measured=sizes(drag.current.split);cancel();commit(measured);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}} onPointerCancel={cancel} onLostPointerCapture={cancel}
    onKeyDown={event=>{const negative=axis==='x'?'ArrowLeft':'ArrowUp',positive=axis==='x'?'ArrowRight':'ArrowDown';if(![negative,positive].includes(event.key))return;event.preventDefault();const {before,after}=pair(event.currentTarget),measured=sizes(event.currentTarget.parentElement),a=measured.find(item=>item.index===Number(before.dataset.index)),b=measured.find(item=>item.index===Number(after.dataset.index));const delta=event.key===positive?16:-16;if(a.size+delta<40||b.size-delta<40)return;a.size+=delta;b.size-=delta;commit(measured)}}/>;
}

export function DockWorkbench({ layout, onChange, panels, hidden, children }) {
  const [hosts] = useState(() => Object.fromEntries(PANEL_IDS.map(id => [id, typeof document.createElement === 'function' ? document.createElement('div') : null])));
  const root = useRef(null), layoutRef = useRef(layout), changeRef = useRef(onChange), drag = useRef(null), frame = useRef(null), previewRef = useRef(null), menuRef = useRef(null), dragEndedAt = useRef(0);
  layoutRef.current = layout; changeRef.current = onChange;
  const [dragging, setDragging] = useState(null), [menu, setMenu] = useState(null);
  const visible = layout.visible && !hidden;
  const updateGroup = (id, patch) => onChange({ ...layout, groups: layout.groups.map(group => group.id === id ? { ...group, ...patch } : group) });
  function tabInsertion(current, target) {
    const group=current.groups.find(group=>group.id===target.groupId),visible=group?.panels.filter(panel=>!current.hidden.includes(panel)),before=visible?.[target.tabIndex];return before?group.panels.indexOf(before):group?.panels.length;
  }
  function begin(event, panel) {
    if (event.button !== 0 || event.target.closest('[data-dock-action]')) return;
    drag.current = { panel, pointerId: event.pointerId, x: event.clientX, y: event.clientY, target: null, started: false }; setMenu(null);
  }
  useEffect(() => {
    function cleanup() {
      if (drag.current?.started) dragEndedAt.current = Date.now();
      if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null;
      if (previewRef.current) previewRef.current.hidden = true;
      drag.current = null; setDragging(null); root.current?.removeAttribute('data-dragging');
    }
    function move(event) {
      const current = drag.current; if (!current || event.pointerId !== current.pointerId) return;
      if (!current.started && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5) return;
      if (!current.started) { current.started = true; setDragging(current.panel); root.current?.setAttribute('data-dragging', 'true'); }
      event.preventDefault();
      const bounds = root.current.getBoundingClientRect();
      const groups = [...root.current.querySelectorAll('.dock-group')].map(element => ({ id: element.dataset.groupId, side: element.closest('.dock-side').dataset.side, rect: element.getBoundingClientRect(), header: element.querySelector('.dock-group-header').getBoundingClientRect(), tabs: [...element.querySelectorAll('.dock-panel-tab')].map(tab => ({ panel: tab.dataset.dockPanel, rect: tab.getBoundingClientRect() })) })).filter(group=>group.rect.width>0&&group.rect.height>0);
      const widths = Object.fromEntries(['left','right'].map(side=>[side,root.current.querySelector(`.dock-side[data-side="${side}"]`).getBoundingClientRect().width]));
      let target = resolveDockDrop({ x: event.clientX, y: event.clientY }, bounds, groups, widths);
      const source = layoutRef.current.groups.find(group => group.panels.includes(current.panel));
      if (target?.groupId === source?.id && source.panels.length === 1) target = null;
      if(target){
        const candidate=moveDockPanel(layoutRef.current,current.panel,target.side,target.groupId,target.placement,target.placement==='merge'?tabInsertion(layoutRef.current,target):null);
        const sides=['left','right'].filter(side=>dockNodeVisible(candidate.trees[side],candidate.groups,candidate.hidden));
        const center=window.innerWidth<=760?200:360,maximum=Math.max(window.innerWidth<=760?(sides.length===2?70:90):100,(bounds.width-center)/(sides.length===2?2:1));
        const width=Math.min(candidate.widths[target.side],maximum),minimum=dockNodeMinimum(candidate.trees[target.side],candidate.groups,candidate.hidden);
        const sideRect={x:target.side==='left'?bounds.x:bounds.right-width,y:bounds.y,width:Math.max(width,minimum.width),height:Math.max(bounds.height,minimum.height)};
        const group=candidate.groups.find(group=>group.panels.includes(current.panel));
        target.rect=projectDockTree(candidate.trees[target.side],sideRect,candidate.groups,candidate.hidden)[group.id]||target.rect;
      }
      current.target = target;
      current.bounds = bounds;
      if (frame.current === null) frame.current = requestAnimationFrame(() => {
        frame.current = null; const element=previewRef.current;if(!element)return;element.hidden=!current.target;
        if(current.target){const rect=current.target.rect;element.dataset.placement=current.target.placement;element.style.left=`${rect.x-current.bounds.x}px`;element.style.top=`${rect.y-current.bounds.y}px`;element.style.width=`${rect.width}px`;element.style.height=`${rect.height}px`;}
      });
    }
    function finish(event) {
      const current = drag.current;if(current&&event.pointerId!==current.pointerId)return;
      if(current?.started&&current.target){const target=current.target;changeRef.current(moveDockPanel(layoutRef.current,current.panel,target.side,target.groupId,target.placement,target.placement==='merge'?tabInsertion(layoutRef.current,target):null));}
      cleanup();
    }
    function escape(event) { if (event.key === 'Escape' && drag.current) { event.preventDefault(); event.stopImmediatePropagation(); cleanup(); } }
    document.addEventListener('pointermove', move, { passive: false }); document.addEventListener('pointerup', finish); document.addEventListener('pointercancel', cleanup); document.addEventListener('keydown', escape, true); window.addEventListener('blur', cleanup);
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', finish); document.removeEventListener('pointercancel', cleanup); document.removeEventListener('keydown', escape, true); window.removeEventListener('blur', cleanup); };
  }, []);
  useEffect(() => {
    if (!menu) return;
    const dismiss = event => { if (event.type === 'keydown') { if (event.key !== 'Escape') return; event.preventDefault(); event.stopImmediatePropagation(); menu.opener?.focus(); } else if (menuRef.current?.contains(event.target)) return; setMenu(null); };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', dismiss, true); menuRef.current?.querySelector('button')?.focus();
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss, true); };
  }, [menu]);
  function showMenu(event, panel, group) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setMenu({ panel, group, opener: event.currentTarget, x: Math.min(rect.left, window.innerWidth - 220), y: Math.min(rect.bottom, window.innerHeight - 270) }); }
  const nodeVisible = node => dockNodeVisible(node,layout.groups,layout.hidden);
  const minimum = node => dockNodeMinimum(node,layout.groups,layout.hidden);
  function renderNode(node,side,path=[]) {
    if(!node)return null;
    if(node.kind==='group'){
      const group=layout.groups.find(group=>group.id===node.id);if(!group)return null;
      const visiblePanels=group.panels.filter(panel=>!layout.hidden.includes(panel)),active=visiblePanels.includes(group.active)?group.active:visiblePanels[0];
      return <section className="dock-group" data-group-id={group.id} hidden={!visiblePanels.length} aria-label={visiblePanels.map(id=>PANEL_LABELS[id]).join(', ')}>
            <header className="dock-group-header" onContextMenu={event => showMenu(event, active, group)}>
              <div className="dock-panel-tabs" role={visiblePanels.length > 1 ? 'tablist' : undefined}>{visiblePanels.map(panel => { const Icon = icons[panel]; return <button key={panel} className={`dock-panel-tab${active === panel ? ' active' : ''}`} data-drag-source={dragging === panel || undefined} data-dock-panel={panel} role={visiblePanels.length > 1 ? 'tab' : undefined} aria-selected={visiblePanels.length > 1 ? active === panel : undefined}
                onPointerDown={event => begin(event, panel)} onClick={() => { if (Date.now() - dragEndedAt.current > 300) updateGroup(group.id, { active: panel }); }}
                onKeyDown={event => { if (visiblePanels.length < 2 || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); const index = visiblePanels.indexOf(panel), next = (index + (event.key === 'ArrowRight' ? 1 : visiblePanels.length - 1)) % visiblePanels.length; updateGroup(group.id, { active: visiblePanels[next] }); event.currentTarget.parentElement.children[next]?.focus(); }}
                title={`${PANEL_LABELS[panel]} · Drag to move panel`}><Icon size={13}/><span>{PANEL_LABELS[panel]}</span></button>; })}</div>
              <button className="dock-group-menu" data-dock-action aria-label={`Move or group ${PANEL_LABELS[active]}`} title="Panel actions" onClick={event => showMenu(event, active, group)}><MoreHorizontal size={14}/></button>
            </header>
            <div className="dock-group-body">{group.panels.map(panel => <PanelSlot key={panel} panel={panel} hosts={hosts} active={active === panel} fallback={panels[panel]}/>)}</div>
      </section>;
    }
    const last=node.children.findLastIndex(nodeVisible);
    return <div className="dock-split" data-axis={node.axis}>{node.children.map((child,index)=>{const size=minimum(child),shown=nodeVisible(child);return <Fragment key={child.kind==='group'?child.id:`split-${index}`}>
      <div className="dock-branch" data-index={index} hidden={!shown} style={{flex:`${node.weights[index]} 1 0`,minWidth:size.width,minHeight:size.height}}>{renderNode(child,side,[...path,index])}</div>
      {shown&&index<last&&<SplitDivider axis={node.axis} weights={node.weights} onCommit={weights=>onChange(current=>({...current,trees:{...current.trees,[side]:updateDockWeights(current.trees[side],path,weights)}}))}/>}
    </Fragment>})}</div>;
  }
  const content = side => {
    const tree=layout.trees[side],size=minimum(tree);
    return <aside className="dock-side explorer" data-side={side} hidden={!visible||!nodeVisible(tree)} style={{width:layout.widths[side]}} aria-label={`${side==='left'?'Left':'Right'} explorer`}>
      <div className="dock-groups dock-tree"><div className="dock-tree-root" style={{minWidth:size.width,minHeight:size.height}}>{renderNode(tree,side)}</div></div>
      <DockDivider axis="x" label={`Resize ${side} explorer`} value={layout.widths[side]} onCommit={width=>onChange({...layout,widths:{...layout.widths,[side]:width}})}/>
    </aside>;
  };
  return <div ref={root} className="dock-workbench" data-dragging={dragging ? 'true' : undefined} data-both-sides={visible && ['left','right'].every(side => layout.groups.some(group => group.side === side && group.panels.some(panel => !layout.hidden.includes(panel))))}>
    {content('left')}<div className="dock-editor-area">{children}</div>{content('right')}
    {PANEL_IDS.map(panel => hosts[panel] ? createPortal(panels[panel], hosts[panel], panel) : null)}
    <div ref={previewRef} className="dock-drop-preview" hidden aria-hidden="true"/>
    {menu && <div ref={menuRef} className="workspace-context-menu dock-actions-menu" role="menu" style={{ left: menu.x, top: Math.max(30, menu.y) }} onKeyDown={event => { if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return; event.preventDefault(); const buttons = [...menuRef.current.querySelectorAll('button')], index = buttons.indexOf(document.activeElement); buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus(); }}>
      {['left', 'right'].map(side => <button key={side} role="menuitem" onClick={() => { onChange(moveDockPanel(layout, menu.panel, side)); setMenu(null); }}>Move to {side}</button>)}
      {layout.groups.filter(group => group.id !== menu.group.id).map(group => <button key={group.id} role="menuitem" onClick={() => { onChange(moveDockPanel(layout, menu.panel, group.side, group.id, 'merge')); setMenu(null); }}>Group with {PANEL_LABELS[group.active]}</button>)}
      {menu.group.panels.length > 1 && <button role="menuitem" onClick={() => { onChange(moveDockPanel(layout, menu.panel, menu.group.side)); setMenu(null); }}>Separate panel</button>}
      <button role="menuitem" onClick={() => { onChange({ ...layout, hidden: [...layout.hidden, menu.panel] }); setMenu(null); requestAnimationFrame(() => document.querySelector('.ide-view-menu>button')?.focus()); }}>Hide panel</button>
    </div>}
  </div>;
}

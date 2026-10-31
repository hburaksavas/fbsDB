import {useLayoutEffect,useRef} from 'react';
import {createPortal} from 'react-dom';

export function workspaceContext(event, item = null) {
  event.preventDefault(); event.stopPropagation();
  const trigger = event.currentTarget, rect = trigger.getBoundingClientRect();
  const keyboard = event.type !== 'contextmenu' || !event.clientX && !event.clientY;
  return {item, trigger, x: keyboard ? rect.left : event.clientX, y: keyboard ? rect.bottom : event.clientY};
}
export function workspaceContextKey(event, open) {
  if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) { event.preventDefault(); event.stopPropagation(); open(event); return true; }
  return false;
}
export function WorkspaceMenu({context,items,onClose,label='Workspace actions'}) {
  const ref=useRef(null),close=useRef(onClose); close.current=onClose;
  useLayoutEffect(()=>{
    const root=ref.current,rect=root.getBoundingClientRect();
    root.style.left=`${Math.max(6,Math.min(context.x,innerWidth-rect.width-6))}px`;
    root.style.top=`${Math.max(6,Math.min(context.y,innerHeight-rect.height-6))}px`;
    const buttons=()=>[...root.querySelectorAll('button:not(:disabled)')]; buttons()[0]?.focus({preventScroll:true});
    const dismiss=event=>{if(!root.contains(event.target))close.current()};
    const key=event=>{
      if(['Escape','Tab'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();close.current();return}
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();event.stopImmediatePropagation();const list=buttons(),index=list.indexOf(document.activeElement);
        list[event.key==='Home'?0:event.key==='End'?list.length-1:(index+(event.key==='ArrowDown'?1:-1)+list.length)%list.length]?.focus();
      }
    };
    document.addEventListener('pointerdown',dismiss);window.addEventListener('keydown',key,true);
    window.addEventListener('resize',onClose);
    return()=>{document.removeEventListener('pointerdown',dismiss);window.removeEventListener('keydown',key,true);window.removeEventListener('resize',onClose);if(context.trigger.isConnected)context.trigger.focus({preventScroll:true})};
  },[context]);
  const parent=context.trigger.closest('[role="dialog"]')||context.trigger.closest('.desktop-shell')||document.body;
  return createPortal(<div ref={ref} className="workspace-actions-menu" role="menu" aria-label={label} onContextMenu={e=>e.preventDefault()}>
    {items.map((item,index)=>item.separator?<hr key={index}/>:<button key={item.id||item.label} type="button" role="menuitem" disabled={item.disabled} data-danger={item.danger||undefined} title={item.title} onClick={()=>{onClose();item.run()}}>{item.icon&&<item.icon size={14}/>}<span>{item.label}</span>{item.detail&&<small>{item.detail}</small>}</button>)}
  </div>,parent);
}

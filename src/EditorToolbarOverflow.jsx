import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { createPortal } from 'react-dom';

export function EditorToolbarOverflow({ onOpen, onUndo, onFormat, pageSize, onPageSize, readOnly, theme }) {
  const [open,setOpen]=useState(false),root=useRef(null),trigger=useRef(null),menuRef=useRef(null);
  const [colors,setColors]=useState({}),[portalTheme,setPortalTheme]=useState('default');
  useEffect(()=>{
    if(!open)return;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    const position=()=>{const menu=menuRef.current,rect=trigger.current?.getBoundingClientRect();if(menu&&rect){if(!rect.width){setOpen(false);return;}menu.style.left=`${Math.max(8,Math.min(rect.left,innerWidth-menu.offsetWidth-8))}px`;menu.style.top=`${rect.bottom+4}px`}};position();window.addEventListener('resize',position);
    const dismiss=e=>{
      if(e.type==='keydown'&&e.key==='Escape'&&!document.querySelector('.modal-backdrop')){e.preventDefault();e.stopImmediatePropagation();setOpen(false);trigger.current?.focus()}
      else if(e.type==='pointerdown'&&!root.current?.contains(e.target)&&!menuRef.current?.contains(e.target))setOpen(false);
    };
    document.addEventListener('keydown',dismiss,true);document.addEventListener('pointerdown',dismiss,true);
    return()=>{document.removeEventListener('keydown',dismiss,true);document.removeEventListener('pointerdown',dismiss,true);window.removeEventListener('resize',position)};
  },[open]);
  const invoke=action=>{setOpen(false);action();};
  return <div className="editor-toolbar-overflow" ref={root}><button className="icon-button" ref={trigger} aria-label="More editor actions" title="More editor actions" aria-expanded={open} aria-haspopup="menu" onClick={()=>{const style=getComputedStyle(root.current);setColors({'--ui-font-family':style.getPropertyValue('--ui-font-family')});setPortalTheme(root.current.closest('.desktop-shell')?.dataset.theme||'default');setOpen(value=>!value)}}><MoreHorizontal size={15}/></button>{open&&createPortal(<div ref={menuRef} style={colors} className="editor-overflow-menu theme-scope" data-theme={theme||portalTheme} role="menu" aria-label="More editor actions" onKeyDown={event=>{
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)||event.target.tagName==='SELECT')return;
    event.preventDefault();const nodes=[...event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled),select')],at=nodes.indexOf(document.activeElement);nodes[event.key==='Home'?0:event.key==='End'?nodes.length-1:(at+(event.key==='ArrowDown'?1:-1)+nodes.length)%nodes.length]?.focus();
  }}><button role="menuitem" onClick={()=>invoke(onOpen)}>Open SQL file <kbd>Ctrl+Shift+O</kbd></button><button role="menuitem" disabled={readOnly} onClick={()=>invoke(onUndo)}>Undo <kbd>Ctrl+Z</kbd></button><button role="menuitem" disabled={readOnly} onClick={()=>invoke(onFormat)}>Format SQL <kbd>Ctrl+Shift+F</kbd></button><label>Rows per result page<select aria-label="Rows per result page" value={pageSize} onChange={e=>onPageSize(Number(e.target.value))}>{[100,500,1000,5000,10000].map(size=><option key={size}>{size}</option>)}</select></label></div>,document.body)}</div>;
}

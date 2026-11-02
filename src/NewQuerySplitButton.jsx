import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ChevronDown,Plus} from 'lucide-react';

// Main part keeps the existing Ctrl+N behaviour; the dropdown only chooses a different profile or starter text.
export function NewQuerySplitButton({label,profiles=[],templates=[],onNew,onProfile,onTemplate}){
 const [menu,setMenu]=useState(null),trigger=useRef(null),root=useRef(null);
 const close=(focus=true)=>{setMenu(null);if(focus)trigger.current?.focus()};
 useEffect(()=>{
  if(!menu)return;
  root.current?.querySelector('button:not(:disabled)')?.focus();
  const pointer=event=>{if(!root.current?.contains(event.target)&&!trigger.current?.contains(event.target))close(false)};
  document.addEventListener('pointerdown',pointer,true);return()=>document.removeEventListener('pointerdown',pointer,true);
 },[menu]);
 const open=()=>{const rect=trigger.current.getBoundingClientRect();setMenu({left:Math.max(6,Math.min(rect.right-260,innerWidth-266)),top:rect.bottom+4})};
 const choose=run=>{close(false);run()};
 const keys=event=>{
  if(event.key==='Escape'||event.key==='Tab'){event.preventDefault();close();return}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();const buttons=[...root.current.querySelectorAll('button:not(:disabled)')],at=buttons.indexOf(document.activeElement);
  buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();
 };
 return <div className="new-query-split">
  <button type="button" className="editor-tab-action add-tab" title={label} aria-label="New SQL file" onClick={onNew}><Plus size={14}/></button>
  <button type="button" ref={trigger} className="editor-tab-action new-query-more" title="New SQL file with another profile or template" aria-label="New SQL file options" aria-haspopup="menu" aria-expanded={Boolean(menu)} onClick={()=>menu?close():open()}><ChevronDown size={11}/></button>
  {menu&&createPortal(<div ref={root} className="connection-context-menu new-query-menu theme-scope" data-theme={document.documentElement.dataset.theme||'default'} role="menu" aria-label="New SQL file options" style={{left:menu.left,top:menu.top}} onKeyDown={keys}>
   <div className="new-query-menu-label">Connection</div>
   {profiles.map(profile=><button key={profile.id} type="button" role="menuitem" disabled={!profile.available} onClick={()=>choose(()=>onProfile(profile.id))}><span>{profile.name}</span><small>{[profile.current&&'current',profile.environment,!profile.available&&'unavailable'].filter(Boolean).join(' · ')}</small></button>)}
   <button type="button" role="menuitem" onClick={()=>choose(()=>onProfile(null))}><span>No connection</span></button>
   <hr/>
   <div className="new-query-menu-label">Template · not executed</div>
   {templates.map(template=><button key={template.id} type="button" role="menuitem" onClick={()=>choose(()=>onTemplate(template.id))}><span>{template.label}</span></button>)}
  </div>,document.body)}
 </div>;
}

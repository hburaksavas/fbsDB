import {FilteredMenuItems} from './FilteredMenuItems.jsx';
import {useFeedbackState,Feedback} from './Feedback';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {BookOpen,Code2,Copy,FileCode2,Link2,Star,RefreshCw,ChevronRight,ChevronLeft,Database} from 'lucide-react';
import {oracleObjectMenu} from './oracleObjectActions.js';
import {restoreFocus} from './focusManagement.js';
const icons={details:BookOpen,sql:Code2,copy:Copy,source:FileCode2,link:Link2,star:Star,refresh:RefreshCw};

export function OracleObjectMenu({context,favorite,onAction,onClose}){
 const root=useRef(null),close=useRef(onClose),mounted=useRef(true);close.current=onClose;
 const [page,setPage]=useState(null),[choices,setChoices]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useFeedbackState('',{title:'Object action failed'}),[theme,setTheme]=useState(document.documentElement.dataset.theme||'default');
 const all=oracleObjectMenu(context.item,favorite),items=page==='overloads'?choices:page?all.find(a=>a.id===page)?.children||[]:all;
 useEffect(()=>{const observer=new MutationObserver(()=>setTheme(document.documentElement.dataset.theme||'default'));observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});return()=>observer.disconnect()},[]);
 useLayoutEffect(()=>{const node=root.current,r=node.getBoundingClientRect();node.style.left=`${Math.max(6,Math.min(context.x,innerWidth-r.width-6))}px`;node.style.top=`${Math.max(6,Math.min(context.y,innerHeight-r.height-6))}px`;node.querySelector('button:not(:disabled)')?.focus({preventScroll:true})},[context,page,error]);
 useEffect(()=>{
  mounted.current=true;
  const pointer=e=>{if(!root.current?.contains(e.target))close.current()};
  let typed='',timer;
  const key=e=>{
   if(e.key==='Escape'||e.key==='ArrowLeft'&&page){e.preventDefault();e.stopImmediatePropagation();if(page){setPage(null);setError('')}else close.current();return}
   if(e.key==='Tab'){e.preventDefault();e.stopImmediatePropagation();close.current();return}
   const buttons=[...root.current.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
   if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();return}
   if(e.key==='ArrowRight'&&document.activeElement?.getAttribute('aria-haspopup')==='menu'){e.preventDefault();e.stopImmediatePropagation();document.activeElement.click();return}
   if(e.key.length===1&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&e.key!==' '){typed+=e.key.toLowerCase();clearTimeout(timer);timer=setTimeout(()=>{typed=''},700);const match=buttons.find(b=>b.textContent.trim().toLowerCase().startsWith(typed));if(match){e.preventDefault();match.focus()}}
  };
  const resize=()=>close.current();document.addEventListener('pointerdown',pointer,true);window.addEventListener('keydown',key,true);window.addEventListener('resize',resize);
  return()=>{clearTimeout(timer);document.removeEventListener('pointerdown',pointer,true);window.removeEventListener('keydown',key,true);window.removeEventListener('resize',resize)};
 },[page]);
 useEffect(()=>{const node=root.current;return()=>{mounted.current=false;context.cancellation?.cancel();restoreFocus(context.trigger,node)}},[context]);
 const invoke=async id=>{if(busy)return;setBusy(true);setError('');try{const result=await onAction(id,context);if(mounted.current){if(result?.choices){setChoices(result.choices);setPage('overloads')}else close.current()}}catch(e){if(mounted.current)setError(e.message||'The object action could not be completed.')}finally{if(mounted.current)setBusy(false)}};
 return createPortal(<div ref={root} className="connection-context-menu oracle-object-menu theme-scope" data-theme={theme} role="menu" aria-label="Oracle object context menu" aria-busy={busy||undefined} onContextMenu={e=>e.preventDefault()}>
  <header><Database size={13}/><span>{context.item.owner}.{context.item.name}</span></header>
  {page&&<button type="button" role="menuitem" disabled={busy} onClick={()=>{setPage(null);setError('')}}><ChevronLeft size={14}/><span>Back</span></button>}
  <FilteredMenuItems key={page||'main'}>{items.map((action,index)=>{
   if(action.separator)return <hr key={'sep'+index}/>;
   const Icon=icons[action.icon]||BookOpen;
   return <button key={action.id} type="button" role="menuitem" disabled={busy} aria-haspopup={action.children?'menu':undefined} onClick={()=>action.children?(setPage(action.id),setError('')):invoke(action.id)}><Icon size={14}/><span>{action.label}</span>{action.children&&<ChevronRight size={12}/>}</button>;
  })}
  </FilteredMenuItems>{busy&&<Feedback kind="progress" title="Oracle object">Loading metadata…</Feedback>}{error&&<Feedback title="Object action failed">{error}</Feedback>}
 </div>,document.body);
}

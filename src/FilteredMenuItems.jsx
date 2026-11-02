import {Children,cloneElement,isValidElement,useLayoutEffect,useRef,useState} from 'react';
function labelText(node){return Children.toArray(node).map(child=>typeof child==='string'||typeof child==='number'?String(child):isValidElement(child)?labelText(child.props.children):'').join(' ')}
export function filterMenuItems(children,query){
 const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 if(!words.length)return children;
 return Children.map(children,child=>{
  if(!isValidElement(child))return child;
  if(child.type==='hr')return null;
  if(/^menuitem/.test(child.props.role||''))return words.every(word=>labelText(child.props.children).toLocaleLowerCase().includes(word))?child:null;
  if(child.props.children)return cloneElement(child,{},filterMenuItems(child.props.children,query));
  return child;
 });
}
function actionCount(children){return Children.toArray(children).reduce((sum,child)=>sum+(!isValidElement(child)?0:/^menuitem/.test(child.props.role||'')?1:actionCount(child.props.children)),0)}
export function FilteredMenuItems({children}){
 const [query,setQuery]=useState(''),input=useRef(null),queryRef=useRef('');queryRef.current=query;
 useLayoutEffect(()=>{
  const root=input.current.closest('[role="menu"]');
  const key=event=>{
   if(!root?.contains(event.target))return;
   const editable=event.target.matches('input,textarea,select,[contenteditable="true"]');
   const consume=()=>{event.preventDefault();event.stopImmediatePropagation()};
   if(event.key==='Escape'&&queryRef.current){consume();setQuery('');input.current.focus();return}
   if(event.target===input.current&&['ArrowDown','ArrowUp','Enter'].includes(event.key)){
    consume();const items=[...root.querySelectorAll('[role^="menuitem"]:not(:disabled)')];const item=event.key==='ArrowUp'?items.at(-1):items[0];item?.focus();return;
   }
   if(editable){if(event.target===input.current&&!['Escape','Tab'].includes(event.key))event.stopImmediatePropagation();return}
   if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){consume();setQuery(value=>value+event.key);input.current.focus();return}
   if(event.key==='Backspace'&&queryRef.current){consume();setQuery(value=>value.slice(0,-1));input.current.focus()}
  };
  window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
 },[]);
 const filtered=filterMenuItems(children,query);
 return <><label className="menu-action-search"><input ref={input} type="search" aria-label="Search menu actions" placeholder="Type to filter actions…" value={query} onChange={event=>setQuery(event.target.value)}/></label>{filtered}{query&&!actionCount(filtered)&&<span className="menu-search-hint" role="status">No matching actions</span>}{query&&<span className="menu-search-hint" role="status">Filtered actions · Escape clears search</span>}</>;
}

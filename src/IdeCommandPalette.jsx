import {OracleObjectIcon} from './OracleObjectIcon';
import { Fragment,useEffect, useMemo, useRef, useState } from 'react';
import { Search, FileCode2, Database, Command, ListTree, History,Settings2 } from 'lucide-react';
import { ModalBackdrop } from './ModalBackdrop';
import { useDialogFocus } from './ConnectionManager';
import { searchKinds, workbenchSearch } from './workbenchUx';

export function IdeCommandPalette({ mode, files = [], objects = [], connections = [], history = [], commands = [], outline = [], settings = [], onChoose, onClose }) {
  const [query,setQuery]=useState(''),[active,setActive]=useState(0),[category,setCategory]=useState('All');
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const items=useMemo(()=>workbenchSearch({mode,query,category,files,objects,connections,history,commands,outline,settings}),[query,category,mode,files,objects,connections,history,commands,outline,settings]);
  useEffect(()=>{setActive(0);setCategory('All')},[mode]);
  useEffect(()=>setActive(0),[query,category]);
  useEffect(()=>setActive(current=>Math.min(current,Math.max(0,items.length-1))),[items.length]);
  useEffect(()=>{ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'})},[active]);
  const choose=item=>{if(!item||item.disabled)return;onClose();onChoose(item)};
  return <ModalBackdrop onClose={onClose} onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><div ref={ref} className="ide-command-palette" role="dialog" aria-modal="true" aria-label={mode==='outline'?'File outline':mode==='files'?'Search Everywhere':'Command palette'} onKeyDown={event=>{
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&!(event.target.tagName==='INPUT'&&['Home','End'].includes(event.key))){event.preventDefault();setActive(value=>items.length?(event.key==='Home'?0:event.key==='End'?items.length-1:(value+(event.key==='ArrowUp'?-1:1)+items.length)%items.length):0)}
    if(event.key==='Enter'&&event.target.getAttribute('role')==='combobox'){event.preventDefault();choose(items[active])}
  }}><label className="ide-palette-search"><Search size={16}/><input autoFocus placeholder={mode==='outline'?'Find statement, CTE or PL/SQL block':'Find files, symbols, settings, commands, objects or history'} value={query} onChange={event=>setQuery(event.target.value)} role="combobox" aria-label="Search workbench" aria-autocomplete="list" aria-expanded="true" aria-controls="ide-command-results" aria-activedescendant={items[active]?`ide-command-${active}`:undefined}/><kbd>Esc</kbd></label>
    {mode!=='outline'&&<div className="ide-search-kinds" role="group" aria-label="Search result type">{searchKinds.map(kind=><button key={kind} aria-pressed={category===kind} onClick={()=>setCategory(kind)}>{kind}</button>)}</div>}
    <div id="ide-command-results" className="ide-palette-results" role="listbox" aria-label="Search results">{items.map((item,index)=>{const Icon={file:FileCode2,object:Database,connection:Database,command:Command,outline:ListTree,history:History,setting:Settings2}[item.kind];return <Fragment key={item.id}>{category==='All'&&mode!=='outline'&&(index===0||items[index-1].category!==item.category)&&<div className="ide-search-group" role="presentation">{item.category}</div>}<button id={`ide-command-${index}`} role="option" key={item.id} aria-selected={active===index} aria-disabled={Boolean(item.disabled)} onPointerMove={()=>setActive(index)} onClick={()=>choose(item)} tabIndex={-1} style={{paddingLeft:12+(item.depth||0)*14}}>{item.kind==='object'?<OracleObjectIcon type={item.type} size={14}/>:<Icon size={14}/>}<span><b>{item.label}</b><small>{item.category} · {item.detail}</small></span></button></Fragment>})}</div>
    {!items.length&&<div className="ide-search-empty" role="status"><p>No matches in {category==='All'?'the available sources':category.toLowerCase()}.</p><button onClick={()=>{setQuery('');setCategory('All')}}>Clear search and filters</button></div>}
    <footer className="ide-search-help">↑ ↓ choose · Enter open · History opens without executing · Symbols use current source · Oracle objects use loaded metadata</footer>
    </div></ModalBackdrop>;
}

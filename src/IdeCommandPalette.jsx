import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, FileCode2, Database, Command, ListTree } from 'lucide-react';
import { ModalBackdrop } from './ModalBackdrop';
import { useDialogFocus } from './ConnectionManager';

export function IdeCommandPalette({ mode, files, objects, connections, commands, outline, onChoose, onClose }) {
  const [query,setQuery]=useState(''),[active,setActive]=useState(0);
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const items=useMemo(()=>{
    const entries=mode==='outline'?outline.map(item=>({...item,id:`outline:${item.start}:${item.depth}`,label:item.name,detail:item.kind,kind:'outline'})):[
      ...files.map(item=>({...item,id:`file:${item.tabId||item.path}`,label:item.name||item.relativePath,detail:item.path||'Open SQL tab',kind:'file'})),
      ...objects.map(item=>({...item,id:`object:${item.owner}.${item.name}:${item.type}`,label:`${item.owner}.${item.name}`,detail:item.type,kind:'object'})),
      ...(mode==='commands'?[...connections.map(item=>({...item,id:`connection:${item.id}`,profileId:item.id,label:item.name||item.id,detail:item.env,kind:'connection'})),...commands.map(item=>({...item,kind:'command'}))]:[]),
    ];
    const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return entries.filter(item=>words.every(word=>`${item.label} ${item.detail||''}`.toLocaleLowerCase().includes(word))).slice(0,300);
  },[query,mode,files,objects,connections,commands,outline]);
  useEffect(()=>setActive(0),[query,mode]);
  useEffect(()=>{ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'})},[active]);
  const choose=item=>{if(!item||item.disabled)return;onClose();onChoose(item)};
  return <ModalBackdrop onClose={onClose}><div ref={ref} className="ide-command-palette" role="dialog" aria-modal="true" aria-label={mode==='outline'?'File outline':mode==='files'?'Quick open':'Command palette'} onKeyDown={event=>{
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&!(event.target.tagName==='INPUT'&&['Home','End'].includes(event.key))){event.preventDefault();setActive(value=>items.length?(event.key==='Home'?0:event.key==='End'?items.length-1:(value+(event.key==='ArrowUp'?-1:1)+items.length)%items.length):0)}
    if(event.key==='Enter'){event.preventDefault();choose(items[active])}
  }}><label className="ide-palette-search"><Search size={16}/><input autoFocus placeholder={mode==='outline'?'Find statement, CTE or PL/SQL block':mode==='files'?'Find SQL file or Oracle object':'Find command, file, connection or Oracle object'} value={query} onChange={event=>setQuery(event.target.value)} role="combobox" aria-label="Search" aria-autocomplete="list" aria-expanded="true" aria-controls="ide-command-results" aria-activedescendant={items[active]?`ide-command-${active}`:undefined}/><kbd>Esc</kbd></label><div id="ide-command-results" className="ide-palette-results" role="listbox">{items.map((item,index)=>{const Icon={file:FileCode2,object:Database,connection:Database,command:Command,outline:ListTree}[item.kind];return <button id={`ide-command-${index}`} role="option" key={item.id} aria-selected={active===index} aria-disabled={Boolean(item.disabled)} onPointerMove={()=>setActive(index)} onClick={()=>choose(item)} tabIndex={-1} style={{paddingLeft:12+(item.depth||0)*14}}><Icon size={14}/><span>{item.label}</span><small>{item.detail}</small></button>})}{!items.length&&<p>No matches</p>}</div></div></ModalBackdrop>;
}

import {Feedback,notifyFeedback} from './Feedback';
import { BinaryValue, ValueLength } from './ResultExtensions';
import { useEffect, useRef, useMemo, useState } from 'react';
import { ModalBackdrop } from './ModalBackdrop';
import { formatStructuredValue } from './resultFeatures';

function useResultDialogFocus(enabled=true) {
  const ref=useRef(null);
  useEffect(()=>{if(!enabled)return;const previous=document.activeElement;const element=ref.current;const focusable=()=>Array.from(element?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')||[]).filter(node=>node.getClientRects().length);(element?.querySelector('[data-settings-autofocus]')||focusable()[0])?.focus();const trap=e=>{if(e.key!=='Tab')return;const nodes=focusable(),first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&(document.activeElement===first||!element.contains(document.activeElement))){e.preventDefault();last?.focus()}else if(!e.shiftKey&&(document.activeElement===last||!element.contains(document.activeElement))){e.preventDefault();first?.focus()}};const contain=event=>{if(event.target.closest?.('.feedback-stack'))return;const overlays=document.querySelectorAll('.modal-backdrop');if(element?.closest('.modal-backdrop')===overlays[overlays.length-1]&&!element.contains(event.target))focusable()[0]?.focus()};element?.addEventListener('keydown',trap);document.addEventListener('focusin',contain);return()=>{document.removeEventListener('focusin',contain);element?.removeEventListener('keydown',trap);if(previous?.isConnected)previous.focus({preventScroll:true})}},[]);
  return ref;
}
function XmlNode({ node }) {
  if (node.nodeType === 3) return node.textContent.trim()?<span>{node.textContent}</span>:null;
  if (node.nodeType !== 1) return null;
  return <details open><summary>&lt;{node.nodeName}{Array.from(node.attributes).map(a=>` ${a.name}="${a.value}"`).join('')}&gt;</summary><div className="xml-children">{Array.from(node.childNodes).map((child,i)=><XmlNode key={i} node={child}/>)}</div></details>;
}
export function ResultValueDialog({ cell, onClose,embedded=false }) {
  const dialogRef=useResultDialogFocus(!embedded);
  const [format,setFormat]=useState('raw'),[search,setSearch]=useState(''),[copied,setCopied]=useState(false);
  const structured=useMemo(()=>{try{return {text:cell.value?.kind==='binary'?cell.value.base64:formatStructuredValue(cell.value,format)}}catch(error){return {text:String(cell.value??'NULL'),error:error.message}}},[cell.value,format]);
  const xml=useMemo(()=>{if(format!=='xml'||structured.error)return null;return new DOMParser().parseFromString(String(cell.value),'application/xml').documentElement},[cell.value,format,structured.error]);
  const parts=search?structured.text.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`,'gi')):[structured.text];
  const content=<section ref={dialogRef} role={embedded?undefined:"dialog"} aria-modal={embedded?undefined:"true"} aria-label="Cell value" className="result-tools-dialog value-dialog"><header><strong>{cell.column?.name} · Row {cell.row}</strong><button aria-label="Close cell value" onClick={onClose}>×</button></header><div className="result-form-row"><select disabled={cell.value?.kind==='binary'} aria-label="Value format" value={format} onChange={e=>setFormat(e.target.value)}><option value="raw">Raw</option><option value="json">JSON</option><option value="xml">XML tree</option></select><input aria-label="Search full value" placeholder="Search full value" value={search} onChange={e=>setSearch(e.target.value)}/><span>{cell.column?.type}</span><ValueLength value={cell.value}/></div>{structured.error&&<Feedback title="Value could not be parsed">{structured.error}</Feedback>}<div className="result-value-content">{cell.value?.kind==='binary'?<BinaryValue value={cell.value}/>:xml&&!search?<XmlNode node={xml}/>:<pre>{parts.map((part,i)=>search&&part.toLowerCase()===search.toLowerCase()?<mark key={i}>{part}</mark>:part)}</pre>}</div><footer><button onClick={async()=>{try{await navigator.clipboard.writeText(structured.text);setCopied(true);notifyFeedback({kind:'success',title:'Cell value',message:'Copied'})}catch{setCopied(false);notifyFeedback({kind:'error',title:'Copy failed',message:'Could not copy the cell value.'})}}}>{copied?'Copied':'Copy value'}</button><button onClick={onClose}>Close</button></footer></section>;
  return embedded?content:<ModalBackdrop onClose={onClose}>{content}</ModalBackdrop>;
}

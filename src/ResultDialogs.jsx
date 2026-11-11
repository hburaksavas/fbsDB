import {Feedback,notifyFeedback} from './Feedback';
import { BinaryValue, ValueLength } from './ResultExtensions';
import { useEffect, useRef, useMemo, useState } from 'react';
import { ModalBackdrop } from './ModalBackdrop';
import { formatStructuredValue } from './resultFeatures';
import { TimezoneLens } from './TimezoneLens.jsx';
import { findValueMatches, splitByMatches } from './valueSearch';
import { defaultValueViewer } from './resultViewers';
import { JsonTree } from './JsonTree.jsx';
import { jsonFieldSql } from './jsonPathSql';
import { elementModel, xmlTableSql } from './xmlTableSql';
import { isLobPreview } from './lobValues.js';
import { LobValueViewer } from './LobValueViewer.jsx';

function useResultDialogFocus(enabled=true) {
  const ref=useRef(null);
  useEffect(()=>{if(!enabled)return;const previous=document.activeElement;const element=ref.current;const focusable=()=>Array.from(element?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')||[]).filter(node=>node.getClientRects().length);(element?.querySelector('[data-settings-autofocus]')||focusable()[0])?.focus();const trap=e=>{if(e.key!=='Tab')return;const nodes=focusable(),first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&(document.activeElement===first||!element.contains(document.activeElement))){e.preventDefault();last?.focus()}else if(!e.shiftKey&&(document.activeElement===last||!element.contains(document.activeElement))){e.preventDefault();first?.focus()}};const contain=event=>{if(event.target.closest?.('.feedback-stack'))return;const overlays=document.querySelectorAll('.modal-backdrop');if(element?.closest('.modal-backdrop')===overlays[overlays.length-1]&&!element.contains(event.target))focusable()[0]?.focus()};element?.addEventListener('keydown',trap);document.addEventListener('focusin',contain);return()=>{document.removeEventListener('focusin',contain);element?.removeEventListener('keydown',trap);if(previous?.isConnected)previous.focus({preventScroll:true})}},[]);
  return ref;
}
function XmlNode({ node, onSqlDraft }) {
  if (node.nodeType === 3) return node.textContent.trim()?<span>{node.textContent}</span>:null;
  if (node.nodeType !== 1) return null;
  return <details open><summary>&lt;{node.nodeName}{Array.from(node.attributes).map(a=>` ${a.name}="${a.value}"`).join('')}&gt;{onSqlDraft&&<button type="button" className="json-tree-path xml-sql-draft" title={`Open an XMLTABLE draft with ${node.nodeName} as the row path`} onClick={event=>{event.preventDefault();event.stopPropagation();onSqlDraft(node)}}>SQL draft</button>}</summary><div className="xml-children">{Array.from(node.childNodes).map((child,i)=><XmlNode key={i} node={child} onSqlDraft={onSqlDraft}/>)}</div></details>;
}
// Maps a DOM element to the namespace-aware element model by its child-index path from the document element.
function xmlDraft(root,node,column){
  const indices=[];for(let current=node;current&&current!==root;current=current.parentElement)indices.unshift([...current.parentElement.children].indexOf(current));
  const model=elementModel(root);let element=model;for(const index of indices)element=element.children[index];
  return xmlTableSql({element,root:model,column,sourceSchema:column?.sourceSchema,sourceTable:column?.sourceTable});
}
// A large value still sent as a preview gets its own viewer; once loaded whole the cell holds the full value and the usual viewer takes over.
export function ResultValueDialog(props) { return isLobPreview(props.cell?.value) ? <LobValueDialog {...props}/> : <FullValueDialog {...props}/>; }
function LobValueDialog({ cell, onClose, embedded=false }) {
  const dialogRef=useResultDialogFocus(!embedded);
  const content=<section ref={dialogRef} role={embedded?undefined:"dialog"} aria-modal={embedded?undefined:"true"} aria-label="Cell value" className="result-tools-dialog value-dialog"><header><strong>{cell.column?.name} · Row {cell.row}</strong><button aria-label="Close cell value" onClick={onClose}>×</button></header><div className="result-form-row"><span>{cell.column?.type}</span></div><LobValueViewer value={cell.value}/><footer><button onClick={onClose}>Close</button></footer></section>;
  return embedded?content:<ModalBackdrop onClose={onClose}>{content}</ModalBackdrop>;
}
function FullValueDialog({ cell, onClose,embedded=false }) {
  const dialogRef=useResultDialogFocus(!embedded);
  const [format,setFormat]=useState(()=>defaultValueViewer(cell.column,cell.value)),[search,setSearch]=useState(''),[copied,setCopied]=useState(false);
  const structured=useMemo(()=>{try{return {text:cell.value?.kind==='binary'?cell.value.base64:formatStructuredValue(cell.value,format==='jsonTree'?'json':format)}}catch(error){return {text:String(cell.value??'NULL'),error:error.message}}},[cell.value,format]);
  const xml=useMemo(()=>{if(format!=='xml'||structured.error)return null;return new DOMParser().parseFromString(String(cell.value),'application/xml').documentElement},[cell.value,format,structured.error]);
  const treeData=useMemo(()=>{if(format!=='jsonTree'||structured.error)return undefined;try{return JSON.parse(structured.text)}catch{return undefined}},[format,structured]);
  const found=useMemo(()=>findValueMatches(structured.text,search),[structured.text,search]),[active,setActive]=useState(0),valueRoot=useRef(null);
  const parts=useMemo(()=>splitByMatches(structured.text,found.matches),[structured.text,found]);
  useEffect(()=>setActive(0),[search,format]);
  useEffect(()=>{valueRoot.current?.querySelector('mark.active-match')?.scrollIntoView({block:'nearest',inline:'nearest'})},[active,found]);
  const step=direction=>{if(found.matches.length)setActive(current=>(current+direction+found.matches.length)%found.matches.length)};
  const current=found.matches[active];
  const content=<section ref={dialogRef} role={embedded?undefined:"dialog"} aria-modal={embedded?undefined:"true"} aria-label="Cell value" className="result-tools-dialog value-dialog"><header><strong>{cell.column?.name} · Row {cell.row}</strong><button aria-label="Close cell value" onClick={onClose}>×</button></header><div className="result-form-row"><select disabled={cell.value?.kind==='binary'} aria-label="Value format" value={format} onChange={e=>setFormat(e.target.value)}><option value="raw">Raw</option><option value="json">JSON</option><option value="jsonTree">JSON tree</option><option value="xml">XML tree</option></select><input aria-label="Search full value" placeholder="Search full value" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();step(e.shiftKey?-1:1)}}}/>{search&&<span className="value-search-status" role="status">{found.matches.length?`${active+1} / ${found.matches.length}${found.truncated?'+':''} · line ${current.line}, col ${current.column}`:'No matches'}</span>}{search&&<><button aria-label="Previous match" disabled={!found.matches.length} onClick={()=>step(-1)}>↑</button><button aria-label="Next match" disabled={!found.matches.length} onClick={()=>step(1)}>↓</button></>}<span>{cell.column?.type}</span><ValueLength value={cell.value}/></div>{structured.error&&<Feedback title="Value could not be parsed">{structured.error}</Feedback>}{cell.value?.kind==='temporal'&&<TimezoneLens value={cell.value}/>}<div className="result-value-content" ref={valueRoot}>{cell.value?.kind==='binary'?<BinaryValue value={cell.value}/>:xml&&!search?<XmlNode node={xml} onSqlDraft={node=>window.dispatchEvent(new CustomEvent('fbsdb.result.sqlDraft',{detail:{sql:xmlDraft(xml,node,cell.column)}}))}/>:treeData!==undefined&&!search?<JsonTree data={treeData} onSqlDraft={row=>window.dispatchEvent(new CustomEvent('fbsdb.result.sqlDraft',{detail:{sql:jsonFieldSql({column:cell.column,path:row.path,type:row.type,sourceSchema:cell.column?.sourceSchema,sourceTable:cell.column?.sourceTable})}}))} onPath={path=>{navigator.clipboard.writeText(path).then(()=>notifyFeedback({kind:'success',title:'JSON path',message:`Copied ${path}`}),()=>{})}}/>:<pre>{parts.map((part,i)=>part.match!=null?<mark key={i} className={part.match===active?'active-match':undefined}>{part.text}</mark>:part.text)}</pre>}</div><footer><button onClick={async()=>{try{await navigator.clipboard.writeText(structured.text);setCopied(true);notifyFeedback({kind:'success',title:'Cell value',message:'Copied'})}catch{setCopied(false);notifyFeedback({kind:'error',title:'Copy failed',message:'Could not copy the cell value.'})}}}>{copied?'Copied':'Copy value'}</button><button onClick={onClose}>Close</button></footer></section>;
  return embedded?content:<ModalBackdrop onClose={onClose}>{content}</ModalBackdrop>;
}

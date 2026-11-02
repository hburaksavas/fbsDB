import {useMemo,useRef,useState} from 'react';
import {initialJsonExpansion,jsonTreeRows} from './resultViewers';

const preview=row=>row.container?`${row.type==='array'?'[':'{'}${row.size} ${row.type==='array'?'item':'key'}${row.size===1?'':'s'}${row.type==='array'?']':'}'}`:row.type==='string'?JSON.stringify(row.value):String(row.value);

// Read-only tree over the parsed value; paths use JSONPath notation so they can seed SQL drafts.
export function JsonTree({data,onPath,onSqlDraft}){
 const [open,setOpen]=useState(()=>initialJsonExpansion(data)),[focus,setFocus]=useState('$'),root=useRef(null);
 const {rows,truncated}=useMemo(()=>jsonTreeRows(data,open),[data,open]);
 const toggle=(path,value)=>setOpen(current=>{const next=new Set(current);(value??!next.has(path))?next.add(path):next.delete(path);return next});
 const key=event=>{
  const index=rows.findIndex(row=>row.path===focus),row=rows[index];if(!row)return;
  const go=target=>{if(!target)return;event.preventDefault();setFocus(target.path);requestAnimationFrame(()=>root.current?.querySelector(`[data-path="${CSS.escape(target.path)}"]`)?.focus())};
  if(event.key==='ArrowDown')go(rows[index+1]);
  else if(event.key==='ArrowUp')go(rows[index-1]);
  else if(event.key==='ArrowRight'&&row.container){event.preventDefault();if(!row.open)toggle(row.path,true);else go(rows[index+1])}
  else if(event.key==='ArrowLeft'){event.preventDefault();if(row.open)toggle(row.path,false);else go([...rows.slice(0,index)].reverse().find(item=>item.depth<row.depth))}
  else if(event.key==='Enter'&&onPath){event.preventDefault();onPath(row.path)}
 };
 return <div className="json-tree" role="tree" aria-label="JSON tree" ref={root} onKeyDown={key}>
  {rows.map(row=><div key={row.path} role="treeitem" aria-level={row.depth+1} aria-expanded={row.container?row.open:undefined} data-path={row.path} tabIndex={row.path===focus?0:-1} className="json-tree-row" style={{paddingLeft:row.depth*14+4}} onFocus={()=>setFocus(row.path)} onClick={()=>{setFocus(row.path);if(row.container)toggle(row.path)}}>
   <span className="json-tree-toggle" aria-hidden="true">{row.container?(row.open?'▾':'▸'):''}</span>
   {row.key!=null&&<span className="json-tree-key">{typeof row.key==='number'?row.key:JSON.stringify(row.key)}:</span>}
   <span className={`json-tree-value json-${row.type}`}>{preview(row)}</span>
   {onPath&&row.path===focus&&<button type="button" className="json-tree-path" title={`Copy ${row.path}`} onClick={event=>{event.stopPropagation();onPath(row.path)}}>{row.path}</button>}{onSqlDraft&&row.path===focus&&row.path!=='$'&&<button type="button" className="json-tree-path" title={`Open a ${row.container?'JSON_QUERY':'JSON_VALUE'} draft for ${row.path} in a new SQL tab`} onClick={event=>{event.stopPropagation();onSqlDraft(row)}}>SQL draft</button>}
  </div>)}
  {truncated&&<p role="status">Showing the first 5,000 nodes. Collapse branches or use Raw/JSON to see the rest.</p>}
 </div>;
}

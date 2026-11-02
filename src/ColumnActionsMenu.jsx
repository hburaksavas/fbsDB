import {FilteredMenuItems} from './FilteredMenuItems.jsx';
import {useFeedbackState,Feedback} from './Feedback';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { visibleFocusTargets } from './focusManagement';
import { columnKind, columnStatistics, validateColumnRule } from './resultColumnActions';
import { TypedColumnFilter } from './TypedColumnFilter.jsx';

const conditions = [['contains','Contains'],['equals','Equals'],['notEquals','Does not equal'],['gt','Greater than'],['gte','Greater than or equal'],['lt','Less than'],['lte','Less than or equal'],['starts','Starts with'],['ends','Ends with'],['null','Is NULL'],['notNull','Is not NULL']];

export function ColumnActionsMenu({ column, index, position, trigger, portalTarget, rows, width, hiddenColumns, pin, canMove, hasSelection, hasSelectedValue, selectedValue, sort, hasFilter, hasHighlight, canSql, canSource, canAlias = false, canSourceExpression = false, alias = null, onAction, onClose }) {
  const [panel,setPanel]=useState('main'),[op,setOp]=useState(columnKind(column)==='text'?'contains':'equals'),[value,setValue]=useState(''),[color,setColor]=useState('teal'),[customWidth,setCustomWidth]=useState(width);
  const [error,setError]=useFeedbackState('',{title:'Column rule'});
  const root=useRef(null);
  const statistics=useMemo(()=>panel==='statistics'?columnStatistics(rows,column,index):null,[panel,rows,column,index]);
  useLayoutEffect(()=>{
    const menu=root.current;if(!menu)return;
    const rect=menu.getBoundingClientRect();
    menu.style.left=`${Math.max(8,Math.min(position.x,innerWidth-rect.width-8))}px`;
    menu.style.top=`${Math.max(8,Math.min(position.y,innerHeight-rect.height-8))}px`;
    (menu.querySelector('[data-autofocus]')||visibleFocusTargets(menu)[0])?.focus({preventScroll:true});
  },[panel,position]);
  useEffect(()=>{
    const outside=event=>{if(!root.current?.contains(event.target))onClose(false)};
    const escape=event=>{if(event.key==='Escape'&&!document.querySelector('.modal-backdrop')){event.preventDefault();event.stopImmediatePropagation();onClose(true)}};
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);
    const resize=()=>onClose(true);window.addEventListener('resize',resize);
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true);window.removeEventListener('resize',resize)};
  },[onClose]);
  const act=(action,payload)=>onAction(action,payload);
  const button=(label,action,payload,disabled=false)=> <button key={label} type="button" role="menuitem" disabled={disabled} onClick={()=>act(action,payload)}>{label}</button>;
  const submenu=(label,id,disabled=false)=><button key={id} type="button" role="menuitem" disabled={disabled} aria-haspopup="menu" onClick={()=>setPanel(id)}>{label}<ChevronRight size={13}/></button>;
  const ruleForm=kind=><form className="column-action-form" onSubmit={event=>{event.preventDefault();try{validateColumnRule(column,op,value);act(kind,{column:index,op,kind:columnKind(column),value,group:'root',...(kind==='highlight'?{color}:{})})}catch(e){setError(e.message)}}}>
    <label>Condition<select aria-label={`${column.name} ${kind} condition`} value={op} onChange={event=>setOp(event.target.value)}>{conditions.filter(([id])=>columnKind(column)==='text'||!['contains','starts','ends'].includes(id)).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    {!['null','notNull'].includes(op)&&<label>Value<input data-autofocus autoComplete="off" aria-label={`${column.name} ${kind} value`} required value={value} placeholder={columnKind(column)==='number'?'Exact decimal':columnKind(column)==='date'?'YYYY-MM-DDTHH:mm:ss':''} onChange={event=>setValue(event.target.value)}/></label>}
    {kind==='highlight'&&<label>Color<select aria-label="Column highlight color" value={color} onChange={event=>setColor(event.target.value)}><option value="teal">Teal</option><option value="amber">Amber</option><option value="rose">Rose</option></select></label>}
    {error&&<Feedback title="Column rule">{error}</Feedback>}
    <button type="submit" disabled={!['null','notNull'].includes(op)&&!value}>Add {kind==='highlight'?'highlight':'filter'}</button>
  </form>;
  const titles={copy:'Copy',sort:'Sort',filter:'Filter',width:'Column width',pin:'Pin column',move:'Move column',hidden:'Hidden columns',statistics:'Statistics',highlight:'Highlight',details:'Column details',sql:'Generate SQL'};
  const content=<div ref={root} role="menu" aria-label={`${column.name} column actions`} className="column-actions-menu" onContextMenu={event=>event.preventDefault()} onKeyDown={event=>{
    if(event.key==='Tab'){const items=visibleFocusTargets(root.current);if(panel==='main'||event.shiftKey&&document.activeElement===items[0]||!event.shiftKey&&document.activeElement===items.at(-1))onClose(true);return;}
    if(event.key==='ArrowLeft'&&panel!=='main'&&!['INPUT','SELECT'].includes(event.target.tagName)){event.preventDefault();setPanel('main');return;}
    if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key)||['INPUT','SELECT'].includes(event.target.tagName))return;
    const items=visibleFocusTargets(root.current),at=items.indexOf(document.activeElement);event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(at+(event.key==='ArrowUp'?-1:1)+items.length)%items.length]?.focus();
  }}>
    <header>{panel!=='main'&&<button className="column-menu-back" aria-label="Back to column actions" onClick={()=>setPanel('main')}><ChevronLeft size={14}/></button>}<div><strong>{column.name}</strong>{panel!=='main'&&<span>{titles[panel]}</span>}</div></header>
    {panel==='main'?<FilteredMenuItems>
      {button('Select All','select',null,!rows.length)}{submenu('Copy','copy')}{button('Format…','format')}{canSourceExpression&&button('Show source expression','sourceExpression')}{canAlias&&button(alias?'Rename display heading…':'Set display heading…','alias')}{canAlias&&alias&&button('Restore original heading','clearAlias')}{submenu('Sort','sort')}{submenu('Filter…','filter')}
      <hr/>{submenu('Column Width','width')}{submenu('Pin Column','pin')}{submenu('Move Column','move')}{button('Hide Column','hide',null,!canMove.hide)}{submenu('Show Hidden Columns…','hidden',!hiddenColumns.length)}
      <hr/>{submenu('Statistics…','statistics')}{submenu('Highlight…','highlight')}{submenu('Column Details','details')}{submenu('Generate SQL','sql',!canSql)}
    </FilteredMenuItems>:panel==='copy'?<>{button('Column name','copyName')}{button('SQL identifier','copyIdentifier')}{button('All loaded values','copyAll',false,!rows.length)}{button('Values with header','copyAll',true,!rows.length)}{button('Selected values','copySelected',null,!hasSelection)}</>
    :panel==='sort'?<>{button('Sort ascending','sort',{direction:'asc'})}{button('Sort descending','sort',{direction:'desc'})}{button('Add ascending to multi-sort','sort',{direction:'asc',multi:true})}{button('Add descending to multi-sort','sort',{direction:'desc',multi:true})}{button('Remove this column sort','sort',{clear:true},!sort)}<p>{sort?`Current: ${sort}`:'Not sorted'} · Shift-click a title to extend sorting.</p></>
    :panel==='filter'?<><TypedColumnFilter column={column} index={index} rows={rows} onApply={rule=>act('filter',rule)}/><hr/>{ruleForm('filter')}<hr/>{button('Only NULL values','filter',{column:index,op:'null',group:'root'})}{button('Only non-NULL values','filter',{column:index,op:'notNull',group:'root'})}{button('Keep selected value','filter',{column:index,op:selectedValue==null?'null':'equals',kind:columnKind(column),value:selectedValue==null?'':String(selectedValue),group:'root'},!hasSelectedValue)}{button('Exclude selected value','filter',{column:index,op:selectedValue==null?'notNull':'notEquals',kind:columnKind(column),value:selectedValue==null?'':String(selectedValue),group:'root'},!hasSelectedValue)}{button('Clear this column filters','clearFilters',null,!hasFilter)}</>
    :panel==='width'?<>{button('Fit to content','fitContent')}{button('Fit to title','fitTitle')}<form className="column-action-form" onSubmit={event=>{event.preventDefault();act('width',Number(customWidth))}}><label>Width (px)<input data-autofocus aria-label={`${column.name} width`} type="number" min="70" max="1200" required value={customWidth} onChange={event=>setCustomWidth(event.target.value)}/></label><button type="submit">Apply width</button></form></>
    :panel==='pin'?<>{button('Pin left','pin','left')}{button('Pin right','pin','right')}{button('Unpin','pin',null,!pin)}<p>{pin?`Pinned ${pin}`:'Not pinned'}</p></>
    :panel==='move'?<>{[['Move first','first'],['Move left','left'],['Move right','right'],['Move last','last']].map(([label,value])=>button(label,'move',value,!canMove[value]))}{pin&&<p>Unpin this column to change its position.</p>}</>
    :panel==='hidden'?<>{hiddenColumns.map(item=>button(`Show ${item.name}`,'show',item.index))}{button('Show all columns','showAll')}</>
    :panel==='statistics'?<dl className="column-action-details">{[['Loaded rows',statistics.count],['NULL values',statistics.nulls],['Non-NULL values',statistics.nonNulls],['Distinct non-NULL values',statistics.distinct],...(statistics.numericCount?[['Numeric values',statistics.numericCount],['Sum',statistics.sum],['Average',statistics.average],['Min',statistics.min],['Max',statistics.max]]:[])].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    :panel==='highlight'?<>{ruleForm('highlight')}{button('Clear this column highlights','clearHighlights',null,!hasHighlight)}</>
    :panel==='details'?<><dl className="column-action-details">{[['Oracle type',column.type],['Precision',column.precision],['Scale',column.scale],['Size',column.size],['Nullable',column.nullable==null?'Unknown':column.nullable?'Yes':'No'],['Source schema',column.sourceSchema],['Source table',column.sourceTable],['Source column',column.sourceColumn],['Comment',column.comment||column.description]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value??'—'}</dd></div>)}</dl>{button('Load source definition / keys…','source',null,!column.sourceTable||!canSource)}</>
    :panel==='sql'?<>{button('Insert column identifier','sql','identifier')}{button('Insert SELECT draft','sql','select')}{button('Insert WHERE draft','sql','where')}{button('Insert ORDER BY draft','sql','order')}<p>Drafts are inserted into the SQL editor without execution.</p></>:null}
    <footer>Loaded rows in the current view only</footer>
  </div>;
  return createPortal(content,portalTarget||trigger?.closest('.desktop-shell')||document.body);
}

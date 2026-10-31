import {Feedback} from './Feedback';
import { useEffect } from 'react';
import { Database, FileCode2, KeyRound, X } from 'lucide-react';

import {oracleInspectorTabs as objectTabs} from './oracleObjectActions.js';

const list = value => Array.isArray(value) ? value : [];
const safeConnectString = value => String(value ?? '').replace(/(password\s*=\s*)[^)\s]+/gi, '$1••••').replace(/(^|[/:])[^/@\s:]+\/[^@/\s]+@/g, '$1••••@');
const property = (details, name) => list(details).find(item => item.name === name)?.value;

function PropertyList({ items }) {
  return items.length ? <dl className="oracle-inspector-properties">{items.map(([name, value], index) => <div key={`${name}-${index}`}><dt>{name}</dt><dd>{value || '—'}</dd></div>)}</dl> : <p className="oracle-inspector-empty">No accessible metadata for this object.</p>;
}

function ColumnList({ columns, mode = 'column' }) {
  return columns.length ? <div className="oracle-inspector-column-list">{columns.map((column, index) => <article className="oracle-inspector-column" key={`${column.name}-${index}`}><div><b>{column.name}</b><span>{mode === 'index' ? '' : column.type}{mode === 'column' && (column.precision != null ? `(${column.precision}${column.scale != null ? `,${column.scale}` : ''})` : column.length != null ? `(${column.characterLength ?? column.length}${column.lengthUnit === 'CHAR' ? ' CHAR' : ''})` : '')}</span></div><small>{mode === 'index' ? column.type : mode === 'column' ? `${column.nullable ? 'NULL' : 'NOT NULL'}${column.indexed ? ' · Indexed' : ''}${column.defaultValue ? ` · DEFAULT ${column.defaultValue}` : ''}` : ''}</small>{column.comment && <p>{column.comment}</p>}</article>)}</div> : <p className="oracle-inspector-empty">Column metadata is unavailable or this object has no columns.</p>;
}

export function OracleObjectInspector({ object, analysis, activeDetailTab, onDetailTabChange, onClose, onNavigate, onLookup }) {
  const tabs = objectTabs[object?.type] || ['Overview', 'Definition'];
  const tab = activeDetailTab || 'Overview';
  useEffect(() => { if (!tabs.includes(tab)) onDetailTabChange('Overview'); }, [object?.type, tab, onDetailTabChange]);
  if (!object) return null;
  const details = list(object.details), columns = list(object.columns);
  const matches = analysis?.target?.owner === object.owner && analysis.target.name === object.name && analysis.target.type === object.type;
  const data = matches ? analysis.data : null;
  const loading = matches && analysis.loading;
  const definition = data?.ddl || (property(details, 'Definition') ? String(property(details, 'Definition')) : '');
  const source = property(details, 'Source') || definition;
  const body = property(details, 'Body');
  const commonProperties = details.filter(item => !['Source', 'Body', 'Definition', 'Member', 'Method'].includes(item.name) && !item.name.startsWith('Constraint · ') && !item.name.startsWith('Index · ') && !(['PROCEDURE', 'FUNCTION'].includes(object.type) && item.value.includes(' · position ')));
  const grants = list(data?.grants), relationships = list(tab === 'Impact' ? data?.impact : data?.dependencies);
  const sourceTabs = ['Specification', 'Source'];
  const selectedSource = sourceTabs.includes(tab) ? source : tab === 'Body' ? body : definition;
  const selectedSourceLabel = tab === 'Specification' ? 'Package or type specification' : tab === 'Body' ? 'Package or type body' : tab === 'Source' ? `${object.type.toLowerCase()} source` : 'DDL';
  const namedDetails = prefix => details.filter(item => item.name.startsWith(prefix)).map(item => [item.name.replace(prefix, ''), item.value]);

  let content;
  if (tab === 'Overview') content = loading && !details.length ? <Feedback kind="progress" title="Oracle metadata">Loading object metadata…</Feedback> : <PropertyList items={commonProperties.map(item => [item.name, object.type === 'DATABASE LINK' && item.name === 'Connect string' ? safeConnectString(item.value) : item.value])}/>;
  else if (tab === 'Columns' || tab === 'Attributes') content = <><div className="oracle-inspector-actions">{object.type === 'TABLE' && <button disabled={!columns.length} onClick={onLookup}><KeyRound size={12}/> Find by primary key</button>}</div><ColumnList columns={columns} mode={tab === 'Attributes' ? 'attribute' : object.type === 'INDEX' ? 'index' : 'column'}/></>;
  else if (tab === 'Errors') content = details.some(item=>item.name.startsWith('Compilation error'))?<PropertyList items={details.filter(item=>item.name.startsWith('Compilation error')).map(item=>[item.name,item.value])}/>:<p className="oracle-inspector-empty">No compilation errors reported.</p>;
  else if (tab === 'Constraints') content = <PropertyList items={namedDetails('Constraint · ')}/>;
  else if (tab === 'Indexes') content = <PropertyList items={namedDetails('Index · ')}/>;
  else if (tab === 'Index') content = <PropertyList items={commonProperties.map(item => [item.name, item.value])}/>;
  else if (tab === 'Constraint') content = <PropertyList items={commonProperties.map(item => [item.name, item.value])}/>;
  else if (tab === 'Refresh') content = <PropertyList items={commonProperties.filter(item => /refresh|staleness|build mode|fast refresh/i.test(item.name)).map(item => [item.name, item.value])}/>;
  else if (tab === 'Sequence') content = <PropertyList items={commonProperties.filter(item => /minimum|maximum|increment|cycle|order|cache|next value/i.test(item.name)).map(item => [item.name, item.value])}/>;
  else if (tab === 'Trigger') content = <PropertyList items={commonProperties.filter(item => /table|base object|trigger type|event|status|description|when clause/i.test(item.name)).map(item => [item.name, item.value])}/>;
  else if (tab === 'Target') content = <PropertyList items={commonProperties.filter(item => /target|connect string|username|created/i.test(item.name)).map(item => [item.name, object.type === 'DATABASE LINK' && item.name === 'Connect string' ? safeConnectString(item.value) : item.value])}/>;
  else if (tab === 'Members') content = <PropertyList items={details.filter(item => item.name === 'Member').map((item, index) => [`Member ${index + 1}`, item.value])}/>;
  else if (tab === 'Methods') content = <PropertyList items={details.filter(item => item.name === 'Method').map((item, index) => [`Method ${index + 1}`, item.value])}/>;
  else if (tab === 'Parameters') content = <PropertyList items={details.filter(item => item.value.includes(' · position ')).map(item => [item.name, item.value])}/>;
  else if (tab === 'Related tables') {
    const groups=new Map();
    for(const fk of list(data?.relationships)){
      const key=JSON.stringify([fk.owner,fk.table,fk.name]),outgoing=fk.owner===object.owner&&fk.table===object.name;
      if(!groups.has(key))groups.set(key,{owner:outgoing?fk.targetOwner:fk.owner,name:outgoing?fk.targetTable:fk.table,type:'TABLE',direction:outgoing?'References':'Referenced by',constraint:fk.name,columns:[]});
      groups.get(key).columns.push(`${fk.column} → ${fk.targetColumn}`);
    }
    content=loading?<Feedback kind="progress" title="Oracle metadata">Loading relationships…</Feedback>:groups.size?<div className="oracle-dependency-list">{[...groups.values()].map(item=><button className="oracle-inspector-dependency" key={item.owner+item.name+item.constraint} title={item.columns.join(', ')} onClick={()=>onNavigate(item)}><Database size={13}/><span>{item.owner}.{item.name}</span><small>{item.direction} · {item.constraint}</small></button>)}</div>:<p className="oracle-inspector-empty">No accessible foreign-key relationships.</p>;
  }
  else if (tab === 'Definition' || sourceTabs.includes(tab) || tab === 'Body') content = loading && !selectedSource ? <Feedback kind="progress" title="Oracle metadata">Loading read-only definition…</Feedback> : selectedSource ? <><p className="oracle-inspector-source-label">{selectedSourceLabel} · read only</p><pre className="oracle-inspector-source">{selectedSource}</pre></> : <p className="oracle-inspector-empty">{data?.ddlError || 'Definition or source is unavailable for this object or account.'}</p>;
  else if (tab === 'Grants') content = loading && !data ? <Feedback kind="progress" title="Oracle metadata">Loading grants…</Feedback> : grants.length ? <div className="oracle-inspector-table"><div className="oracle-inspector-table-head"><span>Grantee</span><span>Privilege</span><span>Column</span><span>Grantable</span><span>Grantor</span></div>{grants.map((grant, index) => <div className="oracle-inspector-table-row" key={`${grant.grantee}-${grant.privilege}-${index}`}><span>{grant.grantee}</span><span>{grant.privilege}</span><span>{grant.column || '—'}</span><span>{grant.grantable ? 'Yes' : 'No'}</span><span>{grant.grantor}</span></div>)}</div> : <p className="oracle-inspector-empty">No accessible object or column grants.</p>;
  else if (tab === 'Dependencies' || tab === 'Impact') content = loading && !data ? <Feedback kind="progress" title="Oracle metadata">Loading {tab.toLowerCase()}…</Feedback> : relationships.length ? <div className="oracle-dependency-list">{relationships.map((item, index) => <button className="oracle-inspector-dependency" key={`${item.owner}.${item.type}.${item.name}.${index}`} disabled={Boolean(item.link)} onClick={() => onNavigate(item)}><FileCode2 size={13}/><span>{item.owner}.{item.name}</span><small>{item.type}{item.link ? ` @${item.link}` : ''}</small></button>)}</div> : <p className="oracle-inspector-empty">No accessible {tab.toLowerCase()} recorded by Oracle.</p>;

  return <section className="oracle-object-inspector" aria-label={`Inspect ${object.owner}.${object.name}`}>
    <header><div><b>{object.owner}.{object.name}</b><small>{object.type} · {object.stale ? 'Showing cached metadata' : 'Oracle object'}{object.type === 'DATABASE LINK' ? ' · passwords are never shown' : ''}</small></div><button className="icon-button" aria-label="Close object inspector" onClick={onClose}><X size={14}/></button></header>
    <nav aria-label="Object inspector tabs">{tabs.map(name=><button key={name} aria-selected={tab===name} onClick={()=>onDetailTabChange(name)}>{name}</button>)}</nav>
    <div className="oracle-object-inspector-body" aria-live="polite">{content}{tab==='Overview'&&matches&&!loading&&data&&!definition&&!source&&!body&&<p className="oracle-inspector-empty" title={data.ddlError||undefined}>Definition unavailable</p>}</div>
  </section>;
}

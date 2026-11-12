// Object Explorer tree: schema, object type and object rows, virtualized for large schemas.
import { useEffect, useState } from "react";
import { OracleObjectIcon } from './OracleObjectIcon';
import { ChevronRight, Database } from "lucide-react";

const oracleObjectKinds = [
  ["TABLE", "Tables"], ["VIEW", "Views"], ["MATERIALIZED VIEW", "Materialized Views"], ["SYNONYM", "Synonyms"],
  ["PACKAGE", "Packages"], ["PROCEDURE", "Procedures"], ["FUNCTION", "Functions"], ["TRIGGER", "Triggers"],
  ["SEQUENCE", "Sequences"], ["INDEX", "Indexes"], ["CONSTRAINT", "Constraints"], ["TYPE", "Types"], ["DATABASE LINK", "Database Links"],
];

export const oracleSchemaKey = (item) => item.key || `${item.owner || ""}.${item.type || ""}.${item.name || ""}`;

export const oracleObjectLabel = (type) => oracleObjectKinds.find(([kind]) => kind === type)?.[1] || type;

export const isOracleRelation = (item) => ["TABLE", "VIEW", "MATERIALIZED VIEW", "SYNONYM"].includes(item?.type);

export const makeOracleRelationLookup = (items, currentSchema) => new Map(items.filter(isOracleRelation).sort((a, b) => Number(a.owner === currentSchema) - Number(b.owner === currentSchema)).map((item) => [item.name.toLowerCase(), item]));

function VirtualOracleObjects({ items, renderItem }) {
  const [top, setTop] = useState(0);
  const rowHeight = 25, viewport = 250, threshold = 100;
  if (items.length <= threshold) return items.map(renderItem);
  const start = Math.min(items.length, Math.floor(top / rowHeight));
  const count = Math.ceil(viewport / rowHeight) + 5;
  return <div className="oracle-object-virtual-list" style={{ maxHeight: viewport }} onScroll={event => setTop(event.currentTarget.scrollTop)} role="group" aria-label={`${items.length} Oracle objects`}>
    <div style={{ height: start * rowHeight }} />{items.slice(start, start + count).map(renderItem)}<div style={{ height: Math.max(0, (items.length - start - count) * rowHeight) }} />
  </div>;
}

function OracleObjectRow({ item, activeKey, onToggle, onContext, onDragStart, contextKey, query = "", searchMatch = "" }) {
  const key = oracleSchemaKey(item), isSelected = activeKey === key;
  return <div className="oracle-object-node" key={key}>
    <div className="oracle-object-line">
    <button className={`oracle-object-row ${isSelected ? "active" : ""}`} data-object-key={key} data-context-selected={contextKey===key||undefined} draggable={isOracleRelation(item)} onDragStart={event=>onDragStart?.(event,item)} onContextMenu={event=>onContext?.(event,item)} onKeyDown={event=>{if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){event.preventDefault();onContext?.(event,item)}}} title="Double-click to open object details; drag to editor for SELECT" onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggle(item); }}>
      <OracleObjectIcon type={item.type} size={14} /><span className="oracle-object-name">{item.name}</span>{searchMatch && <small className="oracle-search-match">{searchMatch}</small>}{item.type === "SYNONYM" && <small className="oracle-object-target">→ {item.targetOwner || "PUBLIC"}.{item.targetName}{item.dbLink ? `@${item.dbLink}` : ""}</small>}
    </button>
    </div>
    {isOracleRelation(item)&&item.columns?.length>0&&<details className="oracle-object-columns"><summary>Columns ({item.columns.length})</summary>{item.columns.slice(0,200).map(column=><button type="button" key={column.name} draggable onDragStart={event=>onDragStart?.(event,item,column.name)} title={`Drag ${column.name} to editor for SELECT`}>{column.name}</button>)}{item.columns.length>200&&<small>First 200 columns shown</small>}</details>}
  </div>;
}

function OracleObjectCategory({ owner, type, label, items, currentSchema, query, activeKey, onToggle, onContext, onDragStart, contextKey, searchKinds }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (query) setOpen(true); }, [query]);
  return <details className="oracle-category-node" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><ChevronRight size={12} className="schema-chevron" /><OracleObjectIcon type={type} /><span>{label}</span><span className="object-count">{items.length}</span></summary>
    {open && (items.length ? <VirtualOracleObjects items={items} renderItem={item => <OracleObjectRow key={oracleSchemaKey(item)} item={item} activeKey={activeKey} onToggle={onToggle} onContext={onContext} onDragStart={onDragStart} contextKey={contextKey} query={query} searchMatch={searchKinds.get(oracleSchemaKey(item))}/>} /> : <div className="oracle-empty-category">No {label.toLowerCase()} visible</div>)}
  </details>;
}

function OracleSchemaNode({ owner, categories, objectCount, currentSchema, query, activeKey, onToggle, onContext, onDragStart, contextKey, searchKinds }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (query) setOpen(true); }, [query]);
  const kinds = oracleObjectKinds.filter(([type]) => !query || categories.has(type));
  return <details className="oracle-schema-node" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><ChevronRight size={13} className="schema-chevron" /><Database size={14} className="oracle-schema-icon" /><span>{owner}</span><span className="object-count">{objectCount}</span></summary>
    {open && kinds.map(([type, label]) => {
      const items = (categories.get(type) || []).slice().sort((a, b) => a.name.localeCompare(b.name));
      return <OracleObjectCategory key={`${owner}-${type}`} owner={owner} type={type} label={label} items={items} currentSchema={currentSchema} query={query} activeKey={activeKey} onToggle={onToggle} onContext={onContext} onDragStart={onDragStart} contextKey={contextKey} searchKinds={searchKinds}/>;
    })}
  </details>;
}

export function OracleObjectTree({ items, activeKey, onToggle, onContext, onDragStart, contextKey, emptyLabel, currentSchema, query, searchKinds = new Map() }) {
  if (!items.length) return <div className="schema-tree"><div className="explorer-empty">{emptyLabel}</div></div>;
  const schemas = new Map();
  for (const item of items) {
    const owner = item.owner || currentSchema || "CURRENT USER";
    if (!schemas.has(owner)) schemas.set(owner, new Map());
    const categories = schemas.get(owner);
    if (!categories.has(item.type)) categories.set(item.type, []);
    categories.get(item.type).push(item);
  }
  const owners = [...schemas.keys()].sort((a, b) => a.localeCompare(b));
  if (currentSchema && owners.includes(currentSchema)) owners.splice(owners.indexOf(currentSchema), 1), owners.unshift(currentSchema);
  return <div className="schema-tree oracle-object-tree">{owners.map((owner) => {
    const categories = schemas.get(owner), objectCount = [...categories.values()].reduce((sum, list) => sum + list.length, 0);
    return <OracleSchemaNode key={owner} owner={owner} categories={categories} objectCount={objectCount} currentSchema={currentSchema} query={query} activeKey={activeKey} onToggle={onToggle} onContext={onContext} onDragStart={onDragStart} contextKey={contextKey} searchKinds={searchKinds}/>;
  })}</div>;
}

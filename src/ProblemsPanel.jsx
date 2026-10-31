import { useState } from 'react';
import { CircleAlert, TriangleAlert, Check, ChevronRight } from 'lucide-react';

export function ProblemsPanel({ items, activeTabId, onNavigate, onReturnToEditor }) {
  const [scope, setScope] = useState('current');
  const visible = scope === 'current' ? items.filter(item => item.tabId === activeTabId) : items;
  return <section className="problems-panel" aria-label="SQL and PL/SQL problems" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onReturnToEditor?.()}}}>
    <div className="problems-heading"><span>{visible.length} problem{visible.length === 1 ? '' : 's'}</span><select aria-label="Problems scope" value={scope} onChange={event => setScope(event.target.value)}><option value="current">Current SQL file</option><option value="all">All open SQL files</option></select></div>
    <div className="problems-list">{visible.length ? visible.map(item => <button key={item.id} className={`problem-row problem-${item.severity}`} onClick={() => onNavigate(item)} aria-label={`${item.severity}: ${item.message} in ${item.fileName}`}>
      {item.severity === 'warning' ? <TriangleAlert size={14} /> : <CircleAlert size={14} />}<span className="problem-message">{item.message}</span><small>{item.fileName}</small><span className="problem-origin">{item.source}</span><code>{item.line ? `${item.line}:${item.column}` : item.oracleLine ? `${item.oracleLine}:${item.oracleColumn}` : 'No position'}</code><ChevronRight size={12} />
    </button>) : <div className="output-empty"><Check size={18} /><b>No problems reported</b></div>}</div>
  </section>;
}

import { resultScopeItems, removeResultScope } from './resultScope.js';

export function ResultScope({ options, columns, filter, sortColumn, sortDirection, serverFilter, hasMore, busy, onOptionsChange, onClearSearch, onClearSort, onClearServerFilter }) {
  const items = resultScopeItems({ options, columns, filter, sortColumn, sortDirection, serverFilter });
  if(!items.length)return null;
  return <div className="result-scope" aria-label="Result scope">{items.map(item => <button key={item.id} type="button" className={item.id === 'server' ? 'scope-chip server-scope' : 'scope-chip'} disabled={item.id === 'server' && busy} title={item.id === 'server' ? 'Remove server filter and rerun the original SELECT' : `Remove ${item.text}`} aria-label={item.id === 'server' ? 'Remove server filter and rerun original SELECT' : `Remove ${item.text}`} onClick={() => {
    if (item.id === 'search') onClearSearch?.();
    else if (item.id === 'headerSort') onClearSort?.();
    else if (item.id === 'server') onClearServerFilter?.();
    else onOptionsChange(removeResultScope(options, item.id));
  }}><span>{item.text}</span><span aria-hidden="true">×</span></button>)}</div>;
}

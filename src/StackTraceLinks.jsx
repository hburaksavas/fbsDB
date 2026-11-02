export function StackTraceLinks({items=[],onNavigate}) {
  const frames=items.filter(item=>item.source==='Oracle stack');
  if(!frames.length)return null;
  return <div className="stack-trace-links" aria-label="Oracle stack source links">{frames.map(frame=><button type="button" className="button-secondary" key={frame.id} onClick={()=>onNavigate(frame)}><code>{frame.fileName}:{frame.oracleLine}</code><small>{frame.versionStatus}</small></button>)}</div>;
}

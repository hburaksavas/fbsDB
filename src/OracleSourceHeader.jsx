export function OracleSourceHeader({ source, related, onSwitch, document, onFind, onCompile, compileDisabled, onCall,onApi }) {
  if (!source.expectedType && !source.declaration) return null;
  const declaration = source.declaration;
  const isPackage = declaration && ['PACKAGE', 'PACKAGE BODY'].includes(declaration.type);
  return <div className="oracle-source-header" aria-label="Oracle source declaration">
    <span title="Derived from editor text; Oracle compilation has not been validated here.">{declaration ? `${declaration.type} · ${declaration.owner ? declaration.owner + '.' : ''}${declaration.name}` : source.expectedType}</span>
    {source.warning && <span className="oracle-source-warning" role="status">{source.warning}</span>}
    {onCompile&&declaration&&!source.warning&&<button type="button" className="button-secondary" disabled={compileDisabled} onClick={onCompile}>Compare and compile…</button>}
    {onApi&&declaration?.type==='PACKAGE'&&!source.warning&&<button type="button" className="button-secondary" onClick={onApi}>Public API…</button>}
    {onCall&&declaration&&['PACKAGE','PACKAGE BODY','PROCEDURE','FUNCTION'].includes(declaration.type)&&!source.warning&&<button type="button" className="button-secondary" disabled={compileDisabled} onClick={onCall}>Create call…</button>}
    {isPackage && related.target && <div className="package-source-views" role="group" aria-label="Package source views">{['PACKAGE','PACKAGE BODY'].map(type=>{
      const selected=declaration.type===type, member=selected?document:related.target, label=type==='PACKAGE'?'Specification':'Body';
      return <button key={type} type="button" className="button-secondary" aria-pressed={selected} aria-label={`Switch to ${type==='PACKAGE'?'specification':'body'}`} title={`${member?.path||member?.name||label}${member?.dirty?' · unsaved':''} (Alt+O)`} onClick={()=>{if(!selected)onSwitch()}}>{label}{member?.dirty?' •':''}</button>;
    })}</div>}
    {isPackage && !related.target && <button type="button" className="button-secondary" disabled title={related.reason}>Switch to {declaration.type === 'PACKAGE' ? 'body' : 'specification'} <small>Alt+O</small></button>}
    {isPackage && onFind && <button type="button" className="button-secondary" onClick={onFind}>Find related sources…</button>}
  </div>;
}

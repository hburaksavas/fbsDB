import {useRef,useState} from 'react';
import Editor from './monacoEditor.js';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {formatOracleSql} from './sqlFormatter.js';
import {planEmbeddedSqlWrite} from './embeddedSql.js';

export function EmbeddedSqlDialog({request,onApply,onClose}){
  const ref=useRef(null),[sql,setSql]=useState(request.context.sql||''),[error,setError]=useState('');useDialogFocus(ref,onClose);
  const plan=request.context.error?{error:request.context.error}:planEmbeddedSqlWrite(request.source,request.context,sql);
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal local-rename-dialog" role="dialog" aria-modal="true" aria-label="Edit embedded SQL">
    <header className="appearance-header"><h2>Edit embedded SQL</h2></header><div className="dialog-content"><p>SQL inside one static EXECUTE IMMEDIATE literal. Review the escaped source before applying; this editor never runs SQL.</p>
      {request.context.error?<p role="alert">{request.context.error}</p>:<><div style={{height:260,border:'1px solid var(--border-color, #777)'}}><Editor language="sql" value={sql} onChange={value=>{setSql(value||'');setError('')}} options={{minimap:{enabled:false},automaticLayout:true,wordWrap:'on',fontSize:13}}/></div><button type="button" className="button-secondary" onClick={()=>setSql(formatOracleSql(sql).replace(/\n$/,''))}>Format SQL</button>{plan.error?<p role="alert">{plan.error}</p>:<><p role="status">Oracle literal preview</p><pre className="local-rename-preview">{plan.edit.after}</pre><p>{request.context.scope}</p></>}</>}
      {error&&<p role="alert">{error}</p>}
    </div><footer className="appearance-footer"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button type="button" className="button-primary" disabled={!!plan.error} onClick={()=>{try{onApply(plan)}catch(failure){setError(failure.message)}}}>Write back SQL</button></footer>
  </section></ModalBackdrop>;
}

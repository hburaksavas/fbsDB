import {lazy,Suspense,useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {formatStructuredValue} from './resultFeatures';
import {formatOracleDocument} from './sqlFormatter';
import {detectCodeLanguage} from './codeCellModel';

const Editor=lazy(()=>import('@monaco-editor/react'));
const languages=[['sql','SQL / PL/SQL'],['json','JSON'],['xml','XML'],['plaintext','Plain text']];

// A local scratch view of one result value: edits never reach the database or the result grid.
export function CodeCellDialog({cell,theme,onOpenSql,onClose}){
 const ref=useRef(null),editor=useRef(null);useDialogFocus(ref,onClose);
 const [language,setLanguage]=useState(()=>detectCodeLanguage(cell.text)),[error,setError]=useState(''),[edited,setEdited]=useState(false);
 const value=()=>editor.current?.getValue()??cell.text;
 const format=()=>{try{const text=value(),sql=language==='sql'?formatOracleDocument(text):null;if(sql&&sql.formatted==null)throw Error(sql.error||sql.message||'unsupported SQL');const next=sql?sql.formatted:formatStructuredValue(text,language);editor.current?.executeEdits('format',[{range:editor.current.getModel().getFullModelRange(),text:next}]);setError('')}catch(failure){setError(`Format failed: ${failure.message}`)}};
 return <ModalBackdrop onClose={onClose}><section ref={ref} className="result-tools-dialog code-cell-dialog" role="dialog" aria-modal="true" aria-label="Cell code editor">
  <header><strong>{cell.column} · Row {cell.row}</strong><button aria-label="Close cell code editor" onClick={onClose}>×</button></header>
  <div className="result-form-row"><select aria-label="Code language" value={language} onChange={event=>setLanguage(event.target.value)}>{languages.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><button className="button-secondary" disabled={language==='plaintext'} onClick={format}>Format</button><button className="button-secondary" onClick={()=>navigator.clipboard.writeText(value())}>Copy</button><button className="button-secondary" disabled={language!=='sql'} onClick={()=>onOpenSql(value())}>Open as new SQL file</button></div>
  <p className="code-cell-note" role="status">{edited?'Edited locally · ':''}Changes stay in this viewer. Nothing is written to the database or the result.</p>
  {error&&<p role="alert">{error}</p>}
  <div className="code-cell-editor"><Suspense fallback={<p role="status">Loading editor…</p>}><Editor defaultValue={cell.text} language={language} theme={theme} onMount={instance=>{editor.current=instance;instance.focus()}} onChange={()=>setEdited(true)} options={{automaticLayout:true,minimap:{enabled:false},scrollBeyondLastLine:false,wordWrap:'on',fontSize:13}}/></Suspense></div>
 </section></ModalBackdrop>;
}

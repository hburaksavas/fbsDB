import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {sendNativeCommand,subscribeNativeMessages} from './nativeBridge';

const DiffEditor=lazy(()=>import('./monacoEditor.js').then(module=>({default:module.DiffEditor})));
const size=bytes=>bytes<1024?`${bytes} B`:`${(bytes/1024).toFixed(bytes<10240?1:0)} KB`;

// Compares earlier saved versions with the editor text. Restoring only edits the editor (undoable); nothing is written to disk.
export function LocalHistoryDialog({path,current,theme,onRestore,onClose}) {
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const requests=useRef(new Map());
  const [entries,setEntries]=useState(null),[selectedId,setSelectedId]=useState(null),[content,setContent]=useState(null),[error,setError]=useState('');
  useEffect(()=>{
    const unsubscribe=subscribeNativeMessages(message=>{
      if(message.type!=='file.history'||requests.current.get(message.operation)!==message.requestId)return;
      requests.current.delete(message.operation);
      if(message.operation==='list'){setEntries(message.entries||[]);setSelectedId(current=>current||message.entries?.[0]?.id||null)}
      else setContent(message.content??null);
    });
    requests.current.set('list',sendNativeCommand('file.history.list',{path}));
    return unsubscribe;
  },[path]);
  useEffect(()=>{if(!selectedId)return;setContent(null);requests.current.set('read',sendNativeCommand('file.history.read',{path,id:selectedId}))},[selectedId,path]);
  const selected=entries?.find(entry=>entry.id===selectedId);
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal local-history" role="dialog" aria-modal="true" aria-label="Local history">
   <header className="appearance-header"><div><h2>Local history</h2><p>Earlier saved versions of <code>{path}</code>, kept privately on this computer (not in the workspace or Git). Restoring changes the editor only; save to keep it.</p></div></header>
   <div className="local-history-body">
    <ol className="local-history-list" aria-label="Saved versions">{entries===null?<li><p role="status">Reading history…</p></li>:entries.length?entries.map(entry=><li key={entry.id}><button type="button" aria-pressed={entry.id===selectedId} onClick={()=>setSelectedId(entry.id)}><b>{new Date(entry.savedAt).toLocaleString()}</b><small>{size(entry.bytes)}</small></button></li>):<li><p>No earlier versions yet. A version is kept each time a changed file is saved.</p></li>}</ol>
    <div className="local-history-diff">{error&&<p role="alert">{error}</p>}{selected&&(content==null?<p role="status">Loading version…</p>:<Suspense fallback={<p role="status">Loading comparison…</p>}><div className="local-history-editor"><DiffEditor original={content} modified={current} language="sql" theme={theme} options={{readOnly:true,originalEditable:false,automaticLayout:true,minimap:{enabled:false},renderSideBySide:true,scrollBeyondLastLine:false}}/></div></Suspense>)}{selected&&<p className="local-history-legend">Left: saved version · Right: current editor text</p>}</div>
   </div>
   <footer className="appearance-footer"><button className="button-secondary" onClick={onClose}>Close</button><button className="button-primary" disabled={content==null||!selected} onClick={()=>{try{onRestore(content)}catch(failure){setError(failure.message)}}}>Restore this version in the editor</button></footer>
  </section></ModalBackdrop>;
}

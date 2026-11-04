import {lazy,Suspense,useRef,useState} from 'react';
import {ModalBackdrop} from './ModalBackdrop';
import {useDialogFocus} from './ConnectionManager';
import {comparisonSummary,placeSources,readDroppedFiles} from './compareSources';

const DiffEditor=lazy(()=>import('./monacoEditor.js').then(module=>({default:module.DiffEditor})));

// Read-only comparison of up to two sources (editor text, clipboard, dropped files). Nothing is opened, saved or executed.
export function CompareDialog({initial,editorText,theme,onClose}) {
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const [sources,setSources]=useState(initial),[notice,setNotice]=useState(''),[dragging,setDragging]=useState(false);
  const drop=async event=>{
    event.preventDefault();setDragging(false);
    const {accepted,rejected}=await readDroppedFiles(event.dataTransfer?.files);
    if(accepted.length)setSources(current=>placeSources(current,accepted));
    setNotice(rejected.map(item=>`${item.name}: ${item.reason}`).join(' '));
  };
  const useClipboard=async side=>{try{const text=await navigator.clipboard.readText();setSources(current=>({...current,[side]:{label:'Clipboard',text}}));setNotice('')}catch{setNotice('The clipboard could not be read.')}};
  const swap=()=>setSources(current=>({left:current.right,right:current.left}));
  return <ModalBackdrop onClose={onClose}><section ref={ref} className={`appearance-modal compare-dialog${dragging?' dragging':''}`} role="dialog" aria-modal="true" aria-label="Compare sources" onDragOver={event=>{event.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={drop}>
   <header className="appearance-header"><div><h2>Compare</h2><p>Drop one or two text files here, or use the editor text or clipboard. This is read-only: nothing is opened, saved or executed.</p></div></header>
   <div className="compare-controls">
    {['left','right'].map(side=><div key={side} className="compare-side"><b>{side==='left'?'Left':'Right'}: {sources[side]?.label||'empty'}</b><span><button type="button" className="button-secondary" onClick={()=>setSources(current=>({...current,[side]:{label:'Current editor',text:editorText}}))}>Editor</button><button type="button" className="button-secondary" onClick={()=>useClipboard(side)}>Clipboard</button></span></div>)}
    <button type="button" className="button-secondary" disabled={!sources.left&&!sources.right} onClick={swap}>Swap sides</button>
   </div>
   <p className="compare-summary" role="status">{comparisonSummary(sources.left,sources.right)}</p>
   {notice&&<p role="alert">{notice}</p>}
   <div className="compare-editor">{sources.left&&sources.right?<Suspense fallback={<p role="status">Loading comparison…</p>}><DiffEditor key={`${sources.left.label}|${sources.right.label}`} original={sources.left.text} modified={sources.right.text} language="sql" theme={theme} options={{readOnly:true,originalEditable:false,automaticLayout:true,minimap:{enabled:false},renderSideBySide:true,scrollBeyondLastLine:false}}/></Suspense>:<div className="compare-drop" aria-label="Drop files here">Drop files here</div>}</div>
   <footer className="appearance-footer"><button className="button-primary" onClick={onClose}>Close</button></footer>
  </section></ModalBackdrop>;
}

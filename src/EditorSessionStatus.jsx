import { useEffect, useState } from 'react';
import { Database, LoaderCircle, LockKeyhole, Play, Unplug, Download, AlertCircle } from 'lucide-react';

import { editorSessionState } from './editorSessionState';

export function EditorSessionStatus({ editor, tabId, connection, startedAt, ...state }) {
  const [position, setPosition] = useState({ lineNumber: 1, column: 1 });
  useEffect(() => {
    if (!editor) return;
    setPosition(editor.getPosition() || { lineNumber: 1, column: 1 });
    const listener = editor.onDidChangeCursorPosition(event => setPosition(event.position));
    return () => listener.dispose();
  }, [editor, tabId]);
  const [elapsed,setElapsed]=useState(0);
  const busy=state.executing||state.fetching||state.exporting||state.connecting;
  useEffect(()=>{if(!busy)return;const start=startedAt||Date.now();const update=()=>setElapsed(Math.max(0,Math.floor((Date.now()-start)/1000)));update();const timer=setInterval(update,1000);return()=>clearInterval(timer)},[busy,startedAt,tabId]);
  const status = editorSessionState(state), Icon = {loading:LoaderCircle,download:Download,run:Play,offline:Unplug,pending:AlertCircle,database:Database}[status.icon];
  return <>
    <span className={`session-status session-status-${status.key}`} role="status"><Icon size={12} />{status.text}{busy?` · ${elapsed}s`:""}</span>
    {state.readOnlyAnalysis && status.text!=='Read-only analysis' && <span className="session-status"><LockKeyhole size={12}/>Read-only analysis</span>}
    {state.connected && <span className="session-profile" title={connection.name || connection.id}>{connection.name || connection.id} · {connection.env || 'UNKNOWN'}</span>}
    {state.transactionPending && !state.readOnlyAnalysis && status.key !== 'pending' && <span className="session-status session-status-pending"><LockKeyhole size={12} />Transaction pending</span>}
    <span className="editor-position">Ln {position.lineNumber}, Col {position.column}</span>
  </>;
}

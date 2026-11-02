import {Feedback,notifyFeedback} from './Feedback';
import { useEffect, useRef, useState } from 'react';
import { X, Copy, LockKeyhole } from 'lucide-react';
import { useInspectorWidth } from './useInspectorWidth';

export function OracleDefinitionView({ source, onClose, hidden = false }) {
  const [copied, setCopied] = useState(false), close = useRef(onClose);
  const { width, onPointerDown, onKeyDown,locked } = useInspectorWidth();
  close.current = onClose;
  useEffect(() => {
    if (hidden) return;
    const dismiss = event => {
      if (event.key !== 'Escape' || document.querySelector('.modal-backdrop, .view-popover, .dock-actions-menu, .ide-file-popover, .workspace-context-menu, .result-hover-popover-anchor, .editor-tabs-menu')) return;
      event.preventDefault(); event.stopImmediatePropagation(); close.current();
    };
    document.addEventListener('keydown', dismiss, true);
    return () => document.removeEventListener('keydown', dismiss, true);
  }, [hidden]);
  useEffect(() => setCopied(false), [source]);
  return <aside className="object-definition-view" style={{ '--inspector-width': `${width}px` }} hidden={hidden} aria-label="Oracle object definition">
    <div className="object-definition-resizer" role="separator" aria-disabled={locked||undefined} aria-label="Resize object definition" aria-orientation="vertical" aria-valuenow={width} tabIndex={0} onPointerDown={onPointerDown} onKeyDown={onKeyDown}/>
    <header><div><strong>{source.owner}.{source.name}</strong><small><LockKeyhole size={11}/>{source.type} · Read only</small></div><button className="icon-button" title="Close definition (Escape)" aria-label="Close object definition" onClick={onClose}><X size={15}/></button></header>
    <div className="object-definition-actions"><span>Definition</span><button className="icon-button" aria-label="Copy object definition" title="Copy definition" onClick={async () => { try { await navigator.clipboard.writeText(source.text); setCopied(true); notifyFeedback({kind:'success',title:'Definition',message:'Copied'}); } catch { setCopied(false); notifyFeedback({kind:'error',title:'Copy failed',message:'Could not copy the definition.'}); } }}><Copy size={13}/></button><Feedback kind="success" title="Definition">{copied?"Copied":""}</Feedback></div>
    <pre tabIndex={0} aria-label="Read-only object DDL">{source.text}</pre>
  </aside>;
}

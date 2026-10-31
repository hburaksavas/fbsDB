import { ChevronDown, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { editorSessionState } from './editorSessionState';

export function ConnectionControl({ profile, inactive, connected, connecting, connectingProfile, disabled, open, onOpen, context, contextError, startedAt, ...operation }) {
  const status=editorSessionState({inactive,connected,connecting,...operation});
  const busy=connecting||operation.executing||operation.fetching||operation.rendering||operation.exporting||operation.cancelling;
  const [elapsed,setElapsed]=useState(0);
  useEffect(()=>{if(!busy)return;const start=startedAt||Date.now();const tick=()=>setElapsed(Math.max(0,Math.floor((Date.now()-start)/1000)));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer)},[busy,startedAt]);
  const summary=[connected&&context?.schema,connected&&context?.container,status.text,operation.transactionPending&&status.key!=='pending'&&!operation.readOnlyAnalysis?'Transaction pending':'',operation.readOnlyAnalysis&&status.text!=='Read-only analysis'?'Read-only analysis':''].filter(Boolean).join(' · ');
  const name = connecting ? connectingProfile || profile.name || profile.id : connected ? profile.name || profile.id : 'Connect';
  const groups=[...new Set((profile.groups||[profile.group]).filter(Boolean))].join(' · ');
  const environment = String(profile.env || 'UNKNOWN').toUpperCase();
  const state = connecting ? 'connecting' : inactive ? 'inactive' : connected ? 'connected' : 'disconnected';
  const pending=operation.transactionPending&&!operation.readOnlyAnalysis;
  const label = connecting ? `Connecting to ${name}` : connected ? `Change connection: ${name}` : 'Connect to Oracle';
  return <button type="button" className="connection-control" data-state={state} data-working={busy||undefined} data-pending={pending||undefined} disabled={disabled} onClick={onOpen}
    aria-label={label} aria-description={summary} aria-haspopup="dialog" aria-expanded={open} aria-busy={connecting || undefined}
    data-tooltip-content={[name,(connected||connecting)&&groups,connected&&environment!=='UNKNOWN'&&environment,summary,busy?`${elapsed}s`:'',context?.edition?`Edition: ${context.edition}`:'',contextError?`Session context unavailable: ${contextError}`:''].filter(Boolean).join(' · ')}>
    <span className="connection-control-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
      <circle className="connection-orbit-rail" cx="12" cy="12" r="9"/>
      <g className="connection-orbit-track"><path d="M4.2 16.5A9 9 0 0 1 12 3m7.8 4.5A9 9 0 0 1 12 21"/><circle cx="12" cy="3" r="1.4" fill="currentColor" stroke="none"/></g>
      <path d="M9 10h6v2a3 3 0 0 1-6 0v-2Zm1-3v3m4-3v3m-2 5v2"/>
    </svg>{connected && !connecting && <span className="connection-control-status"/>}</span>
    <span className="connection-control-copy"><span className="connection-control-heading"><span className="connection-control-name">{name}</span>{pending&&<span className="connection-control-pending" aria-hidden="true"/>}</span><span className="connection-control-summary sr-only" role="status" aria-live="polite" aria-label={summary} data-status={status.key}><span aria-hidden="true">{summary}{busy?` · ${elapsed}s`:''}</span></span></span>
    {(connected||connecting)&&groups&&<span className="connection-control-environment connection-control-group" data-env={environment}>{groups}</span>}
    <span className="connection-control-chevron" aria-hidden="true">{state==='disconnected'?<Plus size={12}/>:<ChevronDown size={11}/>}</span>
  </button>;
}

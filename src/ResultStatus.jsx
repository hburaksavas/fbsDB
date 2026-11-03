import {Feedback} from './Feedback';
import {useEffect,useState} from 'react';
import {AlertCircle,CheckCircle2,Rows3,Table2,Timer,Square,Code2,Copy,LoaderCircle,CircleSlash} from 'lucide-react';
import {LONG_QUERY_MS,elapsedQueryTime,formatQueryDuration,queryFailureDetails,transactionRecoveryHint} from './resultStatus.js';

export function ResultIdle({guidance,onAction}){
  return <section className="result-idle" data-kind="idle" role="status">
    <span className="result-idle-mark" aria-hidden="true"><Table2 size={19} strokeWidth={1.4}/></span>
    <span className="result-idle-text"><span>{guidance?.title||'No results yet'}</span>{guidance?.detail&&<small>{guidance.detail}</small>}</span>
    {guidance?.action&&<button type="button" className="button-secondary" onClick={()=>onAction?.(guidance.action)}>{guidance.label}</button>}
  </section>;
}

export function ResultRunning({startedAt,cancelling=false,onCancel,fetching=false,compact=false}){
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(timer)},[startedAt]);
  const elapsed=elapsedQueryTime(startedAt,now),long=elapsed>=LONG_QUERY_MS;
  return <div className={`result-running${compact?' compact':''}`} data-long-running={long||undefined} aria-busy="true">
    <LoaderCircle size={16} className="result-running-spinner" aria-hidden="true"/>
    <div><strong role="status">{cancelling?'Cancelling query…':fetching?'Loading rows…':long?'Query is still running…':'Running query…'}</strong>
      {long&&<span className="result-running-time"><Timer size={12} aria-hidden="true"/><time role="timer" aria-live="off" aria-label="Elapsed query time" dateTime={`PT${Math.floor(elapsed/1000)}S`}>{formatQueryDuration(elapsed)}</time></span>}
    </div>
    {(long||cancelling)&&<button type="button" className="button-secondary result-cancel" disabled={cancelling||!onCancel} onClick={onCancel}><Square size={11} aria-hidden="true"/>{cancelling?'Cancelling…':'Cancel'}</button>}
  </div>;
}

export function ResultNotice({kind='idle',title,detail,metric,raw,code,onEdit,onClear}){
  const [copyError,setCopyError]=useState(false);
  const Icon=kind==='error'||kind==='timeout'?AlertCircle:kind==='success'?CheckCircle2:kind==='empty'?Rows3:kind==='cancelled'?CircleSlash:null;
  return <section className="result-notice" data-kind={kind} role={kind==='error'||kind==='timeout'?'alert':'status'}>
    {Icon&&<Icon className="result-notice-icon" size={17} aria-hidden="true"/>}
    <div className="result-notice-content"><div className="result-notice-heading"><strong>{title}</strong>{code&&<code>{code}</code>}{metric&&<span className="result-notice-metric">{metric}</span>}</div>
      {detail&&<p>{detail}</p>}{raw&&<pre>{raw}</pre>}
      {(onEdit||raw||onClear)&&<div className="result-notice-actions">
        {onEdit&&<button type="button" onClick={onEdit}><Code2 size={13}/>Return to SQL</button>}
        {raw&&<button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(raw);setCopyError(false)}catch{setCopyError(true)}}}><Copy size={12}/>Copy error</button>}
        {onClear&&<button type="button" onClick={onClear}>Clear local filters</button>}
        {copyError&&<Feedback title="Copy failed">Clipboard unavailable</Feedback>}
      </div>}
    </div>
  </section>;
}
export function ResultFailure({outcome,onEdit}){
  const value=queryFailureDetails(outcome);
  return <ResultNotice {...value} detail={[value.hint,transactionRecoveryHint(outcome)].filter(Boolean).join(' ')} raw={value.message} onEdit={onEdit} metric={Number.isFinite(outcome.elapsedMs)?formatQueryDuration(outcome.elapsedMs):undefined}/>;
}

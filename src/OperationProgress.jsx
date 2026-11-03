import {useEffect,useState} from 'react';
import {LoaderCircle,Square} from 'lucide-react';
import {formatQueryDuration} from './resultStatus.js';

// One shape for long operations: what is running, a plain detail line, how long it has been going and a stop button that says what stopping does.
export function OperationProgress({title,detail,startedAt,onStop,stopLabel='Cancel',stopHint,stopping=false,className=''}) {
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(timer)},[startedAt]);
  const elapsed=startedAt?formatQueryDuration(now-startedAt):'';
  return <div className={`operation-progress ${className}`} role="status" aria-busy="true">
    <LoaderCircle size={14} className="result-running-spinner" aria-hidden="true"/>
    <span className="operation-progress-text"><strong>{title}</strong>{detail&&<small>{detail}</small>}</span>
    {elapsed&&<time aria-label="Elapsed time" className="operation-progress-time">{elapsed}</time>}
    {onStop&&<button type="button" className="button-secondary" disabled={stopping} title={stopHint} onClick={onStop}><Square size={10} aria-hidden="true"/>{stopping?'Stopping…':stopLabel}</button>}
  </div>;
}

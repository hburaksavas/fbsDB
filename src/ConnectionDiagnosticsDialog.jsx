import { useRef } from 'react';
import { ModalBackdrop } from './ModalBackdrop';
import { useDialogFocus } from './ConnectionManager';
import { stageOverview, stepAdvice } from './connectionAdvice';

const stateLabel = { passed: 'Passed', failed: 'Failed', warning: 'Warning', skipped: 'Skipped', 'not reached': 'Not reached', 'not run': 'Not run' };

export function ConnectionDiagnosticsDialog({report,onClose}) {
  const ref=useRef(null);useDialogFocus(ref,onClose);
  const overview=stageOverview(report.steps);
  return <ModalBackdrop onClose={onClose}><div ref={ref} className="appearance-modal connection-diagnostics" role="dialog" aria-modal="true" aria-label="Connection diagnostics"><header className="appearance-header"><div><h2>Connection diagnostics</h2><p>{report.success?'Temporary connection succeeded':'Temporary connection failed'}</p></div></header>
    <ol className="connection-stage-overview" aria-label="Connection stages">{overview.map(item=><li key={item.stage} data-state={item.state.replace(' ','-')}><strong>{item.stage}</strong><span>{stateLabel[item.state]}{item.implied?' (confirmed by sign-in)':''}</span></li>)}</ol>
    <div className="connection-diagnostic-steps">{report.steps.map((step,index)=>{const advice=stepAdvice(step);return <section key={index} data-status={step.status.toLowerCase()}><strong>{step.stage}</strong><span>{step.status} · {step.elapsedMs} ms</span><p>{step.message}</p>{advice&&<div className="connection-advice"><b>{advice.meaning}</b><ul>{advice.checks.map(check=><li key={check}>{check}</li>)}</ul></div>}</section>})}</div><footer className="appearance-footer"><button className="button-primary" onClick={onClose}>Close</button></footer></div></ModalBackdrop>;
}

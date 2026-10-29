import { useRef } from 'react';
import { ModalBackdrop } from './ModalBackdrop';
import { useDialogFocus } from './ConnectionManager';

export function ConnectionDiagnosticsDialog({report,onClose}) {
  const ref=useRef(null);useDialogFocus(ref,onClose);
  return <ModalBackdrop onClose={onClose}><div ref={ref} className="appearance-modal connection-diagnostics" role="dialog" aria-modal="true" aria-label="Connection diagnostics"><header className="appearance-header"><div><h2>Connection diagnostics</h2><p>{report.success?'Temporary connection succeeded':'Temporary connection failed'}</p></div></header><div className="connection-diagnostic-steps">{report.steps.map((step,index)=><section key={index}><strong>{step.stage}</strong><span>{step.status} · {step.elapsedMs} ms</span><p>{step.message}</p></section>)}</div><footer className="appearance-footer"><button className="button-primary" onClick={onClose}>Close</button></footer></div></ModalBackdrop>;
}

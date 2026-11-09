import { Bug, Play, ArrowDownToLine, ArrowRightToLine, ArrowUpFromLine, Square } from 'lucide-react';
import { ModalBackdrop } from './ModalBackdrop';

// FI-007: the debugger's controls, call stack and values while a run is active.
export function DebugPanel({ debug, onStep, onStop, onSelectFrame }) {
  if (!debug) return null;
  const paused = debug.status === 'paused';
  const status = debug.status === 'paused' ? `Paused at ${debug.location?.name || 'anonymous block'}${debug.location?.line ? ` line ${debug.location.line}` : ''}` : debug.status === 'starting' ? 'Starting…' : 'Running…';
  const steps = [['continue', 'Continue (F8)', Play], ['over', 'Step over (F10)', ArrowRightToLine], ['into', 'Step into (F11)', ArrowDownToLine], ['out', 'Step out (Shift+F11)', ArrowUpFromLine]];
  return <section className="debug-panel" role="region" aria-label="Debugger">
    <header><Bug size={14} /><strong role="status" aria-live="polite">{status}</strong>
      <div className="debug-panel-actions">{steps.map(([mode, label, Icon]) => <button type="button" key={mode} className="icon-button" aria-label={label} title={label} disabled={!paused} onClick={() => onStep(mode)}><Icon size={14} /></button>)}
        <button type="button" className="icon-button" aria-label="Stop debugging" title="Stop debugging: the call is aborted" onClick={onStop}><Square size={14} /></button></div>
    </header>
    {paused && <div className="debug-panel-body">
      <div className="debug-stack"><h3>Call stack</h3><ol aria-label="Call stack">{debug.frames.map(frame => <li key={frame.frame}><button type="button" aria-current={frame.frame === debug.selected ? 'true' : undefined} onClick={() => onSelectFrame(frame.frame)}>{frame.name ? `${frame.owner}.${frame.name}` : 'anonymous block'}<small>{frame.type === 'BLOCK' ? '' : `${frame.type.toLowerCase()} · `}line {frame.line}</small></button></li>)}</ol></div>
      <div className="debug-values"><h3>Values</h3>
        {debug.values === null ? <p className="muted">Reading values…</p> : debug.valuesError ? <p className="muted">{debug.valuesError}</p> : !debug.values.length ? <p className="muted">No readable variables here.</p> :
          <table aria-label="Variable values"><tbody>{debug.values.map(value => <tr key={value.name}><th scope="row">{value.name.toLowerCase()}</th><td className={value.state === 'value' ? '' : 'muted'}>{value.state === 'value' ? value.value : value.state === 'null' ? 'NULL' : 'not readable (record, collection or cursor)'}</td></tr>)}</tbody></table>}
      </div>
    </div>}
  </section>;
}

export function DebugCompileDialog({ prompt }) {
  if (!prompt) return null;
  return <ModalBackdrop onClose={() => prompt.resolve(false)}>
    <section className="appearance-modal transaction-guard" role="alertdialog" aria-modal="true" aria-label="Compile for debugging">
      <header className="appearance-header"><div><div className="eyebrow">COMPILE FOR DEBUGGING</div><h2>Recompile {prompt.objects.length} unit{prompt.objects.length === 1 ? '' : 's'} with debug information?</h2>
        <p>Breakpoints need units compiled with debug information. These units are compiled with ALTER … COMPILE DEBUG in the database, for every session that uses them:</p>
        <ul>{prompt.objects.map(item => <li key={`${item.owner}.${item.name}.${item.type}`}><code>{item.owner}.{item.name}</code> ({item.type.toLowerCase()})</li>)}</ul>
        <p>Debug-compiled code runs a little slower. Compile them normally again when you are done.</p>
      </div></header>
      <footer className="appearance-footer"><button type="button" className="button-secondary" onClick={() => prompt.resolve(false)}>Cancel</button><button type="button" className="button-primary" onClick={() => prompt.resolve(true)}>Compile and debug</button></footer>
    </section>
  </ModalBackdrop>;
}

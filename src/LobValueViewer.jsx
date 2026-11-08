import { useEffect, useRef, useState } from 'react';
import { Feedback } from './Feedback';
import { OperationProgress } from './OperationProgress';
import { createLobBuffer, lobChunkSize, lobUnit } from './lobValues.js';
import { loadLob } from './lobReader.js';

const count = number => Number(number || 0).toLocaleString('en-US');
const hex = bytes => Array.from(bytes.subarray(0, 4096), byte => byte.toString(16).padStart(2, '0')).join(' ');

// Shows the loaded part of a large value; loading it whole replaces the preview in every result that shows it.
export function LobValueViewer({ value }) {
  const buffer = useRef(null), controller = useRef(null);
  if (!buffer.current || buffer.current.source !== value) buffer.current = Object.assign(createLobBuffer(value), { source: value });
  const [loaded, setLoaded] = useState(() => buffer.current.loaded), [running, setRunning] = useState(null), [error, setError] = useState('');
  useEffect(() => () => controller.current?.abort(), []);
  async function load(all) {
    const current = buffer.current, abort = new AbortController();
    controller.current = abort; setError(''); setRunning({ all, startedAt: Date.now(), stopping: false });
    try {
      await loadLob(value, current, { until: all ? Infinity : current.loaded + lobChunkSize(value), signal: abort.signal, onProgress: next => setLoaded(next) });
      const full = current.fullValue();
      if (full !== null) window.dispatchEvent(new CustomEvent('fbsdb.result.lobLoaded', { detail: { lobId: value.lobId, value: full } }));
    } catch (failure) { setError(failure.message); }
    finally { if (controller.current === abort) controller.current = null; setRunning(null); setLoaded(current.loaded); }
  }
  const unit = lobUnit(value), complete = loaded >= value.length, binary = value.lobType === 'BLOB';
  const percent = value.length ? Math.floor(loaded * 100 / value.length) : 100;
  return <div className="lob-value">
    <div className="result-form-row lob-value-status">
      <span role="status">{complete ? `Loaded all ${count(value.length)} ${unit}` : `Showing the first ${count(loaded)} of ${count(value.length)} ${unit} (${percent}%)`}</span>
      {!complete && !running && value.lobId && <><button type="button" onClick={() => load(false)}>Load next {count(Math.min(lobChunkSize(value), value.length - loaded))} {unit}</button><button type="button" onClick={() => load(true)}>Load all</button></>}
    </div>
    {running && <OperationProgress title={running.all ? `Loading ${value.lobType} value…` : 'Loading next part…'} detail={`${count(loaded)} of ${count(value.length)} ${unit} (${percent}%)`} startedAt={running.startedAt} stopping={running.stopping} stopLabel="Stop" stopHint="Stops after the part being read; what is already loaded stays shown" onStop={() => { controller.current?.abort(); setRunning(state => state && { ...state, stopping: true }); }}/>}
    {!value.lobId && <Feedback title="Value cannot be loaded">Too many large values were open in this session to keep this one readable. Run the query again to read it.</Feedback>}
    {error && <Feedback title="Value could not be loaded">{error}</Feedback>}
    {!complete && <p className="lob-value-note">Until the value is loaded whole, copying the cell from the grid copies this preview with a note that it is incomplete. Export always reads the whole value from Oracle.</p>}
    <div className="result-value-content">{binary ? <pre aria-label={`First ${count(Math.min(loaded, 4096))} bytes as hexadecimal`}>{hex(buffer.current.bytes())}{loaded > 4096 ? ' …' : ''}</pre> : <pre>{buffer.current.text()}{complete ? '' : '…'}</pre>}</div>
  </div>;
}

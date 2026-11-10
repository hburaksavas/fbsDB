import { useState } from 'react';
import { Gauge, X, Copy } from 'lucide-react';
import { ModalBackdrop } from './ModalBackdrop';
import { formatDuration, hottestLines, lineLevel, profileCsv, share } from './plsqlProfile.js';

// FI-031: the result of a profiled run, and the run while it is going on.
export function ProfilePanel({ profile, onFinish, onClose, onOpenLine }) {
  const [unitFilter, setUnitFilter] = useState(null);
  if (!profile) return null;
  if (profile.status !== 'done') return <section className="profile-panel" role="region" aria-label="Profiler">
    <header><Gauge size={14} /><strong role="status" aria-live="polite">{profile.status === 'reading' ? 'Reading the profile…' : profile.status === 'starting' ? 'Starting the profiler…' : 'Profiling the running statement…'}</strong>
      {profile.status === 'running' && <button type="button" className="button-secondary" onClick={onFinish} title="Stop collecting and read the profile now">Finish now</button>}</header>
  </section>;
  const { report } = profile, units = report.units.filter(unit => unit.lines.length);
  const lines = unitFilter ? hottestLines({ units: units.filter(unit => `${unit.owner}.${unit.name}.${unit.type}` === unitFilter) }, 200) : hottestLines(report, 50);
  const copy = () => navigator.clipboard?.writeText(profileCsv(report));
  return <section className="profile-panel" role="region" aria-label="Profiler">
    <header><Gauge size={14} /><strong role="status">Profile · {formatDuration(report.totalNs)} in {units.length} unit{units.length === 1 ? '' : 's'}</strong>
      <button type="button" className="icon-button" aria-label="Copy profile as CSV" title="Copy every executed line as CSV" onClick={copy}><Copy size={14} /></button>
      <button type="button" className="icon-button" aria-label="Close profile" title="Close the profile and remove its marks from the editor" onClick={onClose}><X size={14} /></button></header>
    <div className="profile-panel-body">
      <table aria-label="Profiled units"><thead><tr><th scope="col">Unit</th><th scope="col">Time</th><th scope="col">Share</th></tr></thead>
        <tbody>{units.map(unit => { const key = `${unit.owner}.${unit.name}.${unit.type}`; return <tr key={key} aria-selected={unitFilter === key}>
          <td><button type="button" onClick={() => setUnitFilter(current => current === key ? null : key)} title="Show this unit's lines">{unit.name ? `${unit.owner}.${unit.name}` : 'anonymous block'} <small>{unit.type.toLowerCase()}</small></button></td>
          <td>{formatDuration(unit.totalNs)}</td><td>{Math.round(share(unit.totalNs, report.totalNs) * 100)}%</td></tr>; })}</tbody></table>
      <table aria-label="Slowest lines"><thead><tr><th scope="col">Line</th><th scope="col">Time</th><th scope="col">Runs</th><th scope="col">Avg</th></tr></thead>
        <tbody>{lines.map(line => <tr key={`${line.unit.owner}.${line.unit.name}.${line.unit.type}:${line.line}`} data-level={lineLevel(line, line.unit)}>
          <td><button type="button" disabled={!line.unit.name} onClick={() => onOpenLine(line.unit, line.line)} title={line.unit.name ? 'Open this line' : 'An anonymous block has no stored source'}>{line.unit.name || 'block'}:{line.line}</button></td>
          <td>{formatDuration(line.totalNs)}</td><td>{line.occurrences.toLocaleString()}</td><td>{formatDuration(line.occurrences ? line.totalNs / line.occurrences : 0)}</td></tr>)}</tbody></table>
    </div>
  </section>;
}

export function ProfileTablesDialog({ prompt }) {
  if (!prompt) return null;
  return <ModalBackdrop onClose={() => prompt.resolve(false)}>
    <section className="appearance-modal transaction-guard" role="alertdialog" aria-modal="true" aria-label="Create profiler tables">
      <header className="appearance-header"><div><div className="eyebrow">PROFILER TABLES</div><h2>Create the DBMS_PROFILER tables in this schema?</h2>
        <p>DBMS_PROFILER writes its timings to {prompt.missing.join(', ')}, which this schema does not have. fbsDB creates them and deletes each run's rows after reading it.</p>
        {prompt.transactionPending && <p>This session has uncommitted work. Creating tables is DDL and commits it: commit or roll back first.</p>}
        <pre className="profile-ddl">{prompt.ddl.join(';\n')};</pre>
      </div></header>
      <footer className="appearance-footer"><button type="button" className="button-secondary" onClick={() => prompt.resolve(false)}>Cancel</button><button type="button" className="button-primary" disabled={prompt.transactionPending} onClick={() => prompt.resolve(true)}>Create tables and profile</button></footer>
    </section>
  </ModalBackdrop>;
}

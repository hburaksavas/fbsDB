import { useRef } from 'react';
import { ModalBackdrop } from './ModalBackdrop';
import { useDialogFocus } from './ConnectionManager';

const show = value => value === null || value === undefined ? 'NULL' : typeof value === 'string' && !/^'/.test(value) && value !== 'NULL' && value !== 'CASE_NOT_FOUND' && value !== 'something else' ? `'${value}'` : String(value);

// Explains a CASE expression or analytic function with made-up sample rows calculated in the app; the query is not run.
export function ExpressionExplainDialog({ explanation, onClose }) {
  const ref = useRef(null); useDialogFocus(ref, onClose);
  const sample = explanation.sample;
  return <ModalBackdrop onClose={onClose}><section ref={ref} className="appearance-modal call-hierarchy-dialog expression-explain-dialog" role="dialog" aria-modal="true" aria-label="Explain expression">
    <header className="appearance-header"><h2>{explanation.title}</h2></header>
    <pre className="expression-explain-source">{explanation.text}</pre>
    {explanation.description && <p>{explanation.description}</p>}
    <ul className="expression-explain-notes">{explanation.notes.map(note => <li key={note}>{note}</li>)}</ul>
    {explanation.kind === 'case' && <table className="expression-explain-table" aria-label="CASE branches">
      <thead><tr><th>#</th><th>{explanation.subject ? `${explanation.subject} =` : 'WHEN'}</th><th>THEN</th></tr></thead>
      <tbody>{explanation.branches.map((branch, index) => <tr key={index}><td>{index + 1}</td><td><code>{branch.when}</code></td><td><code>{branch.then}</code></td></tr>)}
        <tr><td>ELSE</td><td>anything else</td><td><code>{explanation.otherwise ?? (explanation.title === 'CASE statement' ? 'raises CASE_NOT_FOUND' : 'NULL')}</code></td></tr></tbody>
    </table>}
    {explanation.samples && <>
      <h3>Sample values</h3>
      <table className="expression-explain-table" aria-label="CASE sample values">
        <thead><tr><th>{explanation.samples.label} (sample)</th><th>Result</th><th>Branch</th></tr></thead>
        <tbody>{explanation.samples.rows.map((row, index) => <tr key={index}><td>{show(row.input)}</td><td><code>{row.output}</code></td><td>{row.branch ?? 'ELSE'}</td></tr>)}</tbody>
      </table>
    </>}
    {sample && <>
      <h3>Sample rows</h3>
      <table className="expression-explain-table" aria-label="Analytic function sample rows">
        <thead><tr><th>Row</th>{sample.columns.map(column => <th key={column.key}>{column.label}{column.key === 'result' ? '' : ' (sample)'}</th>)}{sample.current != null && <th>In the frame of row {sample.current}</th>}</tr></thead>
        <tbody>{sample.rows.map(row => <tr key={row.id} data-current={row.id === sample.current || undefined}><td>{row.id}</td>{sample.columns.map(column => <td key={column.key}>{show(row[column.key])}</td>)}{sample.current != null && <td>{row.inFrame ? '✓' : ''}</td>}</tr>)}</tbody>
      </table>
    </>}
    <p className="call-hierarchy-scope" role="note">Sample values are made up and calculated here by Oracle's rules; your query is not run.</p>
    <footer className="appearance-footer"><button className="button-secondary" onClick={onClose}>Close</button></footer>
  </section></ModalBackdrop>;
}

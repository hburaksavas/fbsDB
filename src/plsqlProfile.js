// FI-031: shaping a DBMS_PROFILER report for the panel and the editor.
import { sameUnit, toEditorLine } from './plsqlDebug.js';

export function formatDuration(ns) {
  const ms = ns / 1e6;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 10) return `${ms.toFixed(0)} ms`;
  if (ms >= 0.01) return `${ms.toFixed(2)} ms`;
  return `${Math.round(ns / 1000)} µs`;
}

export const share = (part, total) => total > 0 ? part / total : 0;

// The lines that took the most time, across all units of the run.
export function hottestLines(report, limit = 50) {
  return (report?.units || []).flatMap(unit => unit.lines.map(line => ({ ...line, unit })))
    .sort((a, b) => b.totalNs - a.totalNs || a.line - b.line).slice(0, limit);
}

// A line is hot from 10% of its unit's time, warm from 2%.
export function lineLevel(line, unit) {
  const part = share(line.totalNs, unit.totalNs);
  return part >= 0.1 ? 'hot' : part >= 0.02 ? 'warm' : 'cool';
}

// Marks for an editor document showing a profiled unit: one per executed line.
export function profileMarks(report, documentUnit) {
  if (!report || !documentUnit) return [];
  const unit = report.units.find(item => item.name && sameUnit(documentUnit, { owner: item.owner, name: item.name, type: item.type }));
  if (!unit) return [];
  return unit.lines.map(line => ({
    line: toEditorLine(documentUnit, line.line),
    text: `${formatDuration(line.totalNs)} · ${line.occurrences.toLocaleString()}×`,
    level: lineLevel(line, unit),
  }));
}

const csvCell = value => /[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);

export function profileCsv(report) {
  const rows = [['owner', 'unit', 'type', 'line', 'executions', 'total_ms', 'min_ms', 'max_ms', 'share_of_unit']];
  for (const unit of report?.units || []) for (const line of unit.lines)
    rows.push([unit.owner, unit.name || 'anonymous block', unit.type, line.line, line.occurrences, (line.totalNs / 1e6).toFixed(3), (line.minNs / 1e6).toFixed(3), (line.maxNs / 1e6).toFixed(3), share(line.totalNs, unit.totalNs).toFixed(4)]);
  return rows.map(row => row.map(csvCell).join(',')).join('\n');
}

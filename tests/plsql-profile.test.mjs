import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, hottestLines, lineLevel, profileMarks, profileCsv } from '../src/plsqlProfile.js';

const report = { runId: 4, totalNs: 9_000_000, units: [
  { owner: 'APP', name: 'BILLING', type: 'PACKAGE BODY', totalNs: 6_000_000, lines: [
    { line: 5, occurrences: 20001, totalNs: 500_000, minNs: 0, maxNs: 1000 },
    { line: 6, occurrences: 20000, totalNs: 5_400_000, minNs: 0, maxNs: 11000 },
    { line: 8, occurrences: 1, totalNs: 100_000, minNs: 100_000, maxNs: 100_000 }] },
  { owner: '', name: '', type: 'ANONYMOUS BLOCK', totalNs: 3_000_000, lines: [{ line: 1, occurrences: 2, totalNs: 3_000_000, minNs: 1, maxNs: 2 }] }] };

test('durations read naturally from microseconds to seconds', () => {
  assert.equal(formatDuration(4_500), '5 µs');
  assert.equal(formatDuration(530_248), '0.53 ms');
  assert.equal(formatDuration(45_000_000), '45 ms');
  assert.equal(formatDuration(2_345_000_000), '2.35 s');
});

test('the hottest lines come first across units, and a line is hot, warm or cool by its share of the unit', () => {
  assert.deepEqual(hottestLines(report, 2).map(line => [line.unit.type, line.line]), [['PACKAGE BODY', 6], ['ANONYMOUS BLOCK', 1]]);
  const unit = report.units[0];
  assert.equal(lineLevel(unit.lines[1], unit), 'hot');
  assert.equal(lineLevel(unit.lines[0], unit), 'warm');
  assert.equal(lineLevel(unit.lines[2], unit), 'cool');
});

test('editor marks land on the editor lines of the matching unit only', () => {
  const marks = profileMarks(report, { owner: null, name: 'BILLING', type: 'PACKAGE BODY', firstLine: 4 });
  assert.deepEqual(marks.map(mark => [mark.line, mark.level]), [[8, 'warm'], [9, 'hot'], [11, 'cool']]);
  assert.match(marks[1].text, /^5\.40 ms · 20[,.]000×$/);
  assert.deepEqual(profileMarks(report, { owner: null, name: 'BILLING', type: 'PACKAGE', firstLine: 1 }), []);
  assert.deepEqual(profileMarks(null, { name: 'X' }), []);
});

test('the report exports as CSV with one row per executed line', () => {
  const lines = profileCsv(report).split('\n');
  assert.equal(lines[0], 'owner,unit,type,line,executions,total_ms,min_ms,max_ms,share_of_unit');
  assert.equal(lines.length, 5);
  assert.equal(lines[2], 'APP,BILLING,PACKAGE BODY,6,20000,5.400,0.000,0.011,0.9000');
  assert.match(lines[4], /^,anonymous block,ANONYMOUS BLOCK,1,2,/);
});

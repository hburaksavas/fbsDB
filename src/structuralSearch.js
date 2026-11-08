import { routineLabel } from './plsqlReferenceIndex.js';

export const structuralKinds = [
  { id: 'writes', label: 'Routines that write to a table', placeholder: 'TABLE or SCHEMA.TABLE' },
  { id: 'reads', label: 'Routines that read a table', placeholder: 'TABLE or SCHEMA.TABLE' },
  { id: 'column', label: 'Routines that reference a column', placeholder: 'COLUMN, TABLE.COLUMN or SCHEMA.TABLE.COLUMN' },
  { id: 'handles', label: 'Blocks that handle an exception', placeholder: 'OTHERS, NO_DATA_FOUND, PKG.MY_ERROR; empty for any' },
];

// Unquoted parts are upper-cased like Oracle names; "Quoted" parts keep their case.
export function parseStructuralName(text) {
  const parts = [], source = String(text || '').trim();
  for (const match of source.matchAll(/"((?:[^"]|"")*)"|([^."\s]+)/g)) parts.push(match[1] != null ? match[1].replace(/""/g, '"') : match[2].toUpperCase());
  return parts;
}

const tableMatches = (query, ref) => ref.table === query.table && (!query.owner || !ref.owner || ref.owner === query.owner);

// Runs one query over the index. Returns routines with their matching sites; `possible` marks matches that need a look.
export function structuralSearch(index, kind, text, { unhandledOnly = false } = {}) {
  const parts = parseStructuralName(text);
  const groups = new Map();
  const hit = (site, detail, possible = false) => {
    const group = groups.get(site.caller) || { routine: index.routines.get(site.caller), sites: [], possible: true };
    group.sites.push({ path: site.path, start: site.start, end: site.end, line: site.line, detail, possible });
    group.possible &&= possible; groups.set(site.caller, group);
  };
  let error = '';
  if (kind === 'writes' || kind === 'reads') {
    if (!parts.length || parts.length > 2) error = 'Enter a table name, optionally with its schema.';
    else {
      const query = { owner: parts.length === 2 ? parts[0] : null, table: parts.at(-1) };
      for (const ref of index.references) if (ref.kind === 'table' && ref.access === (kind === 'writes' ? 'write' : 'read') && tableMatches(query, ref))
        hit(ref, `${ref.operation} ${[ref.owner, ref.table].filter(Boolean).join('.')}${query.owner && !ref.owner ? ' (schema not written; may be another schema)' : ''}`, Boolean(query.owner && !ref.owner));
    }
  } else if (kind === 'column') {
    if (!parts.length || parts.length > 3) error = 'Enter a column name, optionally with its table and schema.';
    else {
      const column = parts.at(-1), query = parts.length > 1 ? { owner: parts.length === 3 ? parts[0] : null, table: parts.at(-2) } : null;
      for (const ref of index.references) {
        if (ref.kind !== 'column' || ref.column !== column) continue;
        if (ref.resolved) { if (!query || tableMatches(query, ref)) hit(ref, `${ref.operation === 'SQL' ? 'Used' : ref.operation} ${[ref.owner, ref.table, ref.column].filter(Boolean).join('.')}`); continue; }
        // A bare name: it belongs to one of the statement's tables, or to none if it is a variable declared outside the project.
        const tables = ref.tables || [];
        if (query && !tables.some(table => tableMatches(query, table))) continue;
        hit(ref, `Name ${column} without a table, in a statement on ${tables.map(table => [table.owner, table.table].filter(Boolean).join('.')).join(', ') || 'no table'}`, true);
      }
    }
  } else if (kind === 'handles') {
    const wanted = parts.join('.');
    for (const handler of index.handlers) {
      if (unhandledOnly && handler.reraises) continue;
      if (wanted && !handler.exceptions.some(name => name === wanted || name.endsWith('.' + wanted))) continue;
      hit(handler, `WHEN ${handler.exceptions.join(' OR ')}${handler.reraises ? ' · raises again' : ' · does not raise again'}`);
    }
  } else error = 'Choose what to search for.';
  for (const group of groups.values()) group.sites.sort((a, b) => a.path.localeCompare(b.path) || a.start - b.start);
  const results = [...groups.values()].sort((a, b) => Number(a.possible) - Number(b.possible) || routineLabel(a.routine).localeCompare(routineLabel(b.routine)));
  // Dynamic SQL is never searched; routines that contain it may also match.
  const dynamicRoutines = kind === 'handles' ? [] : [...new Set(index.dynamic.map(site => site.caller))].map(id => index.routines.get(id)).filter(Boolean);
  return { error, results, sites: results.reduce((sum, group) => sum + group.sites.length, 0), dynamicRoutines };
}

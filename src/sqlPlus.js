// A small, local subset of SQL*Plus script commands. They never reach Oracle:
// DEFINE/UNDEFINE/SET DEFINE feed &name substitution, DESCRIBE becomes a catalog query,
// WHENEVER SQLERROR sets the script's continue-on-error default, and PROMPT, REM and
// the remaining SET options are skipped. Everything else is sent unchanged.

const ALIASES = { DEF: 'DEFINE', UNDEF: 'UNDEFINE', DESC: 'DESCRIBE', REMARK: 'REM' };
const COMMANDS = new Set(['DEFINE', 'UNDEFINE', 'PROMPT', 'REM', 'SET', 'WHENEVER', 'DESCRIBE']);

// `index` is the first non-blank character of a line and a new statement starts there.
export function directiveAt(text, index) {
  const lineEnd = text.indexOf('\n', index), end = lineEnd < 0 ? text.length : lineEnd;
  const line = text.slice(index, end).replace(/\r$/, '');
  const word = /^([A-Za-z]+)(?=\s|;|$)/.exec(line);
  if (!word) return null;
  const upper = word[1].toUpperCase(), name = ALIASES[upper] || upper;
  if (!COMMANDS.has(name)) return null;
  const args = line.slice(word[0].length).replace(/;\s*$/, '').trim();
  if (name === 'SET' && /^(TRANSACTION|ROLE|CONSTRAINTS?)\b/i.test(args)) return null; // real SQL
  if (name === 'DESCRIBE' && !args) return null;
  return { name, args, end };
}

const unquote = (value) => {
  const match = /^(['"])(.*)\1$/.exec(value);
  return match ? match[2] : value;
};

export function createSqlPlusState() {
  return { defines: new Map(), substitute: true, continueOnError: null };
}

export function substituteDefines(sql, state) {
  if (!state.substitute || !state.defines.size) return sql;
  return sql.replace(/&&?([A-Za-z_][A-Za-z0-9_$#]*)\.?/g, (whole, name) => {
    const value = state.defines.get(name.toUpperCase());
    return value === undefined ? whole : value;
  });
}

export function applyDirective(state, { name, args }) {
  if (name === 'DEFINE') {
    const match = /^([A-Za-z_][A-Za-z0-9_$#]*)\s*=\s*(.*)$/.exec(args);
    if (match) state.defines.set(match[1].toUpperCase(), unquote(substituteDefines(match[2].trim(), state)));
  } else if (name === 'UNDEFINE') {
    for (const item of args.split(/\s+/).filter(Boolean)) state.defines.delete(item.toUpperCase());
  } else if (name === 'SET') {
    const match = /^DEFINE\s+(\S+)$/i.exec(args);
    if (match) {
      const mode = match[1].toUpperCase();
      if (mode === 'OFF') state.substitute = false;
      else if (mode === 'ON') state.substitute = true;
    }
  } else if (name === 'WHENEVER') {
    const match = /^SQLERROR\s+(EXIT|CONTINUE)\b/i.exec(args);
    if (match && state.continueOnError === null) state.continueOnError = match[1].toUpperCase() === 'CONTINUE';
  }
}

const quoteLiteral = (value) => `'${value.replace(/'/g, "''")}'`;
const identifierValue = (part) => (/^"(.*)"$/.test(part) ? part.slice(1, -1) : part.toUpperCase());

// DESCRIBE [owner.]table as a catalog query over the visible tables and views.
export function describeSql(args, state = createSqlPlusState()) {
  const target = substituteDefines(args, state).replace(/;\s*$/, '').trim();
  const parts = target.match(/"[^"]+"|[^."]+/g) || [];
  if (!parts.length || parts.length > 2) return '';
  const name = identifierValue(parts.at(-1)), owner = parts.length === 2 ? identifierValue(parts[0]) : null;
  const ownerFilter = owner ? quoteLiteral(owner) : "SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')";
  return `SELECT column_name AS "Name",
       CASE nullable WHEN 'N' THEN 'NOT NULL' END AS "Null?",
       CASE
         WHEN data_type IN ('VARCHAR2', 'NVARCHAR2', 'CHAR', 'NCHAR') THEN data_type || '(' || char_length || ')'
         WHEN data_type = 'RAW' THEN data_type || '(' || data_length || ')'
         WHEN data_type = 'NUMBER' AND data_precision IS NOT NULL THEN data_type || '(' || data_precision || CASE WHEN NVL(data_scale, 0) <> 0 THEN ',' || data_scale END || ')'
         ELSE data_type
       END AS "Type"
  FROM all_tab_columns
 WHERE owner = ${ownerFilter}
   AND table_name = ${quoteLiteral(name)}
 ORDER BY column_id`;
}

// Runs statements and directives (from getSqlStatements with `directives: true`) in order.
export function prepareScript(items) {
  const state = createSqlPlusState(), statements = [];
  for (const item of items) {
    if (!item.directive) { statements.push({ ...item, sql: substituteDefines(item.sql, state) }); continue; }
    applyDirective(state, item.directive);
    if (item.directive.name === 'DESCRIBE') {
      const sql = describeSql(item.directive.args, state);
      if (sql) statements.push({ start: item.start, end: item.end, sql });
    }
  }
  return { statements, continueOnError: state.continueOnError };
}

// Resolves what the caret or selection runs: substitutes the definitions that precede it,
// turns DESCRIBE into its query and reports other commands without sending them.
export function resolveTarget(items, target) {
  if (target.directive) {
    if (target.directive.name === 'DESCRIBE') {
      const state = createSqlPlusState();
      for (const item of items) if (item.directive && item.start < target.start) applyDirective(state, item.directive);
      const sql = describeSql(target.directive.args, state);
      return sql ? { start: target.start, end: target.end, sql, kind: 'statement' } : { ...target, sql: '', kind: 'sql*plus', command: 'DESCRIBE' };
    }
    return { ...target, sql: '', kind: 'sql*plus', command: target.directive.name };
  }
  const start = target.start ?? Infinity, state = createSqlPlusState();
  for (const item of items) if (item.directive && item.start < start) applyDirective(state, item.directive);
  const sql = substituteDefines(target.sql, state);
  return sql === target.sql ? target : { ...target, sql };
}

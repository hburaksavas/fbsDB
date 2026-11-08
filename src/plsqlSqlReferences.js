// Table and column references of static SQL inside PL/SQL bodies, and exception handlers, read from tokens only.
// Without database metadata a bare column name cannot be tied to one table: such references are kept as unresolved,
// with the tables of their statement, and searches show them as possible matches. Synonyms and views are not followed,
// and SQL inside strings (dynamic SQL) is not read.

const word = (token, value) => token?.kind === 'identifier' && !token.quoted && token.value.toUpperCase() === value;
const plain = token => token?.kind === 'identifier' && !token.quoted ? token.value.toUpperCase() : '';
const keyOf = token => token.quoted ? token.value : token.value.toUpperCase();
const STARTS = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'WITH']);
export const SQL_WORDS = new Set(('SELECT FROM WHERE AND OR NOT NULL IS IN EXISTS BETWEEN LIKE LIKE2 LIKE4 LIKEC ESCAPE AS ON JOIN INNER LEFT RIGHT FULL OUTER CROSS NATURAL USING '
  + 'GROUP BY ORDER HAVING ASC DESC NULLS FIRST LAST DISTINCT UNIQUE ALL ANY SOME UNION INTERSECT MINUS EXCEPT INTO VALUES SET UPDATE DELETE INSERT MERGE '
  + 'WHEN THEN ELSE ELSIF END CASE MATCHED WITH CONNECT START PRIOR LEVEL ROWNUM ROWID SYSDATE SYSTIMESTAMP CURRENT_DATE CURRENT_TIMESTAMP USER UID FOR OF '
  + 'NOWAIT WAIT SKIP LOCKED FETCH NEXT OFFSET ROWS ROW ONLY TIES PERCENT RETURNING RETURN BULK COLLECT LIMIT TRUE FALSE PARTITION OVER WITHIN TABLE '
  + 'INTERVAL DAY SECOND YEAR MONTH HOUR MINUTE TIMESTAMP DATE TIME ZONE LOCAL AT DEFAULT PIVOT UNPIVOT MODEL LATERAL APPLY RECURSIVE SEARCH CYCLE DEPTH BREADTH '
  + 'IGNORE RESPECT PRECEDING FOLLOWING UNBOUNDED CURRENT RANGE MEMBER SUBMULTISET EMPTY NAN INFINITE NOCYCLE SIBLINGS KEEP LOG ERRORS REJECT SAMPLE SEED '
  + 'COLUMN_VALUE SQL MULTISET THE CAST LOOP BEGIN DECLARE EXCEPTION RAISE IF NOCOPY OUT').split(' '));
const ITEM_END = new Set(['WHERE', 'GROUP', 'ORDER', 'HAVING', 'CONNECT', 'START', 'UNION', 'INTERSECT', 'MINUS', 'EXCEPT', 'FETCH', 'OFFSET', 'FOR', 'INTO', 'SET', 'VALUES', 'USING', 'ON', 'WHEN', 'RETURNING', 'RETURN', 'LOG', 'MODEL', 'PIVOT', 'UNPIVOT', 'PARTITION', 'SAMPLE', 'AS', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL', 'OUTER', 'APPLY', 'LATERAL', 'SELECT', 'WINDOW']);

// One statement starts at a SQL keyword and ends at ';', at the closing parenthesis around it, or at LOOP for a cursor FOR loop.
function statementEnd(tokens, start) {
  let depth = 0;
  for (let k = start; k < tokens.length; k++) {
    const value = tokens[k].value;
    if (value === '(') depth++;
    else if (value === ')') { if (depth === 0) return k; depth--; }
    else if (value === ';' && depth === 0) return k;
    else if (depth === 0 && word(tokens[k], 'LOOP')) return k;
  }
  return tokens.length;
}

export function sqlReferences(tokens, { callerAt, shadowed, lineAt, path }) {
  const refs = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!STARTS.has(plain(token)) || tokens[i - 1]?.value === '.') continue;
    const caller = callerAt(token.start);
    if (!caller) continue;
    const end = statementEnd(tokens, i);
    statement(tokens, i, end, caller, refs, { shadowed, lineAt, path });
    i = end;
  }
  return refs;
}

function statement(tokens, start, end, caller, refs, { shadowed, lineAt, path }) {
  const used = new Set(), aliases = new Map(), tables = [];
  const ref = (item, extra) => refs.push({ caller: caller.id, path, start: item.start, end: item.end, line: lineAt(item.start), ...extra });
  // [schema.]table[@link] [alias]; null for a subquery or a table function. After INSERT INTO a parenthesis opens the column list.
  const item = (k, columnList = false) => {
    if (tokens[k]?.kind !== 'identifier' || SQL_WORDS.has(plain(tokens[k])) && !word(tokens[k], 'DUAL')) return null;
    const names = [tokens[k]]; let at = k;
    if (tokens[at + 1]?.value === '.' && tokens[at + 2]?.kind === 'identifier') { names.push(tokens[at + 2]); at += 2; }
    if (tokens[at + 1]?.value === '(' && !columnList) return null;
    for (const name of names) used.add(name.start);
    if (tokens[at + 1]?.value === '@' && tokens[at + 2]?.kind === 'identifier') { at += 2; while (tokens[at + 1]?.value === '.' && tokens[at + 2]?.kind === 'identifier') at += 2; used.add(tokens[at].start); }
    const table = { owner: names.length === 2 ? keyOf(names[0]) : null, table: keyOf(names.at(-1)), start: names[0].start, end: names.at(-1).end };
    let alias = tokens[at + 1];
    if (word(alias, 'AS')) { at++; alias = tokens[at + 1]; }
    if (alias?.kind === 'identifier' && !ITEM_END.has(plain(alias)) && !SQL_WORDS.has(plain(alias))) { aliases.set(keyOf(alias), table); used.add(alias.start); at++; }
    aliases.set(table.table, table); tables.push(table);
    return { ...table, next: at + 1 };
  };
  const columnList = (k, table, operation) => {
    let depth = 0;
    for (; k < end; k++) {
      const value = tokens[k].value;
      if (value === '(') { depth++; continue; }
      if (value === ')') { if (--depth <= 0) return k; continue; }
      if (depth === 1 && tokens[k].kind === 'identifier' && tokens[k + 1]?.value !== '.') { used.add(tokens[k].start); ref(tokens[k], { kind: 'column', operation, owner: table.owner, table: table.table, column: keyOf(tokens[k]), resolved: true }); }
    }
    return k;
  };
  const setColumns = (k, table, operation) => {
    let depth = 0;
    for (; k < end; k++) {
      const value = tokens[k].value;
      if (value === '(') depth++; else if (value === ')') depth--;
      if (depth === 0 && ['WHERE', 'RETURNING', 'RETURN', 'LOG', 'DELETE', 'WHEN'].includes(plain(tokens[k]))) return k;
      const qualified = tokens[k + 1]?.value === '.' && tokens[k + 2]?.kind === 'identifier';
      const column = qualified ? tokens[k + 2] : tokens[k];
      const after = tokens[qualified ? k + 3 : k + 1];
      if (depth === 0 && tokens[k].kind === 'identifier' && (tokens[k - 1]?.value === ',' || word(tokens[k - 1], 'SET')) && after?.value === '=' && tokens[(qualified ? k + 4 : k + 2)]?.value !== '>') {
        used.add(tokens[k].start); used.add(column.start);
        ref(column, { kind: 'column', operation, owner: table.owner, table: table.table, column: keyOf(column), resolved: true });
      }
    }
    return k;
  };
  let target = null;
  for (let k = start; k < end; k++) {
    const first = plain(tokens[k]);
    if (first === 'INSERT' && word(tokens[k + 1], 'INTO')) {
      const found = item(k + 2, true); if (!found) continue;
      ref(found, { kind: 'table', access: 'write', operation: 'INSERT', owner: found.owner, table: found.table });
      k = found.next; if (tokens[k]?.value === '(') k = columnList(k, found, 'INSERT'); k--;
    } else if (first === 'INSERT' && tokens[k + 1]?.value === '(' && target) {
      k = columnList(k + 1, target, 'MERGE');
    } else if (first === 'UPDATE' && word(tokens[k + 1], 'SET') && target) {
      k = setColumns(k + 2, target, 'MERGE') - 1;
    } else if (first === 'UPDATE') {
      const found = item(k + 1); if (!found) continue;
      ref(found, { kind: 'table', access: 'write', operation: 'UPDATE', owner: found.owner, table: found.table });
      k = found.next; if (word(tokens[k], 'SET')) k = setColumns(k + 1, found, 'UPDATE'); k--;
    } else if (first === 'DELETE' && !(target && word(tokens[k - 1], 'THEN'))) {
      const found = item(word(tokens[k + 1], 'FROM') ? k + 2 : k + 1); if (!found) continue;
      ref(found, { kind: 'table', access: 'write', operation: 'DELETE', owner: found.owner, table: found.table });
      k = found.next - 1;
    } else if (first === 'MERGE' && word(tokens[k + 1], 'INTO')) {
      const found = item(k + 2); if (!found) continue;
      target = found; ref(found, { kind: 'table', access: 'write', operation: 'MERGE', owner: found.owner, table: found.table });
      k = found.next - 1;
    } else if ((first === 'FROM' || first === 'JOIN' || first === 'USING' && target) && !word(tokens[k - 1], 'DELETE')) {
      let at = k + 1;
      for (;;) {
        const found = item(at);
        if (found) { ref(found, { kind: 'table', access: 'read', operation: 'SELECT', owner: found.owner, table: found.table }); at = found.next; }
        if (first !== 'FROM' || tokens[at]?.value !== ',') break;
        at++;
      }
    }
  }
  // Qualified columns (alias.column, table.column, schema.table.column) resolve to their table; other names stay possible matches.
  for (let k = start; k < end; k++) {
    const token = tokens[k];
    if (token.kind !== 'identifier' || used.has(token.start) || tokens[k - 1]?.value === '.' || tokens[k - 1]?.value === ':') continue;
    if (tokens[k + 1]?.value === '.' && tokens[k + 2]?.kind === 'identifier') {
      const three = tokens[k + 3]?.value === '.' && tokens[k + 4]?.kind === 'identifier';
      const table = three ? tables.find(item => item.owner === keyOf(token) && item.table === keyOf(tokens[k + 2])) : aliases.get(keyOf(token));
      const column = three ? tokens[k + 4] : tokens[k + 2];
      if (table && tokens[(three ? k + 5 : k + 3)]?.value !== '(') ref(column, { kind: 'column', operation: 'SQL', owner: table.owner, table: table.table, column: keyOf(column), resolved: true });
      k += three ? 4 : 2; continue;
    }
    const name = plain(token) || keyOf(token);
    if (SQL_WORDS.has(plain(token)) || tokens[k + 1]?.value === '(' || tokens[k + 1]?.value === '%' || word(tokens[k - 1], 'AS') || shadowed(name, token.start)) continue;
    ref(token, { kind: 'column', operation: 'SQL', owner: null, table: null, column: name, resolved: false, tables: tables.map(item => ({ owner: item.owner, table: item.table })) });
  }
}

// Exception handlers: the names after WHEN, and whether the branch raises again.
export function exceptionHandlers(model, tokens, { callerAt, lineAt, path }) {
  const found = [];
  const walk = (node, end) => {
    if (!node || typeof node !== 'object') return;
    const nodeEnd = node.end ?? end;
    if (node.handlers) {
      const branches = node.handlers.children || [];
      branches.forEach((branch, index) => found.push({ start: branch.start, end: branches[index + 1]?.start ?? node.closeStart ?? nodeEnd }));
      for (const branch of branches) for (const child of branch.children || []) walk(child, nodeEnd);
    }
    for (const child of node.children || []) walk(child, nodeEnd);
    for (const child of node.declarations || []) walk(child, nodeEnd);
    for (const branch of node.branches || []) for (const child of branch.children || []) walk(child, nodeEnd);
  };
  for (const child of model.children || []) walk(child, model.end);
  const handlers = [];
  for (const branch of found.sort((a, b) => a.start - b.start)) {
    const caller = callerAt(branch.start);
    if (!caller) continue;
    let k = tokens.findIndex(token => token.start === branch.start);
    if (k < 0) continue;
    const exceptions = [];
    for (k++; k < tokens.length && !word(tokens[k], 'THEN'); k++) {
      if (tokens[k].kind !== 'identifier' || word(tokens[k], 'OR')) continue;
      let name = keyOf(tokens[k]);
      while (tokens[k + 1]?.value === '.' && tokens[k + 2]?.kind === 'identifier') { name += '.' + keyOf(tokens[k + 2]); k += 2; }
      exceptions.push(name);
    }
    let reraises = false;
    for (; k < tokens.length && tokens[k].start < branch.end; k++) if (word(tokens[k], 'RAISE') || word(tokens[k], 'RAISE_APPLICATION_ERROR')) { reraises = true; break; }
    handlers.push({ caller: caller.id, path, start: branch.start, end: branch.start + 4, line: lineAt(branch.start), exceptions, reraises });
  }
  return handlers;
}

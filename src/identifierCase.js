import { lexOracle } from './oracleLexer.js';

export const identifierCaseStyles = [
  { id: 'snake', label: 'snake_case' },
  { id: 'camel', label: 'camelCase' },
  { id: 'pascal', label: 'PascalCase' },
  { id: 'upper', label: 'UPPER_CASE' },
];
export const projectIdentifierStyles = [
  { id: 'project-full', label: 'Project full terms' },
  { id: 'project-short', label: 'Project abbreviations' },
];
export const identifierCaseLimits = { characters: 100000, edits: 2000, length: 128 };
// Keywords keep their spelling; converting them would change statement meaning, not naming.
const keywords = new Set(`ACCESS ADD ALL ALTER AND ANY AS ASC AUDIT BEGIN BETWEEN BINARY_INTEGER BODY BOOLEAN BULK BY CASE CHAR CHECK CLOB CLOSE CLUSTER COLLECT COLUMN COMMENT COMMIT COMPRESS CONNECT CONSTANT CONSTRAINT CREATE CROSS CURRENT CURSOR DATE DECIMAL DECLARE DEFAULT DELETE DESC DISTINCT DROP ELSE ELSIF END EXCEPTION EXCLUSIVE EXECUTE EXISTS EXIT FETCH FILE FLOAT FOR FORALL FROM FULL FUNCTION GOTO GRANT GROUP HAVING IDENTIFIED IF IMMEDIATE IN INCREMENT INDEX INITIAL INNER INSERT INTEGER INTERSECT INTERVAL INTO IS JOIN LEFT LEVEL LIKE LIMIT LOCK LONG LOOP MERGE MINUS MODE MODIFY NATURAL NOAUDIT NOCOMPRESS NOT NOTFOUND NOWAIT NULL NUMBER OF OFFLINE ON ONLINE OPEN OPTION OR ORDER OTHERS OUT OUTER PACKAGE PCTFREE PLS_INTEGER PRAGMA PRIOR PRIVILEGES PROCEDURE PUBLIC RAISE RAW RECORD REF RENAME REPLACE RESOURCE RETURN RETURNING REVOKE RIGHT ROLLBACK ROW ROWCOUNT ROWID ROWNUM ROWS ROWTYPE SAVEPOINT SELECT SESSION SET SHARE SIZE SMALLINT START SUBTYPE SUCCESSFUL SYNONYM SYSDATE TABLE THEN TIMESTAMP TO TRIGGER TYPE UID UNION UNIQUE UPDATE USER USING VALIDATE VALUES VARCHAR VARCHAR2 VIEW WHEN WHENEVER WHERE WHILE WITH`.split(' '));

export function identifierWords(name) {
  return name.split('_').flatMap(part => part.match(/\p{Lu}+(?!\p{Ll})|\p{Lu}?\p{Ll}+|\p{N}+|\p{Lu}+/gu) || []).filter(Boolean);
}

function dictionaryWords(name, style, dictionary) {
  const words=identifierWords(name).map(word=>word.toLowerCase());
  if (!style.startsWith('project-')) return words;
  const terms=dictionary?.terms||[];
  return words.map(word=>{
    const term=terms.find(item=>[item.name,item.abbreviation,...String(item.aliases||'').split(',').map(value=>value.trim())].some(value=>value.toLowerCase()===word));
    return term?(style==='project-short'?term.abbreviation:term.name).toLowerCase():word;
  });
}

export function convertIdentifier(name, style, dictionary) {
  const words = dictionaryWords(name, style, dictionary);
  if (!words.length) return name;
  const cap = word => word[0].toUpperCase() + word.slice(1);
  if (style.startsWith('project-')) style=dictionary?.style||'snake';
  if (style === 'snake') return words.join('_');
  if (style === 'upper') return words.join('_').toUpperCase();
  if (style === 'camel') return words[0] + words.slice(1).map(cap).join('');
  if (style === 'pascal') return words.map(cap).join('');
  throw new Error(`Unknown identifier style: ${style}`);
}

// Oracle folds unquoted names to upper case; quoted names are exact.
const identity = (value, quoted) => quoted ? value : value.toUpperCase();

export function planIdentifierCase(source, range, style, { includeQuoted = false, dictionary = null } = {}) {
  const start = Math.max(0, range.start), end = Math.min(source.length, range.end);
  if (end <= start) return { edits: [], skipped: [], renames: [], identityChanges: 0, error: 'Select the identifiers to convert.' };
  if (end - start > identifierCaseLimits.characters) return { edits: [], skipped: [], renames: [], identityChanges: 0, error: `Selections over ${identifierCaseLimits.characters.toLocaleString('en-US')} characters are not converted.` };
  const tokens = lexOracle(source), edits = [], skipped = [], inspections=[];
  const skip = (token, reason) => skipped.push({ value: token.value, start: token.start, reason });
  tokens.forEach((token, index) => {
    if (token.kind !== 'identifier' || token.start < start || token.end > end) return;
    const previous = tokens[index - 1];
    if (previous?.kind === 'symbol' && previous.value === ':' && previous.end === token.start) return skip(token, 'Bind variable');
    if (!token.quoted && keywords.has(token.value.toUpperCase())) return;
    if (token.quoted && !includeQuoted) return skip(token, 'Quoted identifier is case-sensitive');
    if (token.open) return skip(token, 'Unterminated quoted identifier');
    if (/[$#]/.test(token.value)) return skip(token, 'Contains $ or #');
    const aliases=identifierWords(token.value).filter(word=>(dictionary?.terms||[]).some(term=>String(term.aliases||'').split(',').some(alias=>alias.trim().toLowerCase()===word.toLowerCase())));
    if(aliases.length)inspections.push({value:token.value,start:token.start,aliases});
    const after = convertIdentifier(token.value, style, dictionary);
    if (after === token.value) return;
    if (new TextEncoder().encode(after).length > identifierCaseLimits.length) return skip(token, `Longer than ${identifierCaseLimits.length} bytes`);
    if (!token.quoted && keywords.has(after.toUpperCase())) return skip(token, 'Would become a keyword');
    edits.push({ start: token.start, end: token.end, before: token.value, after, text: token.quoted ? `"${after.replace(/"/g, '""')}"` : after, quoted: !!token.quoted, identityChanged: identity(token.value, token.quoted) !== identity(after, token.quoted) });
  });
  if (edits.length > identifierCaseLimits.edits) return { edits: [], skipped, renames: [], identityChanges: 0, error: `More than ${identifierCaseLimits.edits.toLocaleString('en-US')} identifiers are selected. Select a smaller range.` };
  const renames = [...edits.reduce((map, edit) => {
    const key = `${edit.quoted}:${edit.before}`, item = map.get(key) || { before: edit.before, after: edit.after, quoted: edit.quoted, identityChanged: edit.identityChanged, count: 0 };
    item.count++; return map.set(key, item);
  }, new Map()).values()];
  return { edits, skipped, renames, inspections, identityChanges: edits.filter(edit => edit.identityChanged).length };
}

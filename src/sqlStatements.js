import { directiveAt } from './sqlPlus.js';

function startsPlsql(text, start) {
  let at=start;
  const label=/^<<\s*(?:"(?:[^"]|"")+"|[\w$#]+)\s*>>/.exec(text.slice(at));
  if(label)at+=label[0].length;
  const word=()=>{
    while(at<text.length){
      if(/\s/.test(text[at])){at++;continue;}
      if(text.startsWith('--',at)){const end=text.indexOf('\n',at+2);at=end<0?text.length:end+1;continue;}
      if(text.startsWith('/*',at)){const end=text.indexOf('*/',at+2);at=end<0?text.length:end+2;continue;}
      break;
    }
    const match=/^[A-Za-z_$#][A-Za-z0-9_$#]*/.exec(text.slice(at));
    if(!match)return '';
    at+=match[0].length;return match[0].toUpperCase();
  };
  let first=word();
  const types=['PROCEDURE','FUNCTION','PACKAGE','TRIGGER','TYPE'];
  if(['DECLARE','BEGIN',...types].includes(first))return true;
  if(first!=='CREATE')return false;
  first=word();
  if(first==='OR'){if(word()!=='REPLACE')return false;first=word();}
  if(['EDITIONABLE','NONEDITIONABLE'].includes(first))first=word();
  return types.includes(first);
}

// Statement ranges share offsets with Monaco's model, including comments and literals.
export function getSqlStatements(text, options = {}) {
  const statements = [];
  let start = null, plsql = false;
  const finish = (end) => {
    if (start !== null && text.slice(start, end).trim()) statements.push({ start, end, sql: text.slice(start, end).trim() });
    start = null; plsql = false;
  };
  for (let i = 0; i < text.length;) {
    const ch = text[i], next = text[i + 1];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '-' && next === '-') { const end = text.indexOf('\n', i + 2); i = end < 0 ? text.length : end + 1; continue; }
    if (ch === '/' && next === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 2; continue; }
    const lineStart = text.lastIndexOf('\n', i - 1) + 1;
    const lineEnd = text.indexOf('\n', i);
    const endOfLine = lineEnd < 0 ? text.length : lineEnd;
    if (ch === '/' && text.slice(lineStart, endOfLine).trim() === '/') { finish(i); i = endOfLine; continue; }
    if (start === null && text.slice(lineStart, i).trim() === '') {
      const directive = directiveAt(text, i);
      if (directive) {
        if (options.directives) statements.push({ start: i, end: directive.end, sql: text.slice(i, directive.end).trim(), directive });
        i = directive.end; continue;
      }
    }
    if (start === null) {
      if (ch === ';') { i++; continue; }
      start = i;
      plsql = startsPlsql(text,i);
    }
    if ((ch === 'q' || ch === 'Q') && next === "'" && text[i + 2]) {
      const open = text[i + 2], close = ({ '[': ']', '{': '}', '(': ')', '<': '>' })[open] || open;
      const end = text.indexOf(close + "'", i + 3); i = end < 0 ? text.length : end + 2; continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch; i++;
      while (i < text.length) { if (text[i] === quote) { if (text[i + 1] === quote) { i += 2; continue; } i++; break; } i++; }
      continue;
    }
    if (ch === ';' && !plsql) finish(i + 1);
    i++;
  }
  finish(text.length);
  return statements;
}

export function getStatementAtCursor(text, cursor) {
  const statements = getSqlStatements(text);
  return (statements.find((item) => item.end === cursor) || statements.find((item) => cursor < item.end) || statements.at(-1))?.sql || '';
}

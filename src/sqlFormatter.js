import { formatOraclePlsql } from './plsqlFormatter.js';
import { lexOracle } from './oracleLexer.js';
import { getSqlStatements } from './sqlStatements.js';
const keywords = new Set(`SELECT DISTINCT ALL FROM WHERE GROUP BY HAVING ORDER BY ASC DESC NULLS FIRST LAST FETCH FIRST NEXT ROW ROWS ONLY OFFSET FOR UPDATE NOWAIT SKIP LOCKED UNION UNION ALL INTERSECT MINUS JOIN INNER LEFT RIGHT FULL OUTER CROSS NATURAL ON USING AND OR NOT IN IS NULL LIKE BETWEEN EXISTS AS CASE WHEN THEN ELSE END INSERT INTO VALUES UPDATE SET DELETE MERGE MATCHED RETURNING CREATE ALTER DROP TABLE VIEW WITH RECURSIVE CONNECT START PRIOR`.split(" "));

export function isPlsqlSource(source) {
  const tokens = lexOracle(source).filter(token => token.kind !== 'comment'), first = tokens[0]?.value.toUpperCase();
  return ['DECLARE', 'BEGIN', 'PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER', 'TYPE'].includes(first) || first === '<' && tokens[1]?.value === '<' || first === 'CREATE' && tokens.slice(1, 9).some(token => !token.quoted && ['PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER', 'TYPE'].includes(token.value.toUpperCase()));
}

function tokenize(sql) {
  const source = lexOracle(sql), tokens = [], operators = new Set([">=", "<=", "<>", "!=", "||", "=>", ":=", "**"]);
  for (let at = 0; at < source.length; at++) {
    const token = source[at], next = source[at + 1], raw = sql.slice(token.start, token.end);
    if (next && token.end === next.start && operators.has(raw + sql.slice(next.start, next.end))) { tokens.push({ type: "operator", value: sql.slice(token.start, next.end) }); at++; continue; }
    if (raw === ":" && next && token.end === next.start && ["identifier", "number"].includes(next.kind)) { tokens.push({ type: "bind", value: sql.slice(token.start, next.end) }); at++; continue; }
    tokens.push({ type: token.kind === "comment" ? "comment" : token.kind === "string" || token.quoted ? "literal" : token.kind === "identifier" ? "word" : token.kind === "number" ? "number" : "symbol", value: raw });
  }
  return tokens;
}

const clauseHeads = [
  ["UNION", "ALL"], ["GROUP", "BY"], ["ORDER", "BY"], ["PARTITION", "BY"],
  ["CONNECT", "BY"], ["START", "WITH"], ["FETCH", "FIRST"], ["FOR", "UPDATE"],
  ["SELECT"], ["FROM"], ["WHERE"], ["HAVING"], ["UNION"], ["INTERSECT"], ["MINUS"],
  ["OFFSET"], ["RETURNING"], ["INSERT", "INTO"], ["DELETE", "FROM"], ["UPDATE"], ["MERGE", "INTO"], ["VALUES"],
];

function clauseAt(tokens, index, depth) {
  if (depth !== 0 || tokens[index]?.type !== "word") return null;
  for (const clause of clauseHeads) {
    if (clause.every((part, offset) => tokens[index + offset]?.type === "word" && tokens[index + offset].value.toUpperCase() === part)) return clause;
  }
  return null;
}

function joinAt(tokens, index, depth) {
  if (depth !== 0 || tokens[index]?.type !== "word") return null;
  const words = [];
  let cursor = index;
  while (tokens[cursor]?.type === "word" && words.length < 4) words.push(tokens[cursor++].value.toUpperCase());
  const candidates = [["NATURAL", "LEFT", "OUTER", "JOIN"], ["NATURAL", "RIGHT", "OUTER", "JOIN"], ["NATURAL", "LEFT", "JOIN"], ["NATURAL", "RIGHT", "JOIN"], ["LEFT", "OUTER", "JOIN"], ["RIGHT", "OUTER", "JOIN"], ["FULL", "OUTER", "JOIN"], ["INNER", "JOIN"], ["CROSS", "JOIN"], ["LEFT", "JOIN"], ["RIGHT", "JOIN"], ["FULL", "JOIN"], ["NATURAL", "JOIN"], ["JOIN"]];
  for (const candidate of candidates) {
    if (candidate.every((part, offset) => words[offset] === part)) return candidate;
  }
  return null;
}

export function formatOracleSql(source, style = {}) {
  const sql = String(source ?? "");
  if (isPlsqlSource(sql)) return formatOraclePlsql(sql, style).formatted;
  const tokens = tokenize(sql);
  if (!tokens.length) return sql;
  const lines = [];
  let line = "", indent = 0, depth = 0, whereMode = false;
  const flush = () => { const value = line.trimEnd(); if (value.trim()) lines.push(`${"  ".repeat(Math.max(0, indent))}${value.trimStart()}`); line = ""; };
  const add = (value, space = true) => { if (space && line && !line.endsWith(" ") && !line.endsWith("(") && !line.endsWith(".")) line += " "; line += value; };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i], upper = token.type === "word" ? token.value.toUpperCase() : "";
    const join = joinAt(tokens, i, depth);
    if (join) { flush(); indent = 1; line = join.join(" "); i += join.length - 1; continue; }
    const clause = clauseAt(tokens, i, depth);
    if (clause) {
      flush(); indent = 0; whereMode = clause[0] === "WHERE";
      line = clause.join(" ");
      i += clause.length - 1;
      flush(); indent = 1;
      continue;
    }
    if (depth === 0 && whereMode && (upper === "AND" || upper === "OR")) { flush(); indent = 2; line = upper; continue; }
    if (depth === 0 && upper === "ON") { flush(); indent = 1; line = "ON"; continue; }
    if (token.type === "comment") { add(token.value, true); if (token.value.startsWith("--")) flush(); continue; }
    if (token.value === "(") {
      const prev = tokens[i - 1]?.value?.toUpperCase();
      add("(", ["IN", "EXISTS", "AS", "FROM", "USING", "VALUES"].includes(prev)); depth++; continue;
    }
    if (token.value === ")") { line = line.trimEnd() + ")"; depth = Math.max(0, depth - 1); continue; }
    if (token.value === ",") {
      line = line.trimEnd() + ",";
      if (depth === 0) { flush(); indent = whereMode ? 1 : 1; }
      else line += " ";
      continue;
    }
    if (token.value === ".") { line = line.trimEnd() + "."; continue; }
    if (token.value === ";") { line = line.trimEnd() + ";"; flush(); indent = 0; whereMode = false; continue; }
    if (token.type === "operator") { add(token.value); line += " "; continue; }
    const value = token.type === "word" && keywords.has(upper) ? upper : token.value;
    add(value, true);
  }
  flush();
  return lines.join("\n").trim() ? `${lines.join("\n").trimEnd()}\n` : sql;
}

export function formatOracleDocument(source, style = {}) {
  const ranges = getSqlStatements(source);
  if (!ranges.length) return { formatted: source };
  const output = []; let previous = 0;
  for (const range of ranges) {
    const gap = source.slice(previous, range.start).trim(); if (gap) output.push(gap);
    const text = source.slice(range.start, range.end);
    output.push(formatOracleSql(text, style).trimEnd()); previous = range.end;
  }
  const tail = source.slice(previous).trim(); if (tail) output.push(tail);
  return { formatted: output.join('\n\n') + '\n' };
}

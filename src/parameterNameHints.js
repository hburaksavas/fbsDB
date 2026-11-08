import { lexOracle } from './oracleLexer.js';
import { plsqlVisibleRoutines } from './plsqlStructure.js';
import { callableContainers, languageObjects, resolveObject } from './oracleLanguageService.js';

// Parameter names shown before positional arguments of PL/SQL calls, never written into the source.
// Parameters come from routines declared in the same source and from database metadata that is already loaded;
// built-in SQL functions are left out because their parameters have no names that named notation accepts.
// A position gets no hint when the call's overloads disagree on its name, or when the argument already is that name.

const key = token => token.quoted ? token.value : token.value.toUpperCase();
const NOT_CALLS = new Set(['SELECT', 'IN', 'VALUES', 'AS', 'OVER', 'PARTITION', 'IF', 'ELSIF', 'FOR', 'WHILE', 'WHEN', 'AND', 'OR', 'NOT', 'EXISTS', 'ANY', 'ALL', 'SOME', 'RETURN', 'CASE', 'THEN', 'ELSE', 'USING', 'INTO', 'TABLE', 'ON', 'BY', 'WITH', 'FROM', 'WHERE', 'KEY', 'CHECK', 'UNIQUE', 'REFERENCES', 'DEFAULT', 'IS', 'OF']);
const DECLARATIONS = new Set(['PROCEDURE', 'FUNCTION', 'CURSOR', 'TYPE', 'PACKAGE', 'TRIGGER', 'VIEW', 'TABLE', 'INDEX']);

export function parameterNameHints(source, options = {}) {
  const start = options.start ?? 0, end = options.end ?? source.length;
  const tokens = lexOracle(source).filter(token => token.kind !== 'comment');
  let objects = null;
  const metadata = () => objects ??= languageObjects(options);
  const resolve = (path, offset) => {
    const name = path.at(-1).key;
    let routines = path.length === 1 ? plsqlVisibleRoutines(source, offset).filter(routine => routine.key === name) : [];
    if (!routines.length) {
      const container = path.length > 1 ? resolveObject(path.at(-2).key, path.length > 2 ? path.at(-3).key : null, metadata(), options.currentSchema, callableContainers) : resolveObject(name, null, metadata(), options.currentSchema, callableContainers);
      routines = (container?.members || []).filter(member => member.name === name);
    }
    return routines.filter(routine => Array.isArray(routine.parameters));
  };
  const hints = [], stack = [];
  const finish = frame => {
    const args = frame.args.filter(arg => arg.first);
    if (!frame.path.length || !args.length) return;
    if (args.every(arg => arg.first.start < start || arg.first.start > end)) return;
    const positional = [];
    for (const arg of args) { if (arg.named) break; positional.push(arg); }
    if (!positional.length) return;
    const candidates = resolve(frame.path, frame.open.start).filter(routine => routine.parameters.length >= positional.length);
    if (!candidates.length) return;
    positional.forEach((arg, index) => {
      if (arg.first.start < start || arg.first.start > end) return;
      const names = [...new Set(candidates.map(routine => routine.parameters[index]?.name).filter(Boolean))];
      if (names.length !== 1) return;
      const parameter = names[0], parameterKey = /^".*"$/.test(parameter) ? parameter.slice(1, -1) : String(parameter).toUpperCase();
      if (arg.single && arg.first.kind === 'identifier' && key(arg.first) === parameterKey) return;
      hints.push({ offset: arg.first.start, label: `${parameter} =>` });
    });
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i], frame = stack.at(-1);
    if (frame && token.value !== ')' && token.value !== ',' && !frame.current.first) {
      frame.current.first = token;
      frame.current.named = token.kind === 'identifier' && tokens[i + 1]?.value === '=' && tokens[i + 2]?.value === '>';
      const next = tokens[i + 1]?.value;
      frame.current.single = next === ',' || next === ')';
    }
    if (token.value === '(') {
      const path = [];
      for (let back = i - 1; back >= 0 && tokens[back].kind === 'identifier'; back -= 2) { path.unshift({ key: key(tokens[back]) }); if (tokens[back - 1]?.value !== '.') break; }
      // Not a call: a keyword before the parenthesis or a declaration's parameter list. A type with a size resolves to no routine.
      const before = path.length ? tokens[i - path.length * 2] : null;
      const declared = before?.kind === 'identifier' && !before.quoted && DECLARATIONS.has(before.value.toUpperCase());
      const valid = path.length && !NOT_CALLS.has(path.at(-1).key) && !declared;
      const current = { first: null, named: false, single: false };
      stack.push({ open: token, path: valid ? path : [], args: [current], current });
    } else if (token.value === ',' && frame) {
      frame.current = { first: null, named: false, single: false }; frame.args.push(frame.current);
    } else if (token.value === ')' && frame) {
      stack.pop(); finish(frame);
    } else if (token.value === ';') {
      stack.length = 0;
    }
  }
  return hints.sort((a, b) => a.offset - b.offset);
}

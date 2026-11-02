import { lexOracle } from './oracleLexer.js';
import { bindTypes } from './bindDefinitions.js';

// Finds the bind variable (:name) under an offset; strings, comments and ::-style casts are ignored.
export function bindAtOffset(text, offset) {
  const tokens = lexOracle(String(text)).filter(token => !['comment', 'string'].includes(token.kind));
  for (let at = 0; at < tokens.length - 1; at++) {
    const colon = tokens[at], name = tokens[at + 1];
    if (colon.value !== ':' || tokens[at - 1]?.value === ':' || colon.end !== name.start || name.kind !== 'identifier' || name.quoted) continue;
    if (offset >= colon.start && offset <= name.end) {
      const upper = name.value.toUpperCase();
      return { name: upper, start: colon.start, end: name.end, occurrences: tokens.filter((token, index) => index > 0 && tokens[index - 1].value === ':' && tokens[index - 1].end === token.start && token.kind === 'identifier' && !token.quoted && token.value.toUpperCase() === upper && tokens[index - 2]?.value !== ':').length };
    }
  }
  return null;
}

// Context-menu actions for a bind; type changes only touch the saved bind form definition, never the SQL text.
export function bindMenuActions(bind, currentType = 'VARCHAR2', { readOnly = false } = {}) {
  if (!bind) return [];
  return [
    { id: 'bind:header', label: `Bind :${bind.name} · ${currentType} · ${bind.occurrences} use${bind.occurrences === 1 ? '' : 's'}`, disabled: true },
    ...bindTypes.map(type => ({ id: `bind:type:${type}`, label: `${type === currentType ? '● ' : ''}Type ${type}`, disabled: readOnly || type === currentType })),
    { id: 'bind:find', label: `Find all :${bind.name}` },
    { id: 'bind:copy', label: `Copy :${bind.name}` },
    { id: 'bind:run', label: 'Run with bind values…' },
    { id: 'bind:sep', separator: true },
  ];
}

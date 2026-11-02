import { bindPlaceholder, insertPairsAt } from './insertPairs.js';

const toRange = (monaco, model, start, end) => { const from = model.getPositionAt(start), to = model.getPositionAt(end); return new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column); };

const separators = "`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?";
// A registered provider replaces Monaco's word highlighter, so outside INSERT pairs the same whole-word behaviour is kept.
function textualOccurrences(monaco, model, position) {
  const word = model.getWordAtPosition(position);
  if (!word || model.getValueLength() > 1000000) return null;
  return model.findMatches(word.word, false, false, true, separators, false, 1000).map(match => ({ range: match.range, kind: monaco.languages.DocumentHighlightKind.Text }));
}

// Highlights the paired column/value under the cursor and offers the column's bind placeholder in an empty VALUES slot.
export function installInsertPairProviders(monaco) {
  const highlight = monaco.languages.registerDocumentHighlightProvider('sql', {
    provideDocumentHighlights(model, position) {
      const pairs = insertPairsAt(model.getValue(), model.getOffsetAt(position));
      if (!pairs || pairs.index < 0 || pairs.side == null) return textualOccurrences(monaco, model, position);
      const column = pairs.columns[pairs.index], value = pairs.values[pairs.index];
      return [column && !column.empty && { range: toRange(monaco, model, column.start, column.end), kind: monaco.languages.DocumentHighlightKind.Read }, value && !value.empty && { range: toRange(monaco, model, value.start, value.end), kind: monaco.languages.DocumentHighlightKind.Write }].filter(Boolean);
    },
  });
  const completion = monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: [':'],
    provideCompletionItems(model, position) {
      const offset = model.getOffsetAt(position), pairs = insertPairsAt(model.getValue(), offset);
      if (!pairs || pairs.side !== 'values' || !pairs.columns[pairs.index]) return { suggestions: [] };
      const slot = pairs.values[pairs.index], typed = model.getValue().slice(slot.start, offset).trim();
      if (!slot.empty && !/^:?\w*$/.test(typed)) return { suggestions: [] };
      const column = pairs.columns[pairs.index], placeholder = bindPlaceholder(column.name);
      const range = slot.empty ? toRange(monaco, model, offset, offset) : toRange(monaco, model, slot.start, offset);
      return { suggestions: [{ label: placeholder, kind: monaco.languages.CompletionItemKind.Variable, insertText: placeholder, range, detail: `Bind for column ${column.name}`, documentation: 'Placeholder for the paired INSERT column. Values are entered when the statement runs.', sortText: '!0' }] };
    },
  });
  return { dispose() { highlight.dispose(); completion.dispose(); } };
}

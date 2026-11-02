import { postfixSuggestions } from './postfixCompletion.js';

// Postfix items replace "receiver.suffix" with the template; they only appear after complete expressions.
export function installPostfixCompletion(monaco) {
  return monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const items = postfixSuggestions(line);
      if (!items.length) return { suggestions: [] };
      const range = new monaco.Range(position.lineNumber, items[0].start + 1, position.lineNumber, position.column), typed = line.slice(items[0].start);
      return { suggestions: items.map((item, index) => ({ label: { label: `.${item.id}`, description: item.detail }, kind: monaco.languages.CompletionItemKind.Snippet, insertText: item.snippet, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, filterText: `${typed.slice(0, typed.lastIndexOf('.') + 1)}${item.id}`, sortText: `!postfix${index}`, detail: `Postfix: ${item.detail}` })) };
    },
  });
}

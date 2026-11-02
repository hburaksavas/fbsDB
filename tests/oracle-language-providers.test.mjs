import test from 'node:test';
import assert from 'node:assert/strict';
import {sqlOutline} from '../src/editorNavigation.js';
import { installOracleLanguageProviders } from '../src/oracleLanguageProviders.js';
import { oracleLanguageCompletions, languageMetadataTargets, oracleSignatureHelp, oracleSymbolInfo } from '../src/oracleLanguageService.js';

const objects = [{ owner: 'APP', name: 'ORDERS', type: 'TABLE', columns: [] }];
const table = { ...objects[0], columns: [{ name: 'ID', type: 'NUMBER', comment: 'Order number' }] };
function harness(text, override = {}) {
  const providers = {}, native = [], metadata = [];
  let version = 1, source = text, options = { objects, currentSchema: 'APP' };
  const state = { tabId: 'a', originTabId: 'a', connected: true, busy: false, settings: { inline: true, signatureHelp: true }, ...override };
  const register = (name, provider) => { providers[name] = provider; return { dispose() {} }; };
  const monaco = {
    languages: { CompletionItemKind: { Class: 7, Field: 4, Keyword: 17, Function: 1, Variable: 5, Snippet: 27 }, CompletionItemInsertTextRule: { InsertAsSnippet: 4 }, registerCompletionItemProvider: (_, provider) => register('complete', provider), registerInlineCompletionsProvider: (_, provider) => register('inline', provider), registerSignatureHelpProvider: (_, provider) => register('signature', provider), registerHoverProvider: (_, provider) => register('hover', provider), registerDefinitionProvider: (_, provider) => register('definition', provider),registerReferenceProvider: (_,provider)=>register('references',provider),registerDocumentSymbolProvider:(_,provider)=>register('documentSymbols',provider),registerFoldingRangeProvider:(_,provider)=>register('folding',provider),FoldingRangeKind:{Region:{value:'region'}} },
    Range: class Range { constructor(startLineNumber, startColumn, endLineNumber, endColumn) { Object.assign(this, { startLineNumber, startColumn, endLineNumber, endColumn }); } },
    editor: { registerEditorOpener: provider => register('opener', provider) },
  };
  const model = { uri: { toString: () => 'inmemory:a.sql' }, getVersionId: () => version, getValue: () => source, getOffsetAt: position => position.column - 1, getPositionAt: offset => ({ lineNumber: 1, column: offset + 1 }), isDisposed: () => false, getWordAtPosition: () => ({ word: 'ID' }) };
  const client = { revision: 1, cancelAll() {}, metadata(data) { options.metadata = data; }, async request(type, value, cursor, token, extra) {
    if (type === 'analyze') return { targets: languageMetadataTargets(value, cursor, options, extra.mode) };
    if (type === 'complete') return oracleLanguageCompletions(value, cursor, options);
    if (type === 'signature') return { signature: oracleSignatureHelp(value, cursor, options) };
    if(type==='outline')return {outline:sqlOutline(value)};
    if (type === 'symbol') return { symbol: oracleSymbolInfo(value, cursor, options) };
  } };
  const broker = { version: () => "a:0:1", objects: () => metadata, systemObjects: () => [], async load(tabId, target, token, kind = 'metadata') { native.push({ tabId, target, kind }); const value = override.load ? await override.load(tabId, target, token, kind) : table; if (value) metadata.push(value); return value; } };
  const editor = { getModel: () => model, getPosition: () => ({ lineNumber: 1, column: 1 }), addAction: action => { (providers.actions ||= {})[action.id] = action; return { dispose() {} }; } };
  const dispose = installOracleLanguageProviders({ monaco, editor, client, broker, acceptanceCommand: 'test.accept', snapshot: () => state, onDefinition() {}, onReveal() {}, onError() {}, definitionModels: new Map() });
  return { providers, model, state, native, dispose, edit: value => { source = value; version++; } };
}

test('relation suggestions are immediate; selected object details load on demand', async () => {
  const env = harness('SELECT * FROM OR');
  const result = await env.providers.complete.provideCompletionItems(env.model, { column: 17 }, {}, null);
  assert.ok(result.suggestions.some(item => item.label === 'ORDERS')); assert.equal(env.native.length, 0);
  const details = await env.providers.complete.resolveCompletionItem(result.suggestions.find(item => item.label === 'ORDERS'), null);
  assert.equal(env.native.length, 1); assert.ok(details.documentation.value.includes('APP.ORDERS'));
  env.dispose();
});

test('Oracle metadata returning after an edit does not replace current suggestions', async () => {
  let finish;
  const env = harness('SELECT o.i FROM app.orders o', { load: () => new Promise(resolve => { finish = resolve; }) });
  const pending = env.providers.complete.provideCompletionItems(env.model, { column: 11 }, {}, null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.native[0].tabId, 'a');
  env.edit('SELECT 1 FROM dual'); finish(table);
  assert.equal((await pending).suggestions.length, 0); env.dispose();
});

test('an executing Oracle query keeps offline completion responsive', async () => {
  const env = harness('SELECT TO_CH', { busy: true });
  const result = await env.providers.complete.provideCompletionItems(env.model, { column: 13 }, {}, null);
  assert.ok(result.suggestions.some(item => item.label === 'TO_CHAR')); assert.equal(env.native.length, 0);
  env.dispose();
});

test('disabled signature hints do not start metadata requests', async () => {
  const env = harness('SELECT TO_CHAR(', { settings: { signatureHelp: false } });
  assert.equal(await env.providers.signature.provideSignatureHelp(env.model, { column: 16 }, null), null);
  assert.equal(env.native.length, 0); env.dispose();
});

test('inline completion below the configured character threshold does not load metadata', async () => {
  const env=harness('SELECT T',{settings:{inline:true,minCharacters:3}});
  assert.deepEqual(await env.providers.inline.provideInlineCompletions(env.model,{column:9},{},null),{items:[]});
  assert.equal(env.native.length,0);env.dispose();
});

test('read-only definition views use their originating physical session for metadata', async () => {
  const env = harness('SELECT o.i FROM app.orders o', { tabId: 'definition-a', originTabId: 'source-tab' });
  await env.providers.complete.provideCompletionItems(env.model, { column: 11 }, {}, null);
  assert.ok(env.native.length); assert.ok(env.native.every(call => call.tabId === 'source-tab'));
  env.dispose();
});

test('PL/Scope lookup remains opt-in and never loads identifiers on registration', async () => {
  const env = harness('BEGIN NULL; END;', { settings: { plscope: false } });
  assert.equal(env.native.length, 0);
  await env.providers.actions['fbsdb.plscopeReferences'].run();
  assert.equal(env.native.length, 0); env.dispose();
});

test('slow Oracle metadata does not hold cached SQL candidates hostage', async () => {
  let finish;
  const env = harness('SELECT TO_CH FROM app.orders o', { load: () => new Promise(resolve => { finish = resolve; }) });
  let timeout;
  try {
    const result = await Promise.race([
      env.providers.complete.provideCompletionItems(env.model, { column: 13 }, {}, null),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Completion waited for stalled metadata')), 500); }),
    ]);
    assert.equal(result.incomplete, true);
    assert.ok(result.suggestions.some(c => c.label === 'TO_CHAR'));
    assert.ok(finish, 'metadata continues to load independently');
  } finally { clearTimeout(timeout); finish?.(table); env.dispose(); }
});

test('inline acceptance uses the same learning command as popup acceptance', async () => {
  const env = harness('s');
  const result = await env.providers.inline.provideInlineCompletions(env.model, { column: 2 }, {}, null);
  assert.equal(result.items[0].insertText, 'select');
  const popup = await env.providers.complete.provideCompletionItems(env.model, { column: 2 }, {}, null);
  assert.equal(result.items[0].command.id, 'test.accept');
  assert.deepEqual(result.items[0].command.arguments, popup.suggestions[0].command.arguments);
  env.dispose();
});


test('the first alias-dot request waits for columns without requiring a visible popup or a second keystroke', async () => {
  const env = harness('SELECT o. FROM app.orders o', {
    settings: { systemPackages: true },
    load: async () => { await new Promise(resolve => setTimeout(resolve, 90)); return table; },
  });
  try {
    assert.deepEqual(env.providers.complete.triggerCharacters, ['.']);
    const result = await env.providers.complete.provideCompletionItems(env.model, { column: 10 }, {}, null);
    assert.equal(result.incomplete, false);
    assert.ok(result.suggestions.some(item => item.label === 'ID'));
    assert.ok(result.suggestions.some(item => item.label === 'o.all'));
    assert.ok(env.native.every(call => call.kind === 'metadata'), 'columns do not wait on unrelated system packages');
  } finally { env.dispose(); }
});

import { oracleInlineCompletion } from './oracleInlineCompletion.js';
import { monacoCompletionItems } from './oracleCompletionClient.js';
import {automaticCompletionAllowed, getOracleCompletionContext} from './oracleCompletionContext.js';

const markdown = value => String(value || '').replace(/[\\`*_{}\[\]<>]/g, '\\$&');
const rangeAt = (monaco, model, start, end = start + 1) => {
  const a = model.getPositionAt(start), b = model.getPositionAt(end);
  return new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column);
};

export function installOracleLanguageProviders({ monaco, editor, client, broker, snapshot, onDefinition, onReveal, onError, onPlscope, definitionModels, acceptanceCommand }) {
  const disposables = [];
  let disposed = false, lastRefresh = '';
  const prepare = async (model, position, token, mode, manual = false) => {
    const state = snapshot(), revision = client.revision, version = model.getVersionId(), source = model.getValue(), cursor = model.getOffsetAt(position);
    const valid = () => !disposed && client.revision === revision && !token?.isCancellationRequested && !model.isDisposed() && model.getVersionId() === version && snapshot().tabId === state.tabId && snapshot().originTabId === state.originTabId;
    const context = getOracleCompletionContext(source, cursor);
    const qualified = !!context.qualifier && !context.relation;
    let analysis = await client.request('analyze', source, cursor, token, { mode });
    if (!valid()) return null;
    const hydrate = async () => {
      if (state.connected && !state.busy) {
        if (analysis.wantsSystem || !qualified && (manual || state.settings.systemPackages)) {
          await broker.load(state.originTabId, {}, mode === 'complete' ? null : token, 'systemObjects');
          if (!valid()) return null;
          client.metadata(broker.objects(state.originTabId), broker.systemObjects(state.originTabId), broker.version(state.originTabId));
          analysis = await client.request('analyze', source, cursor, token, { mode });
        }
        const loaded = new Set();
        for (let depth = 0; depth < 8; depth++) {
          const targets = (analysis.targets || []).filter(target => { const key = JSON.stringify(target); if (loaded.has(key)) return false; loaded.add(key); return true; });
          if (!targets.length) break;
          await Promise.all(targets.map(target => broker.load(state.originTabId, target, mode === 'complete' ? null : token)));
          if (!valid()) return null;
          client.metadata(broker.objects(state.originTabId), broker.systemObjects(state.originTabId), broker.version(state.originTabId));
          analysis = await client.request('analyze', source, cursor, token, { mode });
        }
      }
    };
    let incomplete = false;
    if (mode === 'complete' && !qualified) {
      // Cache-only candidates have a bounded wait even on a slow Oracle server.
      // Let shared metadata finish for subsequent keystrokes; never reopen a
      // dismissed popup or publish a reply into another tab/model revision.
      let timer;
      const loading = hydrate().catch(error => { if (valid()) onError(error.message); });
      try { incomplete = await Promise.race([loading.then(() => false), new Promise(resolve => { timer = setTimeout(() => resolve(true), 60); })]); }
      finally { clearTimeout(timer); }
      if (incomplete) void loading.then(() => {
        if (disposed || !valid() || !editor.hasTextFocus?.()) return;
        const positionNow = editor.getPosition();
        if (!positionNow || model.getOffsetAt(positionNow) !== cursor) return;
        const stamp = `${revision}:${version}:${cursor}:${broker.version(state.originTabId)}`;
        if (stamp === lastRefresh || !editor.getDomNode?.()?.ownerDocument.querySelector('.suggest-widget.visible')) return;
        lastRefresh = stamp;
        editor.trigger('oracle-metadata', 'editor.action.triggerSuggest', {});
      });
    } else {
      // Keep the first alias request alive until its columns arrive: returning an
      // empty list closes Monaco's popup and prevents the background refresh.
      await hydrate();
    }
    if (!valid()) return null;
    if (state.busy) client.metadata(broker.objects(state.originTabId), broker.systemObjects(state.originTabId), broker.version(state.originTabId));
    const result = await client.request(mode, source, cursor, token, { manual });
    return valid() ? { ...result, incomplete } : null;
  };

  disposables.push(monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.'],
    async provideCompletionItems(model, position, context, token) {
      const result = await prepare(model, position, token, 'complete', snapshot().manualSuggestion?.());
      return { suggestions: result ? monacoCompletionItems(monaco, model, result, acceptanceCommand) : [], incomplete: result?.incomplete || false };
    },
    async resolveCompletionItem(item, token) {
      const target = item._oracle?.target, state = snapshot();
      if (!target || !state.connected) return item;
      const metadata = await broker.load(state.originTabId, target, token);
      if (!metadata || token?.isCancellationRequested || snapshot().tabId !== state.tabId) return item;
      const column = item._oracle.column;
      const contents = [column ? `${column.name} · ${column.type}${column.nullable === false ? ' · NOT NULL' : ''}` : `${metadata.owner}.${metadata.name} · ${metadata.type}`, column?.comment || metadata.comment];
      for (const member of metadata.members?.filter(member => member.name === (item._oracle.member || target.name)) || []) contents.push(`${member.name}(${member.parameters.map(parameter => `${parameter.name} ${parameter.mode} ${parameter.type}${parameter.optional ? ' DEFAULT …' : ''}`).join(', ')})${member.returnType ? ' RETURN ' + member.returnType : ''}`);
      return { ...item, documentation: { value: contents.filter(Boolean).map(markdown).join('\n\n') } };
    },
  }));
  disposables.push(monaco.languages.registerInlineCompletionsProvider('sql', {
    async provideInlineCompletions(model, position, context, token) {
      if (!snapshot().settings.inline) return { items: [] };
      const source = model.getValue(), cursor = model.getOffsetAt(position), settings = snapshot().settings;
      if(!automaticCompletionAllowed(source,cursor,settings))return {items:[]};
      const result = await prepare(model, position, token, 'complete');
      if (!result || token?.isCancellationRequested) return { items: [] };
      const candidate = oracleInlineCompletion(source, cursor, settings, result);
      return candidate ? { items: [{ insertText: candidate.insertText, range: rangeAt(monaco, model, candidate.start, candidate.end),
        command: acceptanceCommand ? { id: acceptanceCommand, title: 'Remember completion', arguments: [candidate.key, result.context.learningContext] } : undefined }] } : { items: [] };
    }, disposeInlineCompletions() {},
  }));
  disposables.push(monaco.languages.registerSignatureHelpProvider('sql', {
    signatureHelpTriggerCharacters: ['(', ','], signatureHelpRetriggerCharacters: [',', '=', '>'],
    async provideSignatureHelp(model, position, token) {
      if (!snapshot().settings.signatureHelp) return null;
      const result = await prepare(model, position, token, 'signature');
      if (!result?.signature) return null;
      return { value: { ...result.signature, signatures: result.signature.signatures.map(signature => ({ ...signature, documentation: signature.documentation ? { value: `[Oracle documentation](${signature.documentation})` } : undefined })) }, dispose() {} };
    },
  }));
  disposables.push(monaco.languages.registerHoverProvider('sql', {
    async provideHover(model, position, token) {
      if (!model.getWordAtPosition(position)) return null;
      const symbol = (await prepare(model, position, token, 'symbol'))?.symbol;
      return symbol ? { range: rangeAt(monaco, model, symbol.start, symbol.end), contents: symbol.contents } : null;
    },
  }));
  const definition = async (model, position, token, body = false) => {
    const state = snapshot(), symbol = (await prepare(model, position, token, 'symbol'))?.symbol;
    if (!symbol) return null;
    if (symbol.localStart != null && !body) return { uri: model.uri, range: rangeAt(monaco, model, symbol.localStart) };
    if (!symbol.target || !state.connected) return null;
    const source = await broker.load(state.originTabId, { ...symbol.target, body }, token, 'definition');
    if (!source?.text || token?.isCancellationRequested || snapshot().tabId !== state.tabId) return null;
    const uri = monaco.Uri.parse('fbsdb-definition:///' + encodeURIComponent(JSON.stringify([state.originTabId, source.owner, source.type, source.name])) + '.sql');
    let sourceModel = monaco.editor.getModel(uri);
    if (!sourceModel) sourceModel = monaco.editor.createModel(source.text, 'sql', uri);
    else if (sourceModel.getValue() !== source.text) sourceModel.setValue(source.text);
    const search = symbol.target.member || symbol.target.column;
    const escaped = search?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const quotedPattern = search ? (symbol.target.member ? '\\b(?:PROCEDURE|FUNCTION)\\s+"' + escaped + '"' : '^\\s*"' + escaped + '"\\s') : null;
    let matches = quotedPattern ? sourceModel.findMatches(quotedPattern, false, true, true, null, false) : [];
    if (!matches.length && search && /^[A-Z][A-Z0-9_$#]*$/.test(search)) matches = sourceModel.findMatches(symbol.target.member ? '\\b(?:PROCEDURE|FUNCTION)\\s+' + escaped + '\\b' : '^\\s*' + escaped + '\\b\\s', false, true, false, null, false);
    const targetRange = matches[0]?.range || new monaco.Range(1, 1, 1, 1);
    definitionModels.set(uri.toString(), { ...source, originTabId: state.originTabId, model: sourceModel });
    while (definitionModels.size > 32) { const oldest = definitionModels.keys().next().value; definitionModels.get(oldest).model.dispose(); definitionModels.delete(oldest); }
    return { uri, range: targetRange };
  };
  disposables.push(monaco.languages.registerDefinitionProvider('sql', { provideDefinition: definition }));
  if (monaco.editor.registerEditorOpener) disposables.push(monaco.editor.registerEditorOpener({
    openCodeEditor(sourceEditor, resource, selection) {
      const source = definitionModels.get(resource.toString());
      if (!source) return false;
      onDefinition(source, selection); return true;
    },
  }));
  disposables.push(editor.addAction({ id: 'fbsdb.revealOracleObject', label: 'Show in Object Explorer', contextMenuGroupId: 'navigation', contextMenuOrder: 2,
    async run() { const model = editor.getModel(), position = editor.getPosition(); if (!model || !position) return; const symbol = (await prepare(model, position, null, 'symbol'))?.symbol; if (symbol?.target) onReveal(symbol.target); else onError('No accessible Oracle object was found at this position.'); },
  }));
  disposables.push(editor.addAction({ id: 'fbsdb.openOracleDefinition', label: 'Open Oracle object DDL / definition', contextMenuGroupId: 'navigation', contextMenuOrder: 2.5,
    async run() { const model = editor.getModel(), position = editor.getPosition(); if (!model || !position) return; const target = await definition(model, position, null); if (target) { const source = definitionModels.get(target.uri.toString()); if (source) onDefinition(source, target.range); } else onError('No accessible Oracle object definition was found at the cursor.'); },
  }));
  disposables.push(editor.addAction({ id: 'fbsdb.openOracleBody', label: 'Open package/type body', contextMenuGroupId: 'navigation', contextMenuOrder: 3,
    async run() { const model = editor.getModel(), position = editor.getPosition(); if (!model || !position) return; const target = await definition(model, position, null, true); if (target) { const source = definitionModels.get(target.uri.toString()); if (source) onDefinition(source, target.range); } },
  }));
  disposables.push(editor.addAction({ id: 'fbsdb.plscopeReferences', label: 'Find PL/Scope references', contextMenuGroupId: 'navigation', contextMenuOrder: 4,
    async run() {
      const state = snapshot();
      if (!state.settings.plscope) { onError('Enable PL/Scope references in Settings > Completion.'); return; }
      if (!state.connected) { onError('Connect to Oracle to look up PL/Scope references.'); return; }
      const model = editor.getModel(), position = editor.getPosition(); if (!model || !position) return;
      const symbol = (await prepare(model, position, null, 'symbol'))?.symbol, target = symbol?.target || state.sourceObject;
      if (!target || !['PACKAGE', 'PACKAGE BODY', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'TYPE', 'TYPE BODY'].includes(target.type)) { onError('Open a PL/SQL object definition to look up collected references.'); return; }
      const member = target.member || symbol?.lookupName || model.getWordAtPosition(position)?.word?.toUpperCase() || target.name;
      const report = await broker.load(state.originTabId, { ...target, member }, null, 'plscope');
      if (report && snapshot().tabId === state.tabId) onPlscope?.({ ...report, originTabId: state.originTabId, target });
    },
  }));
  return () => { disposed = true; for (const disposable of disposables) disposable.dispose(); client.cancelAll(); };
}

const emptyResult = () => ({ candidates: [], context: { fragment: '', blocked: true } });

// Each configuration identifies one tab/session/settings snapshot. Old requests
// are resolved without suggestions when the snapshot or model has changed.
export class OracleCompletionClient {
  constructor(worker, onError = () => {}) {
    this.worker = worker; this.pending = new Map(); this.nextId = 1; this.revision = 0; this.onError = onError;
    worker.onmessage = ({ data }) => {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      if (data.error) this.onError(data.error);
      pending.finish(data.revision === this.revision && !data.error ? data.result : emptyResult());
    };
    worker.onerror = () => { this.failed = true; this.onError('Oracle completion could not be loaded.'); this.cancelAll(); };
  }
  configure(options) {
    this.cancelAll(); this.revision++;
    this.worker.postMessage({ type: 'configure', options, revision: this.revision });
  }
  complete(source, cursor, cancellationToken) {
    return this.request('complete', source, cursor, cancellationToken);
  }
  request(type, source, cursor, cancellationToken, extra = {}) {
    if (this.failed || cancellationToken?.isCancellationRequested) return Promise.resolve(emptyResult());
    const id = this.nextId++;
    return new Promise(resolve => {
      let subscription;
      const finish = result => { subscription?.dispose(); resolve(result); };
      this.pending.set(id, { finish });
      subscription = cancellationToken?.onCancellationRequested(() => { this.pending.delete(id); finish(emptyResult()); });
      this.worker.postMessage({ type, id, source, cursor, revision: this.revision, ...extra });
    });
  }
  remember(key) { this.worker.postMessage({ type: 'remember', key }); }
  metadata(metadata, systemObjects = [], stamp) {
    const key = stamp == null ? null : this.revision + ':' + stamp;
    if (key && key === this.metadataStamp) return;
    this.metadataStamp = key;
    this.worker.postMessage({ type: 'metadata', metadata, systemObjects });
  }
  cancelAll() { for (const item of this.pending.values()) item.finish(emptyResult()); this.pending.clear(); }
  dispose() { this.cancelAll(); this.worker.terminate(); }
}

export function monacoCompletionItems(monaco, model, result, acceptanceCommand) {
  const kinds = { keyword: 'Keyword', function: 'Function', field: 'Field', class: 'Class', variable: 'Variable', snippet: 'Snippet', module: 'Module' };
  return result.candidates.map((candidate, index) => {
    const start = model.getPositionAt(candidate.start), end = model.getPositionAt(candidate.end);
    return {
      label: candidate.alreadySelected ? { label: candidate.label, description: 'SELECT’te mevcut' } : candidate.label, filterText: candidate.filterText || candidate.label, insertText: candidate.insertText,
      detail: candidate.detail, kind: monaco.languages.CompletionItemKind[kinds[candidate.kind]],
      range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column), sortText: String(index).padStart(4, '0'),
      insertTextRules: candidate.snippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
      documentation: candidate.documentation ? { value: `[Oracle documentation](${candidate.documentation})` } : undefined,
      command: acceptanceCommand ? { id: acceptanceCommand, title: 'Remember completion', arguments: [candidate.key, result.context.learningContext] } : undefined,
      _oracle: { target: candidate.object, column: candidate.column, member: candidate.member },
    };
  });
}

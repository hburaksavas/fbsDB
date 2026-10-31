// Own pending saves by request and document, independently of the active editor.
export class DocumentSaves {
  constructor() {
    this.requests = new Map();
    this.documents = new Map();
  }

  start(send, document, afterSave = null) {
    if (this.documents.has(document.id)) return null;
    const requestId = send('file.save', {
      tabId: document.id, path: document.path, fileName: document.name,
      content: document.content, diskVersion: document.diskVersion ?? null,
    });
    if (!requestId) return null;
    this.requests.set(requestId, { document: { ...document }, afterSave });
    this.documents.set(document.id, requestId);
    return requestId;
  }

  take(requestId, tabId) {
    const pending = this.requests.get(requestId);
    if (!pending || (tabId != null && pending.document.id !== tabId)) return null;
    this.requests.delete(requestId);
    this.documents.delete(pending.document.id);
    return pending;
  }

  saved(message, currentDocument) {
    const pending = this.take(message.requestId, message.tabId);
    if (!pending || !currentDocument || currentDocument.id !== pending.document.id) return null;
    // A rename or conversion to a new draft supersedes the old file target.
    if (currentDocument.path !== pending.document.path) return null;
    const unchanged = currentDocument.content === pending.document.content;
    return {
      document: {
        ...currentDocument, path: message.path ?? null,
        name: message.fileName || currentDocument.name,
        dirty: !unchanged, diskVersion: message.diskVersion ?? null,
        externalChange: null,
        connectionProfileId: message.profileId ?? currentDocument.connectionProfileId,
      },
      afterSave: unchanged ? pending.afterSave : null,
    };
  }

  forget(tabId) {
    const requestId = this.documents.get(tabId);
    if (requestId) this.take(requestId);
  }
}

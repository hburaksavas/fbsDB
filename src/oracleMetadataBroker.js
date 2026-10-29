export const completionObjectKey = object => JSON.stringify([object.owner || '', object.type || object.objectType || '', object.name || '']);

// Cache ownership is a physical tab session, including reconnects to the same profile.
export class OracleMetadataBroker {
  constructor(send, onStatus = () => {}) { this.send = send; this.onStatus = onStatus; this.sessions = new Map(); this.pending = new Map(); }
  session(tabId) {
    if (!this.sessions.has(tabId)) this.sessions.set(tabId, { epoch: 0, cacheRevision: 0, cache: new Map(), jobs: new Map() });
    return this.sessions.get(tabId);
  }
  reset(tabId) {
    const session = this.session(tabId); session.epoch++; session.cache.clear(); session.lastError = null;
    for (const job of [...session.jobs.values()]) this.cancel(job);
    session.jobs.clear(); this.onStatus(tabId, 'Oracle metadata refreshed.');
  }
  cancel(job) {
    this.send('completion.cancel', { tabId: job.tabId, requestId: job.id });
    this.pending.delete(job.id); this.session(job.tabId).jobs.delete(job.key);
    for (const consumer of job.consumers) consumer.finish(null);
    job.consumers.clear(); clearTimeout(job.timer);
  }
  load(tabId, target, token, kind = 'metadata') {
    if (token?.isCancellationRequested) return Promise.resolve(null);
    const session = this.session(tabId), key = `${kind}:${target.body ? 'body:' : ''}${kind === 'plscope' ? JSON.stringify(target.member || '') : ''}${completionObjectKey(target)}`;
    const cached = session.cache.get(key);
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value);
    let job = session.jobs.get(key);
    if (!job) {
      const id = this.send(`completion.${kind}`, { tabId, owner: target.owner || '', name: target.name || '', objectType: target.type, member: target.member, body: !!target.body, epoch: session.epoch });
      if (!id) return Promise.resolve(null);
      job = { id, tabId, key, epoch: session.epoch, consumers: new Set() };
      job.timer = setTimeout(() => { this.onStatus(tabId, 'Metadata request timed out. Use Refresh Oracle metadata to retry.'); this.cancel(job); }, 14000);
      session.jobs.set(key, job); this.pending.set(id, job); this.onStatus(tabId, 'Loading Oracle metadata…');
    }
    return new Promise(resolve => {
      let subscription;
      const consumer = { finish: value => { subscription?.dispose(); resolve(value); } };
      job.consumers.add(consumer);
      subscription = token?.onCancellationRequested(() => {
        job.consumers.delete(consumer); consumer.finish(null);
        if (!job.consumers.size) this.cancel(job);
      });
    });
  }
  handle(message) {
    if (message?.type !== 'completion.reply') return false;
    const job = this.pending.get(message.requestId);
    if (!job) return true;
    this.pending.delete(job.id); clearTimeout(job.timer);
    const session = this.session(job.tabId); session.jobs.delete(job.key);
    const valid = message.epoch === job.epoch && session.epoch === job.epoch;
    const value = valid && !message.cancelled && !message.error ? message.result : null;
    if (valid && !message.cancelled) {
      session.cacheRevision++; session.cache.delete(job.key); session.cache.set(job.key, { value, expires: Date.now() + (message.error ? 10000 : 300000) });
      while (session.cache.size > 256) session.cache.delete(session.cache.keys().next().value);
      const definitions = [...session.cache.keys()].filter(key => key.startsWith('definition:'));
      for (const key of definitions.slice(0, Math.max(0, definitions.length - 32))) session.cache.delete(key);
    }
    if (message.error && valid) { session.lastError = message.error; this.onStatus(job.tabId, message.error); }
    else if (!session.jobs.size) this.onStatus(job.tabId, session.lastError || (value ? 'Oracle metadata ready.' : 'Oracle metadata unavailable.'));
    for (const consumer of job.consumers) consumer.finish(value);
    job.consumers.clear(); return true;
  }
  objects(tabId) { return [...this.session(tabId).cache.entries()].filter(([key, item]) => key.startsWith('metadata:') && item.expires > Date.now() && item.value).map(([, item]) => item.value); }
  systemObjects(tabId) { return [...this.session(tabId).cache.entries()].find(([key, item]) => key.startsWith('systemObjects:') && item.expires > Date.now() && item.value)?.[1].value || []; }
  version(tabId) {
    const session = this.session(tabId);
    for (const [key, item] of session.cache) if (item.expires <= Date.now()) { session.cache.delete(key); session.cacheRevision++; }
    return JSON.stringify([tabId, session.epoch, session.cacheRevision]);
  }
  forget(tabId) { const session = this.sessions.get(tabId); if (session) for (const job of [...session.jobs.values()]) this.cancel(job); this.sessions.delete(tabId); }
  dispose() { for (const job of [...this.pending.values()]) this.cancel(job); this.sessions.clear(); }
}

export function completionCancellation() {
  const controller = new AbortController();
  return { cancel: () => controller.abort(), token: {
    get isCancellationRequested() { return controller.signal.aborted; },
    onCancellationRequested(callback) { controller.signal.addEventListener('abort', callback, { once: true }); return { dispose: () => controller.signal.removeEventListener('abort', callback) }; },
  } };
}

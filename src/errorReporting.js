// Sends unexpected interface errors to the desktop host, which appends them to the local log file
// (%LOCALAPPDATA%\fbsDB\logs). Nothing leaves the computer. Reporting must never cause a second error,
// so every step is guarded and a session sends a bounded number of distinct entries.

export const reportLimit = 25;
export const messageLimit = 2000;
export const stackLimit = 8000;
const sources = new Set(['window', 'promise', 'render']);

// Chromium reports this when a layout observer callback resizes something; it is not a failure of the page.
const benign = /^ResizeObserver loop /;

const clip = (text, limit) => text.length > limit ? text.slice(0, limit) + '…' : text;
function text(value) { try { return typeof value === 'string' ? value : value == null ? '' : String(value); } catch { return ''; } }

// Turns whatever was thrown into the fields the log keeps, or null when there is nothing worth recording.
export function describeError(source, error, detail = '') {
  const reason = error && typeof error === 'object' ? error : null;
  const message = clip((reason ? [text(reason.name), text(reason.message)].filter(Boolean).join(': ') : text(error)) || text(detail) || 'Unknown error', messageLimit);
  // Monaco rejects the delays it cancels (for example when a peek editor closes) with an error named Canceled.
  if (benign.test(message) || benign.test(text(reason?.message)) || reason?.name === 'Canceled') return null;
  const stack = clip([text(reason?.stack), text(detail)].filter(Boolean).join('\n'), stackLimit);
  return { source: sources.has(source) ? source : 'window', message, ...(stack ? { stack } : {}) };
}

export function createErrorReporter(send, limit = reportLimit) {
  const seen = new Set();
  let sent = 0;
  return function report(source, error, detail) {
    try {
      const entry = describeError(source, error, detail);
      if (!entry || sent >= limit) return false;
      const key = entry.message + '\n' + (entry.stack || '').split('\n', 2).join('\n');
      if (seen.has(key)) return false;
      seen.add(key); sent++;
      send('ui.logError', entry);
      return true;
    } catch { return false; }
  };
}

export function installErrorReporting(target, report) {
  const onError = event => report('window', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : '');
  const onRejection = event => report('promise', event.reason);
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => { target.removeEventListener('error', onError); target.removeEventListener('unhandledrejection', onRejection); };
}

const sensitiveName = /pass(word)?|pwd|secret|token|api[_-]?key|credential/i;
export const consoleLimits = { entries: 50, outputLines: 200, outputChars: 500, sql: 20000 };

function sanitizeParameters(parameters, retainValues) {
  return (parameters || []).slice(0, 100).map(parameter => {
    const name = String(parameter.name || parameter.key || ''), keep = retainValues && !sensitiveName.test(name) && parameter.value != null && String(parameter.value).length <= 1000;
    return { name, type: parameter.type || 'VARCHAR2', ...(keep ? { value: String(parameter.value) } : {}), hidden: !keep && parameter.value != null };
  });
}

export function createConsoleEntry({ sql, parameters, output, ok, message, elapsedMs, rows, rowsAffected, profile, executedAt }, { retainValues = false } = {}) {
  const lines = (Array.isArray(output) ? output : []).slice(0, consoleLimits.outputLines).map(line => String(line).slice(0, consoleLimits.outputChars));
  return {
    id: `${executedAt || Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    sql: String(sql || '').slice(0, consoleLimits.sql), ok: Boolean(ok), message: message ? String(message).slice(0, 2000) : '',
    elapsedMs: Math.round(elapsedMs || 0), rows: rows ?? null, rowsAffected: rowsAffected ?? null, profile: profile || '', executedAt: executedAt || new Date().toISOString(),
    parameters: sanitizeParameters(parameters, retainValues), output: lines, outputTruncated: Array.isArray(output) && output.length > consoleLimits.outputLines,
  };
}

export function createConsoleStore() {
  const tabs = new Map();
  return {
    record(tabId, entry) { const list = [entry, ...(tabs.get(tabId) || [])].slice(0, consoleLimits.entries); tabs.set(tabId, list); return list; },
    list: tabId => tabs.get(tabId) || [],
    clear(tabId) { tabs.delete(tabId); },
  };
}

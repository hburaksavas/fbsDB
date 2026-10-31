export function createResultSessions() {
  let tabs = {};
  const listeners = new Set(), closed = new Set();
  const store = {
    get tabs() { return tabs; },
    getSnapshot: () => tabs,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    set(value) {
      let next = typeof value === 'function' ? value(tabs) : value;
      for (const id of closed) if (id in next) { next = { ...next }; delete next[id]; }
      if (next !== tabs) { tabs = next; for (const listener of listeners) listener(); }
    },
    update(owner, key, value) {
      if (closed.has(owner)) return;
      const previous = tabs[owner] || {};
      store.set({ ...tabs, [owner]: { ...previous, [key]: typeof value === 'function' ? value(previous[key]) : value } });
    },
    publish(owner, value, defaults, script) {
      if (closed.has(owner)) return;
      const result = { ...value, viewIdentity: crypto.randomUUID(), defaultOptions: structuredClone(defaults) };
      const previous = tabs[owner] || {}, sets = (previous.resultSets || []).filter(item => item.pinned);
      if (script?.running) sets.push({ key: `script-${script.requestId}-${script.index}`, label: `Script ${script.index + 1}`, pinned: true, result, view: { options: structuredClone(defaults) } });
      store.set({ ...tabs, [owner]: { ...previous, resultSets: sets, selectedResultKey: null,
        queryResult: result, queryView: { options: defaults }, resultFilter: '', latestResultName: null } });
    },
    appendPage(owner, page) {
      const tab = tabs[owner]; if (!tab) return;
      const append = result => result?.resultId === page.resultId && result.rows.length === page.offset
        ? { ...result, rows: [...result.rows, ...page.rows], returnedRows: result.rows.length + page.rows.length,
          hasMore: page.hasMore, fetchMetrics: [...(result.fetchMetrics || []), { offset: page.offset,
            rows: page.rows.length, elapsedMs: page.elapsedMs, bytes: new TextEncoder().encode(JSON.stringify(page.rows)).length }] } : result;
      store.set({ ...tabs, [owner]: { ...tab, queryResult: append(tab.queryResult),
        resultSets: (tab.resultSets || []).map(item => ({ ...item, result: append(item.result) })) } });
    },
    invalidateCursor(owner, resultId) {
      const tab = tabs[owner]; if (!tab) return;
      const invalidate = result => result?.resultId === resultId ? { ...result, hasMore: false, cursorUnavailable: true } : result;
      store.set({ ...tabs, [owner]: { ...tab, queryResult: invalidate(tab.queryResult),
        resultSets: (tab.resultSets || []).map(item => ({ ...item, result: invalidate(item.result) })) } });
    },
    measure({ requestId, renderMs, totalMs }) {
      let changed = false;
      const next = { ...tabs };
      for (const [owner, tab] of Object.entries(tabs)) {
        const update = result => {
          if (result?.renderRequestId !== requestId || result.clientTiming?.totalMs != null) return result;
          changed = true; return { ...result, clientTiming: { ...result.clientTiming, renderMs, totalMs } };
        };
        const queryResult = update(tab.queryResult), resultSets = (tab.resultSets || []).map(item => ({ ...item, result: update(item.result) }));
        if (queryResult !== tab.queryResult || resultSets.some((item, index) => item.result !== tab.resultSets[index].result)) next[owner] = { ...tab, queryResult, resultSets };
      }
      if (changed) store.set(next);
    },
    pin(owner) {
      const tab = tabs[owner] || {}, result = tab.queryResult;
      if (tab.selectedResultKey) {
        store.set({ ...tabs, [owner]: { ...tab, resultSets: (tab.resultSets || []).filter(item => item.key !== tab.selectedResultKey), selectedResultKey: null } });
      } else if (result?.columns?.length) {
        const key = `pin-${crypto.randomUUID()}`;
        store.set({ ...tabs, [owner]: { ...tab, resultSets: [...(tab.resultSets || []), { key,
          result: { ...result, hasMore: false }, label: tab.latestResultName || (result.executedSql || 'Pinned result').slice(0, 45), view: tab.queryView, pinned: true }], selectedResultKey: key } });
      }
    },
    release(owner, result) {
      const tab = tabs[owner]; if (!tab) return;
      const id = result.resultId;
      const release = value => value && (value === result || id && value.resultId === id)
        ? { ...value, rows: [], returnedRows: 0, hasMore: false, released: true } : value;
      store.set({ ...tabs, [owner]: { ...tab, queryResult: release(tab.queryResult),
        resultSets: (tab.resultSets || []).map(item => ({ ...item, result: release(item.result) })) } });
    },
    forget(owner) {
      closed.add(owner);
      const next = { ...tabs }; delete next[owner]; store.set(next);
    },
  };
  return store;
}

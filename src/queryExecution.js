import { isDdl } from './sqlSafety.js';
import { executionTarget } from './workbenchUx.js';
import { getSqlStatements, getStatementAtCursor } from './sqlStatements.js';
import { getOracleBindNames } from './oracleBinds.js';

export function createQueryOperations() {
  return { running: new Map(), owners: new Map(), history: new Map(), cancellations: new Map(),
    metadata: new Map(), pages: new Map(), scripts: new Map(), lastOwner: null };
}

// Ports expose the current document/session/result state and UI effects. Every
// operation captures its owner once and sends that identity explicitly.
export function createQueryExecution(getPorts) {
  const active = ports => {
    const owner = ports.documents.activeId;
    return { owner, session: ports.readSession(owner), view: ports.results.tabs[owner] || {} };
  };
  const connected = profile => profile && !['No connection', 'Disconnected'].includes(profile.id);
  const set = (ports, owner, values) => {
    for (const [key, value] of Object.entries(values)) ports.session.update(key, value, owner);
  };
  const actions = {
    runQuery(statementOverride) {
      const p = getPorts(), { owner, session, view } = active(p);
      if (p.documents.active?.readOnly||p.ui.readOnly) return;
      if (view.streamState?.busy) { p.session.status('Finish or cancel the streaming export before executing SQL.', owner); return; }
      if (session.executing || session.scriptRun?.running || p.ui.pendingBind || p.operations.pages.has(owner)) return;
      if (!p.native) { p.session.status('Connect to an Oracle profile in the desktop app to execute SQL.', owner); return; }
      if (!connected(session.activeConnection)||session.connectionLost) { p.ui.showConnections(); return; }
      const editor = p.editor.current, model = editor?.getModel(), position = editor?.getPosition() ?? p.editor.lastPosition;
      const selection = editor?.getSelection();
      const target = executionTarget(model?.getValue() || p.documents.text, {
        start: selection && model ? model.getOffsetAt(selection.getStartPosition()) : 0,
        end: selection && model ? model.getOffsetAt(selection.getEndPosition()) : 0,
        caret: position && model ? model.getOffsetAt(position) : 0,
        override: typeof statementOverride === 'string' ? statementOverride : undefined,
      });
      const statement = target?.sql;
      if (target?.kind === 'sql*plus') { p.session.status(`SQL*Plus ${target.command} is read by the script and is not sent to Oracle.`, owner); return; }
      if (!statement?.trim()) { p.session.status('Place the cursor in a SQL statement or select SQL to run.', owner); return; }
      p.editor.flash(target);
      if (p.ui.reviewSource?.(statement, target)) return;
      if (getOracleBindNames(statement).length) { if (p.ui.inlineBinds?.(statement)) return; p.ui.bind(statement); return; }
      return actions.executeStatement(statement);
    },
    executeStatement(statement, parameters = [], executionContext = {}) {
      const p = getPorts(), { owner, session, view } = active(p), operations = p.operations;
      if(p.documents.active?.readOnly||p.ui.readOnly)return;
      if (isDdl(statement)) {
        if (session.transactionPending) { p.session.status('Commit or roll back pending changes before running DDL. DDL commits automatically.', owner); return; }
        if (!executionContext.ddlConfirmed && !p.ui.confirmDdl?.({statement,parameters,owner,profileId:session.activeConnection?.id})) return;
      }
      operations.cancellations.delete(owner);
      set(p, owner, { queryOutcome: null, rendering: false, sqlStage: 'Executing SQL', operationStartedAt: Date.now(), runtimeProblems: [] });
      if (executionContext.serverFilter) p.session.update('executionTarget', 'server filter', owner);
      p.history.learn(statement);
      statement = statement.replace(/^(\s*SELECT)(?=\*)/i, '$1 ');
      const editor = p.editor.current, model = editor?.getModel(), selection = editor?.getSelection();
      const snapshot = p.documents.text;
      const selectedOffset = model && selection && !selection.isEmpty() ? model.getOffsetAt(selection.getStartPosition()) : null;
      const cursorOffset = model && editor?.getPosition() ? model.getOffsetAt(editor.getPosition()) : null;
      const matches = getSqlStatements(snapshot).filter(item => item.sql === statement.trim());
      const selected = matches.find(item => cursorOffset != null && item.start <= cursorOffset && cursorOffset <= item.end) || (matches.length === 1 ? matches[0] : null);
      const statementOffset = selectedOffset != null && snapshot.slice(selectedOffset, selectedOffset + statement.length) === statement ? selectedOffset : selected?.start ?? null;
      operations.metadata.set(owner, { statementOffset, fileName: p.documents.active?.name,
        executedAt: new Date().toISOString(), requestStartedAtPerf: performance.now(),
        executedProfile: session.activeConnection?.name || session.activeConnection?.id,
        executedProfileId:session.activeConnection?.id,executedTabId:owner,executedConnectionGeneration:session.connectionGeneration??0,executedContext:session.sessionContext?{...session.sessionContext}:null,
        editorSnapshot: snapshot, executedSql: statement, executedParameters: parameters,
        executionPageSize: p.settings.pageSize, workspaceRoot: p.settings.workspaceRoot, ...executionContext });
      operations.lastOwner = owner; operations.pages.delete(owner);
      p.results.update(owner, 'selectedResultKey', null); p.results.update(owner, 'pageError', '');
      if (p.settings.activateResults !== false) p.results.update(owner, 'resultTab', 'Results');
      set(p, owner, { fetchingPage: false, executionKind: 'query', executing: true, cancelling: false });
      p.history.start(owner, statement, session.activeConnection?.id);
      p.session.status('Executing Oracle statement…', owner); p.ui.bind(null);
      const requestId = p.send('sql.execute', { tabId: owner, sql: statement, parameters,
        ...(executionContext.sourceReviewId ? {sourceReviewId:executionContext.sourceReviewId} : {}),
        timeoutSeconds: p.settings.timeout, pageSize: p.settings.pageSize,
        previousResultId: (view.resultSets || []).some(item => item.pinned && item.result.resultId === view.queryResult?.resultId) ? null : view.queryResult?.resultId || null });
      operations.owners.set(requestId, owner); operations.running.set(owner, { requestId, startedAt: Date.now(), status: 'running' });
      operations.history.set(requestId, owner);
      if (operations.history.size > 256) operations.history.delete(operations.history.keys().next().value);
      p.session.update('queryRequestId', requestId, owner);
      return requestId;
    },
    explainQuery() {
      const p = getPorts(), { owner, session } = active(p);
      if (p.documents.active?.readOnly||p.ui.readOnly) return;
      p.results.update(owner, 'resultTab', 'Explain');
      if (session.executing || session.scriptRun?.running) return;
      if (!p.native) { p.results.update(owner, 'explainMessage', 'Connect to an Oracle profile in the desktop app to inspect an execution plan.'); return; }
      if (!connected(session.activeConnection)||session.connectionLost) { p.ui.showConnections(); p.session.status('Connect to an Oracle profile before explaining SQL.', owner); return; }
      const editor = p.editor.current, model = editor?.getModel(), position = editor?.getPosition() ?? p.editor.lastPosition;
      const selection = editor?.getSelection();
      let statement = selection && !selection.isEmpty() ? model.getValueInRange(selection) : '';
      if (!statement && model) statement = getStatementAtCursor(model.getValue(), position ? model.getOffsetAt(position) : 0);
      if (!statement?.trim()) { p.results.update(owner, 'explainMessage', 'Place the cursor in a SQL statement or select SQL to explain.'); return; }
      set(p, owner, { sqlStage: 'Building execution plan', operationStartedAt: Date.now(), executionKind: 'explain', executing: true, cancelling: false });
      p.operations.lastOwner = owner;
      p.results.update(owner, 'explainResult', null); p.results.update(owner, 'explainMessage', '');
      p.session.status('Building execution plan…', owner);
      p.operations.owners.set(p.send('sql.explain', { sql: statement, tabId: owner }), owner);
    },
    fetchMoreResults() {
      const p = getPorts(), { owner, session, view } = active(p);
      const result = (view.selectedResultKey ? (view.resultSets || []).find(item => item.key === view.selectedResultKey)?.result : view.queryResult) || null;
      if (!p.native || !result?.hasMore || p.operations.pages.has(owner) || session.executing || session.scriptRun?.running) return;
      set(p, owner, { operationStartedAt: Date.now(), fetchingPage: true }); p.results.update(owner, 'pageError', '');
      p.operations.pages.set(owner, { owner, resultId: result.resultId,
        id: p.send('sql.fetchNext', { tabId: owner, resultId: result.resultId, pageSize: p.settings.scriptPageSize }) });
    },
    cancelQuery(owner, expectedRequestId) {
      const p = getPorts(); if (typeof owner !== 'string') owner = p.documents.activeId;
      const session = p.readSession(owner), operation = p.operations.running.get(owner);
      if (!p.native || !session || session.cancelling || p.operations.cancellations.has(owner) || !(session.executing || session.fetchingPage || session.scriptRun?.running)) return;
      if (expectedRequestId && (operation?.requestId !== expectedRequestId || operation.status !== 'running')) return;
      p.session.update('cancelling', true, owner); p.session.status('Sending cancellation request…', owner);
      p.operations.cancellations.set(owner, p.send('sql.cancel', { tabId: owner }));
    },
    startScript(statements, parameters, continueOnError) {
      const p = getPorts(), dialog = p.ui.scriptDialog;
      if (!dialog||p.ui.readOnly||p.documents.active?.readOnly) return;
      const owner = dialog.tabId, session = p.readSession(owner), view = p.results.tabs[owner] || {}, profile = session.activeConnection;
      if (!p.native || view.streamState?.busy || session.executing || session.scriptRun?.running || session.fetchingPage || session.connecting || !connected(profile)) return;
      if (view.queryResult) p.results.update(owner, 'resultSets', sets => [...(sets || []), { key: `before-script-${crypto.randomUUID()}`, label: 'Before script', pinned: true, result: view.queryResult, view: view.queryView || {} }]);
      const run = { running: true, source: dialog.source, steps: [], parameters };
      p.operations.scripts.set(owner, run); p.session.update('scriptRun', run, owner);
      p.operations.metadata.set(owner, { fileName: p.documents.tabs.find(tab => tab.id === owner)?.name,
        editorSnapshot: dialog.source, executedProfile: profile.name || profile.id,
        executedProfileId:profile.id,executedTabId:owner,executedConnectionGeneration:session.connectionGeneration??0,executedContext:session.sessionContext?{...session.sessionContext}:null,
        executionPageSize: p.settings.scriptPageSize, workspaceRoot: p.settings.workspaceRoot });
      run.requestId = p.send('script.execute', { tabId: owner, continueOnError, timeoutSeconds: p.settings.timeout,
        pageSize: p.settings.scriptPageSize, statements: statements.map(statement => ({ ...statement,
          parameters: parameters.filter(parameter => getOracleBindNames(statement.sql).includes(parameter.name)) })) });
    },
  };
  return actions;
}

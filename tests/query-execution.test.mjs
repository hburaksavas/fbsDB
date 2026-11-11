import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueryExecution, createQueryOperations } from '../src/queryExecution.js';
import { createDocumentSessions } from '../src/documentSessions.js';
import { createResultSessions } from '../src/resultSessions.js';
import { validateNativeCommand } from '../src/bridge/validation.js';

function fixture() {
  const documents = createDocumentSessions(['a', 'b'].map(id => ({ id, name: `${id}.sql`, path: null, content: 'SELECT 1 FROM dual;', dirty: false })));
  const sessions = { a: { activeConnection: { id: 'DEV' } }, b: { activeConnection: { id: 'TEST' } } };
  const commands = [], history = [], statuses = [], results = createResultSessions(), operations = createQueryOperations();
  const ports = {
    documents, results, operations, native: true, readSession: owner => sessions[owner] || {},
    send(command, payload) {
      const id = `request-${commands.length}`;
      validateNativeCommand({ type: 'command', id, tabId: payload.tabId, command, payload });
      commands.push({ id, command, payload }); return id;
    },
    settings: { pageSize: 100, scriptPageSize: 200, timeout: 30, workspaceRoot: 'C:/queries' },
    editor: { current: null, lastPosition: null, flash() {} },
    session: { update(key, value, owner) { sessions[owner] = { ...sessions[owner], [key]: value }; }, status(value, owner) { statuses.push({ value, owner }); } },
    ui: { pendingBind: null, bind(value) { ports.ui.pendingBind = value; }, showConnections() {}, scriptDialog: null },
    history: { learn() {}, start(owner, sql, profile) { history.push({ owner, sql, profile }); } },
  };
  return { ports, actions: createQueryExecution(() => ports), commands, sessions, documents, results, operations, history, statuses };
}

test('independent queries retain request, history, SQL snapshot and profile ownership after tab switches', () => {
  const f = fixture();
  const a = f.actions.executeStatement('SELECT 1 FROM dual');
  f.documents.activate('b'); f.documents.edit('SELECT 2 FROM dual;');
  const b = f.actions.executeStatement('SELECT 2 FROM dual');
  assert.equal(f.commands[0].payload.tabId, 'a'); assert.equal(f.commands[1].payload.tabId, 'b');
  assert.equal(f.operations.owners.get(a), 'a'); assert.equal(f.operations.owners.get(b), 'b');
  assert.equal(f.operations.metadata.get('a').editorSnapshot, 'SELECT 1 FROM dual;');
  assert.equal(f.operations.metadata.get('b').executedProfile, 'TEST');
  assert.deepEqual(f.history.map(entry => entry.profile), ['DEV', 'TEST']);
  assert.equal(f.sessions.a.executing, true); assert.equal(f.sessions.b.executing, true);
});

test('execution captures its owner even if sending the command changes the active document', () => {
  const f = fixture(), send = f.ports.send;
  f.ports.send = (command, payload) => { f.documents.activate('b'); return send(command, payload); };
  const requestId = f.actions.executeStatement('SELECT 1 FROM dual');
  assert.equal(f.operations.running.get('a').requestId, requestId);
  assert.equal(f.operations.running.has('b'), false);
  assert.equal(f.commands[0].payload.tabId, 'a'); assert.equal(f.documents.activeId, 'b');
});

test('Run prompts for binds and respects read-only, busy and browser-preview guards', () => {
  const f = fixture();
  f.actions.runQuery('SELECT :ID FROM dual'); assert.equal(f.ports.ui.pendingBind, 'SELECT :ID FROM dual');
  assert.equal(f.commands.length, 0);
  f.ports.ui.pendingBind = null; f.documents.patch('a', { readOnly: true });
  f.actions.runQuery(); assert.equal(f.commands.length, 0);
  f.documents.patch('a', { readOnly: false }); f.results.update('a', 'streamState', { busy: true });
  f.actions.runQuery(); assert.match(f.statuses.at(-1).value, /streaming export/);
  f.results.update('a', 'streamState', null); f.ports.native = false;
  f.actions.runQuery(); assert.match(f.statuses.at(-1).value, /desktop app/);
  assert.equal(f.commands.length, 0);
});

test('a stale cancel action cannot cancel a newer execution or another tab', () => {
  const f = fixture(), old = f.actions.executeStatement('SELECT 1 FROM dual');
  const current = f.actions.executeStatement('SELECT 2 FROM dual'); f.documents.activate('b');
  f.actions.cancelQuery('a', old); assert.equal(f.commands.length, 2);
  f.actions.cancelQuery('a', current); assert.equal(f.commands.at(-1).command, 'sql.cancel');
  assert.equal(f.commands.at(-1).payload.tabId, 'a'); assert.equal(f.sessions.b.cancelling, undefined);
  f.actions.cancelQuery('a', current); assert.equal(f.commands.length, 3);
});

test('paging uses the selected cursor and limits one outstanding request per tab', () => {
  const f = fixture();
  f.results.update('a', 'queryResult', { resultId: 'cursor-a', rows: [], hasMore: true });
  f.actions.fetchMoreResults(); f.actions.fetchMoreResults();
  assert.equal(f.commands.length, 1); assert.equal(f.commands[0].payload.resultId, 'cursor-a');
  f.documents.activate('b'); f.results.update('b', 'queryResult', { resultId: 'cursor-b', rows: [], hasMore: true });
  f.actions.fetchMoreResults(); assert.equal(f.operations.pages.size, 2);
  assert.equal(f.commands[1].payload.pageSize, 200); assert.equal(f.commands[1].payload.tabId, 'b');
});

test('a script retains its originating tab and binds each statement independently', () => {
  const f = fixture();
  f.ports.ui.scriptDialog = { tabId: 'a', source: 'SELECT :A FROM dual; SELECT :B FROM dual;' };
  f.documents.activate('b');
  f.actions.startScript([{ sql: 'SELECT :A FROM dual', start: 0 }, { sql: 'SELECT :B FROM dual', start: 21 }],
    [{ name: 'A', type: 'NUMBER', value: '1' }, { name: 'B', type: 'NUMBER', value: '2' }], false);
  const command = f.commands[0];
  assert.equal(command.payload.tabId, 'a'); assert.equal(f.operations.scripts.get('a').running, true);
  assert.deepEqual(command.payload.statements.map(statement => statement.parameters.map(bind => bind.name)), [['A'], ['B']]);
  assert.equal(f.sessions.b.scriptRun, undefined);
});

test('executing again keeps a pinned cursor and closes an unpinned previous result', () => {
  const f = fixture();
  f.results.update('a', 'queryResult', { resultId: 'pinned' });
  f.results.update('a', 'resultSets', [{ pinned: true, result: { resultId: 'pinned' } }]);
  f.actions.executeStatement('SELECT 2 FROM dual'); assert.equal(f.commands[0].payload.previousResultId, null);
  f.results.update('a', 'queryResult', { resultId: 'replace-me' });
  f.actions.executeStatement('SELECT 3 FROM dual'); assert.equal(f.commands[1].payload.previousResultId, 'replace-me');
});

test('single DDL requires explicit confirmation and cannot run over a pending transaction',()=>{
 const f=fixture();let prompts=0;f.ports.ui.confirmDdl=()=>{prompts++;return false};
 f.actions.executeStatement('DROP TABLE x');assert.equal(f.commands.length,0);assert.equal(prompts,1);
 f.sessions.a.transactionPending=true;f.ports.ui.confirmDdl=()=>{prompts++;return true};
 f.actions.executeStatement('DROP TABLE x');assert.equal(f.commands.length,0);assert.equal(prompts,1);assert.match(f.statuses.at(-1).value,/Commit or roll back/);
 f.sessions.a.transactionPending=false;f.actions.executeStatement('DROP TABLE x');assert.equal(f.commands.length,1);
});

test('Run routes source compilation to review before any SQL command is sent',()=>{
  const f=fixture(),sql='CREATE OR REPLACE PROCEDURE demo AS BEGIN NULL; END;';
  f.documents.edit(sql);let review;
  f.ports.ui.reviewSource=(statement,target)=>{review={statement,target};return true};
  f.actions.runQuery();
  assert.equal(review.statement,sql);
  assert.equal(f.commands.length,0);
  const request=f.actions.executeStatement(sql,[],{ddlConfirmed:true,sourceReviewId:'review-token',executedSql:sql,statementOffset:0});
  assert.equal(f.commands[0].payload.sourceReviewId,'review-token');
  assert.equal(f.operations.metadata.get('a').statementOffset,0);
  assert.equal(f.operations.owners.get(request),'a');
});

test('metadata read-only views cannot send hidden-editor SQL, scripts or direct executions',()=>{
  const f=fixture();f.ports.ui.readOnly=true;
  f.actions.runQuery();f.actions.executeStatement('SELECT 1 FROM dual;');
  f.ports.ui.scriptDialog={tabId:'a',source:'SELECT 1 FROM dual;'};f.actions.startScript([{sql:'SELECT 1 FROM dual;'}],[],false);
  assert.equal(f.commands.length,0);
});

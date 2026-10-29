import test from 'node:test';
import assert from 'node:assert/strict';
import { oracleLanguageCompletions, oracleSignatureHelp, oracleCallContext, oracleSymbolInfo, languageMetadataTargets } from '../src/oracleLanguageService.js';
import { OracleMetadataBroker, completionCancellation } from '../src/oracleMetadataBroker.js';

const objects = [
  { owner: 'APP', name: 'ORDERS', type: 'TABLE', columns: [] },
  { owner: 'APP', name: 'CUSTOMERS', type: 'TABLE', columns: [] },
  { owner: 'APP', name: 'BILLING', type: 'PACKAGE', columns: [] },
];
const metadata = [
  { ...objects[0], columns: [{ name: 'CUSTOMER_ID', type: 'NUMBER', nullable: false, comment: 'Customer identifier' }, { name: 'REGION_ID', type: 'NUMBER' }], foreignKeys: [
    { owner: 'APP', table: 'ORDERS', name: 'FK_CUSTOMER', column: 'CUSTOMER_ID', targetOwner: 'APP', targetTable: 'CUSTOMERS', targetColumn: 'ID', position: 1 },
    { owner: 'APP', table: 'ORDERS', name: 'FK_CUSTOMER', column: 'REGION_ID', targetOwner: 'APP', targetTable: 'CUSTOMERS', targetColumn: 'REGION_ID', position: 2 },
  ] },
  { ...objects[1], columns: [{ name: 'ID', type: 'NUMBER' }, { name: 'REGION_ID', type: 'NUMBER' }] },
  { ...objects[2], members: [
    { name: 'POST', subprogramId: 1, parameters: [{ name: 'ORDER_ID', type: 'NUMBER', mode: 'IN' }, { name: 'REGION', type: 'VARCHAR2', mode: 'IN', optional: true }], returnType: 'NUMBER' },
    { name: 'POST', subprogramId: 2, parameters: [{ name: 'ORDER_IDS', type: 'APP.ID_LIST', mode: 'IN' }] },
    { name: 'RESET', subprogramId: 3, parameters: [] },
  ] },
];
const options = { objects, metadata, currentSchema: 'APP', settings: { signatureHelp: true, functionParentheses: true, fkJoins: true } };
function at(text, method = oracleLanguageCompletions, extra = {}) {
  const cursor = text.indexOf('|'); return method(text.replace('|', ''), cursor < 0 ? text.length : cursor, { ...options, ...extra });
}

test('package completion preserves overloads and parameterless procedures', () => {
  const result = at('BEGIN billing.po| END;');
  assert.equal(result.candidates.filter(item => item.label === 'POST').length, 2);
  assert.ok(result.candidates.some(item => item.insertText === 'POST($0)'));
  assert.ok(at('BEGIN app.billing.re| END;').candidates.some(item => item.label === 'RESET'));
});

test('parameter hints track nested calls, named arguments and overloads', () => {
  const context = at("BEGIN billing.post(TO_NUMBER('1,2'), region => |); END;", oracleCallContext);
  assert.equal(context.path.at(-1).key, 'POST'); assert.equal(context.argumentIndex, 1); assert.equal(context.argumentName, 'REGION');
  const hints = at('BEGIN billing.post(region => |); END;', oracleSignatureHelp);
  assert.equal(hints.signatures.length, 2); assert.equal(hints.activeParameter, 1); assert.equal(hints.activeSignature, 0);
  assert.equal(at('BEGIN billing.reset(|); END;', oracleSignatureHelp).signatures[0].parameters.length, 0);
  assert.equal(at("SELECT TO_CHAR(SYSDATE, |) FROM dual", oracleSignatureHelp).activeParameter, 1);
  assert.equal(at("SELECT 'TO_CHAR(|' FROM dual", oracleSignatureHelp), null);
  assert.ok(at('BEGIN billing.post(reg|); END;').candidates.some(item => item.insertText === 'REGION => '));
  assert.ok(!at('BEGIN billing.post(region => |); END;').candidates.some(item => item.key?.startsWith('argument:')));
});

test('metadata requests resolve schema/alias scope and package call paths', () => {
  assert.deepEqual(at('SELECT o.cu| FROM app.orders o', languageMetadataTargets, { mode: 'complete' }).map(item => item.name), ['ORDERS']);
  assert.ok(languageMetadataTargets('BEGIN APP.BILLING.POST(', 23, options, 'signature').some(item => item.name === 'BILLING'));
});

test('hover and definition share source metadata without invented local positions', () => {
  const info = at('SELECT o.cust|omer_id FROM app.orders o', oracleSymbolInfo);
  assert.equal(info.target.name, 'ORDERS'); assert.equal(info.target.column, 'CUSTOMER_ID');
  assert.ok(info.contents.some(item => item.value.includes('NOT NULL')));
  assert.ok(info.contents.some(item => item.value.includes('Customer identifier')));
  assert.equal(info.localStart, null);
  const alias = at('SELECT |o.customer_id FROM app.orders o', oracleSymbolInfo);
  assert.equal(alias.localStart, 'SELECT o.customer_id FROM app.orders o'.lastIndexOf('o'));
  const local = at('DECLARE count_value NUMBER; BEGIN count_|value := 1; END;', oracleSymbolInfo);
  assert.equal(local.localStart, 8);
});

test('FK JOIN suggestions use all verified composite key columns', () => {
  const result = at('SELECT * FROM app.orders o JOIN cu|');
  const join = result.candidates.find(item => item.label === 'CUSTOMERS · FK join');
  assert.ok(join); assert.ok(join.insertText.includes('O.CUSTOMER_ID = CUSTOMERS.ID')); assert.ok(join.insertText.includes('O.REGION_ID = CUSTOMERS.REGION_ID'));
  assert.ok(!at('SELECT * FROM app.orders o JOIN cu|', oracleLanguageCompletions, { settings: { fkJoins: false } }).candidates.some(item => item.label.endsWith('FK join')));
  assert.ok(!at('SELECT * FROM app.orders o JOIN cu| c ON c.id = o.customer_id').candidates.some(item => item.label.endsWith('FK join')));
  const aliased = at('SELECT * FROM app.orders o JOIN cu|', oracleLanguageCompletions, { settings: { fkJoins: true, generateAlias: true } }).candidates.find(item => item.label === 'CUSTOMERS · FK join');
  assert.ok(aliased.insertText.includes('CUSTOMERS c')); assert.ok(aliased.insertText.includes('O.CUSTOMER_ID = C.ID'));
});

test('system packages appear on manual request or their explicit qualifier', () => {
  const systemObjects = [{ owner: 'SYS', name: 'DBMS_OUTPUT', type: 'PACKAGE', members: [{ name: 'PUT_LINE', parameters: [{ name: 'A', type: 'VARCHAR2' }] }] }];
  assert.ok(!at('BEGIN d| END;', oracleLanguageCompletions, { systemObjects }).candidates.some(item => item.label === 'DBMS_OUTPUT'));
  assert.ok(at('BEGIN dbms_| END;', oracleLanguageCompletions, { systemObjects }).candidates.some(item => item.insertText === 'SYS.DBMS_OUTPUT'));
  assert.ok(at('BEGIN dbms_| END;', oracleLanguageCompletions, { systemObjects, manual: true }).candidates.some(item => item.label === 'DBMS_OUTPUT'));
  assert.ok(at('BEGIN dbms_output.pu| END;', oracleLanguageCompletions, { systemObjects }).candidates.some(item => item.label === 'PUT_LINE'));
});

test('metadata broker coalesces requests, isolates tab sessions and cancels stale epochs', async () => {
  let sequence = 0; const sent = [];
  const broker = new OracleMetadataBroker((command, payload) => { const id = String(++sequence); sent.push({ command, payload, id }); return id; });
  const first = broker.load('tab-a', objects[0]), duplicate = broker.load('tab-a', objects[0]);
  assert.equal(sent.length, 1);
  broker.handle({ type: 'completion.reply', requestId: '1', epoch: 0, result: metadata[0] });
  assert.equal((await first).name, 'ORDERS'); assert.equal((await duplicate).name, 'ORDERS');
  assert.equal((await broker.load('tab-a', objects[0])).name, 'ORDERS'); assert.equal(sent.length, 1);
  const otherTab = broker.load('tab-b', objects[0]); assert.equal(sent.length, 2);
  broker.reset('tab-b'); assert.equal(await otherTab, null);
  broker.handle({ type: 'completion.reply', requestId: '2', epoch: 0, result: metadata[0] }); assert.equal(broker.objects('tab-b').length, 0);
  const cancellation = completionCancellation(), cancelled = broker.load('tab-a', objects[1], cancellation.token);
  cancellation.cancel(); assert.equal(await cancelled, null); assert.equal(sent.at(-1).command, 'completion.cancel');
  assert.equal(broker.objects('tab-a').length, 1);
  broker.dispose();
});

test('cancelling one shared metadata consumer preserves the other request', async () => {
  let id = 0; const sent = [];
  const broker = new OracleMetadataBroker((command, payload) => { sent.push(command); return String(++id); });
  const cancellation = completionCancellation();
  const cancelled = broker.load('a', objects[0], cancellation.token), live = broker.load('a', objects[0]);
  cancellation.cancel(); assert.equal(await cancelled, null); assert.equal(sent.length, 1);
  broker.handle({ type: 'completion.reply', requestId: '1', epoch: 0, result: metadata[0] });
  assert.equal((await live).name, 'ORDERS'); broker.dispose();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createErrorReporter, describeError, installErrorReporting, messageLimit, reportLimit, stackLimit } from '../src/errorReporting.js';

test('an Error becomes a message and a stack; other thrown values keep their text', () => {
  const error = new TypeError('x is undefined'); error.stack = 'TypeError: x is undefined\n    at run (index.js:1:1)';
  assert.deepEqual(describeError('window', error), { source: 'window', message: 'TypeError: x is undefined', stack: error.stack });
  assert.deepEqual(describeError('promise', 'plain text'), { source: 'promise', message: 'plain text' });
  assert.deepEqual(describeError('promise', undefined), { source: 'promise', message: 'Unknown error' });
  assert.equal(describeError('render', new Error('boom'), '\n    in App').stack.endsWith('in App'), true);
  assert.equal(describeError('somewhere', 'x').source, 'window');
});

test('long text is cut and values that cannot be read do not throw', () => {
  const entry = describeError('window', { name: 'E', message: 'm'.repeat(messageLimit * 2), stack: 's'.repeat(stackLimit * 2) });
  assert.equal(entry.message.length, messageLimit + 1);
  assert.equal(entry.stack.length, stackLimit + 1);
  const hostile = { get message() { throw new Error('no'); }, toString() { throw new Error('no'); } };
  assert.equal(createErrorReporter(() => {})('window', hostile), false);
});

test('the layout observer notice and cancelled editor delays are not errors', () => {
  assert.equal(describeError('window', 'ResizeObserver loop completed with undelivered notifications.'), null);
  assert.equal(describeError('window', new Error('ResizeObserver loop limit exceeded')), null);
  assert.equal(describeError('promise', Object.assign(new Error('Canceled'), { name: 'Canceled' })), null);
});

test('a session reports each distinct error once, up to the limit, and survives a failing host', () => {
  const sent = [], report = createErrorReporter((command, payload) => sent.push({ command, payload }));
  assert.equal(report('window', new Error('first')), true);
  assert.equal(report('window', new Error('first')) , true, 'a different stack is a different error');
  const same = new Error('again'); assert.equal(report('promise', same), true); assert.equal(report('promise', same), false);
  for (let index = 0; index < reportLimit * 2; index++) report('window', `error ${index}`);
  assert.equal(sent.length, reportLimit);
  assert.ok(sent.every(item => item.command === 'ui.logError' && typeof item.payload.message === 'string'));
  assert.equal(createErrorReporter(() => { throw new Error('host is gone'); })('window', 'x'), false);
});

test('window errors and rejected promises are reported and the listeners can be removed', () => {
  const listeners = new Map(), target = { addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) };
  const seen = [], remove = installErrorReporting(target, (...args) => seen.push(args));
  listeners.get('error')({ message: 'Script error.', filename: 'index.js', lineno: 3, colno: 9 });
  listeners.get('unhandledrejection')({ reason: 'nope' });
  assert.deepEqual(seen, [['window', 'Script error.', 'index.js:3:9'], ['promise', 'nope']]);
  remove(); assert.equal(listeners.size, 0);
});

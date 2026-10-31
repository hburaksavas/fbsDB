import assert from 'node:assert/strict';

export async function connectNativePage(endpoint, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let target;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(2000) })).json();
      target = targets.find(item => item.type === 'page' && item.url.startsWith('https://fbsdb.local/'));
      if (target) break;
    } catch { /* The isolated host may still be starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(target, 'The isolated native page did not start.');
  const socket = new WebSocket(target.webSocketDebuggerUrl), pending = new Map();
  let sequence = 0;
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id); pending.delete(message.id);
    if (request) { clearTimeout(request.timer); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Native debugger disconnected.')); }
    pending.clear();
  });
  const api = {
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Debugger timeout: ${method}`)); }, 15000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    async evaluate(expression) {
      const result = await api.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result?.value;
    },
    async until(expression, label = expression, timeout = 15000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const error = await api.evaluate(`document.querySelector('.application-error pre')?.textContent`);
        assert.ok(!error, error);
        if (await api.evaluate(`Boolean(${expression})`)) return;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(`Timed out: ${label}`);
    },
    async click(selector) {
      assert.ok(await api.evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element || element.disabled) return false; element.focus(); element.click(); return true; })()`), `Missing/enabled control: ${selector}`);
      await api.frame();
    },
    async textClick(selector, text) {
      assert.ok(await api.evaluate(`(() => { const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find(element => element.textContent.trim() === ${JSON.stringify(text)}); if (!element || element.disabled) return false; element.focus(); element.click(); return true; })()`), `Missing/enabled control: ${text}`);
      await api.frame();
    },
    frame: () => api.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'),
    async key(key, modifiers = 0) {
      const code = /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : key;
      const windowsVirtualKeyCode = { Enter: 13, Escape: 27, Tab: 9 }[key] || key.toUpperCase().charCodeAt(0);
      await api.call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, modifiers });
      await api.call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers });
      await api.frame();
    },
    close() { socket.close(); },
  };
  await api.call('Page.enable'); await api.call('Runtime.enable');
  return api;
}

// Keep the real native host and file handlers. Only picker path selection and
// reply timing are substituted; database commands are never forwarded.
export function desktopRegressionFixture(root, workspace = false) {
  return `(() => {
    const root = ${JSON.stringify(root)};
    const state = window.__desktopRegression = { root, ready: false, commands: [], replies: [], errors: [], blocked: [], openPaths: [], savePaths: [], holdSaves: false, pendingReplies: [] };
    const normalize = value => value.split(String.fromCharCode(92)).join('/').toLowerCase();
    const inside = value => typeof value === 'string' && normalize(value).startsWith(normalize(root) + '/') && !value.replace(/\\\\/g, '/').split('/').includes('..');
    // Chromium reports a resize observation that it postpones to the next frame as an "error" event. Monaco's reference peek does
    // this when its preview editor settles one pixel smaller on a scaled display; nothing is lost and no script failed.
    window.addEventListener('error', event => { if (!/^ResizeObserver loop /.test(event.message)) state.errors.push(event.message); });
    // Monaco leaves some cancelled delays unhandled, such as WordHighlighter when a
    // peek editor closes. Its own error handler does not count cancellation as an error.
    window.addEventListener('unhandledrejection', event => { if (event.reason?.name !== 'Canceled') state.errors.push(String(event.reason?.stack || event.reason)); });
    const nativePost = chrome.webview.postMessage.bind(chrome.webview);
    const nativeAdd = chrome.webview.addEventListener.bind(chrome.webview);
    const nativeRemove = chrome.webview.removeEventListener.bind(chrome.webview);
    const wrappers = new Map();
    nativeAdd('message', event => {
      const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      state.replies.push({ type: message.type, requestId: message.requestId, tabId: message.tabId, path: message.path });
      if (state.replies.length > 512) state.replies.shift();
    });
    chrome.webview.addEventListener = (name, listener) => {
      if (name !== 'message') return nativeAdd(name, listener);
      const wrapped = event => {
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (state.holdSaves && message.type === 'file.saved') state.pendingReplies.push(() => listener(event));
        else listener(event);
      };
      wrappers.set(listener, wrapped); nativeAdd(name, wrapped);
    };
    chrome.webview.removeEventListener = (name, listener) => { nativeRemove(name, wrappers.get(listener) || listener); wrappers.delete(listener); };
    state.releaseSaves = () => { state.holdSaves = false; const callbacks = state.pendingReplies.splice(0); callbacks.forEach(callback => callback()); };
    state.post = message => chrome.webview.postMessage(JSON.stringify(message));
    chrome.webview.postMessage = value => {
      const message = typeof value === 'string' ? JSON.parse(value) : value;
      if (message.type === 'ui.ready') { state.ready = true; nativePost(value); return; }
      const allowed = ['ui.logError', 'file.new', 'file.activate', 'file.open', 'file.openPath', 'file.save', 'file.poll', 'tab.close', 'system.locale', 'ui.setTheme', 'ui.setZoom', 'connection.list', 'window.state', 'window.moveTab', 'window.focus', 'window.close', 'window.closeCancelled'];
      if (${JSON.stringify(workspace)}) allowed.push('workspace.projectRules','workspace.projectRules.save','workspace.sources','workspace.refresh','workspace.children','workspace.git','workspace.gitDiff','workspace.gitStage','workspace.gitUnstage','workspace.gitCommit','workspace.runs.list','workspace.runs.save','workspace.search','workspace.binds.load');
      if (message.type !== 'command' || !allowed.includes(message.command)) { state.blocked.push(message.command || message.type); return; }
      const payload = message.payload || {};
      if (message.command.startsWith('workspace.') && message.command !== 'workspace.refresh' && message.command !== 'workspace.children' && message.command !== 'workspace.git' && message.command !== 'workspace.binds.load' && normalize(payload.root || '') !== normalize(root)) throw new Error('Workspace command escaped the isolated test root.');
      state.commands.push({ id: message.id, command: message.command, tabId: message.tabId, path: payload.path });
      if (state.commands.length > 512) state.commands.shift();
      if (message.command === 'file.open') {
        const path = state.openPaths.shift();
        if (!inside(path)) throw new Error('No isolated path queued for Open.');
        message.command = 'file.openPath'; message.payload = { ...payload, path };
      }
      if (message.command === 'file.save' && !payload.path) {
        const selection = state.savePaths.shift();
        if (!selection || !inside(selection.path)) throw new Error('No isolated path queued for Save As.');
        message.payload = { ...payload, path: selection.path, diskVersion: selection.diskVersion };
      }
      if (message.payload?.path != null && !(message.command === 'workspace.children' && normalize(message.payload.path) === normalize(root)) && !inside(message.payload.path)) throw new Error('File command escaped the isolated test root.');
      if (message.command === 'file.poll' && (payload.files || []).some(file => !inside(file.path))) throw new Error('File polling escaped the isolated test root.');
      nativePost(JSON.stringify(message));
    };
  })()`;
}

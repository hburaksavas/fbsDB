import { reviveOracleTemporal } from './oracleTemporal.js';
const webViewHost = window.chrome?.webview ?? null;
const temporalMessages=new WeakMap();
let nextId = 1;
let currentTabId = "tab-1";
export function setNativeTabId(tabId) { currentTabId = tabId; }
export function getNativeTabId() { return currentTabId; }

export const isNativeHost = Boolean(webViewHost);

export function sendNativeCommand(command, payload = {}) {
  if (!webViewHost) return null;
  const id = `ui-${Date.now()}-${nextId++}`;
  webViewHost.postMessage(JSON.stringify({ type: "command", id, command, payload, tabId: payload.tabId ?? currentTabId }));
  return id;
}

export function subscribeNativeMessages(listener) {
  if (!webViewHost) return () => {};
  const handler = (event) => {
    let message = event.data;
    if (typeof message === "string") {
      try { message = JSON.parse(message); } catch { return; }
    }
    if(Array.isArray(message?.rows)&&Array.isArray(message.columns)&&message.columns.some(column=>column.temporalKind)){const cached=temporalMessages.get(message);if(cached)message=cached;else{const original=message;message={...message,rows:message.rows.map(row=>row.map((cell,index)=>message.columns[index]?.temporalKind?reviveOracleTemporal(cell):cell))};temporalMessages.set(original,message)}}
    listener(message);
  };
  webViewHost.addEventListener("message", handler);
  return () => webViewHost.removeEventListener("message", handler);
}

export function announceUiReady() {
  if (webViewHost) webViewHost.postMessage(JSON.stringify({ type: "ui.ready", version: "0.1.0", tabId: currentTabId }));
}

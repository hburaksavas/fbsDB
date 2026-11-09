import { useEffect, useRef, useState } from 'react';
import { sendNativeCommand, subscribeNativeMessages } from './nativeBridge';
import { notifyFeedback } from './Feedback';
import { debugBreakpoints, debugUnit, debugVariableNames, sameUnit, shiftBreakpoints, toEditorLine, toggleBreakpoint } from './plsqlDebug.js';

// FI-007: PL/SQL debugger state for the workbench. The debugged call is the
// statement at the caret of a SQL tab, run in that tab's own session; the
// host's DBMS_DEBUG debugger reports pauses, and this hook shows them.
function request(command, payload, replyType) {
  return new Promise((resolve, reject) => {
    let id = null;
    const stop = subscribeNativeMessages(message => {
      if (!id || message.requestId !== id) return;
      if (message.type === replyType) { stop(); resolve(message); }
      else if (message.type === 'host.error') { stop(); reject(new Error(message.message)); }
    });
    id = sendNativeCommand(command, payload);
    if (!id) { stop(); reject(new Error('Debugging needs the Windows app.')); }
  });
}

export function usePlsqlDebugger({ documents, activeTabId, runQuery, cancelQuery, openDefinition, activateTab, isConnected }) {
  const [breakpoints, setBreakpoints] = useState({});
  const [debug, setDebug] = useState(null);
  const [compilePrompt, setCompilePrompt] = useState(null);
  const ref = useRef({}), editorRef = useRef(null), monacoRef = useRef(null), decorationsRef = useRef(null), sourcesRef = useRef(new Map()), pausedKeyRef = useRef(null);
  ref.current = { documents, activeTabId, runQuery, cancelQuery, openDefinition, activateTab, isConnected, debug, breakpoints };

  const unitKey = location => `${location.owner}.${location.name}.${location.unitType || location.type}`;
  // Read through the ref: the event subscription is created once.
  const locationTab = location => ref.current.documents.tabs.find(tab => sameUnit(debugUnit(tab), { owner: location.owner, name: location.name, type: location.unitType || location.type }));

  async function sourceOf(location, tabId) {
    const key = unitKey(location), open = locationTab(location);
    if (open) return open.content;
    if (!sourcesRef.current.has(key)) {
      const reply = await request('debug.source', { tabId, owner: location.owner, name: location.name, unitType: location.unitType || location.type }, 'debug.source');
      sourcesRef.current.set(key, reply.text);
    }
    return sourcesRef.current.get(key);
  }

  // Shows a frame: its source at the line, and its values.
  async function showFrame(frame, current) {
    const { tabId } = current;
    const location = { owner: frame.owner, name: frame.name, unitType: frame.type, line: frame.line };
    setDebug(state => state && { ...state, selected: frame.frame, values: null, valuesError: '' });
    if (!frame.name || !['PROCEDURE', 'FUNCTION', 'PACKAGE', 'PACKAGE BODY', 'TRIGGER', 'TYPE', 'TYPE BODY'].includes(frame.type)) {
      setDebug(state => state && { ...state, values: [], valuesError: 'An anonymous block has no source or values to show.' }); return;
    }
    try {
      const text = await sourceOf(location, tabId);
      let tab = locationTab(location);
      if (tab) ref.current.activateTab(tab.id);
      else ref.current.openDefinition({ owner: frame.owner, name: frame.name, type: frame.type, text, originTabId: tabId }, { lineNumber: frame.line, column: 1 });
      tab = locationTab(location);
      const unit = tab ? debugUnit(tab) : { firstLine: 1 };
      const line = toEditorLine(unit, frame.line);
      requestAnimationFrame(() => { const editor = editorRef.current; if (editor) { editor.revealLineInCenter(line); editor.setPosition({ lineNumber: line, column: 1 }); } });
      // The text is the open tab's (its own line numbering) or the database source (line 1 is line 1).
      const names = debugVariableNames(text, line);
      const reply = await request('debug.values', { tabId, frame: frame.frame, names }, 'debug.values');
      setDebug(state => state && state.selected === frame.frame ? { ...state, values: reply.values } : state);
    } catch (error) {
      setDebug(state => state && { ...state, values: [], valuesError: error.message });
    }
  }

  useEffect(() => subscribeNativeMessages(message => {
    if (!message.type?.startsWith('debug.')) return;
    const current = ref.current.debug;
    if (!current || message.tabId !== current.tabId) return;
    if (message.type === 'debug.running') setDebug(state => state && { ...state, status: 'running' });
    else if (message.type === 'debug.breakpoints') {
      const refused = (message.breakpoints || []).filter(item => !item.set);
      if (refused.length) notifyFeedback({ kind: 'warning', title: `${refused.length} breakpoint${refused.length === 1 ? '' : 's'} not set`, message: refused.map(item => `${item.name} line ${item.line}: ${item.message}`).join('\n') });
    } else if (message.type === 'debug.paused') {
      const frames = message.frames || [];
      const next = { ...current, status: 'paused', location: { owner: message.owner, name: message.name, unitType: message.unitType, line: message.line }, frames, selected: frames[0]?.frame ?? null, values: null };
      setDebug(next);
      if (frames[0]) showFrame(frames[0], next);
    } else if (message.type === 'debug.ended') {
      setDebug(null); sourcesRef.current.clear();
      notifyFeedback(message.message ? { kind: 'warning', title: 'Debugging ended', message: message.message } : { kind: 'info', title: 'Debugging finished', message: 'The debugged call ended. Its results and any open transaction are in the tab as after a normal run.' });
    }
  }), []);

  // Breakpoints and the paused line are drawn on the editor for the active document.
  useEffect(() => {
    const editor = editorRef.current, monaco = monacoRef.current;
    if (!editor || !monaco) return;
    decorationsRef.current ??= editor.createDecorationsCollection();
    const tab = documents.tabs.find(item => item.id === activeTabId), unit = debugUnit(tab);
    const items = (unit ? breakpoints[activeTabId] || [] : []).map(line => ({ range: new monaco.Range(line, 1, line, 1), options: { glyphMarginClassName: 'debug-breakpoint-glyph', glyphMarginHoverMessage: { value: 'Breakpoint (F9 removes it)' }, stickiness: 1 } }));
    const frame = debug?.status === 'paused' ? debug.frames?.find(item => item.frame === debug.selected) : null;
    if (frame && unit && sameUnit(unit, { owner: frame.owner, name: frame.name, type: frame.type })) {
      const line = toEditorLine(unit, frame.line);
      items.push({ range: new monaco.Range(line, 1, line, 1), options: { isWholeLine: true, className: 'debug-current-line', glyphMarginClassName: 'debug-current-glyph', glyphMarginHoverMessage: { value: 'Paused here' } } });
    }
    decorationsRef.current.set(items);
  }, [breakpoints, activeTabId, debug, documents.tabs]);

  function toggleAt(line, tabId = ref.current.activeTabId) {
    const tab = ref.current.documents.tabs.find(item => item.id === tabId);
    if (!debugUnit(tab)) { notifyFeedback({ kind: 'info', title: 'No breakpoint here', message: 'Breakpoints go in a stored PL/SQL unit: a package, procedure, function, trigger or type source.' }); return; }
    setBreakpoints(current => ({ ...current, [tabId]: toggleBreakpoint(current[tabId], line) }));
  }

  // Called from the editor's onMount.
  function installEditor(editor, monaco) {
    editorRef.current = editor; monacoRef.current = monaco; decorationsRef.current = null;
    const paused = editor.createContextKey('fbsdb.debugPaused', false);
    pausedKeyRef.current = paused;
    editor.onMouseDown(event => {
      if (event.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || event.event.rightButton) return;
      if (event.target.element?.classList?.contains('sql-run-glyph')) return;
      const line = event.target.position?.lineNumber;
      if (line) toggleAt(line);
    });
    editor.onDidChangeModelContent(event => {
      if (event.isFlush) return;
      const id = ref.current.activeTabId, lines = ref.current.breakpoints[id];
      if (!lines?.length) return;
      const changes = event.changes.map(change => ({ startLine: change.range.startLineNumber, endLine: change.range.endLineNumber, insertedLines: (change.text.match(/\n/g) || []).length }));
      setBreakpoints(current => ({ ...current, [id]: shiftBreakpoints(current[id], changes) }));
    });
    editor.addAction({ id: 'fbsdb.toggleBreakpoint', label: 'Debug: Toggle breakpoint', keybindings: [monaco.KeyCode.F9], run: () => toggleAt(editor.getPosition()?.lineNumber || 1) });
    for (const [id, label, keys, mode] of [['continue', 'Debug: Continue', [monaco.KeyCode.F8], 'continue'], ['over', 'Debug: Step over', [monaco.KeyCode.F10], 'over'], ['into', 'Debug: Step into', [monaco.KeyCode.F11], 'into'], ['out', 'Debug: Step out', [monaco.KeyMod.Shift | monaco.KeyCode.F11], 'out']])
      editor.addAction({ id: `fbsdb.debug.${id}`, label, keybindings: keys, precondition: 'fbsdb.debugPaused', run: () => step(mode) });
  }
  useEffect(() => { pausedKeyRef.current?.set(debug?.status === 'paused'); }, [debug?.status]);

  async function start() {
    const { documents: docs, isConnected: connected } = ref.current;
    const tab = docs.active;
    if (ref.current.debug) { notifyFeedback({ kind: 'info', title: 'Already debugging', message: 'Continue, step or stop the current debug run first.' }); return; }
    if (!tab || tab.readOnly || debugUnit(tab)) { notifyFeedback({ kind: 'warning', title: 'Debug from a SQL tab', message: 'Debug runs the statement at the caret of a SQL tab, for example BEGIN billing.run; END;. Running it from a unit\'s own source would compile that unit instead.' }); return; }
    if (!connected) { notifyFeedback({ kind: 'warning', title: 'Not connected', message: 'Connect this tab to Oracle before debugging.' }); return; }
    const tabId = tab.id;
    try {
      const units = debugBreakpoints(docs.tabs, ref.current.breakpoints);
      let list = [];
      if (units.length) {
        const reply = await request('debug.objects', { tabId, objects: units.map(item => ({ owner: item.unit.owner, name: item.unit.name, type: item.unit.type })) }, 'debug.objects');
        const missing = reply.objects.filter(item => !item.exists);
        if (missing.length) notifyFeedback({ kind: 'warning', title: 'Breakpoints skipped', message: `${missing.map(item => `${item.owner}.${item.name} (${item.type})`).join(', ')} is not in this database; its breakpoints are left out.` });
        const compile = reply.objects.filter(item => item.exists && !item.debugInfo);
        if (compile.length) {
          if (reply.production) { notifyFeedback({ kind: 'error', title: 'Not compiled for debugging', message: `${compile.map(item => `${item.owner}.${item.name}`).join(', ')} has no debug information, and units are not recompiled on a PROD connection.` }); return; }
          const ok = await new Promise(resolve => setCompilePrompt({ objects: compile, resolve }));
          setCompilePrompt(null);
          if (!ok) return;
          const compiled = await request('debug.compile', { tabId, objects: compile.map(({ owner, name, type }) => ({ owner, name, type })) }, 'debug.compiled');
          if (!compiled.success) { notifyFeedback({ kind: 'error', title: 'Compile for debugging failed', message: compiled.message }); return; }
        }
        list = units.flatMap((item, index) => reply.objects[index].exists ? item.lines.map(line => ({ owner: reply.objects[index].owner, name: item.unit.name, type: item.unit.type, line })) : []);
      }
      setDebug({ tabId, status: 'starting', frames: [], selected: null, values: null });
      await request('debug.start', { tabId, breakpoints: list }, 'debug.ready');
      setDebug(state => state && { ...state, status: 'running' });
      if (!list.length) notifyFeedback({ kind: 'info', title: 'No breakpoints', message: 'The run pauses where the first PL/SQL unit is entered.' });
      ref.current.runQuery();
    } catch (error) {
      setDebug(null);
      notifyFeedback({ kind: 'error', title: 'Debugging did not start', message: error.message });
    }
  }

  function step(mode) {
    const current = ref.current.debug;
    if (current?.status !== 'paused') return;
    setDebug({ ...current, status: 'running' });
    sendNativeCommand('debug.continue', { tabId: current.tabId, mode });
  }

  function stop() {
    const current = ref.current.debug;
    if (!current) return;
    sendNativeCommand('debug.stop', { tabId: current.tabId });
    if (current.status !== 'paused') ref.current.cancelQuery(current.tabId);
  }

  function selectFrame(frameNumber) {
    const current = ref.current.debug, frame = current?.frames.find(item => item.frame === frameNumber);
    if (frame && current.status === 'paused') showFrame(frame, current);
  }

  const clearBreakpoints = () => setBreakpoints({});
  return { breakpoints, debug, compilePrompt, installEditor, toggleAt, start, step, stop, selectFrame, clearBreakpoints };
}

import { useEffect, useRef, useState } from 'react';
import { sendNativeCommand, subscribeNativeMessages } from './nativeBridge';
import { notifyFeedback } from './Feedback';
import { debugUnit, sameUnit, toEditorLine } from './plsqlDebug.js';
import { profileMarks } from './plsqlProfile.js';

// FI-031: line-level profiling with DBMS_PROFILER. The statement at the caret
// of a SQL tab runs in that tab's own session, as Run does; when it has
// finished, the host reads the report and deletes the run from the tables.
function request(command, payload, replyType) {
  return new Promise((resolve, reject) => {
    let id = null;
    const stop = subscribeNativeMessages(message => {
      if (!id || message.requestId !== id) return;
      if (message.type === replyType) { stop(); resolve(message); }
      else if (message.type === 'host.error') { stop(); reject(new Error(message.message)); }
    });
    id = sendNativeCommand(command, payload);
    if (!id) { stop(); reject(new Error('Profiling needs the Windows app.')); }
  });
}

export function usePlsqlProfiler({ documents, activeTabId, sessions, runQuery, openDefinition, activateTab, isConnected, busy }) {
  const [profile, setProfile] = useState(null);
  const [tablePrompt, setTablePrompt] = useState(null);
  const ref = useRef({}), editorRef = useRef(null), monacoRef = useRef(null), decorationsRef = useRef(null), sawRunRef = useRef(false);
  ref.current = { documents, runQuery, openDefinition, activateTab, isConnected, busy, profile };

  async function finish() {
    const current = ref.current.profile;
    if (current?.status !== 'running') return;
    setProfile({ ...current, status: 'reading' });
    try {
      const reply = await request('profile.finish', { tabId: current.tabId }, 'profile.report');
      setProfile({ tabId: current.tabId, status: 'done', report: reply.report });
    } catch (error) {
      setProfile(null);
      notifyFeedback({ kind: 'error', title: 'Profile not read', message: error.message });
    }
  }

  // The profiled run ends when its tab stops executing.
  useEffect(() => {
    const current = profile;
    if (current?.status !== 'running') return;
    const executing = Boolean(sessions[current.tabId]?.executing);
    if (executing) sawRunRef.current = true;
    else if (sawRunRef.current) { sawRunRef.current = false; finish(); }
  }, [sessions, profile?.status]);

  useEffect(() => subscribeNativeMessages(message => {
    const current = ref.current.profile;
    if (current && message.tabId === current.tabId && message.type === 'connection.disconnected') setProfile(null);
  }), []);

  // Line times beside an open source of a profiled unit.
  useEffect(() => {
    const editor = editorRef.current, monaco = monacoRef.current;
    if (!editor || !monaco) return;
    decorationsRef.current ??= editor.createDecorationsCollection();
    const tab = documents.tabs.find(item => item.id === activeTabId);
    const marks = profile?.status === 'done' ? profileMarks(profile.report, debugUnit(tab)) : [];
    const model = editor.getModel();
    decorationsRef.current.set(marks.filter(mark => model && mark.line <= model.getLineCount()).map(mark => {
      const column = model.getLineMaxColumn(mark.line);
      return { range: new monaco.Range(mark.line, column, mark.line, column), options: { showIfCollapsed: true, isWholeLine: mark.level === 'hot', className: mark.level === 'hot' ? 'profile-hot-line' : undefined, after: { content: `   ${mark.text}`, inlineClassName: `profile-line-time profile-${mark.level}` } } };
    }));
  }, [profile, activeTabId, documents.tabs]);

  function installEditor(editor, monaco) { editorRef.current = editor; monacoRef.current = monaco; decorationsRef.current = null; }

  async function start() {
    const { documents: docs, isConnected: connected, busy: running } = ref.current;
    const tab = docs.active;
    if (['starting', 'running', 'reading'].includes(ref.current.profile?.status)) { notifyFeedback({ kind: 'info', title: 'Already profiling', message: 'Wait for the profiled run to end, or finish it from the profile panel.' }); return; }
    if (!tab || tab.readOnly || debugUnit(tab)) { notifyFeedback({ kind: 'warning', title: 'Profile from a SQL tab', message: 'Profiling runs the statement at the caret of a SQL tab, for example BEGIN billing.run; END;. Running it from a unit\'s own source would compile that unit instead.' }); return; }
    if (!connected) { notifyFeedback({ kind: 'warning', title: 'Not connected', message: 'Connect this tab to Oracle before profiling.' }); return; }
    if (running) { notifyFeedback({ kind: 'info', title: 'Tab is busy', message: 'Wait for the running statement, or stop debugging, before profiling.' }); return; }
    const tabId = tab.id;
    try {
      const state = await request('profile.state', { tabId }, 'profile.state');
      if (!state.tablesReady) {
        if (state.production) { notifyFeedback({ kind: 'error', title: 'Profiler tables missing', message: `DBMS_PROFILER needs ${state.missing.join(', ')} in this schema. They are not created on a PROD connection; ask a DBA to create them.` }); return; }
        const ok = await new Promise(resolve => setTablePrompt({ missing: state.missing, ddl: state.ddl, transactionPending: state.transactionPending, resolve }));
        setTablePrompt(null);
        if (!ok) return;
        const created = await request('profile.createTables', { tabId }, 'profile.tablesCreated');
        if (!created.success) { notifyFeedback({ kind: 'error', title: 'Profiler tables not created', message: created.message }); return; }
      }
      setProfile({ tabId, status: 'starting' });
      await request('profile.start', { tabId }, 'profile.started');
      sawRunRef.current = false;
      setProfile({ tabId, status: 'running' });
      ref.current.runQuery();
    } catch (error) {
      setProfile(null);
      notifyFeedback({ kind: 'error', title: 'Profiling did not start', message: error.message });
    }
  }

  // Opens a profiled line: in its open source, or the unit's source read from the database.
  async function openLine(unit, line) {
    const current = ref.current.profile;
    if (!unit.name || !current) return;
    const location = { owner: unit.owner, name: unit.name, type: unit.type };
    const open = ref.current.documents.tabs.find(tab => sameUnit(debugUnit(tab), location));
    const reveal = editorLine => requestAnimationFrame(() => { const editor = editorRef.current; if (editor) { editor.revealLineInCenter(editorLine); editor.setPosition({ lineNumber: editorLine, column: 1 }); editor.focus(); } });
    if (open) { ref.current.activateTab(open.id); reveal(toEditorLine(debugUnit(open), line)); return; }
    try {
      const reply = await request('profile.source', { tabId: current.tabId, owner: unit.owner, name: unit.name, unitType: unit.type }, 'profile.source');
      ref.current.openDefinition({ owner: unit.owner, name: unit.name, type: unit.type, text: reply.text, originTabId: current.tabId }, { lineNumber: line, column: 1 });
    } catch (error) { notifyFeedback({ kind: 'error', title: 'Source not opened', message: error.message }); }
  }

  const clear = () => setProfile(current => current?.status === 'done' ? null : current);
  return { profile, tablePrompt, installEditor, start, finish, openLine, clear };
}

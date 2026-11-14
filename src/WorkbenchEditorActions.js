// Editor commands: the run gutter, formatting, CTE extraction, column paste, schema drops, bind drops, definitions and problem navigation. App keeps a function of the same name that passes its values in; see docs/architecture.md.
import { columnCursorDraft } from "./columnMulticursor";
import { dragSqlDraft } from "./dragToSql";
import { currentExecutionOffset } from "./editLocations";
import { summaryHover, summaryLabel } from "./executionSummaries";
import { notifyFeedback } from "./Feedback";
import { LARGE_FILE_THRESHOLD } from "./largeFilePolicy.js";
import { setNativeTabId } from "./nativeBridge";
import { getOracleBindNames } from "./oracleBinds";
import { oracleSchemaKey } from "./OracleObjectTree.jsx";
import { offsetAtOraclePosition } from "./plsqlDiagnostics";
import { extractCteSnippet } from "./postfixCompletion";
import { cellDragType, planBindDrop } from "./resultBindDrop.js";
import { resolveSetting } from "./settingsModel";
import { sqlFormatterStyle } from "./sqlFormatterSettings.js";
import { getSqlStatements } from "./sqlStatements.js";

export function installRunGutter(ctx, editor, monacoInstance) {
  const {
    documents, editorIsReadonly, executionSummaries, largeFileOverridesRef, runQueryRef, setResultTab, updateLayout
  } = ctx;
    const decorations = editor.createDecorationsCollection(), summaryDecorations = editor.createDecorationsCollection();
    let statementsByLine = new Map();
    const refresh = () => {
      const model = editor.getModel();
      statementsByLine = new Map();
      if (!model || editorIsReadonly() || model.getValueLength()>=LARGE_FILE_THRESHOLD&&!largeFileOverridesRef.current[documents.activeId]?.source) { decorations.clear(); summaryDecorations.clear(); return; }
      for (const statement of getSqlStatements(model.getValue())) {
        const position = model.getPositionAt(statement.start);
        // A gutter click targets only the first statement starting on this line.
        const current = statementsByLine.get(position.lineNumber);
        if (!current) statementsByLine.set(position.lineNumber, { ...statement, position });
      }
      const summaryItems = [];
      for (const statement of getSqlStatements(model.getValue())) {
        const summary = executionSummaries.current.get(documents.activeId, statement.sql);
        if (!summary) continue;
        const end = model.getPositionAt(statement.end), column = model.getLineMaxColumn(end.lineNumber);
        summaryItems.push({ range: new monacoInstance.Range(end.lineNumber, column, end.lineNumber, column), options: { showIfCollapsed: true, stickiness: monacoInstance.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, after: { content: summaryLabel(summary), inlineClassName: summary.ok ? 'sql-exec-summary' : 'sql-exec-summary failed' }, hoverMessage: { value: summaryHover(summary) } } });
      }
      summaryDecorations.set(summaryItems);
      decorations.set([...statementsByLine.values()].map(({ position, sql }) => ({
        range: new monacoInstance.Range(position.lineNumber, 1, position.lineNumber, 1),
        options: { glyphMarginClassName: "sql-run-glyph", glyphMarginHoverMessage: { value: "Run SQL statement\n\n" + sql.slice(0, 160) } },
      })));
    };
    const subscriptions = [editor.onDidChangeModelContent(refresh), editor.onDidChangeModel(refresh), editor.onMouseDown((event) => {
      if (event.target.element?.closest?.('.sql-exec-summary') || event.target.detail?.injectedText?.options?.inlineClassName?.includes('sql-exec-summary')) { setResultTab('Results'); updateLayout(current => ({ ...current, resultsCollapsed: false })); return; }
      if (event.target.type !== monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || event.event.rightButton) return;
      const statement = statementsByLine.get(event.target.position?.lineNumber);
      if (!statement) return;
      editor.setPosition(statement.position); editor.focus();
      runQueryRef.current?.(statement.sql);
    })];
    refresh();
    window.addEventListener('fbsdb.refreshRunGutter',refresh);
    editor.onDidDispose(() => {window.removeEventListener('fbsdb.refreshRunGutter',refresh); subscriptions.forEach((subscription) => subscription.dispose()); decorations.clear(); summaryDecorations.clear(); });
  }

export async function formatSql(ctx) {
  const {
    codeStyle, completionClientRef, documents, editorIsReadonly, editorRef, setFileDirty, setRunState, settingsRef
  } = ctx;
    if (editorIsReadonly()) return;
    const editor = editorRef.current, model = editor?.getModel(), client = completionClientRef.current;
    if (!editor || !model || !client) return;
    const selection = editor.getSelection(), hasSelection = selection && !selection.isEmpty(), range = hasSelection ? selection : model.getFullModelRange();
    const source = model.getValueInRange(range), version = model.getVersionId(), owner = documents.activeId;
    const result = await client.request("format", source, 0, null, { style: sqlFormatterStyle(resolveSetting(settingsRef.current,'editor.sqlFormatter').value, codeStyle) });
    if (model.isDisposed() || model.getVersionId() !== version || documents.activeId !== owner || editor.getModel() !== model || typeof result?.formatted !== "string") return;
    const formatted = result.formatted;
    if (formatted === source) { setRunState("No formatting changes."); return; }
    editor.pushUndoStop(); editor.executeEdits("fbsdb.formatSql", [{ range, text: hasSelection ? formatted.replace(/\n$/, "") : formatted, forceMoveMarkers: true }]); editor.pushUndoStop();
    setFileDirty(true); setRunState("SQL / PL/SQL formatted."); editor.focus();
  }

export function extractSelectionToCte(ctx) {
  const {
    activeTabReadonly, documents, editorRef, monacoRef
  } = ctx;
    const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection();
    if(!model||activeTabReadonly)return;
    if(!selection||selection.isEmpty()){notifyFeedback({kind:'warning',title:'Extract CTE',message:'Select the subquery to extract.',scope:documents.activeId});return}
    const text=model.getValue(),start=model.getOffsetAt(selection.getStartPosition()),end=model.getOffsetAt(selection.getEndPosition()),statement=getSqlStatements(text).find(item=>item.start<=start&&end<=item.end);
    if(!statement){notifyFeedback({kind:'warning',title:'Extract CTE',message:'The selection must be inside one statement.',scope:documents.activeId});return}
    const raw=text.slice(statement.start,statement.end),result=extractCteSnippet(raw,start-statement.start,end-statement.start);
    if(result.error){notifyFeedback({kind:'warning',title:'Extract CTE',message:result.error,scope:documents.activeId});return}
    const from=model.getPositionAt(statement.start),to=model.getPositionAt(statement.end);
    editor.setSelection(new monacoRef.current.Selection(from.lineNumber,from.column,to.lineNumber,to.column));editor.focus();
    editor.getContribution('snippetController2').insert(result.snippet.replace(/\n/g,model.getEOL()),{adjustWhitespace:false,undoStopBefore:true,undoStopAfter:true});
  }

export async function pasteColumnCursors(ctx) {
  const {
    documents, editorIsReadonly, editorRef, monacoRef
  } = ctx;
    const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection(),tabId=documents.activeId,version=model?.getVersionId();
    if(!model||!selection||editorIsReadonly())return;
    try {
      const draft=columnCursorDraft(await navigator.clipboard.readText(),model.getEOL());
      if(draft.error)throw Error(draft.error);
      if(documents.activeId!==tabId||editor.getModel()!==model||model.isDisposed()||model.getVersionId()!==version)throw Error('The editor changed. Copy the columns and try again.');
      const start=model.getOffsetAt(selection.getStartPosition());
      editor.pushUndoStop();editor.executeEdits('column-cursors',[{range:selection,text:draft.text,forceMoveMarkers:true}]);editor.pushUndoStop();
      editor.setSelections(draft.spans.map(span=>{const a=model.getPositionAt(start+span.start),b=model.getPositionAt(start+span.end);return new monacoRef.current.Selection(a.lineNumber,a.column,b.lineNumber,b.column)}));
      editor.focus();
    } catch(error) {notifyFeedback({kind:'warning',title:'Column cursors',message:error.message||'Clipboard unavailable',scope:tabId})}
  }

export function dropSchemaInEditor(ctx, event) {
  const {
    editorIsReadonly, editorRef, metadataOriginTabId, monacoRef, schemaObjects, setFileDirty
  } = ctx;
    if(!event.dataTransfer?.types?.includes('application/x-fbsdb-schema'))return;
    event.preventDefault();event.stopPropagation();
    const editor=editorRef.current,model=editor?.getModel();
    if(!model||editorIsReadonly())return;
    let payload;try{payload=JSON.parse(event.dataTransfer.getData('application/x-fbsdb-schema'))}catch{return}
    if(payload.tabId!==metadataOriginTabId)return;
    const item=schemaObjects.find(object=>oracleSchemaKey(object)===payload.key),draft=dragSqlDraft(item,payload.column,model.getValue(),schemaObjects);
    if(!draft)return;
    const position=editor.getTargetAtClientPoint(event.clientX,event.clientY)?.position||editor.getPosition(),range=model.validateRange(editor.getSelection()?.containsPosition(position)?editor.getSelection():new monacoRef.current.Range(position.lineNumber,position.column,position.lineNumber,position.column));
    editor.pushUndoStop();editor.executeEdits('schema-drag',[{range,text:draft.text,forceMoveMarkers:true}]);editor.pushUndoStop();editor.focus();setFileDirty(true);
  }

export function attachBindDrop(ctx, editor) {
  const {
    bindPrefillRef, documents, editorIsReadonly, monacoRef
  } = ctx;
    const node = editor.getDomNode();
    if (!node || node.dataset.bindDrop) return;
    node.dataset.bindDrop = '1';
    node.addEventListener('dragover', event => { if ([...(event.dataTransfer?.types || [])].includes(cellDragType)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }, true);
    node.addEventListener('drop', event => {
      const raw = event.dataTransfer?.getData(cellDragType);
      if (!raw) return;
      event.preventDefault(); event.stopPropagation();
      const model = editor.getModel();
      if (!model || editorIsReadonly()) { notifyFeedback({ kind: 'warning', title: 'Bind placeholder', message: 'This editor is read-only.', scope: documents.activeId }); return; }
      const hit = editor.getTargetAtClientPoint(event.clientX, event.clientY), position = hit && [6, 7].includes(hit.type) && hit.position ? hit.position : editor.getPosition();
      const plan = planBindDrop(raw, getOracleBindNames(model.getValue()));
      if (!plan || !position) return;
      editor.executeEdits('result-bind-drop', [{ range: new monacoRef.current.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: plan.insertText, forceMoveMarkers: true }]);
      if (plan.prefill) bindPrefillRef.current[plan.prefill.name] = plan.prefill;
      notifyFeedback({ kind: 'success', title: 'Bind created', message: `${plan.insertText} (${plan.type}) was inserted. ${plan.prefill ? 'Its value is offered only in the next bind prompt and is not saved.' : 'No value was carried over.'}`, scope: documents.activeId });
      editor.focus();
    }, true);
  }

export function openOracleDefinition(ctx, source, selection) {
  const {
    documents, editorRef, rememberEditorPosition, rememberLocation, setObjectDefinition
  } = ctx;
    if (!['PACKAGE', 'PACKAGE BODY', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'TYPE', 'TYPE BODY'].includes(source.type)) {
      setObjectDefinition({ ...source, originTabId: source.originTabId || documents.activeId });
      return;
    }
    rememberLocation();
    const originTabId = source.originTabId, id = `definition:${originTabId}:${source.owner}:${source.type}:${source.name}`;
    rememberEditorPosition();
    const tab = { id, name: `${source.owner}.${source.name}${source.type.endsWith(" BODY") ? ".body" : ""}.sql`, path: null, content: source.text, dirty: false, readOnly: true, metadataOriginTabId: originTabId, definitionObject: { owner: source.owner, name: source.name, type: source.type }, sourceVersionNotice:source.sourceVersionNotice };
    documents.open(tab);
    setNativeTabId(originTabId);
    requestAnimationFrame(() => { const position = { lineNumber: selection?.startLineNumber || selection?.lineNumber || 1, column: selection?.startColumn || selection?.column || 1 }; editorRef.current?.setPosition(position); editorRef.current?.revealPositionInCenter(position); editorRef.current?.focus(); rememberLocation(id,position); });
  }

export async function navigateProblem(ctx, problem) {
  const {
    activateTab, closedTabsRef, completionMetadataRef, documents, editorRef, openOracleDefinition, rememberLocation, sessionsRef,
    setResultTab
  } = ctx;
    const tab = documents.tabs.find(tab => tab.id === problem.tabId);
    if (!tab) return;
    const text = problem.tabId === documents.activeId ? documents.text : tab.content;
    if(problem.source==='Oracle stack'&&problem.definition){
      const session=sessionsRef.current[problem.tabId]||{};
      if(session.connectionLost||problem.executedProfileId&&problem.executedProfileId!==session.activeConnection?.id||problem.executedConnectionGeneration!=null&&problem.executedConnectionGeneration!==(session.connectionGeneration??0)){
        notifyFeedback({kind:'warning',title:'Stack source',message:'The execution session changed. Return to its connection context before loading source.'});return;
      }
    }

    if (problem.offset != null && problem.editorSnapshot === text) {
      rememberLocation();
      if (problem.tabId !== documents.activeId) activateTab(problem.tabId);
      requestAnimationFrame(() => { const editor = editorRef.current, model = editor?.getModel(); if (!model || model.getValue() !== text) return; const position = model.getPositionAt(problem.offset); editor.setPosition(position); editor.revealPositionInCenter(position); editor.focus(); rememberLocation(problem.tabId,position); });
      return;
    }
    if (problem.definition) {
      let source = problem.definition;
      if (!source.text) {
        if(problem.source==='Oracle stack')completionMetadataRef.current.invalidate(problem.tabId,{...source});
        const epoch=completionMetadataRef.current.session(problem.tabId).epoch;
        const loaded = await completionMetadataRef.current.load(problem.tabId, { owner: source.owner, name: source.name, type: source.type.replace(/ BODY$/, ''), body: source.type.endsWith(' BODY') }, null, 'definition');
        if (!loaded||completionMetadataRef.current.session(problem.tabId).epoch!==epoch||closedTabsRef.current.has(problem.tabId)) return;
        source = { ...loaded, originTabId: problem.tabId, sourceVersionNotice:problem.source==='Oracle stack'?'Current server source retrieved after failure. The execution source version is unknown; this line may have changed.':null };
      }
      const offset = offsetAtOraclePosition(source.text, problem.oracleLine, problem.oracleColumn);
      const prefix = offset == null ? null : source.text.slice(0, offset);
      openOracleDefinition(source, prefix == null ? null : { lineNumber: prefix.split('\n').length, column: prefix.length - prefix.lastIndexOf('\n') });
      return;
    }
    if (problem.tabId !== documents.activeId) activateTab(problem.tabId);
    if (problem.source === 'Oracle') setResultTab('Output', problem.tabId);
  }

export function returnToExecution(ctx) {
  const {
    activateTab, documents, jumpToOffset, operations, rememberEditorPosition, setObjectTabActive, setRunState
  } = ctx;
    const owner=documents.active?.metadataOriginTabId||documents.activeId,context=operations.metadata.get(owner),original=documents.tabs.find(tab=>tab.id===owner);
    if(!context||!original){setRunState('No execution source is recorded for this document.');return;}
    setObjectTabActive(false);
    const offset=currentExecutionOffset(context,original);
    if(offset!=null){if(documents.activeId!==owner)activateTab(owner);requestAnimationFrame(()=>jumpToOffset(offset));return;}
    const id=`execution-snapshot:${owner}`,hasPosition=Number.isInteger(context.statementOffset),content=hasPosition?context.editorSnapshot:context.executedSql;
    if(typeof content!=='string'){setRunState('The execution source position was not recorded.');return;}
    rememberEditorPosition();documents.open({id,name:`Execution · ${context.fileName||original.name}`,content,readOnly:true,dirty:false,metadataOriginTabId:owner,sourceVersionNotice:'Recorded execution snapshot. Current editor source differs or its position is unavailable.'});setNativeTabId(owner);
    requestAnimationFrame(()=>jumpToOffset(hasPosition?context.statementOffset:0));
  }

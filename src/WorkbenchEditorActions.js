// x
import { columnCursorDraft } from "./columnMulticursor";
import { docSkeletonAt } from "./docSkeleton";
import { dragSqlDraft } from "./dragToSql";
import { currentExecutionOffset } from "./editLocations";
import { summaryHover, summaryLabel } from "./executionSummaries";
import { notifyFeedback } from "./Feedback";
import { LARGE_FILE_THRESHOLD, largeFilePolicy } from "./largeFilePolicy.js";
import { isNativeHost, sendNativeCommand, setNativeTabId } from "./nativeBridge";
import { getOracleBindNames } from "./oracleBinds";
import { completionCancellation } from "./oracleMetadataBroker";
import { oracleSchemaKey } from "./OracleObjectTree.jsx";
import { inListSql, insertTemplateSql, jsonTableSql } from "./pasteToCode";
import { offsetAtOraclePosition } from "./plsqlDiagnostics";
import { extractCteSnippet } from "./postfixCompletion";
import { projectOptions } from "./projectRules";
import { cellDragType, planBindDrop } from "./resultBindDrop.js";
import { resolveSetting } from "./settingsModel";
import { sqlFormatterStyle } from "./sqlFormatterSettings.js";
import { getSqlStatements } from "./sqlStatements.js";
import { planStatementMove } from "./statementMove";
import { surroundOptions, surroundSnippet } from "./surroundWith";
import { pathKey } from "./workspaceTree";

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

export function applySurround(ctx, action, context) {
  const {
    applyPasteAs, documents, editorRef
  } = ctx;
    if(action.startsWith('paste:'))return applyPasteAs(action,context);
    const editor=editorRef.current,model=context.model,id=action.replace(/^surround:/,'');
    if(documents.activeId!==context.tabId||editor.getModel()!==model||model.isDisposed()||model.getVersionId()!==context.version)throw Error('The editor changed. Choose Surround with again.');
    const modelOptions=model.getOptions(),indent=modelOptions.insertSpaces?' '.repeat(modelOptions.indentSize||modelOptions.tabSize||2):'	';
    editor.setSelection(context.selection);editor.focus();
    editor.getContribution('snippetController2').insert(surroundSnippet(id,model.getValueInRange(context.selection),{indent,newline:model.getEOL()}),{adjustWhitespace:false,undoStopBefore:true,undoStopAfter:true});
  }

export function openSurroundMenu(ctx, x, y, trigger) {
  const {
    activeTabReadonly, documents, editorRef, monacoRef, setSurroundMenu
  } = ctx;
    const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection();
    if(!model||activeTabReadonly)return;
    if(!selection||selection.isEmpty()){notifyFeedback({kind:'warning',title:'Surround with',message:'Select the code to wrap.',scope:documents.activeId});return}
    const lines=new monacoRef.current.Range(selection.startLineNumber,1,selection.endColumn===1&&selection.endLineNumber>selection.startLineNumber?selection.endLineNumber-1:selection.endLineNumber,Number.MAX_SAFE_INTEGER),range=model.validateRange(lines),options=surroundOptions(model.getValueInRange(range));
    if(!options.length)return;
    setSurroundMenu({tabId:documents.activeId,model,version:model.getVersionId(),selection:range,trigger,x,y,options});
  }

export async function applyPasteAs(ctx, action, context) {
  const {
    documents, editorRef
  } = ctx;
    const editor=editorRef.current,model=context.model;
    const text=await navigator.clipboard.readText();
    if(documents.activeId!==context.tabId||editor.getModel()!==model||model.isDisposed()||model.getVersionId()!==context.version)throw Error('The editor changed. Choose Paste as again.');
    const result=action==='paste:in'?inListSql(text):action==='paste:json'?jsonTableSql(text):insertTemplateSql(text);
    if(result.error)throw Error(result.error);
    const sqlText=result.sql.replace(/\n/g,model.getEOL());
    editor.setSelection(context.selection);editor.focus();editor.pushUndoStop();editor.executeEdits('paste-as',[{range:context.selection,text:sqlText,forceMoveMarkers:true}]);editor.pushUndoStop();
  }

export function applyExtractProcedure(ctx, plan) {
  const {
    documents, editorRef, extractProcedure, monacoRef, setExtractProcedure
  } = ctx;
    const editor=editorRef.current,request=extractProcedure,model=request?.model;
    if(!plan?.edits?.length||!model||model.isDisposed()||documents.activeId!==request.tabId||editor.getModel()!==model||model.getVersionId()!==request.version||model.getValue()!==request.source)throw Error('The editor changed after the preview. Reopen Extract Procedure.');
    editor.pushUndoStop();editor.executeEdits('extract-procedure',plan.edits.map(edit=>{const from=model.getPositionAt(edit.start),to=model.getPositionAt(edit.end);return {range:new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column),text:edit.after}}));editor.pushUndoStop();setExtractProcedure(null);editor.focus();
  }

export function applyChangeSignature(ctx, plan) {
  const {
    changeSignature, documents, editorRef, monacoRef, setChangeSignature
  } = ctx;
    const editor=editorRef.current,request=changeSignature,model=request?.model;
    if(!plan?.edits?.length||!model||model.isDisposed()||documents.activeId!==request.tabId||editor.getModel()!==model||model.getVersionId()!==request.version||model.getValue()!==request.source)throw Error('The editor changed after the preview. Reopen Change Signature.');
    editor.pushUndoStop();editor.executeEdits('change-signature',plan.edits.map(edit=>{const from=model.getPositionAt(edit.start),to=model.getPositionAt(edit.end);return {range:new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column),text:edit.after}}));editor.pushUndoStop();setChangeSignature(null);editor.focus();
  }

export function moveStatement(ctx, direction) {
  const {
    documents, editorIsReadonly, editorRef, monacoRef
  } = ctx;
    const editor=editorRef.current,model=editor?.getModel(),position=editor?.getPosition();if(!model||!position||editorIsReadonly())return;
    const plan=planStatementMove(model.getValue(),model.getOffsetAt(position),direction);
    if(plan.error){notifyFeedback({kind:'warning',title:'Move statement',message:plan.error,scope:documents.activeId});return false}
    const from=model.getPositionAt(plan.edit.start),to=model.getPositionAt(plan.edit.end);
    editor.pushUndoStop();editor.executeEdits('move-statement',[{range:new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column),text:plan.edit.after}]);editor.pushUndoStop();editor.focus();
    return true;
  }

export function applyEmbeddedSql(ctx, plan) {
  const {
    documents, editorRef, embeddedSql, monacoRef, setEmbeddedSql
  } = ctx;
    const editor=editorRef.current,request=embeddedSql,model=request?.model;
    if(!plan?.edit||!model||model.isDisposed()||documents.activeId!==request.tabId||editor.getModel()!==model||model.getVersionId()!==request.version||model.getValue()!==request.source)throw Error('The editor changed after the preview. Reopen embedded SQL.');
    const edit=plan.edit,from=model.getPositionAt(edit.start),to=model.getPositionAt(edit.end);
    editor.pushUndoStop();editor.executeEdits('embedded-sql',[{range:new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column),text:edit.after}]);editor.pushUndoStop();setEmbeddedSql(null);editor.focus();
  }

export function applyQuickFix(ctx, fix) {
  const {
    documents, editorRef, monacoRef, quickFix, setQuickFix
  } = ctx;
    const editor=editorRef.current,request=quickFix,model=request?.model;
    if(!fix?.edits?.length||!model||model.isDisposed()||documents.activeId!==request.tabId||editor.getModel()!==model||model.getVersionId()!==request.version||model.getValue()!==request.source)throw Error('The editor changed after the preview. Reopen Quick fixes.');
    editor.pushUndoStop();editor.executeEdits('quick-fix',fix.edits.map(edit=>{const from=model.getPositionAt(edit.start),to=model.getPositionAt(edit.end);return {range:new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column),text:edit.text}}));editor.pushUndoStop();setQuickFix(null);editor.focus();
  }

export function applyIdentifierCase(ctx, plan) {
  const {
    documents, editorRef, identifierCase, monacoRef, setIdentifierCase
  } = ctx;
    const editor=editorRef.current,request=identifierCase,model=request?.model;
    if(!model||model.isDisposed()||documents.activeId!==request.tabId||editor.getModel()!==model||model.getVersionId()!==request.version)throw Error('The editor changed after the preview. Close and convert again.');
    editor.pushUndoStop();
    editor.executeEdits('identifier-case',plan.edits.map(edit=>{const from=model.getPositionAt(edit.start),to=model.getPositionAt(edit.end);return {range:new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column),text:edit.text}}));
    editor.pushUndoStop();setIdentifierCase(null);editor.focus();
  }

export function openIdentifierCase(ctx) {
  const {
    activeTabReadonly, documents, editorRef, setIdentifierCase, workspace
  } = ctx;
    const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection();
    if(!model||activeTabReadonly)return;
    if(!selection||selection.isEmpty()){notifyFeedback({kind:'warning',title:'Convert identifier case',message:'Select the identifiers to convert.',scope:documents.activeId});return}
    setIdentifierCase({tabId:documents.activeId,model,version:model.getVersionId(),source:model.getValue(),range:{start:model.getOffsetAt(selection.getStartPosition()),end:model.getOffsetAt(selection.getEndPosition())},dictionary:workspace.root?projectOptions(workspace.projectRules).dictionary:null});
  }

export function applyLocalRename(ctx, plan) {
  const {
    documents, editorRef, localRename, monacoRef, setLocalRename
  } = ctx;
    const editor=editorRef.current,request=localRename,model=request?.model;
    if(!plan?.edits?.length||!model||model.isDisposed()||documents.activeId!==request.tabId||editor.getModel()!==model||model.getVersionId()!==request.version)throw Error('The editor changed after the preview. Close and rename again.');
    editor.pushUndoStop();editor.executeEdits('rename-local',plan.edits.map(edit=>{const from=model.getPositionAt(edit.start),to=model.getPositionAt(edit.end);return {range:new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column),text:edit.after}}));editor.pushUndoStop();setLocalRename(null);editor.focus();
  }

export function generateDocComment(ctx) {
  const {
    activeTabReadonly, documents, editorRef
  } = ctx;
    const editor=editorRef.current,model=editor?.getModel(),position=editor?.getPosition();
    if(!model||!position||activeTabReadonly)return;
    const result=docSkeletonAt(model.getValue(),model.getOffsetAt(position));
    if(result.error){notifyFeedback({kind:'warning',title:'Documentation comment',message:result.error,scope:documents.activeId});return}
    const at=model.getPositionAt(result.insertAt);
    editor.setPosition(at);editor.focus();
    editor.getContribution('snippetController2').insert(result.snippet.replace(/\r?\n/g,model.getEOL()),{adjustWhitespace:false,undoStopBefore:true,undoStopAfter:true});
  }

export function flashExecutionTarget(ctx, target) {
  const {
    documents, editorRef, executionFlashRef, executionFlashTimerRef, updateTabSession
  } = ctx;
    const editor=editorRef.current,model=editor?.getModel();
    if(!model||target?.start==null||target?.end==null)return;
    clearTimeout(executionFlashTimerRef.current);executionFlashRef.current?.clear();
    const start=model.getPositionAt(target.start),end=model.getPositionAt(target.end);
    const decorations=editor.createDecorationsCollection([{range:{startLineNumber:start.lineNumber,startColumn:start.column,endLineNumber:end.lineNumber,endColumn:end.column},options:{className:'sql-execution-target',isWholeLine:false,description:'SQL execution target'}}]);
    executionFlashRef.current=decorations;
    executionFlashTimerRef.current=setTimeout(()=>decorations.clear(),1600);
    updateTabSession('executionTarget',`${target.kind} · Ln ${start.lineNumber}–${end.lineNumber}`,documents.activeId);
  }

export function openBookmark(ctx, mark) {
  const {
    activateTab, bookmarkCursorRef, documents, editorRef, pendingSearchPositionRef, setObjectTabActive, setRunState
  } = ctx;
    bookmarkCursorRef.current=mark.id;setObjectTabActive(false);
    const tab=documents.tabs.find(tab=>tab.id===mark.documentId)||documents.tabs.find(tab=>mark.path&&pathKey(tab.path)===pathKey(mark.path));
    if(tab){if(documents.activeId!==tab.id)activateTab(tab.id);requestAnimationFrame(()=>{const editor=editorRef.current,position=editor?.getModel()?.validatePosition(mark);if(position){editor.setPosition(position);editor.revealPositionInCenter(position);editor.focus()}});return;}
    if(mark.path&&isNativeHost){pendingSearchPositionRef.current={path:mark.path,lineNumber:mark.lineNumber,column:mark.column};sendNativeCommand('file.openPath',{path:mark.path});return;}
    setRunState('This session-only bookmark source is no longer open.');
  }

export function showProjectionSource(ctx, columnIndex, reveal) {
  const {
    documents, editorRef, monacoRef, projectionDecorations, projectionMapping
  } = ctx;
    const editor=editorRef.current,model=editor?.getModel(),range=projectionMapping?.[columnIndex];
    projectionDecorations.current?.clear();
    if(!editor||!model||!range){if(reveal)notifyFeedback({kind:'warning',title:'Source expression',message:projectionMapping?'This column comes from * or an unmatched projection.':'The editor changed since this execution, so result columns are not linked to the SQL.',scope:documents.activeId});return}
    const from=model.getPositionAt(range.start),to=model.getPositionAt(range.end),monacoRange=new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column);
    projectionDecorations.current=editor.createDecorationsCollection([{range:monacoRange,options:{inlineClassName:'projection-source-highlight'}}]);
    if(reveal){editor.setSelection(monacoRange);editor.revealRangeInCenterIfOutsideViewport(monacoRange);editor.focus()}
  }

export function navigateHistory(ctx, direction) {
  const {
    activateTab, documents, editorRef, navigatingRef, navigationHistoryRef, rememberLocation
  } = ctx;
    if(direction<0&&navigationHistoryRef.current.index===navigationHistoryRef.current.items.length-1)rememberLocation();
    const location=navigationHistoryRef.current.move(direction,item=>documents.tabs.some(tab=>tab.id===item.tabId));if(!location)return;
    navigatingRef.current=true;
    if(location.tabId!==documents.activeId)activateTab(location.tabId);
    requestAnimationFrame(()=>{editorRef.current?.setPosition(location);editorRef.current?.revealPositionInCenter(location);editorRef.current?.focus();navigatingRef.current=false});
  }

export function navigateEdit(ctx, direction) {
  const {
    activateTab, documents, editLocationsRef, editorRef, jumpToOffset, setObjectTabActive, setRunState
  } = ctx;
    const history=editLocationsRef.current,available=item=>documents.tabs.some(tab=>tab.id===item.tabId);
    const item=direction==='last'?history.last(available):history.move(direction,available);
    if(!item){setRunState('No further edit location is available.');return;}
    setObjectTabActive(false);if(documents.activeId!==item.tabId)activateTab(item.tabId);
    requestAnimationFrame(()=>jumpToOffset(Math.min(item.offset,editorRef.current?.getModel()?.getValueLength()||0)));
  }

export function openExtractProcedure(ctx) {
  const {
    documents, editorIsReadonly, editorRef, setExtractProcedure
  } = ctx;
    const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection();
    if(!model||!selection||selection.isEmpty()||editorIsReadonly()){notifyFeedback({kind:'warning',title:'Extract Procedure',message:'Select complete PL/SQL assignment statements first.',scope:documents.activeId});return}
    setExtractProcedure({tabId:documents.activeId,model,version:model.getVersionId(),source:model.getValue(),start:model.getOffsetAt(selection.getStartPosition()),end:model.getOffsetAt(selection.getEndPosition())});
  }

export function openStructuralSearch(ctx) {
  const {
    documents, editorRef, setStructuralSearch, workspace
  } = ctx; const editor = editorRef.current, model = editor?.getModel(), selection = editor?.getSelection(), position = editor?.getPosition(); const selected = model && selection && !selection.isEmpty() ? model.getValueInRange(selection).trim() : ''; const initialName = /^[\w$#".]{1,128}$/.test(selected) ? selected : model && position ? model.getWordAtPosition(position)?.word || '' : ''; setStructuralSearch({ root: isNativeHost ? workspace.root || null : null, document: { ...documents.active, content: documents.text }, initialName }); }

export function learnSqlUsage(ctx, source) {
  const {
    completionClientRef, completionSettingsRef, learningEpochRef, publishLearning, suggestionLearningRef, suggestionScope
  } = ctx;
    if (source.length>=LARGE_FILE_THRESHOLD || !completionSettingsRef.current.learning || !completionClientRef.current) return;
    const scope = suggestionScope(), epoch = learningEpochRef.current;
    completionClientRef.current.request('learn', source, 0).then(result => {
      if (!completionSettingsRef.current.learning || epoch !== learningEpochRef.current) return;
      suggestionLearningRef.current.observe(scope, result.observations || []); publishLearning();
    });
  }

export function queueSchemaForSql(ctx, text) {
  const {
    completionClientRef, completionMetadataRef, documents, editorRef, largeFileOverridesRef, schemaReadyRef, schemaWarmupRef, sessionsRef
  } = ctx;
    if (schemaWarmupRef.current) { clearTimeout(schemaWarmupRef.current.timer); schemaWarmupRef.current.cancel(); }
    if (!largeFilePolicy(text,largeFileOverridesRef.current[documents.activeId]).completion || !isNativeHost || !schemaReadyRef.current || (sessionsRef.current[documents.activeId]?.executing||sessionsRef.current[documents.activeId]?.scriptRun?.running)) return;
    const owner = documents.activeId, cancellation = completionCancellation();
    const timer = setTimeout(async () => {
      const client = completionClientRef.current;
      if (!client || owner !== documents.activeId || text !== documents.text || cancellation.token.isCancellationRequested) return;
      const model = editorRef.current?.getModel(), position = editorRef.current?.getPosition(), revision = client.revision;
      const analysis = await client.request('analyze', text, model && position ? model.getOffsetAt(position) : text.length, cancellation.token, { mode: 'complete' });
      if (revision !== client.revision || owner !== documents.activeId || cancellation.token.isCancellationRequested) return;
      await Promise.all((analysis.targets || []).map(target => completionMetadataRef.current.load(owner, target, cancellation.token)));
      if (revision === client.revision && owner === documents.activeId && !cancellation.token.isCancellationRequested) client.metadata(completionMetadataRef.current.objects(owner), completionMetadataRef.current.systemObjects(owner), completionMetadataRef.current.version(owner));
    }, 200);
    schemaWarmupRef.current = { ...cancellation, timer };
  }

export function requestSchemaDetails(ctx, item, originTabId, force) {
  const {
    schemaLoadedRef, schemaRequestedRef
  } = ctx; const key = oracleSchemaKey(item).toLowerCase(); if(force){schemaLoadedRef.current.delete(key);schemaRequestedRef.current.delete(key)} if (!isNativeHost || schemaLoadedRef.current.has(key) || schemaRequestedRef.current.has(key)) return; schemaRequestedRef.current.add(key); sendNativeCommand("schema.objectDetails", { tabId:originTabId, owner: item.owner, name: item.name, objectType: item.type }); }

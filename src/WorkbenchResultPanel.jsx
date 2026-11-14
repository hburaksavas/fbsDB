// The result panel under the editor: results, problems and output tabs. App calls this inside its return; see docs/architecture.md.
import { ActionableState } from "./ActionableState";
import { ResultSourceProvenance } from "./ExecutionContextBadges";
import { ExplainPlanView } from "./lazyViews.js";
import { sendNativeCommand } from "./nativeBridge";
import { ProblemsPanel } from "./ProblemsPanel";
import { estimateResultMemory } from "./resultWorkbench";
import { resolveSetting } from "./settingsModel";
import { SqlResultsView } from "./SqlResultsView.jsx";
import { StackTraceLinks } from "./StackTraceLinks";
import { Activity, BookOpen, ChevronDown, CircleHelp, Table2, Terminal } from "lucide-react";
import { Suspense } from "react";

export function renderResultPanel(ctx) {
  const {
    activeEditorTab, activeProblems, activeTabId, allProblems, applyServerFilters, bottomCollapsed, cancelQuery, cancelling,
    currentAppearanceKey, definition, documents, editorConnection, editorRef, executeStatement, executing, executionKind, explainMessage,
    explainQuery, explainResult, exportChosenColumns, exportResultsInsertSql, fetchMoreResults, fetchingPage, insertEditorText, language,
    linkedProjectionColumn, maxRows, maximizedPanel, navigateProblem, openChildRecords, openRelatedRecords, operations, pageError,
    pageRequestRef, panelMessage, pinCurrentResult, queryResult, region, releaseResult, requestPrimaryKey, resultFilter,
    resultLiveAppearance, resultRenderMeasured, resultSetSearch, resultTab, runQueryRef, runState, sessionConnected, setDefinition,
    setFocusMode, setNewResultName, setPaletteMode, setRenameResult, setResultFilter, setResultLiveAppearance, setResultSetSearch,
    setResultTab, setShowPicker, settings, showProjectionSource, showSmartObject, sourceDefinitionRequestRef, sql, sqlResult,
    streamResultToFile, tabSession, togglePanelMaximized, transactionPending, updateLayout, updateTabResult, view
  } = ctx;
  return <section className="result-panel" data-collapsed={bottomCollapsed}>
        <div className="result-header" onDoubleClick={event=>{if(!event.target.closest('button,input,select'))togglePanelMaximized('results')}}><button className="icon-button panel-maximize" aria-label={maximizedPanel==='results'?'Restore results panel':'Maximize results panel'} aria-pressed={maximizedPanel==='results'} title="Temporarily maximize results (Escape restores)" onClick={()=>togglePanelMaximized('results')}>{maximizedPanel==='results'?'↙':'↗'}</button><div className="result-tabs">
          <button className={resultTab === "Results" ? "active" : ""} onClick={() => { updateLayout(current => ({ ...current, resultsCollapsed: false })); setFocusMode(false); setResultTab("Results"); }}><Table2 size={14} /> Results{queryResult && <span className="result-tab-count">{queryResult.returnedRows ?? queryResult.rowsAffected ?? ""}</span>}</button>
          <button className={resultTab === "Output" ? "active" : ""} onClick={() => { updateLayout(current => ({ ...current, resultsCollapsed: false })); setFocusMode(false); setResultTab("Output"); }}><Terminal size={14} /> Output</button>
          <button className={resultTab === "Problems" ? "active" : ""} onClick={() => { updateLayout(current => ({ ...current, resultsCollapsed: false })); setFocusMode(false); setResultTab("Problems"); }} title="SQL and PL/SQL problems (F8 / Shift+F8)"><CircleHelp size={14} /> Problems{activeProblems.length > 0 && <span className="result-tab-count">{activeProblems.length}</span>}</button>
          <button className={resultTab === "Explain" ? "active" : ""} onClick={() => { updateLayout(current => ({ ...current, resultsCollapsed: false })); setFocusMode(false); setResultTab("Explain"); }} title="View the last execution plan"><Activity size={14} /> Explain plan</button>
        </div><button className="icon-button result-panel-collapse" aria-label={bottomCollapsed ? "Restore bottom panel" : "Minimize bottom panel"} title={bottomCollapsed ? "Restore bottom panel" : "Minimize bottom panel"} onClick={() => { setFocusMode(false); updateLayout(current => ({ ...current, resultsCollapsed: !bottomCollapsed })); }}><ChevronDown size={14} style={{ transform: bottomCollapsed ? "rotate(180deg)" : undefined }}/></button></div>
        {resultTab === "Results" && <div className="result-set-tabs">
          <input aria-label="Search result sets" placeholder="Search results" value={resultSetSearch} onChange={event => setResultSetSearch(event.target.value)} />
          <button title="Double-click to rename latest result" onDoubleClick={() => { setRenameResult("latest"); setNewResultName(view.latestResultName || "Latest"); }} className={!view.selectedResultKey ? "active" : ""} onClick={() => updateTabResult("selectedResultKey", null)}>{view.latestResultName || "Latest"}</button>
          {(view.resultSets || []).filter(item => item.pinned && (item.label + " " + (item.result.executedSql || "")).toLowerCase().includes(resultSetSearch.toLowerCase())).map(item => <div key={item.key} className={view.selectedResultKey === item.key ? "active" : ""}>
            <button title={item.result.executedSql + " · Double-click to rename"} onDoubleClick={() => { setRenameResult(item.key); setNewResultName(item.label); }} onClick={() => updateTabResult("selectedResultKey", item.key)}>{item.pinned ? "◆ " : ""}{item.label}</button>
            <button aria-label="Close result set" onClick={() => { if (item.result.resultId && item.result.resultId !== view.queryResult?.resultId && !(view.resultSets || []).some(other => other.key !== item.key && other.result.resultId === item.result.resultId)) sendNativeCommand("sql.closeResult", { resultId: item.result.resultId }); updateTabResult("resultSets", sets => sets.filter(value => value.key !== item.key)); if (view.selectedResultKey === item.key) updateTabResult("selectedResultKey", null); }}>×</button>
          </div>)}
        </div>}
        {['Results','Output'].includes(resultTab)&&<StackTraceLinks items={tabSession.runtimeProblems} onNavigate={navigateProblem}/>}
        {['Results','Output'].includes(resultTab)&&<ResultSourceProvenance result={resultTab==='Output'?view.outputProvenance:queryResult} document={activeEditorTab||{}} connection={editorConnection} context={tabSession.sessionContext}/>}
        {resultTab === "Problems" ? <ProblemsPanel onReturnToEditor={()=>editorRef.current?.focus()} items={allProblems} activeTabId={activeTabId} onNavigate={navigateProblem} /> : resultTab === "Explain" ? <Suspense fallback={<div role="status">Loading…</div>}><ExplainPlanView result={explainResult} loading={executing && executionKind === "explain"} error={explainMessage} mode={view.planPresentation || "diagram"} onModeChange={mode => updateTabResult("planPresentation", mode, activeTabId)} /></Suspense> : resultTab === "Results"
          ? <SqlResultsView transactionOpen={transactionPending}
                actions={{
                  onFindObject: ()=>setPaletteMode('files'),
                  onRun: ()=>runQueryRef.current?.(),
                  onAppearanceApplied: sequence=>setResultLiveAppearance(current=>current?.sequence===sequence?null:current),
                  onSelectionSummary: summary=>updateTabResult('selectionSummary',summary,activeTabId),
                  onExportInsert: exportResultsInsertSql,
                  onSmartObject: showSmartObject,
                  onColumnSource: showProjectionSource,
                  onCloseSourceDefinition: () => { const owner = documents.activeId, requestId = sourceDefinitionRequestRef.current.get(owner); if (requestId) operations.owners.delete(requestId); sourceDefinitionRequestRef.current.delete(owner); setDefinition(null); },
                  onReleaseResult: releaseResult,
                  onPin: pinCurrentResult,
                  onExplain: explainQuery,
                  onViewStateChange: state => { if (resultTab === "Results" && view.selectedResultKey) updateTabResult("resultSets", sets => (sets || []).map(item => item.key === view.selectedResultKey ? { ...item, view: state } : item), activeTabId); else updateTabResult(resultTab === "Explain" ? "planView" : "queryView", state, activeTabId); },
                  onMetadata: metadata => { const url = URL.createObjectURL(new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" })), link = document.createElement("a"); link.href = url; link.download = "result-metadata.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); },
                  onGenerateSql: sql => sendNativeCommand("result.openSql", { sql }),
                  onSourceDefinition: column => { const owner = documents.activeId; setDefinition(null); const requestId = sendNativeCommand("result.columnDefinition", { column, tabId: owner }); if (requestId) { sourceDefinitionRequestRef.current.set(owner, requestId); operations.owners.set(requestId, owner); } },
                  onUpdateDraft: (columns, rows) => sendNativeCommand("result.updateDraft", { columns, rows }),
                  onConnect: ()=>setShowPicker(true),
                  onEdit: ()=>editorRef.current?.focus(),
                  onClearServerFilter: ()=>{const base=queryResult?.serverFilter;if(base&&!executing&&!fetchingPage&&!view.streamState?.busy)executeStatement(base.sql,base.parameters);},
                  onServerFilter: applyServerFilters,
                  onExportColumns: exportChosenColumns,
                  onLookup: requestPrimaryKey,
                  onClearFilter: () => setResultFilter(""),
                  onChildren: openChildRecords,
                  onSql: insertEditorText,
                  onRelated: openRelatedRecords,
                  onStreamExport: streamResultToFile,
                  onCancelExport: () => sendNativeCommand("result.cancelExport",{tabId:activeTabId}),
                  onResultRendered: resultRenderMeasured,
                  onCancel: ()=>cancelQuery(activeTabId,tabSession.scriptRun?.running||fetchingPage?undefined:tabSession.queryRequestId),
                  onFetchMore: resultTab === "Explain" ? undefined : fetchMoreResults
                }} runShortcut={resolveSetting(settings,'editor.shortcuts').value.run}
              liveAppearance={resultTab==='Results'&&resultLiveAppearance?.key===currentAppearanceKey?resultLiveAppearance:null}
              budget={{maxRows:resolveSetting(settings,'results.budgetRows').value,maxMemoryMb:resolveSetting(settings,'results.budgetMemoryMb').value,action:resolveSetting(settings,'results.budgetAction').value}} linkedColumn={linkedProjectionColumn}
              sourceDefinition={definition?.tabId === activeTabId ? definition : null}
              memoryItems={[{ key: "latest", label: view.latestResultName || "Latest", result: view.queryResult }, ...(view.resultSets || []).filter(item => item.pinned)].filter(item => item.result).map(item => ({ ...item, memoryKB: Math.round(estimateResultMemory(item.result) / 1024) }))}
              key={`${activeTabId}:${resultTab}:${view.selectedResultKey || "latest"}:${sqlResult?.viewIdentity||sqlResult?.resultId||"empty"}`}
              initialView={(resultTab === "Results" && view.selectedResultKey ? view.resultSets?.find(item => item.key === view.selectedResultKey)?.view : view[resultTab === "Explain" ? "planView" : "queryView"]) || {}}
              connected={sessionConnected} streamState={view.streamState}
              result={sqlResult} region={region} language={language} editorSql={sql} runState={runState} executing={executing && (resultTab === "Explain" ? executionKind === "explain" : executionKind !== "explain")}
              startedAt={tabSession.operationStartedAt} outcome={!view.selectedResultKey?tabSession.queryOutcome:null}
              cancelling={cancelling} filter={resultTab === "Explain" ? "" : resultFilter} pageSize={maxRows}
              fetching={resultTab === "Results" && fetchingPage && pageRequestRef.current?.owner === activeTabId}
              pageError={resultTab === "Results" ? pageError : ""}
            />
          : /ORA-\d+/i.test(panelMessage||'') ? <ActionableState className="output-empty" title={/ORA-0*1031\b/i.test(panelMessage)?'Oracle access denied':/ORA-0*942\b/i.test(panelMessage)?'Oracle object missing or inaccessible':'Oracle execution error'} detail={panelMessage} action={/ORA-0*1031\b/i.test(panelMessage)?'Choose another profile':'Return to SQL'} onAction={()=>/ORA-0*1031\b/i.test(panelMessage)?setShowPicker(true):editorRef.current?.focus()}/>: <div className="output-empty"><div className="output-icon"><BookOpen size={18}/></div><b>{panelMessage?'DBMS_OUTPUT':'No output messages'}</b><span>{panelMessage||'DBMS_OUTPUT and execution notices appear here.'}</span></div>}
      </section>;
}

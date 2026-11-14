// Result area of a SQL tab: toolbar, grid, status and the empty, running and failed states.
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Feedback, notifyFeedback } from './Feedback';
import { ResultIdle, ResultNotice, ResultFailure, ResultRunning } from './ResultStatus.jsx';
import { loadTemplateAliases, queryTemplateFingerprint, saveTemplateAlias } from './columnAliases';
import { idleGuidance, noRowsGuidance } from './emptyGuidance';
import { ResultScope } from './ResultScope.jsx';
import { nextColumnSort } from './resultColumnActions';
import { ResultToolbar } from './ResultToolbar';
import { PivotOptionsPanel, TransposePivotInspector } from './PivotPopover';
import { deriveResultData } from './resultWorkbench';
import { ResultsPresentation } from "./ResultExtensions";
import { applyResultFeatures } from "./resultFeatures";
import { getVisibleResultRows, moveResultRow } from "./resultRows";
import { buildResultDisplay, displayedColumnIndices, resultViewMode, updateResultViewOptions } from "./resultPresentationData";
import { estimateResultBytes, evaluateBudget } from './executionBudgets';
import { translate as t } from './localeProfile';
import { draftStoreKey } from "./draftStore.js";
import { HeldDraftsNotice } from './HeldDraftsNotice';
import { getNativeTabId } from "./nativeBridge";
import { liveResultAppearance } from './resultLiveAppearance';
import { Check, ChevronRight } from "lucide-react";
import { ResultValueDialog } from './lazyViews.js';

function ResultRenderMeasurement({result,onMeasured}){
  const callback=useRef(onMeasured);callback.current=onMeasured;const measured=useRef(new Set());
  useLayoutEffect(()=>{
    const timing=result?.clientTiming,requestId=result?.renderRequestId;
    if(!timing?.startedAtPerf||!timing?.responseAtPerf||!requestId||measured.current.has(requestId)||!result?.columns?.length)return;
    let second=0;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{measured.current.add(requestId);const paintedAt=performance.now();callback.current?.({requestId,renderMs:paintedAt-timing.responseAtPerf,totalMs:paintedAt-timing.startedAtPerf})})});
    return()=>{cancelAnimationFrame(first);if(second)cancelAnimationFrame(second)};
  },[result?.renderRequestId,result?.clientTiming?.responseAtPerf,result?.columns?.length]);
  return null;
}

export function SqlResultsView({ actions = {}, runShortcut, result, editorSql, runState, executing, cancelling, outcome, startedAt, filter = "", pageSize = 1000, region, language='en', fetching = false, pageError = "", initialView = {}, streamState, connected, transactionOpen, sourceDefinition, memoryItems=[], liveAppearance, linkedColumn, budget }) {
  const { onRun, onFindObject, onCancel, onFetchMore, onViewStateChange, onResultRendered, onSql, onRelated, onStreamExport, onCancelExport, onServerFilter, onClearServerFilter, onConnect, onEdit, onExportColumns, onLookup, onClearFilter, onChildren, onSourceDefinition, onCloseSourceDefinition, onUpdateDraft, onGenerateSql, onMetadata, onPin, onExplain, onReleaseResult, onExportInsert, onAppearanceApplied, onSelectionSummary, onSmartObject, onColumnSource } = actions;
  const [page, setPage] = useState(initialView.page || 0), [requestedPage, setRequestedPage] = useState(null);
  const [sortColumn, setSortColumn] = useState(initialView.sortColumn ?? -1);
  const [sortDirection, setSortDirection] = useState(initialView.sortDirection || "asc");
  const [rowOrder, setRowOrder] = useState(initialView.rowOrder || []);
  const [options, setOptions] = useState(initialView.options || {}), [hasSelection,setHasSelection]=useState(false),[editState,setEditState]=useState({available:false,on:false,descriptions:false}),[selectedColumn,setSelectedColumn]=useState(null),[layouts,setLayouts]=useState(initialView.layouts||{}), [gridCommand, setGridCommand] = useState(null), [loadingAll, setLoadingAll] = useState(false),[resetGeneration,setResetGeneration]=useState(0),[pivotPanelOpen,setPivotPanelOpen]=useState(false);
  useEffect(()=>{if(!liveAppearance)return;setOptions(current=>liveResultAppearance(current,liveAppearance.patch));onAppearanceApplied?.(liveAppearance.sequence)},[liveAppearance?.sequence]);
  useEffect(() => { if (!pivotPanelOpen) return; const closeOnEscape = event => { if (event.key !== 'Escape' || document.querySelector('.result-hover-popover-anchor, .modal-backdrop')) return; event.preventDefault(); event.stopPropagation(); setPivotPanelOpen(false); document.querySelector('.results-toolbar button[aria-label="Pivot options"]')?.focus(); }; document.addEventListener('keydown', closeOnEscape, true); return () => document.removeEventListener('keydown', closeOnEscape, true); }, [pivotPanelOpen]);
  const openTools=(section='Overview')=>{if(section==='Commands'){window.dispatchEvent(new Event('fbsdb.result.openCommands'));return;}window.dispatchEvent(new CustomEvent('fbsdb.result.openPopover',{detail:{id:section}}));};
  const selectionSummaryCallback=useRef(onSelectionSummary);selectionSummaryCallback.current=onSelectionSummary;
  const [copySelection,setCopySelection]=useState(null);
  const columnSourceRef=useRef(onColumnSource);columnSourceRef.current=onColumnSource;
  const handleSelectionChange=useCallback((hasSelectedCells,columnIndex,summary)=>{setHasSelection(hasSelectedCells);columnSourceRef.current?.(hasSelectedCells?columnIndex:null,false);setCopySelection(summary);setSelectedColumn(hasSelectedCells?columnIndex:null);selectionSummaryCallback.current?.(summary)},[]);
  const command = action => { if(action.type==='cancelExport')onCancelExport?.();else if(action.type==='goTo'){ const index=action.kind==='column'?-1:visibleRows.findIndex(item=>item.index+1===Number(action.target)); if(index>=0)setPage(Math.floor(index/pageSize)); setGridCommand({...action,seq:Date.now()}); }else setGridCommand({...action,seq:Date.now()}); };
  const resetResultView=()=>{setOptions(structuredClone(result?.defaultOptions||{}));setSortColumn(-1);setSortDirection("asc");setRowOrder([]);setPage(0);setRequestedPage(null);setLayouts({});onClearFilter?.();setResetGeneration(value=>value+1)};
  const handledResetGeneration=useRef(0);
  useEffect(()=>{if(resetGeneration>handledResetGeneration.current){handledResetGeneration.current=resetGeneration;command({type:"resetView"})}},[resetGeneration]);
  const budgetNotified = useRef('');
  useEffect(()=>{
    if(!loadingAll||fetching)return;
    if(result?.hasMore&&!pageError){
      const verdict=budget?evaluateBudget({rows:result.rows.length,bytes:estimateResultBytes(result.rows,result.columns?.length)},budget):{exceeded:null,stop:false,message:''};
      if(verdict.exceeded&&budgetNotified.current!==`${result.resultId}:${verdict.exceeded}`){budgetNotified.current=`${result.resultId}:${verdict.exceeded}`;notifyFeedback({kind:'warning',title:'Result budget',message:verdict.message,scope:result.executedTabId||null})}
      if(verdict.stop){setLoadingAll(false);return}
      onFetchMore?.();
    }else setLoadingAll(false);
  },[loadingAll,fetching,result?.rows?.length,result?.hasMore,pageError]);
  const [previewCell, setPreviewCell] = useState(null);
  useEffect(()=>{const loaded=event=>{const {lobId,value}=event.detail||{};if(lobId)setPreviewCell(cell=>cell?.value?.kind==='lob'&&cell.value.lobId===lobId?{...cell,value}:cell)};window.addEventListener('fbsdb.result.lobLoaded',loaded);return()=>window.removeEventListener('fbsdb.result.lobLoaded',loaded)},[]);
  const aliasTemplate=useMemo(()=>queryTemplateFingerprint(result?.executedSql),[result?.executedSql]);
  const [columnAliases,setColumnAliases]=useState(()=>loadTemplateAliases(globalThis.localStorage,aliasTemplate));
  useEffect(()=>setColumnAliases(loadTemplateAliases(globalThis.localStorage,aliasTemplate)),[aliasTemplate]);
  const changeColumnAlias=useCallback((key,label)=>setColumnAliases(saveTemplateAlias(globalThis.localStorage,aliasTemplate,key,label)),[aliasTemplate]);
  const previousViewKey = useRef({ resultId: result?.resultId, filter, pageSize });
  const viewCallback = useRef(onViewStateChange); viewCallback.current = onViewStateChange;
  useEffect(() => { viewCallback.current?.({ page, sortColumn, sortDirection, rowOrder, options, layouts }); }, [page, sortColumn, sortDirection, rowOrder, options, layouts]);
  useEffect(() => {
    const previous = previousViewKey.current;
    if (previous.resultId !== result?.resultId || previous.filter !== filter || previous.pageSize !== pageSize) { setPage(0); setRequestedPage(null); }
    previousViewKey.current = { resultId: result?.resultId, filter, pageSize };
  }, [result?.resultId, filter, pageSize]);
  useEffect(() => {
    if (!result?.columns?.length || executing || fetching || pageError) return;
    const target = requestedPage ?? 0;
    if (result.hasMore && result.rows.length < (target + 1) * pageSize) { onFetchMore?.(); return; }
    if (requestedPage !== null) { setPage(requestedPage); setRequestedPage(null); }
  }, [result, requestedPage, pageSize, executing, fetching, pageError, onFetchMore]);
  const previousSortResult = useRef(result?.resultId);
  useEffect(() => { if (previousSortResult.current !== result?.resultId) { setSortColumn(-1); setSortDirection("asc"); setRowOrder([]); setOptions({}); } previousSortResult.current = result?.resultId; }, [result?.resultId]);
  const materialized=useMemo(()=>{try{return deriveResultData(result?.rows||[],result?.columns||[],options.derivedColumns||[])}catch(error){return {rows:result?.rows||[],columns:result?.columns||[],error:error.message}}},[result?.rows,result?.columns,options.derivedColumns]);
  const rows=materialized.rows, columns=materialized.columns;
  const viewMode = resultViewMode(options);
  useEffect(() => { setHasSelection(false); setSelectedColumn(null); }, [viewMode]);
  const columnLayout = layouts[viewMode] || {};
  const handleLayoutChange = useCallback(layout => setLayouts(current => ({ ...current, [viewMode]: layout })), [viewMode]);
  const display = useMemo(() => {
    try { return buildResultDisplay(rows, columns, options, filter, sortColumn, sortDirection, rowOrder); }
    catch (error) { return { mode: viewMode, columns: [], rawRows: [], rows: [], options, sortColumn: -1, sortDirection: 'asc', error: error.message }; }
  }, [rows, columns, options, filter, sortColumn, sortDirection, rowOrder, viewMode]);
  const visibleRows = display.rows, viewColumns = display.columns, viewOptions = display.options;
  const changeViewOptions = next => { setOptions(current => updateResultViewOptions(current, next, viewMode)); setPage(0); };
  const setViewSort = (column, direction) => {
    if (viewMode === 'source') { setSortColumn(column); setSortDirection(direction); }
    else setOptions(current => ({ ...current, [`${viewMode}View`]: { ...(current[`${viewMode}View`] || {}), sortColumn: column, sortDirection: direction } }));
  };
  const reorderRow = (source, target, after) => {
    const order = applyResultFeatures(getVisibleResultRows(rows, columns, "", sortColumn, sortDirection, rowOrder,options),columns,{...options,filters:[],markedOnly:false,duplicatesOnly:false}).map(item=>item.index);
    setRowOrder(moveResultRow(order, source, target, after)); setSortColumn(-1); setOptions(current=>({...current,sorts:[]}));
  };
  const toggleSort = (columnIndex, request = {}) => {
    const next=nextColumnSort({sortColumn:display.sortColumn,sortDirection:display.sortDirection,sorts:viewOptions.sorts||[]},columnIndex,request);
    changeViewOptions({...viewOptions,sorts:next.sorts});setViewSort(next.sortColumn,next.sortDirection);
    if(viewMode==='source'&&!request.clear)setRowOrder([]);setPage(0);
  };

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize)), safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(() => visibleRows.slice(safePage * pageSize, (safePage + 1) * pageSize), [visibleRows, safePage, pageSize]);
  const firstVisible = visibleRows.length ? safePage * pageSize + 1 : 0, lastVisible = Math.min((safePage + 1) * pageSize, visibleRows.length);
  const exportView = { columns: viewColumns, rows: visibleRows.map(item => item.row), visibleColumns: displayedColumnIndices(viewColumns, columnLayout, viewOptions), settings: viewOptions.exportSettings || {} };
  const toolbar=<ResultToolbar initialDefaults={result?.defaultOptions||{}} pivotPanelOpen={pivotPanelOpen} onTogglePivotPanel={()=>setPivotPanelOpen(open=>!open)} viewKind={viewMode} columns={viewColumns} sourceColumns={columns} loadedRows={display.rawRows} columnLayout={columnLayout} sortColumn={display.sortColumn} selectedColumn={selectedColumn} memoryItems={memoryItems} onReleaseResult={onReleaseResult} onCommand={command} onClearSort={()=>{setViewSort(-1,'asc');if(viewMode==='source')setRowOrder([])}} onOptionsChange={changeViewOptions} onLayoutChange={layout=>command({type:'layoutApply',layout})} onExport={(format,indices,overrideOptions)=>onExportColumns?.(format,indices,overrideOptions,exportView)} onExportInsert={viewMode==='source'?onExportInsert:undefined} onGenerateSql={onGenerateSql} onMetadata={onMetadata} onLookup={onLookup} onFetchMore={onFetchMore} onLoadAll={()=>setLoadingAll(true)} onStopLoad={()=>setLoadingAll(false)} loadingAll={loadingAll} onStreamExport={viewMode==='source'?onStreamExport:undefined} streamState={streamState} onServerFilter={viewMode==='source'?onServerFilter:undefined} hasData={Boolean(result?.columns?.length&&!result?.released&&!executing&&!outcome)} hasExecution={Boolean(result?.executedSql)} hasSelection={hasSelection} editAvailable={editState.available} editing={editState.on} descriptionsOpen={editState.descriptions} onToggleEdit={()=>command({type:'toggleEdit'})} onToggleDescriptions={()=>command({type:'toggleDescriptions'})} selectionSummary={copySelection} pageCount={pageCount} hasMore={result?.hasMore} busy={executing||fetching} options={viewOptions} onAction={action=>{
    if(action==='find')command({type:'find'});else if(action==='copy')command({type:'copyTsv'});else if(action==='inspect')command({type:'inspect'});else if(action==='details')command({type:'details'});else if(action==='execution')command({type:'execution'});else if(action==='marks')command({type:'marks'});else if(action==='pin')onPin?.();else if(action==='explain')onExplain?.();else if(action==='clear')resetResultView();
  }}/>;
  let body;
  if (executing) body=<ResultRunning startedAt={startedAt} cancelling={cancelling} onCancel={onCancel}/>;
  else if (outcome) body=<ResultFailure outcome={outcome} onEdit={outcome.kind==='cancelled'?undefined:onEdit} onAction={action=>action==='connection'?onConnect?.():onFindObject?.()}/>;
  else if (!result) body=<ResultIdle guidance={idleGuidance({connected,executing,hasSql:Boolean(editorSql?.trim()),runShortcut})} onAction={action=>action==='connect'?onConnect?.():action==='run'?onRun?.():onEdit?.()}/>;
  else if (result.released) body=<ResultNotice title="Result data released" detail="Run the SELECT again to load records."/>;
  else if (!result.columns?.length) body=<ResultNotice kind="success" title="Statement completed" metric={result.rowsAffected>=0&&result.rowsAffected!=null?`${result.rowsAffected} ${result.rowsAffected===1?'row':'rows'} affected`:undefined} detail={`${result.transactionPending&&transactionOpen!==false?'Pending transaction · commit or rollback when ready. ':''}${result.elapsedMs??0} ms`}/>;
  else if (!rows.length&&!result.hasMore) body=<ResultNotice kind="empty" {...noRowsGuidance()} onEdit={onEdit} metric={`0 rows · ${result.elapsedMs??0} ms`}/>;
  else if (!visibleRows.length&&(filter.trim()||viewOptions.filters?.length||viewOptions.markedOnly||viewOptions.duplicatesOnly)&&!materialized.error&&!display.error) body=<ResultNotice kind="empty" title="No rows match this view" detail={`${rows.length} loaded rows. Local filters hide all rows.`} onClear={()=>{changeViewOptions({...viewOptions,filters:[],markedOnly:false,duplicatesOnly:false});onClearFilter?.()}}/>;
  else body=<>{(materialized.error||display.error)&&<Feedback title="Result view">{materialized.error||display.error}</Feedback>}<div className="result-presentation-layout"><ResultsPresentation textFilter={filter} language={language} pivotPanelOpen={pivotPanelOpen} onClosePivotPanel={()=>setPivotPanelOpen(false)} pivotPanel={<PivotOptionsPanel columns={columns} options={viewOptions} onChange={changeViewOptions} onClose={()=>setPivotPanelOpen(false)}/>} viewKind={viewMode} sourceRowCount={rows.length} onSourceDefinition={onSourceDefinition} sourceDefinition={sourceDefinition} onCloseSourceDefinition={onCloseSourceDefinition} executionDetails={result} onUpdateDraft={onUpdateDraft} rows={pageRows} allRows={visibleRows} pageSize={pageSize} onRowPage={setPage} onSmartObject={onSmartObject} linkedColumn={viewMode==='source'?linkedColumn:null} onColumnSource={viewMode==='source'?onColumnSource:undefined} columnAliases={columnAliases} onColumnAlias={viewMode==='source'&&aliasTemplate?changeColumnAlias:undefined} onChildren={onChildren} columns={viewColumns} sortColumn={display.sortColumn} sortDirection={display.sortDirection} onSort={toggleSort} onReorder={viewMode==='source'?reorderRow:undefined} options={{...viewOptions,cursorUnavailable:result.cursorUnavailable,truncated:result.truncated}} onOptionsChange={changeViewOptions} onSelectionChange={handleSelectionChange} onEditState={setEditState} onLayoutChange={handleLayoutChange} onTools={openTools} command={gridCommand} onSql={onSql} onRelated={onRelated} onInspect={setPreviewCell} />{pivotPanelOpen&&viewOptions.transpose&&<TransposePivotInspector columns={columns} options={viewOptions} onChange={changeViewOptions} onClose={()=>setPivotPanelOpen(false)}/>}</div><div className="result-footer"><div><span className="success-state"><Check size={12} /> {firstVisible}–{lastVisible} {t('displayed',language)}</span><span className="foot-separator">·</span><span>{rows.length} {t(result.hasMore ? 'loaded · more available' : result.cursorUnavailable ? 'retained rows' : 'loaded rows',language)}{filter.trim() || viewOptions.filters?.length || viewOptions.markedOnly || viewOptions.duplicatesOnly ? ` · ${visibleRows.length} ${t('match',language)}` : ""}</span></div><div className="result-page-controls">{result.executedAt && <span className="result-context" title={result.executedSql}>{result.executedProfile} · {new Date(result.executedAt).toLocaleTimeString(region||undefined)} · {result.editorSnapshot !== editorSql ? (language==='tr'?'SQL çalıştırmadan sonra değişti':'SQL changed since execution') : (language==='tr'?'Son çalıştırma':'Last execution')}</span>}<span role="status">{fetching ? t("Loading page…",language) : pageError || `${t('Database',language)} ${result.elapsedMs} ms`}</span>{result.clientTiming?.totalMs!=null&&<span className="result-client-timing" title={language==='tr'?'Sorgu isteğinden son çizime kadar geçen süre':'From query request until the result finished rendering'}>{t('End-to-end',language)} {Math.round(result.clientTiming.totalMs)} ms</span>}{pageError && result.hasMore && <button className="button-secondary" onClick={onFetchMore}>{t('Retry',language)}</button>}{(pageCount > 1 || result.hasMore) && <><button className="pager-button" aria-label={t('Previous result page',language)} title={t('Previous page',language)} disabled={safePage === 0 || fetching} onClick={() => setPage(safePage - 1)}><ChevronRight size={12} className="flip" /></button><span className="result-page-number">{safePage + 1} / {pageCount}{result.hasMore ? "+" : ""}</span><button className="pager-button" aria-label={t('Next result page',language)} title={t('Next page',language)} disabled={fetching || (safePage >= pageCount - 1 && !result.hasMore)} onClick={() => { const next = safePage + 1; if (next < pageCount) setPage(next); else { setRequestedPage(next); onFetchMore?.(); } }}><ChevronRight size={12} /></button></>}</div></div></>;
  return <>{toolbar}<HeldDraftsNotice currentKey={draftStoreKey(getNativeTabId(),result?.columns||[])}/>{fetching&&<ResultRunning compact fetching startedAt={startedAt} cancelling={cancelling} onCancel={onCancel}/ >}{pageError&&<Feedback title="Rows could not be loaded">{pageError}</Feedback>}{Boolean(result?.columns?.length)&&<ResultScope columns={viewColumns} options={viewOptions} filter={filter} sortColumn={display.sortColumn} sortDirection={display.sortDirection} serverFilter={result.serverFilter} hasMore={result.hasMore} busy={executing||fetching} onOptionsChange={changeViewOptions} onClearSearch={onClearFilter} onClearSort={()=>setViewSort(-1,'asc')} onClearServerFilter={onClearServerFilter}/>}<div className="result-view-content">{body}</div><ResultRenderMeasurement result={result} onMeasured={onResultRendered}/>{previewCell&&<Suspense fallback={<div role="status">Loading…</div>}><ResultValueDialog cell={previewCell} onClose={()=>setPreviewCell(null)}/></Suspense>}</>;
}

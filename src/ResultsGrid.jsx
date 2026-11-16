import './resultBindDrop';
import { notifyFeedback } from './Feedback';
import { useInspectorWidth } from './useInspectorWidth';
import {sendNativeCommand,isNativeHost,subscribeNativeMessages,getNativeTabId} from './nativeBridge';
import {columnsSignature,draftStoreKey,loadStoredDrafts,saveStoredDrafts} from './draftStore';
import './GridEditBar';
import './NewRowsPanel';
import {appliedReadbackCells} from './gridReadback';
import {nextEditableCell} from './tabEntry';
import './DescriptionsPanel';
import {announce,gridAnnouncement} from './announcer';
import { loadLookupDescriptions } from './lookupDescriptions';
import './localeNumber';
import {matchRowIds,rowIdRefusal} from './gridRowIds';
import {mapApplyErrors} from './oracleErrorMap';
import {reconcileDrafts,resolveConflict} from './draftReconcile';
import { emptyDrafts, isDirty, pendingSummary, settleApplied } from './gridDrafts';
import { explainEditability } from './gridEditability';
import './dmlPreview';
import './cellValidation';
import './resultVerticalView';
import { formatResultValue, copyResultData, selectionStatistics, isExpandableResultValue } from "./resultFeatures";
import { isResultCellSelected, selectResultRange, resultSelectionTsv } from "./resultSelection";
import { ExactDecimal, formatExact } from "./exactDecimal";
import { lazy, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getResultWindow } from "./resultWindow";
import "./ColumnFormatPopover";
import './ColumnActionsMenu';
import './resultColumnActions';
import './resultRowJump';
import { cellOverlayPlacement, cellOverlayText } from './cellTextOverlay';
import { distributeColumnSpace, equalizeColumnWidths } from './columnWidths';
import { rowMarkerPositions } from './rowMarkers';
import { resolveColumnAliases } from './columnAliases';
import './smartLinks';
import './codeCellModel';
const ResultValueDialog = lazy(() => import('./ResultDialogs').then(module => ({ default: module.ResultValueDialog })));
import { floatingToolbarEnabled, floatingToolbarPlacement } from './floatingSelectionToolbar';
import 'react-dom';
import { renderResultsGridView } from './ResultsGridView.jsx';
import * as gridCommands from './ResultsGridCommands.js';
import * as gridPointer from './ResultsGridPointer.js';

const sourceDefinitionMatches=(column,definition)=>Boolean(column?.sourceTable&&definition&&String(definition.name||"").toUpperCase()===String(column.sourceColumn||column.name||"").toUpperCase()&&String(definition.table||"").toUpperCase()===String(column.sourceTable||"").toUpperCase()&&(!column.sourceSchema||!definition.schema||String(definition.schema).toUpperCase()===String(column.sourceSchema).toUpperCase()));

export const ResultsGrid = memo(function ResultsGrid({ rows: sourceRows, textFilter = '', columns, sortColumn, sortDirection, onSort, onInspect, onReorder, options = {}, onOptionsChange, onTools, command, onSql, onRelated, allRows = sourceRows, onChildren,onSourceDefinition,sourceDefinition,onCloseSourceDefinition,executionDetails,onUpdateDraft,onSelectionChange,onEditState,onLayoutChange,pivotPanel,pivotPanelOpen=false,onClosePivotPanel,inspectorEnabled=true,sourceRowCount,pageSize,onRowPage,columnAliases,onColumnAlias,onSmartObject,linkedColumn,onColumnSource,onVerticalView,focusRow=null }) {
  const [toolbarOn,setToolbarOn]=useState(()=>floatingToolbarEnabled(globalThis.localStorage)),[toolbarDismissed,setToolbarDismissed]=useState(null),[toolbarPosition,setToolbarPosition]=useState(null),[pointerActive,setPointerActive]=useState(false),floatingToolbar=useRef(null);
  const [editingAlias,setEditingAlias]=useState(null);
  const aliasLabels=useMemo(()=>onColumnAlias?resolveColumnAliases(columns,columnAliases||{}).labels:[],[columns,columnAliases,onColumnAlias]);
  const [rowJump,setRowJump]=useState(null),[pendingRow,setPendingRow]=useState(null),[expanded,setExpanded]=useState(null),overlayRoot=useRef(null);
  const storeKey=useMemo(()=>draftStoreKey(getNativeTabId(),columns),[columns]),columnLayout=useMemo(()=>columnsSignature(columns),[columns]);
  const restored=useRef(undefined);
  if(restored.current===undefined)restored.current=loadStoredDrafts(storeKey,columnLayout);
  const [editMode,setEditMode]=useState(()=>restored.current?.editMode??false),[drafts,setDrafts]=useState(()=>restored.current?.drafts??emptyDrafts()),[editing,setEditing]=useState(null),[identity,setIdentity]=useState(()=>restored.current?.identity??null),editRef=useRef(null),[applied,setApplied]=useState({cells:{},deleted:[],base:null}),[applyState,setApplyState]=useState(null),[rowIds,setRowIds]=useState(null),[applyErrors,setApplyErrors]=useState([]),[descOpen,setDescOpen]=useState(false),[descQueries,setDescQueries]=useState(()=>loadLookupDescriptions(globalThis.localStorage)),[descMaps,setDescMaps]=useState({}),[descStatus,setDescStatus]=useState(''),evalWaiters=useRef(new Map()),draftsRef=useRef(null),previousOriginals=useRef(null),lastSourceRows=useRef(restored.current?.rows??null);
  const originalRows=useMemo(()=>new Map(sourceRows.map(item=>[item.index,item.row])),[sourceRows]);
  const rows=useMemo(()=>{
    const base=sourceRows.filter(item=>!(options.frozenRows||[]).includes(item.index));
    const settled=applied.base&&sourceRows[0]===applied.base;
    if(!Object.keys(drafts.cells).length&&!(settled&&Object.keys(applied.cells).length))return base;
    return base.map(item=>{
      const edits=Object.entries(drafts.cells).filter(([name])=>name.startsWith(`${item.index}:`)),done=settled?Object.entries(applied.cells).filter(([name])=>name.startsWith(`${item.index}:`)):[];
      if(!edits.length&&!done.length)return item;
      const row=[...item.row];
      for(const [name,value] of done)row[Number(name.split(':')[1])]=value;
      for(const [name,draft] of edits)row[Number(name.split(':')[1])]=draft.isNull?null:draft.value;
      return {...item,row};
    });
  },[sourceRows,options,drafts,applied]);
  const appliedLive=applied.base&&sourceRows[0]===applied.base;
  const sourceTable=useMemo(()=>{const column=columns.find(item=>item.sourceTable);return column?{schema:column.sourceSchema||'',table:column.sourceTable}:null},[columns]);
  const columnsKey=columns.map(item=>`${item.name}|${item.sourceTable||''}`).join(',');
  draftsRef.current=drafts;
  const firstLayout=useRef(columnLayout);
  useEffect(()=>{if(firstLayout.current===columnLayout)return;firstLayout.current=columnLayout;if(isDirty(draftsRef.current))notifyFeedback({kind:'warning',title:'Edits discarded',message:`${pendingSummary(draftsRef.current).total} unapplied edit${pendingSummary(draftsRef.current).total===1?'':'s'} were discarded because a different result replaced this one.`});setDrafts(emptyDrafts());setEditing(null);editRef.current=null;setIdentity(null);setEditMode(false);setApplied({cells:{},deleted:[],base:null});setApplyState(null);setApplyErrors([]);setRowIds(null)},[columnsKey])
  useEffect(()=>{if(applied.base&&sourceRows[0]!==applied.base)setApplied({cells:{},deleted:[],base:null})},[sourceRows]);
  useEffect(()=>{
    if(!applyState)return undefined;
    return subscribeNativeMessages(message=>{
      if(message.type!=='sql.dmlApplied'||message.requestId!==applyState.requestId)return;
      const outcomes=message.outcomes||[],statements=applyState.statements;
      setApplyState(null);
      if(message.error){notifyFeedback({kind:'error',title:'Apply',message:message.error});return}
      const settled=settleApplied(draftsRef.current,statements,outcomes);
      setDrafts(settled.drafts);
      setApplied(current=>({base:sourceRows[0]??null,cells:{...(current.base===sourceRows[0]?current.cells:{}),...settled.appliedCells,...appliedReadbackCells(statements,outcomes)},deleted:[...(current.base===sourceRows[0]?current.deleted:[]),...settled.appliedDeleted]}));
      const mapped=mapApplyErrors(statements,outcomes,columns);
      setApplyErrors(mapped);
      const stopped=outcomes.find(item=>item.status==='failed'||item.status==='mismatch');
      if(stopped){
        const statement=statements[stopped.index],where=statement?.kind==='insert'?`New row ${statement.id}`:`Row ${(statement?.row??0)+1}`;
        const why=stopped.status==='failed'?(mapped[0]?.message||stopped.error):stopped.rowsAffected===0?'the row was changed or deleted by someone else since it was read. Run the query again.':`it would change ${stopped.rowsAffected} rows instead of ${stopped.expected}.`;
        notifyFeedback({kind:'error',title:'Apply failed',message:`${where}: ${why}\nNothing was changed; your edits are still in the grid.`});
        return;
      }
      const count=outcomes.filter(item=>item.status==='applied').length;
      notifyFeedback({kind:'success',title:'Changes applied',message:`${count} change${count===1?'':'s'} sent to Oracle. Commit makes them permanent; Rollback undoes them.`});
    });
  },[applyState?.requestId]);
  useEffect(()=>{
    if(!editMode||!sourceTable||!isNativeHost||identity)return undefined;
    const requestId=sendNativeCommand('result.editIdentity',{schema:sourceTable.schema,table:sourceTable.table});
    return subscribeNativeMessages(message=>{if(message.type==='result.editIdentity'&&message.requestId===requestId)setIdentity({columns:message.error?[]:message.columns||[],error:message.error,privileges:message.privileges??null})});
  },[editMode,sourceTable?.schema,sourceTable?.table,identity===null]);
  // Unapplied edits outlive the view (a tab switch remounts the grid); they are kept in memory per tab and table.
  useEffect(()=>{
    if(storeKey)saveStoredDrafts(storeKey,isDirty(drafts)?{signature:columnLayout,drafts,editMode,identity,rows:originalRows}:null);
  },[storeKey,columnLayout,drafts,editMode,identity,originalRows]);
  useEffect(()=>subscribeNativeMessages(message=>{
    if(message.type==='sql.evaluated'&&evalWaiters.current.has(message.requestId)){evalWaiters.current.get(message.requestId)(message);evalWaiters.current.delete(message.requestId);return}
    if(message.type==='transaction.state'&&!message.pending&&message.state==='rolled back')setApplied({cells:{},deleted:[],base:null});
  }),[]);
  useEffect(()=>{
    const reset=event=>{if(!storeKey||!storeKey.startsWith(`${event.detail?.tabId}|`))return;setDrafts(emptyDrafts());setEditMode(false);setEditing(null);editRef.current=null;setRowIds(null);setApplyErrors([]);setApplied({cells:{},deleted:[],base:null})};
    window.addEventListener('fbsdb.draftsCleared',reset);return()=>window.removeEventListener('fbsdb.draftsCleared',reset);
  },[storeKey]);
  const editabilityRef=useRef(null);
  // With a usable primary key rows are found by it; otherwise by ROWID, which is read once editing starts.
  const keyed=useMemo(()=>identity&&(editMode||isDirty(drafts))?explainEditability(columns,{primaryKey:identity.columns??null,privileges:identity.privileges??null,rowId:true}):null,[editMode,isDirty(drafts),columns,identity]);
  const byRowId=Boolean(keyed?.byRowId&&keyed.editable);
  const editability=useMemo(()=>{
    if(!(editMode||isDirty(drafts)))return null;
    if(!keyed)return explainEditability(columns,{});
    if(!byRowId)return keyed;
    if(rowIds?.error)return {...keyed,editable:false,reasons:[rowIds.error]};
    return rowIds?.ids?keyed:{...keyed,editable:false,reasons:[],preparing:true};
  },[editMode,isDirty(drafts),columns,keyed,byRowId,rowIds]);
  const loadedCount=sourceRowCount??allRows.length;
  useEffect(()=>{
    if(!byRowId||!editMode||!isNativeHost)return undefined;
    const sql=executionDetails?.executedSql;
    if(!sql){setRowIds({error:'The statement that produced this result is not known, so its rows cannot be identified. Run the query again.'});return undefined}
    let live=true;
    const requestId=sendNativeCommand('sql.evaluate',{sql,parameters:executionDetails.executedParameters||[],withRowIds:true,rowLimit:Math.max(1,loadedCount),timeoutSeconds:60});
    evalWaiters.current.set(requestId,message=>{
      if(!live)return;
      if(message.error){setRowIds({error:rowIdRefusal(message.error)});return}
      const matched=matchRowIds({columns,rows:sourceRows,reply:message});
      setRowIds(matched.error?{error:matched.error}:matched);
    });
    return()=>{live=false;evalWaiters.current.delete(requestId)};
  },[byRowId,editMode,sourceRows,executionDetails?.executedSql]);
  // A row applied earlier holds its new values in Oracle: later edits start from those, not from what the query first read.
  const baseRow=index=>{
    const row=originalRows.get(index);
    if(!row||!(applied.base&&sourceRows[0]===applied.base))return row;
    const done=Object.entries(applied.cells).filter(([name])=>name.startsWith(`${index}:`));
    if(!done.length)return row;
    const next=[...row];for(const [name,value] of done)next[Number(name.split(':')[1])]=value;return next;
  };
  const unidentified=index=>byRowId&&!rowIds?.ids?.has(index);
  const changedSinceRead='This row changed in the database since it was read. Run the query again to edit it.';
  editabilityRef.current=editability;
  useEffect(()=>{
    const old=lastSourceRows.current;lastSourceRows.current=originalRows;
    if(!old||old===originalRows||!isDirty(draftsRef.current))return;
    const first=sourceRows[0];
    if(first&&old.get(first.index)===first.row)return;
    const live=editabilityRef.current;
    setApplyErrors([]);
    if(!live?.editable||!live.identity.length){setDrafts(emptyDrafts());notifyFeedback({kind:'warning',title:'Edits discarded',message:'The result was read again and the unapplied edits could not be matched to its rows.'});return}
    // Edits follow their rows by key. One whose row is gone is dropped; one whose stored value changed meanwhile stays and replaces the new value.
    const result=reconcileDrafts({drafts:draftsRef.current,oldRows:old,newRows:sourceRows,identity:live.identity});
    let next=result.drafts;
    for(const conflict of result.conflicts)if(conflict.kind==='changed')next=resolveConflict(next,conflict,'mine');
    const lost=result.conflicts.filter(conflict=>conflict.kind==='missing').length;
    setDrafts(next);
    if(lost)notifyFeedback({kind:'warning',title:'Refreshed result',message:`${lost} unapplied edit${lost===1?' was':'s were'} dropped because the row is no longer in the result. The others were kept.`});
  },[originalRows]);
  const draftSummary=useMemo(()=>pendingSummary(drafts),[drafts]);
  useEffect(()=>{if(pendingRow==null)return;const position=rows.findIndex(item=>item.index===pendingRow);if(position<0)return;setPendingRow(null);reveal(position,0);root.current?.focus()},[rows,pendingRow]);
  const frozen=useMemo(()=>allRows.filter(item=>(options.frozenRows||[]).includes(item.index)),[allRows,options.frozenRows]);
  const root = useRef(null), frame = useRef(null), menuRoot=useRef(null);
  const [menu, setMenu] = useState(null), [executionOpen,setExecutionOpen]=useState(false), [inspectorMode,setInspectorModeState]=useState('cell'), [inspectorVisible,setInspectorVisible]=useState(false), [hover, setHover] = useState(null), [find, setFind] = useState(""), [findOpen,setFindOpen] = useState(false), [findIndex,setFindIndex] = useState(-1), [layoutMessage,setLayoutMessage] = useState("");
  useEffect(() => { const close = () => { setInspectorVisible(false); setExecutionOpen(false); onClosePivotPanel?.(); }; window.addEventListener('fbsdb.closeDetails', close); return () => window.removeEventListener('fbsdb.closeDetails', close); }, [onClosePivotPanel]);
  function setInspectorMode(mode) { setInspectorModeState(mode); if(mode !== 'pivot') onClosePivotPanel?.(); }
  useEffect(()=>{if(pivotPanelOpen){setInspectorModeState('pivot');setInspectorVisible(true)}else if(inspectorMode==='pivot')setInspectorVisible(false)},[pivotPanelOpen]);
  useEffect(()=>{if(menu)menuRoot.current?.querySelector('button:not(:disabled)')?.focus()},[menu]);
  const settings = patch => onOptionsChange?.({ ...options, ...patch });
  const updateColumnFormat=(column,patch)=>{const formats={...(options.columnFormats||{})};if(patch==null)delete formats[column];else formats[column]={...(formats[column]||{}),...patch};settings({columnFormats:formats})};
  const rowHeight = options.wrap || Object.values(options.columnFormats||{}).some(format=>format.wrap) ? 64 : options.density === "comfortable" ? 34 : 26;
  const [viewport, setViewport] = useState({ top: 0, height: 300 });
  const [loadedColumn,setLoadedColumn]=useState(null),[columnMenu,setColumnMenu]=useState(null);
  const [selection, setSelection] = useState(null), [sizes, setSizes] = useState({}), [hidden, setHidden] = useState([]), [pinned, setPinned] = useState(null), [order, setOrder] = useState([]), [copyState, setCopyState] = useState(""), [formatMenu,setFormatMenu]=useState(null), [dropColumn,setDropColumn]=useState(null);
  const {width:inspectorWidth,onPointerDown:resizeInspector,onKeyDown:resizeInspectorKey,locked:inspectorLocked}=useInspectorWidth();
  const formatTrigger=useRef(null);
  const [dropRow, setDropRow] = useState(null);

  const dragColumn = useRef(null), suppressColumnClick=useRef(false), selectionDragCleanup = useRef(null);
  useEffect(() => () => selectionDragCleanup.current?.(), []);
  useEffect(() => {
    const dismiss = event => { if (event.key !== "Escape") return; const open = document.querySelector(".result-column-menu")?.parentElement; if (open?.open) { open.open = false; event.preventDefault(); event.stopPropagation(); } };
    document.addEventListener("keydown", dismiss, true); return () => document.removeEventListener("keydown", dismiss, true);
  }, []);
  useEffect(() => {
    const element = root.current;
    const measure = () => { frame.current = null; const next = { top: element.scrollTop, height: element.clientHeight }; setViewport(current => current.top === next.top && current.height === next.height ? current : next); };
    const schedule = () => { if (frame.current === null) frame.current = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule); observer.observe(element); element.addEventListener("scroll", schedule, { passive: true }); measure();
    return () => { observer.disconnect(); element.removeEventListener("scroll", schedule); if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, []);
  const previousRows=useRef(rows);
  useEffect(()=>{const previous=previousRows.current,previousSource=previousOriginals.current;previousRows.current=rows;previousOriginals.current=originalRows;if(previous.length===rows.length&&rows.every((item,i)=>item.index===previous[i].index&&(item.row===previous[i].row||(originalRows.get(item.index)!==undefined&&originalRows.get(item.index)===previousSource?.get(item.index)))))return;selectionDragCleanup.current?.();root.current.scrollTop=0;if(loadedColumn==null)setSelection(null);setViewport(current=>({...current,top:0}))},[rows]);
  useEffect(()=>{setSelection(null);setLoadedColumn(null)},[hidden,order,pinned,options.pinnedRight]);
  const signature = columns.map(c => `${c.name}:${c.type}`).join("|");
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(`fbsdb.result-layout.auto.${signature}`) || "null"); setSizes(saved?.sizes || {}); setHidden(saved?.hidden || []); setPinned(saved?.pinned ?? null); setOrder(saved?.order || []); } catch { setSizes({});setHidden([]);setPinned(null);setOrder([]); }
  }, [signature]);
  useEffect(() => { try { localStorage.setItem(`fbsdb.result-layout.auto.${signature}`, JSON.stringify({sizes,hidden,pinned,order})); } catch {} }, [sizes,hidden,pinned,order,onLayoutChange]);
  useEffect(() => { const dismiss = e => { if(e.key === "Escape") {setMenu(null);setFindOpen(false);} }; const outside = e => {if(!e.target.closest('.result-context-menu'))setMenu(null)};document.addEventListener('keydown',dismiss);document.addEventListener('pointerdown',outside);return()=>{document.removeEventListener('keydown',dismiss);document.removeEventListener('pointerdown',outside)} }, []);
  const autoWidths = useMemo(() => columns.map(column => options.columnWidth>0?Math.max(60,options.columnWidth):Math.max(110, Math.min(360, column.name.length * 7 + 30))), [columns,options.columnWidth]);
  const visible = [...order.filter(i => i < columns.length), ...columns.map((_, i) => i).filter(i => !order.includes(i))].filter(i => !hidden.includes(i));
  const selectedColumn=selection?.focus?visible[selection.focus.c]:null;
  const sourceColumn=selectedColumn==null?null:columns[selectedColumn];
  const matchingSourceDefinition=sourceDefinitionMatches(sourceColumn,sourceDefinition);
  if (pinned !== null && visible.includes(pinned)) visible.splice(0, 0, ...visible.splice(visible.indexOf(pinned), 1));
  const rightPins=(options.pinnedRight||[]).filter(i=>visible.includes(i)&&i!==pinned);
  rightPins.forEach(i=>visible.splice(0,visible.length,...visible.filter(x=>x!==i),i));
  const rightOffset=i=>rightPins.slice(rightPins.indexOf(i)+1).reduce((sum,index)=>sum+(sizes[index]||autoWidths[index]),0);
  const cellFormat=(value,i)=>formatResultValue(value,columns[i].type,{...options,...Object.fromEntries(Object.entries(options.columnFormats?.[i]||{}).filter(([,v])=>v!==undefined))});
  const widths = visible.map(i => sizes[i] || autoWidths[i]);
  function select(r, c, extend = false, mode = "cell", additive = false) {
    setLoadedColumn(null);
    setSelection(previous => selectResultRange(previous, r, c, { extend, mode, additive, rowCount: rows.length, columnCount: visible.length }));
    setCopyState(""); root.current.focus({ preventScroll: true });
  }
  function reorderColumn(source,target,x){
    return gridPointer.reorderColumn({
      columns, order, root, setOrder
    }, source, target, x);
  }
  function startColumnDrag(event,index){
    return gridPointer.startColumnDrag({
      dragColumn, reorderColumn, setDropColumn, suppressColumnClick
    }, event, index);
  }
  function selectAllCells() {
    setLoadedColumn(null);
    if (!rows.length || !visible.length) return;
    setSelection(selectResultRange(selectResultRange(null, 0, 0, { rowCount: rows.length, columnCount: visible.length }), rows.length - 1, visible.length - 1, { extend: true, rowCount: rows.length, columnCount: visible.length }));
    setCopyState(""); root.current?.focus({ preventScroll: true });
  }
  function startRowMove(event, source) {
    return gridPointer.startRowMove({
      onReorder, root, selectionDragCleanup, setDropRow
    }, event, source);
  }
  function startSelectionDrag(event) {
    return gridPointer.startSelectionDrag({
      root, select, selectionDragCleanup, setPointerActive, setSelection
    }, event);
  }
  useEffect(()=>{if(sourceDefinition&&inspectorEnabled){setInspectorMode('source');setInspectorVisible(true)}},[sourceDefinition]);
  useEffect(()=>{if(!inspectorEnabled||inspectorMode!=='source'||!inspectorVisible)return;if(!sourceColumn?.sourceTable){if(sourceDefinition)onCloseSourceDefinition?.();return}if(!sourceDefinitionMatches(sourceColumn,sourceDefinition))onSourceDefinition?.(sourceColumn)},[selectedColumn,inspectorMode,inspectorVisible]);
  function selected(r, c) { return loadedColumn!=null?visible[c]===loadedColumn:isResultCellSelected(selection, r, c); }
  function rowSelected(r) { return visible.length > 0 && visible.every((_, c) => selected(r, c)); }
  function inspect(r, c) { if (rows[r]) onInspect({ column: columns[visible[c]], row: rows[r].index + 1, value: rows[r].row[visible[c]] }); }
  function inspectExpandable(r,c){const item=rows[r],column=columns[visible[c]],value=item?.row[visible[c]];if(item&&isExpandableResultValue(column,value))inspect(r,c)}
  function copy(event) {
    if (!selection) return;
    const values = loadedColumn!=null?copyResultData(allRows.map(item=>[item.row[loadedColumn]]),[columns[loadedColumn]],'tsv'):resultSelectionTsv(selection, rows, visible);
    event.preventDefault(); event.clipboardData.setData("text/plain", values); setCopyState("Selection copied");notifyFeedback({kind:"success",title:"Results",message:"Selection copied"});
  }
  const scalarText=value=>value==null?null:typeof value==='string'||typeof value==='number'||typeof value==='bigint'?String(value):value instanceof ExactDecimal?formatExact(value):value?.kind==='temporal'&&/^(DATE|TIMESTAMP(\(\d+\))?)$/i.test(value.oracleType||'')&&!value.offset&&!value.region?String(value.value):undefined;
  function beginEdit(r,c,typed){
    return gridCommands.beginEdit({
      applyState, baseRow, changedSinceRead, columns, drafts, editRef, editability, rows, scalarText, setEditing, unidentified, visible
    }, r, c, typed);
  }
  function stageEdit(text){
    return gridCommands.stageEdit({
      columns, editRef, options, root, setApplyErrors, setDrafts, setEditing
    }, text);
  }
  function cancelEdit(){editRef.current=null;setEditing(null);root.current?.focus()}
  function applyChanges(){
    return gridCommands.applyChanges({
      applyState, baseRow, byRowId, columns, draftsRef, editability, rowIds, setApplyErrors, setApplyState
    });
  }
  function discardChanges(){
    return gridCommands.discardChanges({
      cancelEdit, draftsRef, setApplyErrors, setDrafts
    });
  }
  function focusedCell(){const focus=selection?.focus;if(!focus)return null;const item=rows[focus.r],col=visible[focus.c];return item&&col!=null?{r:focus.r,c:focus.c,rowIndex:item.index,col}:null}
  function setFocusedNull(){
    return gridCommands.setFocusedNull({
      baseRow, changedSinceRead, editability, focusedCell, scalarText, setDrafts, unidentified
    });
  }
  function tabFrom(r,c,direction){
    const step=nextEditableCell({rowCount:rows.length,visible,isEditable:col=>Boolean(editability?.columns[col]?.editable)},{r,c},direction);
    if(step.end||step.none||step.start)return;
    select(step.r,step.c);setTimeout(()=>beginEdit(step.r,step.c),0);
  }
  function loadDescriptions(col,template){
    return gridCommands.loadDescriptions({
      evalWaiters, scalarText, setDescMaps, setDescStatus, sourceRows
    }, col, template);
  }
  function deleteFocusedRow(){
    return gridCommands.deleteFocusedRow({
      changedSinceRead, focusedCell, setDrafts, unidentified
    });
  }
  function keyDown(event) {
    return gridPointer.keyDown({
      beginEdit, editMode, editability, expandCell, inspect, jumpToMark, onTools, openCellDrawer, pinned, root, rowHeight, rows, select,
      selection, setDrafts, setFocusedNull, setLoadedColumn, setMenu, setRowJump, setSelection, viewport, visible, widths
    }, event);
  }
  function resize(event, i) {
    event.preventDefault(); event.stopPropagation(); const element = event.currentTarget, start = event.clientX, width = sizes[i] || autoWidths[i]; element.setPointerCapture(event.pointerId);
    element.onpointermove = e => setSizes(previous => ({ ...previous, [i]: Math.max(70, Math.min(1200, width + e.clientX - start)) }));
    element.onpointerup = element.onpointercancel = () => { element.onpointermove = null; element.onpointerup = null; element.onpointercancel = null; };
  }
  function fit(i,titleOnly=false) {
    const context=document.createElement('canvas').getContext('2d'),sample=root.current.querySelector('td button');
    context.font=getComputedStyle(sample||root.current).font;
    let width=context.measureText(columns[i].name).width;
    if(!titleOnly)for(const {row} of allRows){for(const line of cellFormat(row[i],i).slice(0,2000).split(/\r?\n/))width=Math.max(width,context.measureText(line).width);if(width>=680)break;}
    setSizes(previous=>({...previous,[i]:Math.max(70,Math.min(700,Math.ceil(width+24)))}));
  }
  const rowMarkers=useMemo(()=>rowMarkerPositions(rows,options.marks||[],{height:viewport.height}),[rows,options.marks,viewport.height]);
  function jumpToMark(direction) {
    return gridCommands.jumpToMark({
      options, reveal, rows, selection, setLayoutMessage
    }, direction);
  }
  const selectedColumnIndices=()=>loadedColumn!=null?[loadedColumn]:visible.filter((_,c)=>rows.some((_,r)=>selected(r,c)));
  function applyColumnWidths(kind) {
    const indices=selectedColumnIndices(),current=Object.fromEntries(visible.map((i,c)=>[i,widths[c]]));
    setMenu(null);root.current?.focus();
    if(kind==='fit'){indices.forEach(i=>fit(i));return}
    const result=kind==='equalize'?equalizeColumnWidths(indices,current):distributeColumnSpace(indices,current,(root.current?.clientWidth||0)-37);
    if(result.error){setLayoutMessage(result.error);return}
    setSizes(previous=>({...previous,...result.sizes}));
  }
  function followSmartLink(link) {
    setMenu(null);
    if(link.kind==='url'||link.kind==='email'){if(isNativeHost)sendNativeCommand('result.openUrl',{url:link.target});else document.defaultView.open(link.target,'_blank','noopener');return}
    if(link.kind==='path'){if(link.openable&&isNativeHost)sendNativeCommand('file.openPath',{path:link.target});return}
    onSmartObject?.(link);
  }
  // The overlay shows the formatted display text; Inspect remains the path for raw and LOB values.
  function expandCell(r,c) {
    const element=root.current?.querySelector(`[data-cell="${r}:${c}"]`),i=visible[c];
    if(!element||!rows[r]||i==null)return;
    const formatted=cellFormat(rows[r].row[i],i),rect=element.getBoundingClientRect();
    setExpanded({r,c,column:columns[i].name,row:rows[r].index+1,clipped:element.scrollWidth>element.clientWidth+1,...cellOverlayText(typeof formatted==='string'?formatted:rows[r].row[i]),placement:cellOverlayPlacement({left:rect.left,top:rect.top,bottom:rect.bottom,width:rect.width},{width:innerWidth,height:innerHeight}),theme:document.documentElement.dataset.theme||'default'});
  }
  useEffect(()=>{
    if(!expanded)return;
    const close=(focus=false)=>{setExpanded(null);if(focus)root.current?.focus()};
    const pointer=event=>{if(!overlayRoot.current?.contains(event.target))close()};
    const key=event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close(true)}};
    const moved=()=>close(),grid=root.current;
    document.addEventListener('pointerdown',pointer,true);window.addEventListener('keydown',key,true);window.addEventListener('resize',moved);grid?.addEventListener('scroll',moved);
    overlayRoot.current?.focus();
    return()=>{document.removeEventListener('pointerdown',pointer,true);window.removeEventListener('keydown',key,true);window.removeEventListener('resize',moved);grid?.removeEventListener('scroll',moved)};
  },[expanded]);
  // Returns a message when the row cannot be shown; other pages are opened before revealing.
  function jumpToRow(value) {
    return gridCommands.jumpToRow({
      allRows, onRowPage, options, pageSize, reveal, rows, selection, setPendingRow, sourceRowCount
    }, value);
  }
  // The vertical view replaces the grid, so unapplied edits would be lost with it.
  function openVerticalView(r){setMenu(null);if(!onVerticalView||!rows.length)return;if(editMode&&draftSummary.total>0){setLayoutMessage('Apply or discard the pending changes before switching to the vertical view.');return}onVerticalView(rows[r]?.index??rows[0].index)}
  // Restoring the saved column layout right after mount clears the selection, so the row is focused again until the mount has settled.
  const pendingFocus=useRef(focusRow);
  useEffect(()=>{const wanted=pendingFocus.current;if(wanted==null||!root.current)return;const r=rows.findIndex(item=>item.index===wanted);if(r<0)return;reveal(r,0);const settled=setTimeout(()=>{pendingFocus.current=null},0);return()=>clearTimeout(settled)},[rows,hidden,order,pinned]);
  function reveal(r,c) { select(r,c); root.current.scrollTop = Math.max(0,r*rowHeight-50); root.current.scrollLeft = Math.max(0, widths.slice(0,c).reduce((a,b)=>a+b,0)); }
  function performCommand(command) {
    return gridCommands.performCommand({
      cancelEdit, columns, copyFormat, fit, inspect, jumpToRow, onChildren, onCloseSourceDefinition, onRelated, onSourceDefinition, onSql,
      onUpdateDraft, openVerticalView, options, performCommand, reveal, root, rows, selected, selection, selectionData,
      selectionDragCleanup, setColumnMenu, setCopyState, setDescOpen, setDropColumn, setEditMode, setExecutionOpen, setFind, setFindIndex,
      setFindOpen, setFormatMenu, setHidden, setInspectorMode, setInspectorVisible, setLayoutMessage, setLoadedColumn, setMenu, setOrder,
      setPinned, setRowJump, setSelection, setSizes, settings, visible
    }, command);
  }
  const handledCommand=useRef(command?.seq);
  useEffect(()=>{if(command&&command.seq!==handledCommand.current){handledCommand.current=command.seq;performCommand(command)}},[command]);
  useEffect(()=>onLayoutChange?.({sizes,hidden,pinned,order}),[sizes,hidden,pinned,order,onLayoutChange]);
  const selectionData = useMemo(() => {
    if(loadedColumn!=null){const numeric=/NUMBER|INTEGER|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL/i.test(columns[loadedColumn]?.type||'');const values=allRows.map(item=>item.row[loadedColumn]);return {stats:selectionStatistics(values.map(v=>{if(!numeric||v==null)return v;try{new ExactDecimal(v);return {exactNumber:String(v)}}catch{return v}})),selectedRowCount:allRows.length,selectedColumnCount:1,columns:[columns[loadedColumn]],fullRows:allRows.map(item=>item.row),rows:values.map(v=>[v])};}
    const cells=[],selectedRows=[],cols=new Set();
    rows.forEach((item,r)=>{const cs=visible.map((_,c)=>c).filter(c=>isResultCellSelected(selection,r,c));if(cs.length){selectedRows.push(r);cs.forEach(c=>{cols.add(c);const value=item.row[visible[c]];const numeric=/NUMBER|INTEGER|DECIMAL|FLOAT|DOUBLE|REAL/i.test(columns[visible[c]].type||'');cells.push(numeric&&value!=null&&Number.isFinite(Number(value))?{exactNumber:String(value)}:value);});}});
    const cs=[...cols].sort((a,b)=>a-b);return {stats:selectionStatistics(cells),selectedRowCount:selectedRows.length,selectedColumnCount:cs.length,columns:cs.map(c=>columns[visible[c]]),fullRows:selectedRows.map(r=>rows[r].row),rows:selectedRows.map(r=>cs.map(c=>isResultCellSelected(selection,r,c)?rows[r].row[visible[c]]:''))};
  },[selection,rows,allRows,loadedColumn,columns,order,hidden,pinned,options.pinnedRight]);
  // The cell drawer follows the focused cell so the surrounding table stays usable while inspecting.
  const cellDetail=useMemo(()=>{const focus=selection?.focus,i=focus?visible[focus.c]:null;if(inspectorMode!=='cell'||!focus||i==null||!rows[focus.r])return null;return {column:columns[i],row:rows[focus.r].index+1,value:rows[focus.r].row[i]}},[inspectorMode,selection?.focus?.r,selection?.focus?.c,rows,columns,visible.join(',')]);
  function openCellDrawer(r,c){if(r!=null&&c!=null&&(selection?.focus?.r!==r||selection?.focus?.c!==c))select(r,c);setInspectorMode('cell');setInspectorVisible(true)}
  // Shown for multi-cell selections once the pointer is released; keyboard users keep Ctrl+C, Shift+F10 and Enter.
  const toolbarKey=selection?`${selection.anchor?.r}:${selection.anchor?.c}:${selection.focus?.r}:${selection.focus?.c}:${selectionData.stats.count}`:null;
  useLayoutEffect(()=>{
    const focus=selection?.focus,container=root.current;
    if(!toolbarOn||pointerActive||loadedColumn!=null||!focus||selectionData.stats.count<2||toolbarDismissed===toolbarKey||!container){setToolbarPosition(null);return}
    const cell=container.querySelector(`[data-cell="${focus.r}:${focus.c}"]`),box=container.getBoundingClientRect();
    setToolbarPosition(floatingToolbarPlacement(cell?.getBoundingClientRect(),{left:box.left,top:box.top,width:container.clientWidth,height:container.clientHeight,bottom:box.top+container.clientHeight},{width:floatingToolbar.current?.offsetWidth||250,height:floatingToolbar.current?.offsetHeight||30}));
  },[toolbarKey,toolbarOn,pointerActive,loadedColumn,toolbarDismissed,viewport.top,widths.join(',')]);
  const formatAggregate=value=>{const rounded=new ExactDecimal(value).round(5);if(rounded.n===0n)return "0";const locale=options.locale||"en-US",formatted=formatExact(value,{decimals:5,locale,grouping:true}),separator=new Intl.NumberFormat(locale).formatToParts(1.1).find(part=>part.type==="decimal")?.value||".";const at=formatted.lastIndexOf(separator);if(at<0)return formatted;const fraction=formatted.slice(at+separator.length).replace(/0+$/,"");return fraction?formatted.slice(0,at+separator.length)+fraction:formatted.slice(0,at)};
  useEffect(()=>{const hasSelection=selectionData.stats.count>0;onSelectionChange?.(hasSelection,hasSelection?selectedColumn:null,hasSelection?{cells:selectionData.stats.count,rows:selectionData.selectedRowCount,columns:selectionData.selectedColumnCount,scope:loadedColumn!=null?'loaded rows':'current page'}:null);return()=>onSelectionChange?.(false,null,null)},[selectionData.stats.count,selectionData.selectedRowCount,selectionData.selectedColumnCount,selectedColumn,loadedColumn,onSelectionChange]);
  function copyFormat(format,headers=false) {
    return gridCommands.copyFormat({
      selectionData, setCopyState, setMenu
    }, format, headers);
  }
  const matches=useMemo(()=>{if(!find)return [];const found=[];let regex;try{if(options.searchRegex)regex=new RegExp(find,options.caseSensitive?'':'i')}catch{return []}const normalize=text=>options.caseSensitive?String(text):String(text).toLowerCase(),needle=normalize(find);rows.forEach(({row},r)=>visible.forEach((i,c)=>{if(regex?regex.test(String(row[i]??'NULL')):normalize(row[i]??'NULL').includes(needle))found.push({r,c})}));return found},[find,rows,order,hidden,pinned,options.searchRegex,options.caseSensitive]);
  function nextMatch() {if(!matches.length)return;const next=(findIndex+1)%matches.length;setFindIndex(next);reveal(matches[next].r,matches[next].c);}
  const warnings = [...new Set(columns.filter((c,i)=>columns.findIndex(x=>x.name.toUpperCase()===c.name.toUpperCase())!==i).map(c=>`Duplicate column: ${c.name}`)), ...(options.cursorUnavailable?['Cursor closed; loaded rows remain available. Rerun to load more.']:[]), ...(options.truncated?['The source reports truncated values/results.']:[])];
  function columnHeader(i){return root.current?.querySelector(`th[data-column-index="${i}"] .result-column-title-button`)}
  function closeColumnMenu(restore=true){const i=columnMenu?.column;setColumnMenu(null);if(restore)(columnHeader(i)||root.current)?.focus({preventScroll:true})}
  function openColumnMenu(event,i){event.preventDefault();event.stopPropagation();setMenu(null);setFormatMenu(null);const rect=columnHeader(i)?.getBoundingClientRect();setColumnMenu({column:i,x:event.clientX||rect?.left||8,y:event.clientY||rect?.bottom||8})}
  function selectLoadedColumn(i){const c=visible.indexOf(i);if(c<0)return;setSelection(selectResultRange(null,0,c,{mode:'column',rowCount:rows.length,columnCount:visible.length}));setLoadedColumn(i);setCopyState('');root.current?.focus({preventScroll:true})}
  function columnAction(action,payload){
    return gridCommands.columnAction({
      aliasLabels, allRows, closeColumnMenu, columnHeader, columnMenu, columns, fit, formatTrigger, loadedColumn, onColumnAlias,
      onColumnSource, onSort, onSourceDefinition, onSql, options, pinned, rows, select, selectLoadedColumn, selected, setColumnMenu,
      setCopyState, setEditingAlias, setFormatMenu, setHidden, setInspectorMode, setInspectorVisible, setOrder, setPinned, setSizes,
      settings, visible
    }, action, payload);
  }
  const resultWindow = getResultWindow(rows.length, viewport.top, viewport.height, rowHeight);
  const spacer = height => height > 0 && <tr aria-hidden="true" className="result-spacer"><td colSpan={visible.length + 1} style={{ height }} /></tr>;
  const announced=useRef({editMode,pending:draftSummary.total,invalid:0});
  useEffect(()=>{const next={editMode,pending:draftSummary.total,invalid:0},text=gridAnnouncement(announced.current,next);announced.current=next;if(text)announce(text)},[editMode,draftSummary.total]);
  useEffect(()=>{onEditState?.({available:Boolean(sourceTable),on:editMode,descriptions:descOpen})},[sourceTable,editMode,descOpen,onEditState]);
  useEffect(()=>()=>onEditState?.({available:false,on:false,descriptions:false}),[onEditState]);
  return renderResultsGridView({
      ResultValueDialog, aliasLabels, allRows, applied, appliedLive, applyChanges, applyColumnWidths, applyErrors, applyState, autoWidths,
      beginEdit, cancelEdit, cellDetail, cellFormat, closeColumnMenu, columnAction, columnHeader, columnMenu, columns, copy, copyFormat,
      copyState, deleteFocusedRow, descMaps, descOpen, descQueries, descStatus, discardChanges, draftSummary, drafts, dropColumn, dropRow,
      editMode, editability, editing, editingAlias, executionDetails, expandCell, expanded, find, findOpen, fit, floatingToolbar,
      followSmartLink, formatAggregate, formatMenu, formatTrigger, frozen, hidden, hover, identity, inspect, inspectExpandable,
      inspectorEnabled, inspectorLocked, inspectorMode, inspectorVisible, inspectorWidth, jumpToRow, keyDown, layoutMessage, linkedColumn,
      loadDescriptions, loadedColumn, matches, matchingSourceDefinition, menu, menuRoot, nextMatch, onChildren, onColumnAlias,
      onColumnSource, onInspect, onRelated, onReorder, onSmartObject, onSort, onSourceDefinition, onSql, onTools, onVerticalView,
      openCellDrawer, openColumnMenu, openVerticalView, options, order, overlayRoot, pinned, pivotPanel, resize, resizeInspector,
      resizeInspectorKey, resultWindow, reveal, rightOffset, rightPins, root, rowHeight, rowJump, rowMarkers, rowSelected, rows, scalarText,
      select, selectAllCells, selected, selectedColumnIndices, selection, selectionData, setCopyState, setDescMaps, setDescOpen,
      setDescQueries, setDescStatus, setDrafts, setEditMode, setEditingAlias, setExecutionOpen, setExpanded, setFind, setFindIndex,
      setFindOpen, setFormatMenu, setHover, setInspectorMode, setInspectorVisible, setMenu, setRowJump, setSizes, setToolbarDismissed,
      setToolbarOn, settings, sizes, sortColumn, sortDirection, sourceColumn, sourceDefinition, sourceRowCount, sourceTable, spacer,
      stageEdit, startColumnDrag, startRowMove, startSelectionDrag, suppressColumnClick, tabFrom, toolbarKey, toolbarOn, toolbarPosition,
      updateColumnFormat, visible, warnings, widths
    });
});

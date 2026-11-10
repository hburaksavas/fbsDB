import {bindNameFor,cellDragData,cellDragType} from './resultBindDrop';
import {Feedback,notifyFeedback} from './Feedback';
import { useInspectorWidth } from './useInspectorWidth';
import {sendNativeCommand,isNativeHost,subscribeNativeMessages,getNativeTabId} from './nativeBridge';
import {columnsSignature,draftStoreKey,loadStoredDrafts,saveStoredDrafts} from './draftStore';
import {GridEditBar,CellEditor} from './GridEditBar';
import {NewRowsPanel} from './NewRowsPanel';
import {appliedReadbackCells} from './gridReadback';
import {nextEditableCell} from './tabEntry';
import {DescriptionsPanel} from './DescriptionsPanel';
import {announce,gridAnnouncement} from './announcer';
import {descriptionMap,loadLookupDescriptions,lookupColumnKey,prepareDescriptionQuery,saveLookupDescription} from './lookupDescriptions';
import {numberSeparators,parseLocaleNumber} from './localeNumber';
import {KeyPicker} from './KeyPicker';
import {mapApplyErrors} from './oracleErrorMap';
import {reconcileDrafts,resolveConflict} from './draftReconcile';
import {cellDraft,editCell,editInserted,emptyDrafts,insertRow,removeInserted,isDeleted,isDirty,pendingSummary,redo as redoDraft,settleApplied,toggleDeleted,undo as undoDraft} from './gridDrafts';
import {cellEditorKind,explainEditability} from './gridEditability';
import {buildDml} from './dmlPreview';
import {invalidDraftCells} from './cellValidation';
import { formatResultValue, matchesCondition, copyResultData, selectionStatistics, sqlIdentifier, sqlLiteral, isExpandableResultValue } from "./resultFeatures";
import { isResultCellSelected, selectResultRange, resultSelectionTsv } from "./resultSelection";
import { ExactDecimal, formatExact } from "./exactDecimal";
import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp,X,ClipboardCopy,Database,List,ListFilter } from "lucide-react";
import { getResultWindow } from "./resultWindow";
import { ColumnFormatPopover } from "./ColumnFormatPopover";
import { ColumnActionsMenu } from './ColumnActionsMenu';
import { columnOrder, moveColumn, columnSqlDraft } from './resultColumnActions';
import { resolveResultRowJump } from './resultRowJump';
import { cellOverlayPlacement, cellOverlayText } from './cellTextOverlay';
import { distributeColumnSpace, equalizeColumnWidths } from './columnWidths';
import { rowMarkerPositions } from './rowMarkers';
import { columnAliasKey, resolveColumnAliases } from './columnAliases';
import { detectSmartLink, smartLinkActionLabel } from './smartLinks';
import { codeCellText } from './codeCellModel';
const ResultValueDialog = lazy(() => import('./ResultDialogs').then(module => ({ default: module.ResultValueDialog })));
import { floatingToolbarEnabled, floatingToolbarPlacement, setFloatingToolbarEnabled } from './floatingSelectionToolbar';
import { createPortal } from 'react-dom';

const sourceDefinitionMatches=(column,definition)=>Boolean(column?.sourceTable&&definition&&String(definition.name||"").toUpperCase()===String(column.sourceColumn||column.name||"").toUpperCase()&&String(definition.table||"").toUpperCase()===String(column.sourceTable||"").toUpperCase()&&(!column.sourceSchema||!definition.schema||String(definition.schema).toUpperCase()===String(column.sourceSchema).toUpperCase()));

export const ResultsGrid = memo(function ResultsGrid({ rows: sourceRows, textFilter = '', columns, sortColumn, sortDirection, onSort, onInspect, onReorder, options = {}, onOptionsChange, onTools, command, onSql, onRelated, allRows = sourceRows, onChildren,onSourceDefinition,sourceDefinition,onCloseSourceDefinition,executionDetails,onUpdateDraft,onSelectionChange,onEditState,onLayoutChange,pivotPanel,pivotPanelOpen=false,onClosePivotPanel,inspectorEnabled=true,sourceRowCount,pageSize,onRowPage,columnAliases,onColumnAlias,onSmartObject,linkedColumn,onColumnSource }) {
  const [toolbarOn,setToolbarOn]=useState(()=>floatingToolbarEnabled(globalThis.localStorage)),[toolbarDismissed,setToolbarDismissed]=useState(null),[toolbarPosition,setToolbarPosition]=useState(null),[pointerActive,setPointerActive]=useState(false),floatingToolbar=useRef(null);
  const [editingAlias,setEditingAlias]=useState(null);
  const aliasLabels=useMemo(()=>onColumnAlias?resolveColumnAliases(columns,columnAliases||{}).labels:[],[columns,columnAliases,onColumnAlias]);
  const [rowJump,setRowJump]=useState(null),[pendingRow,setPendingRow]=useState(null),[expanded,setExpanded]=useState(null),overlayRoot=useRef(null);
  const storeKey=useMemo(()=>draftStoreKey(getNativeTabId(),columns),[columns]),columnLayout=useMemo(()=>columnsSignature(columns),[columns]);
  const restored=useRef(undefined);
  if(restored.current===undefined)restored.current=loadStoredDrafts(storeKey,columnLayout);
  const [editMode,setEditMode]=useState(()=>restored.current?.editMode??false),[drafts,setDrafts]=useState(()=>restored.current?.drafts??emptyDrafts()),[editing,setEditing]=useState(null),[identity,setIdentity]=useState(()=>restored.current?.identity??null),editRef=useRef(null),[applied,setApplied]=useState({cells:{},deleted:[],base:null}),[applyState,setApplyState]=useState(null),[manualKey,setManualKey]=useState(()=>restored.current?.manualKey??null),[applyErrors,setApplyErrors]=useState([]),[descOpen,setDescOpen]=useState(false),[descQueries,setDescQueries]=useState(()=>loadLookupDescriptions(globalThis.localStorage)),[descMaps,setDescMaps]=useState({}),[descStatus,setDescStatus]=useState(''),evalWaiters=useRef(new Map()),draftsRef=useRef(null),previousOriginals=useRef(null),lastSourceRows=useRef(restored.current?.rows??null);
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
  useEffect(()=>{if(firstLayout.current===columnLayout)return;firstLayout.current=columnLayout;if(isDirty(draftsRef.current))notifyFeedback({kind:'warning',title:'Edits discarded',message:`${pendingSummary(draftsRef.current).total} unapplied edit${pendingSummary(draftsRef.current).total===1?'':'s'} were discarded because a different result replaced this one.`});setDrafts(emptyDrafts());setEditing(null);editRef.current=null;setIdentity(null);setEditMode(false);setApplied({cells:{},deleted:[],base:null});setApplyState(null);setApplyErrors([]);setManualKey(null)},[columnsKey])
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
    if(storeKey)saveStoredDrafts(storeKey,isDirty(drafts)?{signature:columnLayout,drafts,editMode,identity,manualKey,rows:originalRows}:null);
  },[storeKey,columnLayout,drafts,editMode,identity,manualKey,originalRows]);
  useEffect(()=>subscribeNativeMessages(message=>{
    if(message.type==='sql.evaluated'&&evalWaiters.current.has(message.requestId)){evalWaiters.current.get(message.requestId)(message);evalWaiters.current.delete(message.requestId);return}
    if(message.type==='transaction.state'&&!message.pending&&message.state==='rolled back')setApplied({cells:{},deleted:[],base:null});
  }),[]);
  useEffect(()=>{
    const reset=event=>{if(!storeKey||!storeKey.startsWith(`${event.detail?.tabId}|`))return;setDrafts(emptyDrafts());setEditMode(false);setEditing(null);editRef.current=null;setManualKey(null);setApplyErrors([]);setApplied({cells:{},deleted:[],base:null})};
    window.addEventListener('fbsdb.draftsCleared',reset);return()=>window.removeEventListener('fbsdb.draftsCleared',reset);
  },[storeKey]);
  const editabilityRef=useRef(null);
  const editability=useMemo(()=>editMode||isDirty(drafts)?explainEditability(columns,{primaryKey:identity?.columns?.length?identity.columns:manualKey?manualKey.map(index=>columns[index].sourceColumn||columns[index].name):identity?.columns??null,privileges:identity?.privileges??null}):null,[editMode,isDirty(drafts),columns,identity,manualKey]);
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
  const [menu, setMenu] = useState(null), [detailsRow, setDetailsRow] = useState(null), [executionOpen,setExecutionOpen]=useState(false), [inspectorMode,setInspectorModeState]=useState('row'), [inspectorVisible,setInspectorVisible]=useState(false), [hover, setHover] = useState(null), [find, setFind] = useState(""), [findOpen,setFindOpen] = useState(false), [findIndex,setFindIndex] = useState(-1), [layoutMessage,setLayoutMessage] = useState("");
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
    if(!Number.isInteger(source)||!Number.isInteger(target)||source===target)return;
    const ordered=[...new Set([...order.filter(index=>Number.isInteger(index)&&index>=0&&index<columns.length),...columns.map((_,index)=>index)])],from=ordered.indexOf(source);
    if(from<0||!ordered.includes(target))return;
    ordered.splice(from,1);
    const targetIndex=ordered.indexOf(target),targetHeader=root.current?.querySelector(`th[data-column-index="${target}"]`),rect=targetHeader?.getBoundingClientRect(),after=rect?x>rect.left+rect.width/2:false;
    ordered.splice(Math.max(0,targetIndex+(after?1:0)),0,source);setOrder(ordered);
  }
  function startColumnDrag(event,index){
    if(event.button!==0)return;
    const drag={index,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,active:false,target:null};dragColumn.current=drag;
    const move=moveEvent=>{
      if(moveEvent.pointerId!==drag.pointerId)return;
      if(!drag.active&&Math.abs(moveEvent.clientX-drag.startX)+Math.abs(moveEvent.clientY-drag.startY)>6){drag.active=true;document.body.classList.add("column-reordering")}
      if(!drag.active)return;
      moveEvent.preventDefault();
      const target=document.elementFromPoint(moveEvent.clientX,moveEvent.clientY)?.closest("th[data-column-index]");
      drag.target=target?Number(target.dataset.columnIndex):null;setDropColumn(drag.target);
    };
    const finish=finishEvent=>{
      if(finishEvent.pointerId!==drag.pointerId)return;
      document.removeEventListener("pointermove",move);document.removeEventListener("pointerup",finish);document.removeEventListener("pointercancel",finish);document.body.classList.remove("column-reordering");
      if(drag.active){suppressColumnClick.current=true;if(drag.target!=null)reorderColumn(drag.index,drag.target,finishEvent.clientX);setTimeout(()=>{suppressColumnClick.current=false},0)}
      dragColumn.current=null;setDropColumn(null);
    };
    document.addEventListener("pointermove",move);document.addEventListener("pointerup",finish);document.addEventListener("pointercancel",finish);
  }
  function selectAllCells() {
    setLoadedColumn(null);
    if (!rows.length || !visible.length) return;
    setSelection(selectResultRange(selectResultRange(null, 0, 0, { rowCount: rows.length, columnCount: visible.length }), rows.length - 1, visible.length - 1, { extend: true, rowCount: rows.length, columnCount: visible.length }));
    setCopyState(""); root.current?.focus({ preventScroll: true });
  }
  function startRowMove(event, source) {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); selectionDragCleanup.current?.();
    const handle = event.currentTarget; handle.setPointerCapture(event.pointerId);
    let x = event.clientX, y = event.clientY, moved = false, target = null, animation;
    const startX = x, startY = y;
    const update = () => {
      if (!moved) return;
      const rect = root.current.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.max(rect.left + 20, Math.min(rect.right - 14, x)), Math.max(rect.top + 41, Math.min(rect.bottom - 14, y)))?.closest("tr[data-result-row]");
      if (!hit || !root.current.contains(hit)) { target = null; setDropRow(null); return; }
      const rowRect = hit.getBoundingClientRect();
      target = { index: Number(hit.dataset.resultRow), after: y > rowRect.top + rowRect.height / 2 };
      setDropRow(target);
    };
    const move = e => { if (e.pointerId !== event.pointerId) return; x = e.clientX; y = e.clientY; moved ||= Math.abs(x - startX) + Math.abs(y - startY) > 4; update(); };
    const tick = () => {
      if (moved) { const rect = root.current.getBoundingClientRect(); const dy = y < rect.top + 55 ? -12 : y > rect.bottom - 24 ? 12 : 0; if (dy) { root.current.scrollTop += dy; update(); } }
      animation = requestAnimationFrame(tick);
    };
    const cleanup = () => {
      cancelAnimationFrame(animation); document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", end); document.removeEventListener("pointercancel", cancel); document.defaultView.removeEventListener("blur", cancel);
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      selectionDragCleanup.current = null; setDropRow(null);
    };
    const end = e => { if (e.pointerId !== event.pointerId) return; if (moved && target && target.index !== source) onReorder?.(source, target.index, target.after); cleanup(); };
    const cancel = () => cleanup();
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", end); document.addEventListener("pointercancel", cancel); document.defaultView.addEventListener("blur", cancel);
    selectionDragCleanup.current = cleanup; animation = requestAnimationFrame(tick);
  }
  function startSelectionDrag(event) {
    if (event.button !== 0 || event.target.closest(".row-move-handle")) return;
    const cell = event.target.closest("[data-cell], [data-row-select]");
    if (!cell || !root.current.contains(cell)) return;
    event.preventDefault();
    const mode = cell.hasAttribute("data-row-select") ? "row" : "cell";
    const [r, c] = mode === "row" ? [Number(cell.dataset.rowSelect), 0] : cell.dataset.cell.split(":").map(Number);
    select(r, c, event.shiftKey, mode, event.ctrlKey || event.metaKey);
    setPointerActive(true);window.addEventListener('pointerup',()=>setPointerActive(false),{once:true});
    selectionDragCleanup.current?.();
    let x = event.clientX, y = event.clientY, lastR = r, lastC = c, animation, dragging=false;
    const startX=x,startY=y;
    const update = () => {
      const element = root.current, rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.max(rect.left + 2, Math.min(rect.right - 12, x)), Math.max(rect.top + 40, Math.min(rect.bottom - 12, y)))?.closest("[data-cell], [data-row-select]");
      if (!hit || !element.contains(hit)) return;
      const [nextR, nextC] = hit.hasAttribute("data-row-select") ? [Number(hit.dataset.rowSelect), 0] : hit.dataset.cell.split(":").map(Number);
      if (nextR !== lastR || nextC !== lastC) {
        lastR = nextR; lastC = nextC;
        setSelection(previous => selectResultRange(previous, nextR, mode === "row" ? 0 : nextC, { extend: true, mode }));
      }
    };
    const move = e => { if (e.pointerId !== event.pointerId) return; x = e.clientX; y = e.clientY; dragging ||= Math.abs(x-startX)+Math.abs(y-startY)>4; if(dragging)update(); };
    const tick = () => {
      const element = root.current, rect = element.getBoundingClientRect();
      const dy = y < rect.top + 55 ? -14 : y > rect.bottom - 24 ? 14 : 0;
      const dx = mode === "cell" ? x < rect.left + 45 ? -14 : x > rect.right - 24 ? 14 : 0 : 0;
      if (dragging && (dy || dx)) { element.scrollTop += dy; element.scrollLeft += dx; update(); }
      animation = requestAnimationFrame(tick);
    };
    const end = e => { if (e?.pointerId != null && e.pointerId !== event.pointerId) return; cleanup(); };
    const cleanup = () => {
      cancelAnimationFrame(animation); document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", end); document.removeEventListener("pointercancel", end); document.defaultView.removeEventListener("blur", cleanup); selectionDragCleanup.current = null;
    };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end); document.defaultView.addEventListener("blur", cleanup);
    selectionDragCleanup.current = cleanup; animation = requestAnimationFrame(tick);
  }
  useEffect(()=>{if(detailsRow!=null&&selection)setDetailsRow(selection.focus.r)},[selection]);
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
    const item=rows[r],col=visible[c];
    if(!item||col==null||applyState)return;
    const info=editability?.columns[col];
    if(!info?.editable){notifyFeedback({kind:'info',title:'Edit rows',message:info?.reason||'This cell cannot be edited.'});return}
    const original=scalarText(originalRows.get(item.index)?.[col]);
    if(original===undefined){notifyFeedback({kind:'info',title:'Edit rows',message:'Dates, binary and structured values are not edited as text.'});return}
    const draft=cellDraft(drafts,item.index,col),kind=cellEditorKind(columns[col],draft?draft.value:original);
    const next={r,c,col,rowIndex:item.index,original,initial:draft?(draft.isNull?'':draft.value):original??'',typed:kind==='datetime'?undefined:typed,kind};
    editRef.current=next;setEditing(next);
  }
  function stageEdit(text){
    const active=editRef.current;
    if(!active)return;
    editRef.current=null;setEditing(null);
    if(/NUMBER|INTEGER|INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL/i.test(columns[active.col]?.type||'')&&text.trim()!==''){const parsed=parseLocaleNumber(text,numberSeparators(options.locale));if(parsed.value!==undefined)text=parsed.value}
    setApplyErrors(current=>current.filter(item=>!(item.row===active.rowIndex&&(item.col===active.col||item.col==null))));
    // Oracle stores empty text as NULL, so clearing a cell means NULL.
    setDrafts(current=>editCell(current,active.rowIndex,active.col,active.original,text===''?{isNull:true}:{value:text}));
    root.current?.focus();
  }
  function cancelEdit(){editRef.current=null;setEditing(null);root.current?.focus()}
  function applyChanges(){
    const current=draftsRef.current;
    if(applyState||!isDirty(current))return;
    if(!editability?.editable||!isNativeHost){notifyFeedback({kind:'info',title:'Apply',message:editability?.reasons?.[0]||'This result cannot be edited.'});return}
    // Values Oracle would reject, or store differently than typed (a zoned date without its offset), stop here and are marked in the grid.
    const invalid=invalidDraftCells(current.cells,columns);
    if(invalid.length){setApplyErrors(invalid);notifyFeedback({kind:'error',title:'Apply',message:`Row ${invalid[0].row+1}: ${invalid[0].message}${invalid.length>1?` (${invalid.length-1} more marked in the grid)`:''}\nNothing was sent.`});return}
    const built=buildDml({table:editability.table,columns,identity:editability.identity,rowAt:index=>originalRows.get(index),drafts:current});
    if(built.problems.length||!built.statements.length){notifyFeedback({kind:'error',title:'Apply',message:built.problems.join('\n')||'There is nothing to apply.'});return}
    setApplyErrors([]);
    // One batch: if any statement fails, Oracle returns to the point before Apply and the changes stay in the grid.
    const requestId=sendNativeCommand('sql.applyDml',{statements:built.statements.map(item=>({kind:item.kind,sql:item.sql,binds:item.binds,expectRows:item.expectRows,readColumns:item.readColumns})),timeoutSeconds:60,onFailure:'rollback'});
    setApplyState({requestId,statements:built.statements});
  }
  function discardChanges(){
    const total=pendingSummary(draftsRef.current).total;
    if(!total||!globalThis.confirm?.(`Discard ${total} unapplied change${total===1?'':'s'}?`))return;
    cancelEdit();setDrafts(emptyDrafts());setApplyErrors([]);
  }
  function focusedCell(){const focus=selection?.focus;if(!focus)return null;const item=rows[focus.r],col=visible[focus.c];return item&&col!=null?{r:focus.r,c:focus.c,rowIndex:item.index,col}:null}
  function setFocusedNull(){const cell=focusedCell();if(!cell)return;const info=editability?.columns[cell.col];if(!info?.editable){notifyFeedback({kind:'info',title:'Edit rows',message:info?.reason||'This cell cannot be edited.'});return}const original=scalarText(originalRows.get(cell.rowIndex)?.[cell.col]);if(original===undefined)return;setDrafts(current=>editCell(current,cell.rowIndex,cell.col,original,{isNull:true}))}
  function tabFrom(r,c,direction){
    const step=nextEditableCell({rowCount:rows.length,visible,isEditable:col=>Boolean(editability?.columns[col]?.editable)},{r,c},direction);
    if(step.end||step.none||step.start)return;
    select(step.r,step.c);setTimeout(()=>beginEdit(step.r,step.c),0);
  }
  async function loadDescriptions(col,template){
    const plan=prepareDescriptionQuery(template,sourceRows.map(item=>scalarText(item.row[col])));
    if(plan.error){setDescStatus(plan.error);return}
    setDescStatus('Reading descriptions…');
    const requestId=sendNativeCommand('sql.evaluate',{sql:plan.sql,parameters:plan.parameters,rowLimit:50,timeoutSeconds:30});
    const reply=await new Promise(resolve=>{evalWaiters.current.set(requestId,resolve);setTimeout(()=>{if(evalWaiters.current.delete(requestId))resolve({error:'No answer from Oracle within 30 seconds.'})},31000)});
    if(reply.error){setDescStatus(reply.error);return}
    const map=descriptionMap(reply.rows||[]);
    setDescMaps(current=>({...current,[col]:map}));
    setDescStatus(`${map.size} description${map.size===1?'':'s'} for ${plan.covered} of ${plan.total} distinct value${plan.total===1?'':'s'}${plan.covered<plan.total?` (the first ${plan.covered} were read)`:''}. The stored values are unchanged.`);
  }
  function deleteFocusedRow(){const cell=focusedCell();if(cell)setDrafts(current=>toggleDeleted(current,cell.rowIndex))}
  function keyDown(event) {
    if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key.toLowerCase()==='p'){event.preventDefault();onTools?.('Commands');return;}
    if((event.ctrlKey||event.metaKey)&&event.altKey&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();jumpToMark(event.key==='ArrowDown'?1:-1);return;}
    if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&event.key.toLowerCase()==='g'){event.preventDefault();setRowJump({value:'',message:''});return;}
    if (!rows.length || !visible.length) return;
    if (event.key === "Escape") { setLoadedColumn(null);setSelection(null); return; }
    if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();const rect=root.current.getBoundingClientRect();const focus=selection?.focus||{r:0,c:0};if(!selection)select(0,0);setMenu({x:Math.min(rect.left+40,document.documentElement.clientWidth-265),y:Math.max(5,Math.min(rect.top+45,document.documentElement.clientHeight-450)),column:visible[focus.c],row:focus.r});return;}
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") { event.preventDefault(); setLoadedColumn(null);setSelection(selectResultRange(selectResultRange(null, 0, 0), rows.length - 1, visible.length - 1, { extend: true })); return; }
    const current = selection?.focus || { r: 0, c: 0 };
    if(editMode&&(event.ctrlKey||event.metaKey)&&!event.shiftKey&&!event.altKey&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();setDrafts(state=>event.key.toLowerCase()==='z'?undoDraft(state):redoDraft(state));return}
    if(editMode&&editability?.editable&&selection&&!event.altKey&&!event.ctrlKey&&!event.metaKey){
      if(!event.shiftKey&&(event.key==='F2'||event.key==='Enter')){event.preventDefault();beginEdit(current.r,current.c);return}
      if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();setFocusedNull();return}
      // Typing on a selected cell starts editing it with that character, as in a spreadsheet.
      if(event.key.length===1){event.preventDefault();beginEdit(current.r,current.c,event.key);return}
    }
    if (event.altKey && event.key === "Enter") { event.preventDefault(); expandCell(current.r, current.c); return; }
    if (event.shiftKey && event.key === "Enter") { event.preventDefault(); openCellDrawer(current.r, current.c); return; }
    if (event.key === "Enter" || event.key === "F2") { event.preventDefault(); inspect(current.r, current.c); return; }
    const directions = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Home: [0, -visible.length], End: [0, visible.length], PageUp: [-Math.max(1, Math.floor(viewport.height / rowHeight) - 2), 0], PageDown: [Math.max(1, Math.floor(viewport.height / rowHeight) - 2), 0] };
    if (!directions[event.key]) return;
    event.preventDefault(); const [dr, dc] = directions[event.key];
    const r = Math.max(0, Math.min(rows.length - 1, current.r + dr)), c = Math.max(0, Math.min(visible.length - 1, current.c + dc));
    select(r, c, event.shiftKey, selection?.mode === "row" && dc === 0 ? "row" : "cell");
    const top = r * rowHeight, bottom = top + rowHeight + 39;
    if (top < root.current.scrollTop) root.current.scrollTop = top;
    else if (bottom > root.current.scrollTop + root.current.clientHeight) root.current.scrollTop = bottom - root.current.clientHeight;
    const left = 37 + widths.slice(0, c).reduce((a, b) => a + b, 0), right = left + widths[c];
    if (visible[c] !== pinned) {
      if (left < root.current.scrollLeft + 37) root.current.scrollLeft = left - 37;
      else if (right > root.current.scrollLeft + root.current.clientWidth) root.current.scrollLeft = right - root.current.clientWidth;
    }
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
    const current=selection?.focus?.r??-1,marks=new Set(options.marks||[]),positions=rows.map((item,r)=>marks.has(item.index)?r:-1).filter(r=>r>=0);
    if(!positions.length){setLayoutMessage('No marked rows in this view.');return}
    const next=direction>0?positions.find(r=>r>current)??positions[0]:[...positions].reverse().find(r=>r<current)??positions.at(-1);
    reveal(next,selection?.focus?.c||0);
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
    const target=resolveResultRowJump(value,{rows,viewRows:allRows,loadedCount:sourceRowCount??allRows.length,frozenRows:options.frozenRows||[],pageSize:onRowPage?pageSize:0});
    if(target.position!=null){reveal(target.position,selection?.focus?.c||0);return ''}
    if(target.page!=null){setPendingRow(target.index);onRowPage(target.page);return ''}
    return target.error||target.message;
  }
  function reveal(r,c) { select(r,c); root.current.scrollTop = Math.max(0,r*rowHeight-50); root.current.scrollLeft = Math.max(0, widths.slice(0,c).reduce((a,b)=>a+b,0)); }
  function performCommand(command) {
    if(!command) return;
    if(command.type==='batch'){command.actions.forEach(performCommand);return;}
    if(command.type==='toggleEdit'){setEditMode(on=>!on);cancelEdit();return;}
    if(command.type==='toggleDescriptions'){setDescOpen(open=>!open);return;}
    if(command.type==='resetView'){setLoadedColumn(null);setColumnMenu(null);setSelection(null);setSizes({});setHidden([]);setPinned(null);setOrder([]);setMenu(null);setFormatMenu(null);setDropColumn(null);setDetailsRow(null);setExecutionOpen(false);setInspectorVisible(false);setInspectorMode('row');setFind('');setFindOpen(false);setFindIndex(-1);setCopyState('');setLayoutMessage('');selectionDragCleanup.current?.();onCloseSourceDefinition?.();return;}
    if(command.type==='layoutApply'){setHidden(command.layout.hidden||[]);setPinned(command.layout.pinned??null);setOrder(command.layout.order||[]);setSizes(command.layout.sizes||{});return;}
    if(['source','related','children','selectColumnSql','whereSql','orderSql','updateDraft','openUrl'].includes(command.type)){
      const focus=selection?.focus;if(!focus||!rows[focus.r])return;const i=visible[focus.c],column=columns[i],row=rows[focus.r].row,value=row[i];
      if(command.type==='source'&&column.sourceTable)onSourceDefinition?.(column);
      if(command.type==='related'&&column.sourceTable)onRelated?.(column,value,Object.fromEntries(columns.map((c,index)=>[c.sourceColumn||c.name,row[index]])));
      if(command.type==='children'&&column.sourceTable)onChildren?.(column,Object.fromEntries(columns.map((c,index)=>[c.sourceColumn||c.name,row[index]])));
      if(command.type==='updateDraft')onUpdateDraft?.(columns,selectionData.fullRows.length?selectionData.fullRows:[row]);
      if(command.type==='selectColumnSql')onSql?.(sqlIdentifier(column.sourceColumn||column.name));
      if(command.type==='whereSql')onSql?.(`WHERE ${sqlIdentifier(column.sourceColumn||column.name)} ${value==null?'IS NULL':`= ${sqlLiteral(value)}`}`);
      if(command.type==='orderSql')onSql?.(`ORDER BY ${sqlIdentifier(column.sourceColumn||column.name)}`);
      if(command.type==='openUrl'&&/^https?:\/\//i.test(String(value))){if(isNativeHost)sendNativeCommand('result.openUrl',{url:String(value)});else document.defaultView.open(String(value),'_blank','noopener')}
    }
    if(command.type==='copyTsv')copyFormat('tsv');
    if(command.type==='copyFormat')copyFormat(command.format,command.headers);
    if(command.type==='inspect'){const focus=selection?.focus;if(focus)inspect(focus.r,focus.c)}
    if(command.type==='details'){setDetailsRow(current=>selection?.focus.r??current??null);setInspectorMode('row');setInspectorVisible(true)}
    if(command.type==='execution'){setExecutionOpen(true);setInspectorMode('execution');setInspectorVisible(true)}
    if(command.type==='marks')settings({markedOnly:!options.markedOnly});
    if(command.type==='columnVisible')setHidden(current=>command.visible?current.filter(i=>i!==command.column):[...new Set([...current,command.column])]);
    if(command.type==='columnPin')setPinned(current=>current===command.column?null:command.column);
    if(command.type==='showAll')setHidden([]);
    if(command.type==='find')setFindOpen(true);
    if(command.type==='jumpRow')setRowJump({value:'',message:''});
    if(command.type==='copyJson')copyFormat('json');
    if(command.type==='freezeSelection')settings({frozenRows:[...new Set([...(options.frozenRows||[]),...rows.filter((_,r)=>visible.some((_,c)=>selected(r,c))).map(item=>item.index)])].slice(0,10)});
    if(command.type==='unfreeze')settings({frozenRows:[]});
    if(command.type==='hideSelection')setHidden(current=>[...new Set([...current,...visible.filter((_,c)=>rows.some((_,r)=>selected(r,c)))])]);
    if(command.type==='useVisibleExport')command.apply?.(visible);
    if(command.type==='equalWidths'||command.type==='fitViewport') {const selectedColumns=visible.filter((_,c)=>rows.some((_,r)=>selected(r,c)));const targets=selectedColumns.length?selectedColumns:visible;const size=command.type==='fitViewport'?Math.max(70,Math.floor((root.current.clientWidth-37)/visible.length)):160;setSizes(current=>({...current,...Object.fromEntries(targets.map(i=>[i,size]))}));}
    if(command.type==='fitAll') visible.forEach(fit);
    if(command.type==='goTo'&&command.kind==='row') {const message=jumpToRow(command.target);if(message)setLayoutMessage(message);}
    else if(command.type==='goTo') {const c=visible.findIndex(i=>columns[i].name.toLowerCase()===String(command.target).toLowerCase());if(c>=0)reveal(0,c);else setLayoutMessage('Column is not visible in this view.');}
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
  async function copyFormat(format,headers=false) {try{await navigator.clipboard.writeText(copyResultData(selectionData.rows,selectionData.columns,format,headers));setCopyState('Selection copied');notifyFeedback({kind:'success',title:'Results',message:'Selection copied'});}catch{setCopyState('Clipboard unavailable');notifyFeedback({kind:'error',title:'Results',message:'Clipboard unavailable'})}setMenu(null);}
  const matches=useMemo(()=>{if(!find)return [];const found=[];let regex;try{if(options.searchRegex)regex=new RegExp(find,options.caseSensitive?'':'i')}catch{return []}const normalize=text=>options.caseSensitive?String(text):String(text).toLowerCase(),needle=normalize(find);rows.forEach(({row},r)=>visible.forEach((i,c)=>{if(regex?regex.test(String(row[i]??'NULL')):normalize(row[i]??'NULL').includes(needle))found.push({r,c})}));return found},[find,rows,order,hidden,pinned,options.searchRegex,options.caseSensitive]);
  function nextMatch() {if(!matches.length)return;const next=(findIndex+1)%matches.length;setFindIndex(next);reveal(matches[next].r,matches[next].c);}
  const warnings = [...new Set(columns.filter((c,i)=>columns.findIndex(x=>x.name.toUpperCase()===c.name.toUpperCase())!==i).map(c=>`Duplicate column: ${c.name}`)), ...(options.cursorUnavailable?['Cursor closed; loaded rows remain available. Rerun to load more.']:[]), ...(options.truncated?['The source reports truncated values/results.']:[])];
  function columnHeader(i){return root.current?.querySelector(`th[data-column-index="${i}"] .result-column-title-button`)}
  function closeColumnMenu(restore=true){const i=columnMenu?.column;setColumnMenu(null);if(restore)(columnHeader(i)||root.current)?.focus({preventScroll:true})}
  function openColumnMenu(event,i){event.preventDefault();event.stopPropagation();setMenu(null);setFormatMenu(null);const rect=columnHeader(i)?.getBoundingClientRect();setColumnMenu({column:i,x:event.clientX||rect?.left||8,y:event.clientY||rect?.bottom||8})}
  function selectLoadedColumn(i){const c=visible.indexOf(i);if(c<0)return;setSelection(selectResultRange(null,0,c,{mode:'column',rowCount:rows.length,columnCount:visible.length}));setLoadedColumn(i);setCopyState('');root.current?.focus({preventScroll:true})}
  function columnAction(action,payload){
    const i=columnMenu.column,column=columns[i],c=visible.indexOf(i),trigger=columnHeader(i);
    if(action==='alias'){const value=aliasLabels[i]||column.name;closeColumnMenu(false);setTimeout(()=>setEditingAlias({column:i,value}));return}
    if(action==='sourceExpression'){closeColumnMenu(false);onColumnSource?.(i,true);return}
    if(action==='clearAlias'){onColumnAlias?.(columnAliasKey(columns,i),'');closeColumnMenu();return}
    const clipboard=text=>{navigator.clipboard.writeText(text).then(()=>{setCopyState('Column copied');notifyFeedback({kind:'success',title:'Results',message:'Column copied'})},()=>{setCopyState('Clipboard unavailable');notifyFeedback({kind:'error',title:'Results',message:'Clipboard unavailable'})})};
    if(action==='format'){const rect=trigger.getBoundingClientRect();formatTrigger.current=trigger;setFormatMenu({column:i,position:{left:Math.max(8,Math.min(rect.left,innerWidth-300)),top:Math.max(8,Math.min(rect.bottom+6,innerHeight-450))}});closeColumnMenu(false);return;}
    if(action==='sql'){closeColumnMenu(false);onSql?.(columnSqlDraft(column,payload));return;}
    if(action==='source'){closeColumnMenu(false);select(0,c);setInspectorMode('source');setInspectorVisible(true);onSourceDefinition?.(column);return;}
    if(action==='select'){selectLoadedColumn(i);setColumnMenu(null);return;}
    if(action==='copyName')clipboard(column.name);
    if(action==='copyIdentifier')clipboard(columnSqlDraft(column,'identifier'));
    if(action==='copyAll')clipboard(copyResultData(allRows.map(item=>[item.row[i]]),[column],'tsv',Boolean(payload)));
    if(action==='copySelected'){const selectedRows=loadedColumn===i?allRows:rows.filter((_,r)=>selected(r,c));clipboard(copyResultData(selectedRows.map(item=>[item.row[i]]),[column],'tsv'));}
    if(action==='sort')onSort?.(i,payload);
    if(action==='filter')settings({filters:[...(options.filters||[]),payload]});
    if(action==='clearFilters')settings({filters:(options.filters||[]).filter(rule=>rule.column!==i)});
    if(action==='highlight')settings({rules:[...(options.rules||[]),payload]});
    if(action==='clearHighlights'){const rules=(options.rules||[]).filter(rule=>rule.column!==i);settings({rules,...(!rules.length?{highlightedOnly:false}:{})});}
    if(action==='fitContent'||action==='fitTitle')fit(i,action==='fitTitle');
    if(action==='width')setSizes(current=>({...current,[i]:Math.max(70,Math.min(1200,payload))}));
    if(action==='pin'){if(payload==='left'){setPinned(i);settings({pinnedRight:(options.pinnedRight||[]).filter(index=>index!==i)})}else if(payload==='right'){if(pinned===i)setPinned(null);settings({pinnedRight:[...new Set([...(options.pinnedRight||[]),i])]})}else{if(pinned===i)setPinned(null);settings({pinnedRight:(options.pinnedRight||[]).filter(index=>index!==i)})}}
    if(action==='move')setOrder(current=>moveColumn(current,columns.length,i,payload));
    if(action==='hide')setHidden(current=>[...new Set([...current,i])]);
    if(action==='show')setHidden(current=>current.filter(index=>index!==payload));
    if(action==='showAll')setHidden([]);
    closeColumnMenu(true);
  }
  const resultWindow = getResultWindow(rows.length, viewport.top, viewport.height, rowHeight);
  const spacer = height => height > 0 && <tr aria-hidden="true" className="result-spacer"><td colSpan={visible.length + 1} style={{ height }} /></tr>;
  const announced=useRef({editMode,pending:draftSummary.total,invalid:0});
  useEffect(()=>{const next={editMode,pending:draftSummary.total,invalid:0},text=gridAnnouncement(announced.current,next);announced.current=next;if(text)announce(text)},[editMode,draftSummary.total]);
  useEffect(()=>{onEditState?.({available:Boolean(sourceTable),on:editMode,descriptions:descOpen})},[sourceTable,editMode,descOpen,onEditState]);
  useEffect(()=>()=>onEditState?.({available:false,on:false,descriptions:false}),[onEditState]);
  return <><Feedback kind={/unavailable/i.test(copyState)?"error":layoutMessage?"warning":"success"} title="Results">{copyState||layoutMessage}</Feedback>{(sourceTable||editMode)&&<GridEditBar editability={editability} loading={editMode&&Boolean(sourceTable)&&isNativeHost&&!identity} editMode={editMode} onToggle={()=>{setEditMode(on=>!on);cancelEdit()}} summary={draftSummary} applying={Boolean(applyState)} onApply={applyChanges} onDiscard={discardChanges} onNewRow={()=>setDrafts(current=>insertRow(current,{}))} onDeleteRow={deleteFocusedRow} hasSelection={Boolean(selection)} onDescriptions={()=>setDescOpen(open=>!open)}/>}{editMode&&editability?.keyProblem==='absent'&&identity&&<KeyPicker columns={columns} rows={sourceRows} onUse={setManualKey}/>}{editMode&&editability?.editable&&manualKey&&!identity?.columns?.length&&<p className="grid-edit-note key-note" role="status">Using {manualKey.map(index=>columns[index].name).join(', ')} as the row identity (chosen by you; Oracle checks that each statement changes exactly one row).</p>}{descOpen&&<DescriptionsPanel columns={columns} queries={descQueries} status={descStatus} onSave={(key,text)=>setDescQueries(saveLookupDescription(globalThis.localStorage,key,text))} onLoad={loadDescriptions} onClear={(col,key)=>{setDescQueries(saveLookupDescription(globalThis.localStorage,key,''));setDescMaps(current=>{const next={...current};delete next[col];return next});setDescStatus('')}} onClose={()=>setDescOpen(false)}/>}{editMode&&editability?.editable&&drafts.inserted.length>0&&<NewRowsPanel rows={drafts.inserted} columns={columns} editability={editability} onChange={(id,col,input)=>setDrafts(current=>editInserted(current,id,col,input))} onRemove={id=>setDrafts(current=>removeInserted(current,id))}/>}{findOpen&&<div className="result-find"><input autoFocus aria-label="Find in result cells" placeholder="Find in this page" value={find} onChange={e=>{setFind(e.target.value);setFindIndex(-1)}} onKeyDown={e=>{if(e.key==='Enter')nextMatch();if(e.key==='Escape')setFindOpen(false)}}/><span>{matches.length} matches</span><button className="results-tool" title="Next match" aria-label="Next match" onClick={nextMatch}><ArrowDown size={14}/></button><button aria-label="Close result find" onClick={()=>setFindOpen(false)}><X size={14}/></button></div>}{rowJump&&<div className="result-find result-row-jump"><input autoFocus inputMode="numeric" aria-label="Go to result row" placeholder="Row number" value={rowJump.value} onChange={e=>setRowJump({value:e.target.value,message:''})} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setRowJump(null);root.current?.focus();return}if(e.key!=='Enter')return;e.preventDefault();const message=jumpToRow(rowJump.value);if(message){setRowJump({...rowJump,message});return}setRowJump(null);root.current?.focus()}}/><span role="status" title="Numbers follow the loaded result order shown in the # column; filters and sorts do not renumber rows.">{rowJump.message||`Loaded order · ${(sourceRowCount??allRows.length).toLocaleString('en-US')} rows`}</span><button aria-label="Close go to row" onClick={()=>{setRowJump(null);root.current?.focus()}}><X size={14}/></button></div>}{expanded&&createPortal(<div ref={overlayRoot} tabIndex={-1} className="result-cell-overlay theme-scope" data-theme={expanded.theme} role="dialog" aria-label={`Cell text: ${expanded.column}, row ${expanded.row}`} style={{left:expanded.placement.left,top:expanded.placement.top,bottom:expanded.placement.bottom,width:expanded.placement.width,maxHeight:expanded.placement.maxHeight}}><header><strong>{expanded.column}</strong><span>Row {expanded.row}{expanded.clipped?'':' · not clipped'}</span><button aria-label="Close cell text" onClick={()=>{setExpanded(null);root.current?.focus()}}><X size={13}/></button></header><pre>{expanded.text}</pre>{expanded.truncated&&<p>Showing the first {expanded.text.length.toLocaleString('en-US')} of {expanded.length.toLocaleString('en-US')} characters. Use Inspect value for the full value.</p>}</div>,document.body)}{warnings.length>0&&<Feedback kind="warning" title="Result warnings">{warnings.join("\n")}</Feedback>}{frozen.length>0&&<div className="result-frozen-rows"><table className="result-grid"><tbody>{frozen.map(item=><tr key={item.index}><th><button title="Unfreeze row" onClick={()=>settings({frozenRows:options.frozenRows.filter(i=>i!==item.index)})}>× {item.index+1}</button></th>{visible.map(i=><td key={i} className={loadedColumn===i?"selected-cell":""} style={{width:sizes[i]||autoWidths[i],...(options.columnFormats?.[i]?.wrap!=null?{whiteSpace:options.columnFormats[i].wrap?'pre-wrap':'pre'}:{}),...(options.columnFormats?.[i]?.alignment&&options.columnFormats[i].alignment!=='auto'?{textAlign:options.columnFormats[i].alignment}:{})}} onDoubleClick={()=>{if(isExpandableResultValue(columns[i],item.row[i]))onInspect({column:columns[i],row:item.index+1,value:item.row[i]})}}>{cellFormat(item.row[i],i)}</td>)}</tr>)}</tbody></table></div>}<div className="result-grid-body"><div className="result-grid-scroll">
  <div className="grid-wrap" ref={root} tabIndex={0} aria-label="Query result grid. Arrow keys navigate; Shift extends selection; Control C copies; Enter inspects." onKeyDown={event => { if (event.target === root.current) keyDown(event); }} onContextMenu={e=>{e.preventDefault();const cell=e.target.closest('[data-cell]');if(cell){const [r,c]=cell.dataset.cell.split(':').map(Number);if(!selected(r,c))select(r,c);setMenu({x:Math.min(e.clientX,document.documentElement.clientWidth-265),y:Math.max(5,Math.min(e.clientY,document.documentElement.clientHeight-450)),column:visible[c],row:r});}}} onCopy={copy} onPointerDown={startSelectionDrag}><table className={`result-grid virtual-result-grid ${options.wrap ? "result-wrap" : ""}`} role="grid" aria-multiselectable="true" aria-rowcount={rows.length + 1} style={{ "--result-row-height": `${rowHeight}px`, minWidth: 37 + widths.reduce((a, b) => a + b, 0), width: 37 + widths.reduce((a, b) => a + b, 0) }}>
    <colgroup><col style={{ width: 37 }} />{visible.map((i, c) => <col key={i} style={{ width: widths[c] }} />)}</colgroup>
    <thead><tr><th className="rownum-head"><button type="button" aria-label="Select all result cells" title="Select all cells on this page. Right-click or Ctrl+G: go to row number" onClick={selectAllCells} onContextMenu={event=>{event.preventDefault();event.stopPropagation();setRowJump({value:'',message:''})}}>#</button></th>{visible.map((i,c)=>{
      const sorted=sortColumn===i?sortDirection:options.sorts?.find(item=>item.column===i)?.direction;
      return <th key={i} data-column-index={i} className={`${pinned===i?'pinned-column':rightPins.includes(i)?'pinned-right':''} ${dropColumn===i?'column-drop-target':''} ${sorted?'is-sorted':''} ${linkedColumn===i?'projection-linked':''}`} style={rightPins.includes(i)?{right:rightOffset(i)}:undefined} aria-sort={sorted==='asc'?'ascending':sorted==='desc'?'descending':'none'} data-edit-lock={editMode&&editability&&editability.editable&&!editability.columns[i]?.editable?'locked':undefined} data-edit-key={editMode&&editability?.identity?.includes(i)?'key':undefined} title={editMode&&editability&&editability.editable?(!editability.columns[i]?.editable?`Locked: ${editability.columns[i]?.reason}`:editability.identity.includes(i)?`Key column ${columns[i].sourceSchema?`${columns[i].sourceSchema}.`:''}${columns[i].sourceTable}.${columns[i].sourceColumn}: identifies the row in the generated SQL`:`Writes to ${columns[i].sourceSchema?`${columns[i].sourceSchema}.`:''}${columns[i].sourceTable}.${columns[i].sourceColumn}`):undefined} onContextMenu={event=>openColumnMenu(event,i)}>
        <button type="button" className="result-column-title-button" aria-label={`Sort by ${columns[i].name}`} aria-haspopup="menu" data-tooltip-content={`${aliasLabels[i]?`${aliasLabels[i]} · original column ${columns[i].name}`:columns[i].name}${sorted?` · Sorted ${sorted==='asc'?'ascending':'descending'}`:''}. Click to sort; Shift-click adds to multi-sort. Right-click for column actions. Drag to reorder.`} onPointerDown={event=>startColumnDrag(event,i)} onClick={event=>{if(suppressColumnClick.current){suppressColumnClick.current=false;return;}onSort?.(i,{multi:event.shiftKey||event.ctrlKey||event.metaKey})}} onKeyDown={event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();event.stopPropagation();openColumnMenu(event,i)}}}><span className={aliasLabels[i]?'result-column-alias':undefined}>{aliasLabels[i]||columns[i].name}</span></button>{editingAlias?.column===i&&<input className="result-alias-input" autoFocus aria-label={`Display heading for ${columns[i].name}`} value={editingAlias.value} maxLength={128} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onChange={event=>setEditingAlias({column:i,value:event.target.value})} onBlur={()=>setEditingAlias(null)} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();setEditingAlias(null);root.current?.focus()}if(event.key==='Enter'){event.preventDefault();onColumnAlias?.(columnAliasKey(columns,i),event.currentTarget.value.trim()===columns[i].name?'':event.currentTarget.value);setEditingAlias(null);root.current?.focus()}}}/>}
        <span className="column-resizer" role="separator" aria-label={`Resize ${columns[i].name}`} aria-orientation="vertical" tabIndex={0} onKeyDown={event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();setSizes(current=>({...current,[i]:Math.max(70,(current[i]||autoWidths[i])+(event.key==='ArrowLeft'?-10:10))}))}}} onPointerDown={event=>resize(event,i)} onDoubleClick={()=>fit(i)}/>
      </th>;
    })}</tr></thead>
    <tbody>{spacer(resultWindow.top)}{rows.slice(resultWindow.start, resultWindow.end).map(({ row, index }, offset) => { const r = resultWindow.start + offset; return <tr key={index} data-result-row={index} aria-rowindex={r + 2} aria-selected={rowSelected(r)} data-row-error={applyErrors.some(item=>item.row===index)||undefined} data-row-draft={isDeleted(drafts,index)?'deleted':appliedLive&&applied.deleted.includes(index)?'applied-deleted':undefined} className={`result-data-row ${isDeleted(drafts,index)||(appliedLive&&applied.deleted.includes(index))?'result-deleted-row':''} ${options.crosshair!==false&&hover?.r===r?"result-hover-row":""} ${rows[r].duplicate?"result-duplicate-row":""} ${(options.marks||[]).includes(index)?"result-marked-row":""} ${dropRow?.index === index ? dropRow.after ? "row-drop-after" : "row-drop-before" : ""}`}><td data-row-select={r} onDoubleClick={()=>settings({marks:(options.marks||[]).includes(index)?options.marks.filter(x=>x!==index):[...(options.marks||[]),index]})} className={`rownum ${rowSelected(r) ? "selected-cell" : ""}`}><button className="row-move-handle" onPointerDown={e => startRowMove(e, index)} aria-label={`Move row ${index + 1}`} title="Drag to move row | Alt+Up/Down to move with keyboard" onKeyDown={e => { if (e.altKey && ["ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); const next = r + (e.key === "ArrowUp" ? -1 : 1); if (rows[next]) onReorder?.(index, rows[next].index, next > r); } }}>⋮</button><button className="row-select-button" tabIndex={-1} aria-label={`Select row ${index + 1}`} title="Drag row numbers to select; double-click to mark row" onClick={e => { if (e.detail === 0) select(r, 0, e.shiftKey, "row", e.ctrlKey || e.metaKey); }}>{index + 1}</button></td>{visible.map((i, c) => <td key={i} data-cell={`${r}:${c}`} data-error={applyErrors.some(item=>item.row===index&&item.col===i)||undefined} data-draft={cellDraft(drafts,index,i)?(cellDraft(drafts,index,i).isNull?'null':'edited'):appliedLive&&`${index}:${i}` in applied.cells?'applied':undefined} title={applyErrors.find(item=>item.row===index&&item.col===i)?`Cannot be saved: ${applyErrors.find(item=>item.row===index&&item.col===i).message}`:cellDraft(drafts,index,i)?`Original: ${cellDraft(drafts,index,i).original==null?'NULL':cellDraft(drafts,index,i).original}`:undefined} draggable={Boolean(selection&&selection.anchor?.r===r&&selection.anchor?.c===c&&selection.focus?.r===r&&selection.focus?.c===c)||undefined} onDragStart={event=>{event.dataTransfer.setData(cellDragType,cellDragData(columns[i],row[i]));event.dataTransfer.setData('text/plain',`:${bindNameFor(columns[i]?.name)}`);event.dataTransfer.effectAllowed='copy'}} onPointerEnter={()=>setHover({r,c})} style={{...(rightPins.includes(i)?{right:rightOffset(i)}:{}),...(options.rules?.find(rule=>rule.column===i&&matchesCondition(row[i],rule))?{"--rule-color":({teal:'var(--highlight-teal-bg)',amber:'var(--highlight-amber-bg)',rose:'var(--highlight-rose-bg)'})[options.rules.find(rule=>rule.column===i&&matchesCondition(row[i],rule)).color]}:{})}} aria-selected={selected(r, c)} className={`${options.crosshair!==false&&hover?.c===c?"result-hover-column":""} ${find&&matches.some(match=>match.r===r&&match.c===c)?"result-find-match":""} ${selection?.focus.r === r && selection?.focus.c === c ? "result-active-cell" : ""} ${selected(r, c) ? "selected-cell" : ""} ${pinned === i ? "pinned-column" : rightPins.includes(i)?"pinned-right":""} ${/NUMBER|INTEGER|INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL/i.test(columns[i].type || "") ? "numeric" : /DATE|TIMESTAMP/i.test(columns[i].type || "") ? "date-cell" : ""}`}>{editing&&editing.r===r&&editing.c===c?<CellEditor kind={editing.kind} initial={editing.initial} typed={editing.typed} onCommit={stageEdit} onCancel={cancelEdit} onTab={direction=>tabFrom(r,c,direction)} onEnter={()=>{if(r+1<rows.length)select(r+1,c)}}/>:<button tabIndex={-1} type="button" data-description={descMaps[i]?.get(String(scalarText(row[i])??'').trim())||undefined} className={`result-cell-value ${options.columnFormats?.[i]?.linkify&&detectSmartLink(row[i])?'result-url':''}`} style={options.columnFormats?.[i]?.alignment&&options.columnFormats[i].alignment!=='auto'?{textAlign:options.columnFormats[i].alignment}:undefined} onClick={e => { if (e.detail === 0) select(r, c, e.shiftKey, "cell", e.ctrlKey || e.metaKey); }} onDoubleClick={() => editMode&&editability?.editable ? beginEdit(r, c) : inspectExpandable(r, c)}>{row[i] == null || row[i] === "" ? <em>{cellFormat(row[i],i)}</em> : cellFormat(row[i],i)}{descMaps[i]?.get(String(scalarText(row[i])??'').trim())&&<small className="cell-description"> · {descMaps[i].get(String(scalarText(row[i])??'').trim())}</small>}</button>}</td>)}</tr>; })}{spacer(resultWindow.bottom)}</tbody>
  </table></div>{rowMarkers.markers.length>0&&<div className="result-row-markers" style={{right:Math.max(0,(root.current?.offsetWidth||0)-(root.current?.clientWidth||0))}} title={`${(options.marks||[]).length} marked rows${rowMarkers.outside?` · ${rowMarkers.outside} outside this filtered page`:''}. Ctrl+Alt+Down/Up moves between them.`}>{rowMarkers.markers.map(marker=><button key={marker.index} type="button" tabIndex={-1} style={{top:marker.top}} aria-label={`Go to marked row ${marker.index+1}`} title={`Row ${marker.index+1}${marker.count>1?` and ${marker.count-1} nearby`:''}`} onClick={()=>reveal(marker.r,selection?.focus?.c||0)}/>)}</div>}{toolbarPosition&&<div ref={floatingToolbar} className="result-floating-toolbar" role="toolbar" aria-label="Selection actions" style={{left:toolbarPosition.left,top:toolbarPosition.top}} onPointerDown={event=>event.stopPropagation()}><span>{selectionData.selectedRowCount} × {selectionData.selectedColumnCount}</span><button type="button" title="Copy as TSV (Ctrl+C)" onClick={()=>copyFormat('tsv')}><ClipboardCopy size={13}/>Copy</button><button type="button" title="Copy formats with header and scope preview" onClick={()=>onTools?.('Copy')}>Formats…</button><button type="button" title="Export loaded results" onClick={()=>onTools?.('Export')}>Export…</button><button type="button" title="Row details (Enter inspects a cell)" onClick={()=>{setDetailsRow(selection?.focus?.r??null);setInspectorMode('row');setInspectorVisible(true)}}><List size={13}/>Details</button><button type="button" aria-label="Hide selection toolbar" title="Hide for this selection" onClick={()=>{setToolbarDismissed(toolbarKey);root.current?.focus()}}><X size={13}/></button><button type="button" className="result-floating-off" title="Turn off the floating selection toolbar on this device" onClick={()=>{setFloatingToolbarEnabled(globalThis.localStorage,false);setToolbarOn(false);root.current?.focus()}}>Don't show</button></div>}</div><aside hidden={!inspectorEnabled} className={`result-row-details result-inspector ${inspectorVisible?'open':''}`} style={{"--inspector-width":`${inspectorWidth}px`}}>{inspectorVisible&&<span className="result-inspector-resizer" role="separator" aria-disabled={inspectorLocked||undefined} aria-label="Resize result details panel" aria-orientation="vertical" tabIndex={0} onPointerDown={resizeInspector} onKeyDown={resizeInspectorKey}/>}{inspectorVisible&&(inspectorMode==='pivot'?pivotPanel:<div className="result-inspector-content"><header><strong>{inspectorMode==='source'?'Source definition':inspectorMode==='execution'?'Execution & parameters':inspectorMode==='cell'?(cellDetail?`${cellDetail.column?.name} · Row ${cellDetail.row}`:'Cell details'):`Row ${(rows[detailsRow]?.index??0)+1}`}</strong><button aria-label="Close inspector" title="Close inspector" onClick={()=>setInspectorVisible(false)}><X size={14}/></button></header>{inspectorMode==='cell'?(cellDetail?<Suspense fallback={<p role="status">Loading…</p>}><ResultValueDialog key={`${cellDetail.row}:${cellDetail.column?.name}`} embedded cell={cellDetail} onClose={()=>setInspectorVisible(false)}/></Suspense>:<p>Select a cell to show its value.</p>):inspectorMode==='execution'&&executionDetails?.executedSql?<div className="result-execution-inspector"><dl><div><dt>Connection</dt><dd>{executionDetails.executedProfile||'—'}</dd></div><div><dt>Executed</dt><dd>{executionDetails.executedAt?new Date(executionDetails.executedAt).toLocaleString(options.locale||undefined):'—'}</dd></div><div><dt>Elapsed</dt><dd>{executionDetails.elapsedMs!=null?`${executionDetails.elapsedMs} ms`:'—'}</dd></div><div><dt>Page size</dt><dd>{executionDetails.executionPageSize||executionDetails.pageSize||'—'}</dd></div></dl><h4>SQL</h4><pre>{executionDetails.executedSql}</pre><h4>Parameters <span>{executionDetails.executedParameters?.length||0}</span></h4>{executionDetails.executedParameters?.length?<div className="result-execution-parameters">{executionDetails.executedParameters.map((parameter,index)=><div key={`${parameter.name||parameter.key||index}-${index}`}><b>:{parameter.name||parameter.key||`P${index+1}`}</b><small>{parameter.type||parameter.dataType||'VARCHAR2'}</small><code>{parameter.value==null?'NULL':String(parameter.value)}</code></div>)}</div>:<p>No bind parameters.</p>}<h4>Fetch performance</h4>{executionDetails.fetchMetrics?.length?<div className="result-execution-metrics"><table><thead><tr><th>Offset</th><th>Rows</th><th>ms</th><th>Bytes</th><th>Rows/s</th></tr></thead><tbody>{executionDetails.fetchMetrics.map((metric,index)=><tr key={index}><td>{metric.offset}</td><td>{metric.rows}</td><td>{metric.elapsedMs}</td><td>{metric.bytes}</td><td>{metric.elapsedMs>0?Math.round(metric.rows*1000/metric.elapsedMs):'—'}</td></tr>)}</tbody></table></div>:<p>No fetch metrics available.</p>}</div>:inspectorMode==='source'?(matchingSourceDefinition?<div className="result-source-details"><h3>{sourceDefinition.name?`${sourceDefinition.schema||'Current schema'}.${sourceDefinition.table}.${sourceDefinition.name}`:'Source definition'}</h3><dl>{Object.entries(sourceDefinition).filter(([key])=>!['constraints','tabId'].includes(key)).map(([key,value])=><div key={key}><dt>{({schema:'Schema',table:'Table',name:'Column',type:'Data type',size:'Length',precision:'Precision',scale:'Scale',nullable:'Nullable',defaultValue:'Default value',message:'Status'})[key]||key}</dt><dd>{typeof value==='boolean'?value?'Yes':'No':String(value??'—')}</dd></div>)}</dl><h4>Constraints</h4>{(sourceDefinition.constraints||[]).length?(sourceDefinition.constraints||[]).map((constraint,i)=><div className="result-source-constraint" key={i}><strong>{constraint.name}</strong><span>{({P:'Primary key',R:'Foreign key',U:'Unique',C:'Check'})[constraint.type]||constraint.type}{constraint.status?' | '+constraint.status:''}</span>{constraint.condition&&<code>{constraint.condition}</code>}</div>):<p>No constraints found.</p>}</div>:<Feedback kind={sourceDefinition?.message?"error":sourceColumn?.sourceTable?"progress":"info"} title="Column source">{sourceDefinition?.message|| (sourceColumn?.sourceTable?"Loading source definition…":"No source metadata for this column.")}</Feedback>):detailsRow!=null&&rows[detailsRow]&&<><div className="result-form-row"><button disabled={detailsRow===0} aria-label="Previous row" title="Previous row" onClick={()=>setDetailsRow(x=>x-1)}><ArrowUp size={14}/></button><button disabled={detailsRow>=rows.length-1} aria-label="Next row" title="Next row" onClick={()=>setDetailsRow(x=>x+1)}><ArrowDown size={14}/></button><button onClick={()=>{navigator.clipboard.writeText(copyResultData([rows[detailsRow].row],columns,'vertical')).catch(()=>setCopyState('Clipboard unavailable'));}} aria-label="Copy row" title="Copy row"><ClipboardCopy size={14}/></button></div>{columns.map((column,i)=><button key={i} className={selection?.focus.r===detailsRow&&selection?.focus.c===visible.indexOf(i)?"active":""} onClick={()=>{const c=visible.indexOf(i);if(c>=0)reveal(detailsRow,c)}} onDoubleClick={()=>{const c=visible.indexOf(i);if(c>=0)inspectExpandable(detailsRow,c)}}><b>{column.name}</b><span>{cellFormat(rows[detailsRow].row[i],i)}</span></button>)}</>}</div>)}<nav className="result-inspector-switcher" aria-label="Inspector views"><button disabled={!rows.length||(!selection?.focus&&detailsRow==null)} className={inspectorMode==='row'&&inspectorVisible?'active':''} aria-label="Show row details" title="Row details" onClick={()=>{setDetailsRow(current=>selection?.focus.r??current??0);setInspectorMode('row');setInspectorVisible(true)}}><List size={14}/></button><button disabled={!sourceColumn?.sourceTable&&!matchingSourceDefinition} className={inspectorMode==='source'&&inspectorVisible?'active':''} aria-label="Show source definition" title="Source definition" onClick={()=>{setInspectorMode('source');setInspectorVisible(true)}}><Database size={14}/></button><button disabled={!executionDetails?.executedSql} className={inspectorMode==='execution'&&inspectorVisible?'active':''} aria-label="Show execution and parameters" title="Execution & parameters" onClick={()=>{setExecutionOpen(true);setInspectorMode('execution');setInspectorVisible(true)}}><ListFilter size={14}/></button></nav></aside></div>
  {selectionData.stats.count>0&&<div className="result-selection-stats"><span>Selection: {selectionData.stats.count} cells | {selectionData.selectedRowCount} rows | {selectionData.selectedColumnCount} columns | {loadedColumn!=null?"loaded rows in current view":"current page"}</span>{selectionData.stats.numericCount>0&&(selection?.mode==="row"||selectionData.selectedColumnCount!==1?<span>Aggregates require a selection from one column.</span>:<><span>{selectionData.stats.numericCount} numeric values in {selectionData.columns[0]?.name}</span><span>Sum: {formatAggregate(selectionData.stats.sum)}</span><span>Avg: {formatAggregate(selectionData.stats.average)}</span><span>Min: {formatAggregate(selectionData.stats.min)}</span><span>Max: {formatAggregate(selectionData.stats.max)}</span></>)}</div>}
  {menu&&<div ref={menuRoot} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();setMenu(null);root.current?.focus();return;}if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const buttons=Array.from(event.currentTarget.querySelectorAll('button:not(:disabled)'));const index=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus()}} className="result-context-menu result-quick-menu" style={{left:menu.x,top:menu.y}} role="menu"><div className="result-menu-label">Selection · {selectionData.selectedRowCount} × {selectionData.selectedColumnCount}{loadedColumn!=null?' · loaded rows':' · current page'}</div><button role="menuitem" onClick={()=>copyFormat('tsv')}>Copy<span>Ctrl+C</span></button><button role="menuitem" onClick={()=>{setMenu(null);onTools?.('Copy')}}>Copy formats…</button>{(()=>{const link=rows[menu.row]&&detectSmartLink(rows[menu.row].row[menu.column]);if(!link)return null;const disabled=link.kind==='path'?!link.openable||!isNativeHost:link.kind==='object'?!onSmartObject:false;return <><div className="result-menu-label">Link · {link.kind==='object'?'Oracle object':link.kind}</div><button role="menuitem" disabled={disabled} title={link.kind==='path'&&!link.openable?'Only Oracle source files (.sql, .pks, .pkb, .prc, .fnc, .trg) open in the editor':link.text} onClick={()=>followSmartLink(link)}>{smartLinkActionLabel[link.kind]}</button><button role="menuitem" onClick={()=>{navigator.clipboard.writeText(link.text).then(()=>setCopyState('Link copied'),()=>setCopyState('Clipboard unavailable'));setMenu(null)}}>Copy {link.kind==='email'?'email address':link.kind==='path'?'path':link.kind==='object'?'object name':'URL'}</button><hr/></>})()}{!toolbarOn&&<button role="menuitem" onClick={()=>{setFloatingToolbarEnabled(globalThis.localStorage,true);setToolbarOn(true);setMenu(null)}}>Show floating selection toolbar</button>}<button role="menuitem" onClick={()=>{inspect(menu.row,visible.indexOf(menu.column));setMenu(null)}}>Inspect value<span>Enter</span></button><button role="menuitem" onClick={()=>{openCellDrawer(menu.row,visible.indexOf(menu.column));setMenu(null)}}>Inspect in side panel<span>Shift+Enter</span></button><button role="menuitem" disabled={!rows[menu.row]||Boolean(codeCellText(rows[menu.row].row[menu.column]).error)} onClick={()=>{const item=rows[menu.row],cell=codeCellText(item.row[menu.column]);setMenu(null);if(cell.text!=null)window.dispatchEvent(new CustomEvent('fbsdb.result.openCode',{detail:{column:columns[menu.column].name,row:item.index+1,text:cell.text}}))}}>Open in code editor</button><button role="menuitem" onClick={()=>{expandCell(menu.row,visible.indexOf(menu.column));setMenu(null)}}>Expand cell text<span>Alt+Enter</span></button><hr/>{(()=>{const count=selectedColumnIndices().length;return <><div className="result-menu-label">Column widths · {count} selected</div><button role="menuitem" disabled={count<2} onClick={()=>applyColumnWidths('equalize')}>Equalize selected widths</button><button role="menuitem" disabled={!count} onClick={()=>applyColumnWidths('fit')}>Fit selected to content</button><button role="menuitem" disabled={!count} onClick={()=>applyColumnWidths('distribute')}>Distribute remaining space</button><hr/></>})()}<div className="result-menu-label">Filter</div><button role="menuitem" onClick={()=>{const value=rows[menu.row].row[menu.column];settings({filters:[...(options.filters||[]),{column:menu.column,op:value==null?'null':'equals',kind:/NUMBER|DECIMAL|INT/i.test(columns[menu.column].type)?'number':'text',value:String(value??'')}]});setMenu(null)}}>Keep this value</button><button role="menuitem" onClick={()=>{const value=rows[menu.row].row[menu.column];settings({filters:[...(options.filters||[]),{column:menu.column,op:value==null?'notNull':'notEquals',kind:/NUMBER|DECIMAL|INT/i.test(columns[menu.column].type)?'number':'text',value:String(value??'')}]});setMenu(null)}}>Exclude this value</button><hr/><button role="menuitem" onClick={()=>{setDetailsRow(menu.row);setInspectorMode('row');setInspectorVisible(true);setMenu(null)}}>Row details</button><button role="menuitem" onClick={()=>{setMenu(null);onTools?.('Sql')}}>SQL generation…</button><button role="menuitem" disabled={!columns[menu.column].sourceTable} onClick={()=>{onSourceDefinition?.(columns[menu.column]);setMenu(null)}}>Source definition…</button></div>}
  {columnMenu&&columns[columnMenu.column]&&(()=>{
    const i=columnMenu.column,c=visible.indexOf(i),ordered=columnOrder(order,columns.length),at=ordered.indexOf(i),fixed=pinned===i||rightPins.includes(i),focus=selection?.focus;
    return <ColumnActionsMenu key={i} column={columns[i]} index={i} position={{x:columnMenu.x,y:columnMenu.y}} trigger={columnHeader(i)} portalTarget={root.current?.closest('.desktop-shell')} rows={allRows} width={sizes[i]||autoWidths[i]} hiddenColumns={hidden.map(index=>({index,name:columns[index]?.name||''}))} pin={pinned===i?'left':rightPins.includes(i)?'right':null} canMove={{first:!fixed&&at>0,left:!fixed&&at>0,right:!fixed&&at<ordered.length-1,last:!fixed&&at<ordered.length-1,hide:visible.length>1}} hasSelection={loadedColumn===i||rows.some((_,r)=>selected(r,c))} hasSelectedValue={Boolean(focus&&visible[focus.c]===i&&rows[focus.r]&&selected(focus.r,focus.c))} selectedValue={focus&&visible[focus.c]===i?rows[focus.r]?.row[i]:null} sort={sortColumn===i?sortDirection:options.sorts?.find(item=>item.column===i)?.direction} hasFilter={options.filters?.some(rule=>rule.column===i)} hasHighlight={options.rules?.some(rule=>rule.column===i)} canSql={Boolean(onSql)} canSource={Boolean(onSourceDefinition)} canAlias={Boolean(onColumnAlias)} canSourceExpression={Boolean(onColumnSource)} alias={aliasLabels[i]} onAction={columnAction} onClose={closeColumnMenu}/>;
  })()}
  {formatMenu&&columns[formatMenu.column]&&<ColumnFormatPopover defaults={options} column={columns[formatMenu.column]} format={options.columnFormats?.[formatMenu.column]||{}} position={formatMenu.position} triggerRef={formatTrigger} onClose={()=>setFormatMenu(null)} onChange={patch=>updateColumnFormat(formatMenu.column,patch)}/>}
  </>;
});

import {Feedback,notifyFeedback} from './Feedback';
import { useInspectorWidth } from './useInspectorWidth';
import {sendNativeCommand,isNativeHost} from './nativeBridge';
import { formatResultValue, matchesCondition, copyResultData, selectionStatistics, sqlIdentifier, sqlLiteral, isExpandableResultValue } from "./resultFeatures";
import { isResultCellSelected, selectResultRange, resultSelectionTsv } from "./resultSelection";
import { ExactDecimal, formatExact } from "./exactDecimal";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp,X,ClipboardCopy,Database,List,ListFilter } from "lucide-react";
import { getResultWindow } from "./resultWindow";
import { ColumnFormatPopover } from "./ColumnFormatPopover";
import { ColumnActionsMenu } from './ColumnActionsMenu';
import { columnOrder, moveColumn, columnSqlDraft } from './resultColumnActions';

const sourceDefinitionMatches=(column,definition)=>Boolean(column?.sourceTable&&definition&&String(definition.name||"").toUpperCase()===String(column.sourceColumn||column.name||"").toUpperCase()&&String(definition.table||"").toUpperCase()===String(column.sourceTable||"").toUpperCase()&&(!column.sourceSchema||!definition.schema||String(definition.schema).toUpperCase()===String(column.sourceSchema).toUpperCase()));

export const ResultsGrid = memo(function ResultsGrid({ rows: sourceRows, columns, sortColumn, sortDirection, onSort, onInspect, onReorder, options = {}, onOptionsChange, onTools, command, onSql, onRelated, allRows = sourceRows, onChildren,onSourceDefinition,sourceDefinition,onCloseSourceDefinition,executionDetails,onUpdateDraft,onSelectionChange,onLayoutChange,pivotPanel,pivotPanelOpen=false,onClosePivotPanel,inspectorEnabled=true }) {
  const rows=useMemo(()=>sourceRows.filter(item=>!(options.frozenRows||[]).includes(item.index)),[sourceRows,options.frozenRows]);
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
  const {width:inspectorWidth,onPointerDown:resizeInspector,onKeyDown:resizeInspectorKey}=useInspectorWidth();
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
  useEffect(()=>{const previous=previousRows.current;previousRows.current=rows;if(previous.length===rows.length&&rows.every((item,i)=>item.index===previous[i].index&&item.row===previous[i].row))return;selectionDragCleanup.current?.();root.current.scrollTop=0;if(loadedColumn==null)setSelection(null);setViewport(current=>({...current,top:0}))},[rows]);
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
  function keyDown(event) {
    if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key.toLowerCase()==='p'){event.preventDefault();onTools?.('Commands');return;}
    if (!rows.length || !visible.length) return;
    if (event.key === "Escape") { setLoadedColumn(null);setSelection(null); return; }
    if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();const rect=root.current.getBoundingClientRect();const focus=selection?.focus||{r:0,c:0};if(!selection)select(0,0);setMenu({x:Math.min(rect.left+40,document.documentElement.clientWidth-265),y:Math.max(5,Math.min(rect.top+45,document.documentElement.clientHeight-450)),column:visible[focus.c],row:focus.r});return;}
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") { event.preventDefault(); setLoadedColumn(null);setSelection(selectResultRange(selectResultRange(null, 0, 0), rows.length - 1, visible.length - 1, { extend: true })); return; }
    const current = selection?.focus || { r: 0, c: 0 };
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
  function reveal(r,c) { select(r,c); root.current.scrollTop = Math.max(0,r*rowHeight-50); root.current.scrollLeft = Math.max(0, widths.slice(0,c).reduce((a,b)=>a+b,0)); }
  function performCommand(command) {
    if(!command) return;
    if(command.type==='batch'){command.actions.forEach(performCommand);return;}
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
    if(command.type==='copyJson')copyFormat('json');
    if(command.type==='freezeSelection')settings({frozenRows:[...new Set([...(options.frozenRows||[]),...rows.filter((_,r)=>visible.some((_,c)=>selected(r,c))).map(item=>item.index)])].slice(0,10)});
    if(command.type==='unfreeze')settings({frozenRows:[]});
    if(command.type==='hideSelection')setHidden(current=>[...new Set([...current,...visible.filter((_,c)=>rows.some((_,r)=>selected(r,c)))])]);
    if(command.type==='useVisibleExport')command.apply?.(visible);
    if(command.type==='equalWidths'||command.type==='fitViewport') {const selectedColumns=visible.filter((_,c)=>rows.some((_,r)=>selected(r,c)));const targets=selectedColumns.length?selectedColumns:visible;const size=command.type==='fitViewport'?Math.max(70,Math.floor((root.current.clientWidth-37)/visible.length)):160;setSizes(current=>({...current,...Object.fromEntries(targets.map(i=>[i,size]))}));}
    if(command.type==='fitAll') visible.forEach(fit);
    if(command.type==='goTo') {const r=command.kind==='column'?-1:rows.findIndex(item=>item.index+1===Number(command.target)),c=command.kind==='row'?-1:visible.findIndex(i=>columns[i].name.toLowerCase()===String(command.target).toLowerCase());if(r>=0)reveal(r,0);else if(c>=0)reveal(0,c);else setLayoutMessage(command.kind==='row'?'Row is not in the loaded result.':'Column is not visible in this view.');}
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
  const formatAggregate=value=>{const rounded=new ExactDecimal(value).round(5);if(rounded.n===0n)return "0";const locale=options.locale||"en-US",formatted=formatExact(value,{decimals:5,locale,grouping:true}),separator=new Intl.NumberFormat(locale).formatToParts(1.1).find(part=>part.type==="decimal")?.value||".";const at=formatted.lastIndexOf(separator);if(at<0)return formatted;const fraction=formatted.slice(at+separator.length).replace(/0+$/,"");return fraction?formatted.slice(0,at+separator.length)+fraction:formatted.slice(0,at)};
  useEffect(()=>{const hasSelection=selectionData.stats.count>0;onSelectionChange?.(hasSelection,hasSelection?selectedColumn:null);return()=>onSelectionChange?.(false,null)},[selectionData.stats.count,selectedColumn,onSelectionChange]);
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
  return <><Feedback kind={/unavailable/i.test(copyState)?"error":layoutMessage?"warning":"success"} title="Results">{copyState||layoutMessage}</Feedback>{findOpen&&<div className="result-find"><input autoFocus aria-label="Find in result cells" placeholder="Find in this page" value={find} onChange={e=>{setFind(e.target.value);setFindIndex(-1)}} onKeyDown={e=>{if(e.key==='Enter')nextMatch();if(e.key==='Escape')setFindOpen(false)}}/><span>{matches.length} matches</span><button className="results-tool" title="Next match" aria-label="Next match" onClick={nextMatch}><ArrowDown size={14}/></button><button aria-label="Close result find" onClick={()=>setFindOpen(false)}><X size={14}/></button></div>}{warnings.length>0&&<Feedback kind="warning" title="Result warnings">{warnings.join("\n")}</Feedback>}{frozen.length>0&&<div className="result-frozen-rows"><table className="result-grid"><tbody>{frozen.map(item=><tr key={item.index}><th><button title="Unfreeze row" onClick={()=>settings({frozenRows:options.frozenRows.filter(i=>i!==item.index)})}>× {item.index+1}</button></th>{visible.map(i=><td key={i} className={loadedColumn===i?"selected-cell":""} style={{width:sizes[i]||autoWidths[i],...(options.columnFormats?.[i]?.wrap!=null?{whiteSpace:options.columnFormats[i].wrap?'pre-wrap':'pre'}:{}),...(options.columnFormats?.[i]?.alignment&&options.columnFormats[i].alignment!=='auto'?{textAlign:options.columnFormats[i].alignment}:{})}} onDoubleClick={()=>{if(isExpandableResultValue(columns[i],item.row[i]))onInspect({column:columns[i],row:item.index+1,value:item.row[i]})}}>{cellFormat(item.row[i],i)}</td>)}</tr>)}</tbody></table></div>}<div className="result-grid-body">
  <div className="grid-wrap" ref={root} tabIndex={0} aria-label="Query result grid. Arrow keys navigate; Shift extends selection; Control C copies; Enter inspects." onKeyDown={event => { if (event.target === root.current) keyDown(event); }} onContextMenu={e=>{e.preventDefault();const cell=e.target.closest('[data-cell]');if(cell){const [r,c]=cell.dataset.cell.split(':').map(Number);if(!selected(r,c))select(r,c);setMenu({x:Math.min(e.clientX,document.documentElement.clientWidth-265),y:Math.max(5,Math.min(e.clientY,document.documentElement.clientHeight-450)),column:visible[c],row:r});}}} onCopy={copy} onPointerDown={startSelectionDrag}><table className={`result-grid virtual-result-grid ${options.wrap ? "result-wrap" : ""}`} role="grid" aria-multiselectable="true" aria-rowcount={rows.length + 1} style={{ "--result-row-height": `${rowHeight}px`, minWidth: 37 + widths.reduce((a, b) => a + b, 0), width: 37 + widths.reduce((a, b) => a + b, 0) }}>
    <colgroup><col style={{ width: 37 }} />{visible.map((i, c) => <col key={i} style={{ width: widths[c] }} />)}</colgroup>
    <thead><tr><th className="rownum-head"><button type="button" aria-label="Select all result cells" title="Select all cells on this page" onClick={selectAllCells}>#</button></th>{visible.map((i,c)=>{
      const sorted=sortColumn===i?sortDirection:options.sorts?.find(item=>item.column===i)?.direction;
      return <th key={i} data-column-index={i} className={`${pinned===i?'pinned-column':rightPins.includes(i)?'pinned-right':''} ${dropColumn===i?'column-drop-target':''} ${sorted?'is-sorted':''}`} style={rightPins.includes(i)?{right:rightOffset(i)}:undefined} aria-sort={sorted==='asc'?'ascending':sorted==='desc'?'descending':'none'} onContextMenu={event=>openColumnMenu(event,i)}>
        <button type="button" className="result-column-title-button" aria-label={`Sort by ${columns[i].name}`} aria-haspopup="menu" title={`${columns[i].name}${sorted?` · Sorted ${sorted==='asc'?'ascending':'descending'}`:''}. Click to sort; Shift-click adds to multi-sort. Right-click for column actions. Drag to reorder.`} onPointerDown={event=>startColumnDrag(event,i)} onClick={event=>{if(suppressColumnClick.current){suppressColumnClick.current=false;return;}onSort?.(i,{multi:event.shiftKey||event.ctrlKey||event.metaKey})}} onKeyDown={event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();event.stopPropagation();openColumnMenu(event,i)}}}><span>{columns[i].name}</span></button>
        <span className="column-resizer" role="separator" aria-label={`Resize ${columns[i].name}`} aria-orientation="vertical" tabIndex={0} onKeyDown={event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();setSizes(current=>({...current,[i]:Math.max(70,(current[i]||autoWidths[i])+(event.key==='ArrowLeft'?-10:10))}))}}} onPointerDown={event=>resize(event,i)} onDoubleClick={()=>fit(i)}/>
      </th>;
    })}</tr></thead>
    <tbody>{spacer(resultWindow.top)}{rows.slice(resultWindow.start, resultWindow.end).map(({ row, index }, offset) => { const r = resultWindow.start + offset; return <tr key={index} data-result-row={index} aria-rowindex={r + 2} aria-selected={rowSelected(r)} className={`result-data-row ${options.crosshair!==false&&hover?.r===r?"result-hover-row":""} ${rows[r].duplicate?"result-duplicate-row":""} ${(options.marks||[]).includes(index)?"result-marked-row":""} ${dropRow?.index === index ? dropRow.after ? "row-drop-after" : "row-drop-before" : ""}`}><td data-row-select={r} onDoubleClick={()=>settings({marks:(options.marks||[]).includes(index)?options.marks.filter(x=>x!==index):[...(options.marks||[]),index]})} className={`rownum ${rowSelected(r) ? "selected-cell" : ""}`}><button className="row-move-handle" onPointerDown={e => startRowMove(e, index)} aria-label={`Move row ${index + 1}`} title="Drag to move row | Alt+Up/Down to move with keyboard" onKeyDown={e => { if (e.altKey && ["ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); const next = r + (e.key === "ArrowUp" ? -1 : 1); if (rows[next]) onReorder?.(index, rows[next].index, next > r); } }}>⋮</button><button className="row-select-button" tabIndex={-1} aria-label={`Select row ${index + 1}`} title="Drag row numbers to select; double-click to mark row" onClick={e => { if (e.detail === 0) select(r, 0, e.shiftKey, "row", e.ctrlKey || e.metaKey); }}>{index + 1}</button></td>{visible.map((i, c) => <td key={i} data-cell={`${r}:${c}`} onPointerEnter={()=>setHover({r,c})} style={{...(rightPins.includes(i)?{right:rightOffset(i)}:{}),...(options.rules?.find(rule=>rule.column===i&&matchesCondition(row[i],rule))?{"--rule-color":({teal:'var(--highlight-teal-bg)',amber:'var(--highlight-amber-bg)',rose:'var(--highlight-rose-bg)'})[options.rules.find(rule=>rule.column===i&&matchesCondition(row[i],rule)).color]}:{})}} aria-selected={selected(r, c)} className={`${options.crosshair!==false&&hover?.c===c?"result-hover-column":""} ${find&&matches.some(match=>match.r===r&&match.c===c)?"result-find-match":""} ${selection?.focus.r === r && selection?.focus.c === c ? "result-active-cell" : ""} ${selected(r, c) ? "selected-cell" : ""} ${pinned === i ? "pinned-column" : rightPins.includes(i)?"pinned-right":""} ${/NUMBER|INTEGER|INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL/i.test(columns[i].type || "") ? "numeric" : /DATE|TIMESTAMP/i.test(columns[i].type || "") ? "date-cell" : ""}`}><button tabIndex={-1} type="button" className={`result-cell-value ${options.columnFormats?.[i]?.linkify&&/^https?:\/\//i.test(String(row[i]))?'result-url':''}`} style={options.columnFormats?.[i]?.alignment&&options.columnFormats[i].alignment!=='auto'?{textAlign:options.columnFormats[i].alignment}:undefined} onClick={e => { if (e.detail === 0) select(r, c, e.shiftKey, "cell", e.ctrlKey || e.metaKey); }} onDoubleClick={() => inspectExpandable(r, c)}>{row[i] == null ? <em>NULL</em> : row[i] === "" ? <em>EMPTY</em> : cellFormat(row[i],i)}</button></td>)}</tr>; })}{spacer(resultWindow.bottom)}</tbody>
  </table></div><aside hidden={!inspectorEnabled} className={`result-row-details result-inspector ${inspectorVisible?'open':''}`} style={{"--inspector-width":`${inspectorWidth}px`}}>{inspectorVisible&&<span className="result-inspector-resizer" role="separator" aria-label="Resize result details panel" aria-orientation="vertical" tabIndex={0} onPointerDown={resizeInspector} onKeyDown={resizeInspectorKey}/>}{inspectorVisible&&(inspectorMode==='pivot'?pivotPanel:<div className="result-inspector-content"><header><strong>{inspectorMode==='source'?'Source definition':inspectorMode==='execution'?'Execution & parameters':`Row ${(rows[detailsRow]?.index??0)+1}`}</strong><button aria-label="Close inspector" title="Close inspector" onClick={()=>setInspectorVisible(false)}><X size={14}/></button></header>{inspectorMode==='execution'&&executionDetails?.executedSql?<div className="result-execution-inspector"><dl><div><dt>Connection</dt><dd>{executionDetails.executedProfile||'—'}</dd></div><div><dt>Executed</dt><dd>{executionDetails.executedAt?new Date(executionDetails.executedAt).toLocaleString(options.locale||undefined):'—'}</dd></div><div><dt>Elapsed</dt><dd>{executionDetails.elapsedMs!=null?`${executionDetails.elapsedMs} ms`:'—'}</dd></div><div><dt>Page size</dt><dd>{executionDetails.executionPageSize||executionDetails.pageSize||'—'}</dd></div></dl><h4>SQL</h4><pre>{executionDetails.executedSql}</pre><h4>Parameters <span>{executionDetails.executedParameters?.length||0}</span></h4>{executionDetails.executedParameters?.length?<div className="result-execution-parameters">{executionDetails.executedParameters.map((parameter,index)=><div key={`${parameter.name||parameter.key||index}-${index}`}><b>:{parameter.name||parameter.key||`P${index+1}`}</b><small>{parameter.type||parameter.dataType||'VARCHAR2'}</small><code>{parameter.value==null?'NULL':String(parameter.value)}</code></div>)}</div>:<p>No bind parameters.</p>}<h4>Fetch performance</h4>{executionDetails.fetchMetrics?.length?<div className="result-execution-metrics"><table><thead><tr><th>Offset</th><th>Rows</th><th>ms</th><th>Bytes</th><th>Rows/s</th></tr></thead><tbody>{executionDetails.fetchMetrics.map((metric,index)=><tr key={index}><td>{metric.offset}</td><td>{metric.rows}</td><td>{metric.elapsedMs}</td><td>{metric.bytes}</td><td>{metric.elapsedMs>0?Math.round(metric.rows*1000/metric.elapsedMs):'—'}</td></tr>)}</tbody></table></div>:<p>No fetch metrics available.</p>}</div>:inspectorMode==='source'?(matchingSourceDefinition?<div className="result-source-details"><h3>{sourceDefinition.name?`${sourceDefinition.schema||'Current schema'}.${sourceDefinition.table}.${sourceDefinition.name}`:'Source definition'}</h3><dl>{Object.entries(sourceDefinition).filter(([key])=>!['constraints','tabId'].includes(key)).map(([key,value])=><div key={key}><dt>{({schema:'Schema',table:'Table',name:'Column',type:'Data type',size:'Length',precision:'Precision',scale:'Scale',nullable:'Nullable',defaultValue:'Default value',message:'Status'})[key]||key}</dt><dd>{typeof value==='boolean'?value?'Yes':'No':String(value??'—')}</dd></div>)}</dl><h4>Constraints</h4>{(sourceDefinition.constraints||[]).length?(sourceDefinition.constraints||[]).map((constraint,i)=><div className="result-source-constraint" key={i}><strong>{constraint.name}</strong><span>{({P:'Primary key',R:'Foreign key',U:'Unique',C:'Check'})[constraint.type]||constraint.type}{constraint.status?' | '+constraint.status:''}</span>{constraint.condition&&<code>{constraint.condition}</code>}</div>):<p>No constraints found.</p>}</div>:<Feedback kind={sourceDefinition?.message?"error":sourceColumn?.sourceTable?"progress":"info"} title="Column source">{sourceDefinition?.message|| (sourceColumn?.sourceTable?"Loading source definition…":"No source metadata for this column.")}</Feedback>):detailsRow!=null&&rows[detailsRow]&&<><div className="result-form-row"><button disabled={detailsRow===0} aria-label="Previous row" title="Previous row" onClick={()=>setDetailsRow(x=>x-1)}><ArrowUp size={14}/></button><button disabled={detailsRow>=rows.length-1} aria-label="Next row" title="Next row" onClick={()=>setDetailsRow(x=>x+1)}><ArrowDown size={14}/></button><button onClick={()=>{navigator.clipboard.writeText(copyResultData([rows[detailsRow].row],columns,'vertical')).catch(()=>setCopyState('Clipboard unavailable'));}} aria-label="Copy row" title="Copy row"><ClipboardCopy size={14}/></button></div>{columns.map((column,i)=><button key={i} className={selection?.focus.r===detailsRow&&selection?.focus.c===visible.indexOf(i)?"active":""} onClick={()=>{const c=visible.indexOf(i);if(c>=0)reveal(detailsRow,c)}} onDoubleClick={()=>{const c=visible.indexOf(i);if(c>=0)inspectExpandable(detailsRow,c)}}><b>{column.name}</b><span>{cellFormat(rows[detailsRow].row[i],i)}</span></button>)}</>}</div>)}<nav className="result-inspector-switcher" aria-label="Inspector views"><button disabled={!rows.length||(!selection?.focus&&detailsRow==null)} className={inspectorMode==='row'&&inspectorVisible?'active':''} aria-label="Show row details" title="Row details" onClick={()=>{setDetailsRow(current=>selection?.focus.r??current??0);setInspectorMode('row');setInspectorVisible(true)}}><List size={14}/></button><button disabled={!sourceColumn?.sourceTable&&!matchingSourceDefinition} className={inspectorMode==='source'&&inspectorVisible?'active':''} aria-label="Show source definition" title="Source definition" onClick={()=>{setInspectorMode('source');setInspectorVisible(true)}}><Database size={14}/></button><button disabled={!executionDetails?.executedSql} className={inspectorMode==='execution'&&inspectorVisible?'active':''} aria-label="Show execution and parameters" title="Execution & parameters" onClick={()=>{setExecutionOpen(true);setInspectorMode('execution');setInspectorVisible(true)}}><ListFilter size={14}/></button></nav></aside></div>
  {selectionData.stats.count>0&&<div className="result-selection-stats"><span>Selection: {selectionData.stats.count} cells | {selectionData.selectedRowCount} rows | {selectionData.selectedColumnCount} columns | {loadedColumn!=null?"loaded rows in current view":"current page"}</span>{selectionData.stats.numericCount>0&&(selection?.mode==="row"||selectionData.selectedColumnCount!==1?<span>Aggregates require a selection from one column.</span>:<><span>{selectionData.stats.numericCount} numeric values in {selectionData.columns[0]?.name}</span><span>Sum: {formatAggregate(selectionData.stats.sum)}</span><span>Avg: {formatAggregate(selectionData.stats.average)}</span><span>Min: {formatAggregate(selectionData.stats.min)}</span><span>Max: {formatAggregate(selectionData.stats.max)}</span></>)}</div>}
  {menu&&<div ref={menuRoot} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();setMenu(null);root.current?.focus();return;}if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const buttons=Array.from(event.currentTarget.querySelectorAll('button:not(:disabled)'));const index=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus()}} className="result-context-menu result-quick-menu" style={{left:menu.x,top:menu.y}} role="menu"><div className="result-menu-label">Selection</div><button role="menuitem" onClick={()=>copyFormat('tsv')}>Copy<span>Ctrl+C</span></button><button role="menuitem" onClick={()=>{setMenu(null);onTools?.('Copy')}}>Copy formats…</button><button role="menuitem" onClick={()=>{inspect(menu.row,visible.indexOf(menu.column));setMenu(null)}}>Inspect value<span>Enter</span></button><hr/><div className="result-menu-label">Filter</div><button role="menuitem" onClick={()=>{const value=rows[menu.row].row[menu.column];settings({filters:[...(options.filters||[]),{column:menu.column,op:value==null?'null':'equals',kind:/NUMBER|DECIMAL|INT/i.test(columns[menu.column].type)?'number':'text',value:String(value??'')}]});setMenu(null)}}>Keep this value</button><button role="menuitem" onClick={()=>{const value=rows[menu.row].row[menu.column];settings({filters:[...(options.filters||[]),{column:menu.column,op:value==null?'notNull':'notEquals',kind:/NUMBER|DECIMAL|INT/i.test(columns[menu.column].type)?'number':'text',value:String(value??'')}]});setMenu(null)}}>Exclude this value</button><hr/><button role="menuitem" onClick={()=>{setDetailsRow(menu.row);setInspectorMode('row');setInspectorVisible(true);setMenu(null)}}>Row details</button><button role="menuitem" onClick={()=>{setMenu(null);onTools?.('Sql')}}>SQL generation…</button><button role="menuitem" disabled={!columns[menu.column].sourceTable} onClick={()=>{onSourceDefinition?.(columns[menu.column]);setMenu(null)}}>Source definition…</button></div>}
  {columnMenu&&columns[columnMenu.column]&&(()=>{
    const i=columnMenu.column,c=visible.indexOf(i),ordered=columnOrder(order,columns.length),at=ordered.indexOf(i),fixed=pinned===i||rightPins.includes(i),focus=selection?.focus;
    return <ColumnActionsMenu key={i} column={columns[i]} index={i} position={{x:columnMenu.x,y:columnMenu.y}} trigger={columnHeader(i)} portalTarget={root.current?.closest('.desktop-shell')} rows={allRows} width={sizes[i]||autoWidths[i]} hiddenColumns={hidden.map(index=>({index,name:columns[index]?.name||''}))} pin={pinned===i?'left':rightPins.includes(i)?'right':null} canMove={{first:!fixed&&at>0,left:!fixed&&at>0,right:!fixed&&at<ordered.length-1,last:!fixed&&at<ordered.length-1,hide:visible.length>1}} hasSelection={loadedColumn===i||rows.some((_,r)=>selected(r,c))} hasSelectedValue={Boolean(focus&&visible[focus.c]===i&&rows[focus.r]&&selected(focus.r,focus.c))} selectedValue={focus&&visible[focus.c]===i?rows[focus.r]?.row[i]:null} sort={sortColumn===i?sortDirection:options.sorts?.find(item=>item.column===i)?.direction} hasFilter={options.filters?.some(rule=>rule.column===i)} hasHighlight={options.rules?.some(rule=>rule.column===i)} canSql={Boolean(onSql)} canSource={Boolean(onSourceDefinition)} onAction={columnAction} onClose={closeColumnMenu}/>;
  })()}
  {formatMenu&&columns[formatMenu.column]&&<ColumnFormatPopover defaults={options} column={columns[formatMenu.column]} format={options.columnFormats?.[formatMenu.column]||{}} position={formatMenu.position} triggerRef={formatTrigger} onClose={()=>setFormatMenu(null)} onChange={patch=>updateColumnFormat(formatMenu.column,patch)}/>}
  </>;
});

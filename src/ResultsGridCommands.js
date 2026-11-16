// Result grid commands, edits and navigation moved out of ResultsGrid.
import { invalidDraftCells } from "./cellValidation";
import { columnAliasKey } from "./columnAliases";
import { buildDml } from "./dmlPreview";
import { notifyFeedback } from "./Feedback";
import { cellDraft, editCell, emptyDrafts, isDirty, pendingSummary, toggleDeleted } from "./gridDrafts";
import { cellEditorKind } from "./gridEditability";
import { numberSeparators, parseLocaleNumber } from "./localeNumber";
import { descriptionMap, prepareDescriptionQuery } from "./lookupDescriptions";
import { isNativeHost, sendNativeCommand } from "./nativeBridge";
import { columnSqlDraft, moveColumn } from "./resultColumnActions";
import { copyResultData, sqlIdentifier, sqlLiteral } from "./resultFeatures";
import { resolveResultRowJump } from "./resultRowJump";

export function performCommand(ctx, command) {
  const {
    cancelEdit, columns, copyFormat, fit, inspect, jumpToRow, onChildren, onCloseSourceDefinition, onRelated, onSourceDefinition, onSql,
    onUpdateDraft, openVerticalView, options, performCommand, reveal, root, rows, selected, selection, selectionData, selectionDragCleanup,
    setColumnMenu, setCopyState, setDescOpen, setDropColumn, setEditMode, setExecutionOpen, setFind, setFindIndex, setFindOpen,
    setFormatMenu, setHidden, setInspectorMode, setInspectorVisible, setLayoutMessage, setLoadedColumn, setMenu, setOrder, setPinned,
    setRowJump, setSelection, setSizes, settings, visible
  } = ctx;
    if(!command) return;
    if(command.type==='batch'){command.actions.forEach(performCommand);return;}
    if(command.type==='toggleEdit'){setEditMode(on=>!on);cancelEdit();return;}
    if(command.type==='toggleDescriptions'){setDescOpen(open=>!open);return;}
    if(command.type==='resetView'){setLoadedColumn(null);setColumnMenu(null);setSelection(null);setSizes({});setHidden([]);setPinned(null);setOrder([]);setMenu(null);setFormatMenu(null);setDropColumn(null);setExecutionOpen(false);setInspectorVisible(false);setInspectorMode('row');setFind('');setFindOpen(false);setFindIndex(-1);setCopyState('');setLayoutMessage('');selectionDragCleanup.current?.();onCloseSourceDefinition?.();return;}
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
    if(command.type==='details')openVerticalView(selection?.focus.r??0);
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

export function columnAction(ctx, action, payload) {
  const {
    aliasLabels, allRows, closeColumnMenu, columnHeader, columnMenu, columns, fit, formatTrigger, loadedColumn, onColumnAlias,
    onColumnSource, onSort, onSourceDefinition, onSql, options, pinned, rows, select, selectLoadedColumn, selected, setColumnMenu,
    setCopyState, setEditingAlias, setFormatMenu, setHidden, setInspectorMode, setInspectorVisible, setOrder, setPinned, setSizes, settings,
    visible
  } = ctx;
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

export function applyChanges(ctx) {
  const {
    applyState, baseRow, byRowId, columns, draftsRef, editability, rowIds, setApplyErrors, setApplyState
  } = ctx;
    const current=draftsRef.current;
    if(applyState||!isDirty(current))return;
    if(!editability?.editable||!isNativeHost){notifyFeedback({kind:'info',title:'Apply',message:editability?.reasons?.[0]||'This result cannot be edited.'});return}
    // Values Oracle would reject, or store differently than typed (a zoned date without its offset), stop here and are marked in the grid.
    const invalid=invalidDraftCells(current.cells,columns);
    if(invalid.length){setApplyErrors(invalid);notifyFeedback({kind:'error',title:'Apply',message:`Row ${invalid[0].row+1}: ${invalid[0].message}${invalid.length>1?` (${invalid.length-1} more marked in the grid)`:''}\nNothing was sent.`});return}
    const built=buildDml({table:editability.table,columns,identity:editability.identity,rowAt:baseRow,drafts:current,rowIds:byRowId?rowIds.ids:null});
    if(built.problems.length||!built.statements.length){notifyFeedback({kind:'error',title:'Apply',message:built.problems.join('\n')||'There is nothing to apply.'});return}
    setApplyErrors([]);
    // One batch: if any statement fails, Oracle returns to the point before Apply and the changes stay in the grid.
    const requestId=sendNativeCommand('sql.applyDml',{statements:built.statements.map(item=>({kind:item.kind,sql:item.sql,binds:item.binds,expectRows:item.expectRows,readColumns:item.readColumns})),timeoutSeconds:60,onFailure:'rollback'});
    setApplyState({requestId,statements:built.statements});
  }

export function discardChanges(ctx) {
  const {
    cancelEdit, draftsRef, setApplyErrors, setDrafts
  } = ctx;
    const total=pendingSummary(draftsRef.current).total;
    if(!total||!globalThis.confirm?.(`Discard ${total} unapplied change${total===1?'':'s'}?`))return;
    cancelEdit();setDrafts(emptyDrafts());setApplyErrors([]);
  }

export async function loadDescriptions(ctx, col, template) {
  const {
    evalWaiters, scalarText, setDescMaps, setDescStatus, sourceRows
  } = ctx;
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

export function beginEdit(ctx, r, c, typed) {
  const {
    applyState, baseRow, changedSinceRead, columns, drafts, editRef, editability, rows, scalarText, setEditing, unidentified, visible
  } = ctx;
    const item=rows[r],col=visible[c];
    if(!item||col==null||applyState)return;
    const info=editability?.columns[col];
    if(!info?.editable){notifyFeedback({kind:'info',title:'Edit rows',message:info?.reason||'This cell cannot be edited.'});return}
    if(unidentified(item.index)){notifyFeedback({kind:'info',title:'Edit rows',message:changedSinceRead});return}
    const original=scalarText(baseRow(item.index)?.[col]);
    if(original===undefined){notifyFeedback({kind:'info',title:'Edit rows',message:'Dates, binary and structured values are not edited as text.'});return}
    const draft=cellDraft(drafts,item.index,col),kind=cellEditorKind(columns[col],draft?draft.value:original);
    const next={r,c,col,rowIndex:item.index,original,initial:draft?(draft.isNull?'':draft.value):original??'',typed:kind==='datetime'?undefined:typed,kind};
    editRef.current=next;setEditing(next);
  }

export function stageEdit(ctx, text) {
  const {
    columns, editRef, options, root, setApplyErrors, setDrafts, setEditing
  } = ctx;
    const active=editRef.current;
    if(!active)return;
    editRef.current=null;setEditing(null);
    if(/NUMBER|INTEGER|INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL/i.test(columns[active.col]?.type||'')&&text.trim()!==''){const parsed=parseLocaleNumber(text,numberSeparators(options.locale));if(parsed.value!==undefined)text=parsed.value}
    setApplyErrors(current=>current.filter(item=>!(item.row===active.rowIndex&&(item.col===active.col||item.col==null))));
    // Oracle stores empty text as NULL, so clearing a cell means NULL.
    setDrafts(current=>editCell(current,active.rowIndex,active.col,active.original,text===''?{isNull:true}:{value:text}));
    root.current?.focus();
  }

export async function copyFormat(ctx, format, headers) {
  const {
    selectionData, setCopyState, setMenu
  } = ctx;try{await navigator.clipboard.writeText(copyResultData(selectionData.rows,selectionData.columns,format,headers));setCopyState('Selection copied');notifyFeedback({kind:'success',title:'Results',message:'Selection copied'});}catch{setCopyState('Clipboard unavailable');notifyFeedback({kind:'error',title:'Results',message:'Clipboard unavailable'})}setMenu(null);}

export function jumpToRow(ctx, value) {
  const {
    allRows, onRowPage, options, pageSize, reveal, rows, selection, setPendingRow, sourceRowCount
  } = ctx;
    const target=resolveResultRowJump(value,{rows,viewRows:allRows,loadedCount:sourceRowCount??allRows.length,frozenRows:options.frozenRows||[],pageSize:onRowPage?pageSize:0});
    if(target.position!=null){reveal(target.position,selection?.focus?.c||0);return ''}
    if(target.page!=null){setPendingRow(target.index);onRowPage(target.page);return ''}
    return target.error||target.message;
  }

export function jumpToMark(ctx, direction) {
  const {
    options, reveal, rows, selection, setLayoutMessage
  } = ctx;
    const current=selection?.focus?.r??-1,marks=new Set(options.marks||[]),positions=rows.map((item,r)=>marks.has(item.index)?r:-1).filter(r=>r>=0);
    if(!positions.length){setLayoutMessage('No marked rows in this view.');return}
    const next=direction>0?positions.find(r=>r>current)??positions[0]:[...positions].reverse().find(r=>r<current)??positions.at(-1);
    reveal(next,selection?.focus?.c||0);
  }

export function setFocusedNull(ctx) {
  const {
    baseRow, changedSinceRead, editability, focusedCell, scalarText, setDrafts, unidentified
  } = ctx;const cell=focusedCell();if(!cell)return;const info=editability?.columns[cell.col];if(!info?.editable){notifyFeedback({kind:'info',title:'Edit rows',message:info?.reason||'This cell cannot be edited.'});return}if(unidentified(cell.rowIndex)){notifyFeedback({kind:'info',title:'Edit rows',message:changedSinceRead});return}const original=scalarText(baseRow(cell.rowIndex)?.[cell.col]);if(original===undefined)return;setDrafts(current=>editCell(current,cell.rowIndex,cell.col,original,{isNull:true}))}

export function deleteFocusedRow(ctx) {
  const {
    changedSinceRead, focusedCell, setDrafts, unidentified
  } = ctx;const cell=focusedCell();if(!cell)return;if(unidentified(cell.rowIndex)){notifyFeedback({kind:'info',title:'Edit rows',message:changedSinceRead});return}setDrafts(current=>toggleDeleted(current,cell.rowIndex))}

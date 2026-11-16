// Result grid keyboard and pointer handling moved out of ResultsGrid.
import { redo as redoDraft, undo as undoDraft } from "./gridDrafts";
import { selectResultRange } from "./resultSelection";

export function keyDown(ctx, event) {
  const {
    beginEdit, editMode, editability, expandCell, inspect, jumpToMark, onTools, openCellDrawer, pinned, root, rowHeight, rows, select,
    selection, setDrafts, setFocusedNull, setLoadedColumn, setMenu, setRowJump, setSelection, viewport, visible, widths
  } = ctx;
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

export function startSelectionDrag(ctx, event) {
  const {
    root, select, selectionDragCleanup, setPointerActive, setSelection
  } = ctx;
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

export function startRowMove(ctx, event, source) {
  const {
    onReorder, root, selectionDragCleanup, setDropRow
  } = ctx;
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

export function startColumnDrag(ctx, event, index) {
  const {
    dragColumn, reorderColumn, setDropColumn, suppressColumnClick
  } = ctx;
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

export function reorderColumn(ctx, source, target, x) {
  const {
    columns, order, root, setOrder
  } = ctx;
    if(!Number.isInteger(source)||!Number.isInteger(target)||source===target)return;
    const ordered=[...new Set([...order.filter(index=>Number.isInteger(index)&&index>=0&&index<columns.length),...columns.map((_,index)=>index)])],from=ordered.indexOf(source);
    if(from<0||!ordered.includes(target))return;
    ordered.splice(from,1);
    const targetIndex=ordered.indexOf(target),targetHeader=root.current?.querySelector(`th[data-column-index="${target}"]`),rect=targetHeader?.getBoundingClientRect(),after=rect?x>rect.left+rect.width/2:false;
    ordered.splice(Math.max(0,targetIndex+(after?1:0)),0,source);setOrder(ordered);
  }

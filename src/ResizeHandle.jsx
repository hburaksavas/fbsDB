// Separator between two workbench areas: drag, arrow keys, Home/End and double-click to reset.
import { useEffect, useRef } from "react";

export function ResizeHandle({ axis, value, onChange, min, max, label, panelSelector,locked }) {
  const drag = useRef(null), frame = useRef(null);
  const paint = () => {
    frame.current = null;
    if (drag.current) drag.current.shell.style.setProperty(drag.current.property, `${drag.current.next}${axis === "x" ? "px" : "%"}`);
  };
  const update = event => {
    if (!drag.current) return;
    const delta = axis === "x" ? event.clientX - drag.current.origin : drag.current.origin - event.clientY;
    drag.current.next = Math.max(min, Math.min(max, drag.current.value + delta / drag.current.scale));
    if (frame.current === null) frame.current = requestAnimationFrame(paint);
  };
  const finish = commit => {
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
    const current = drag.current;
    if (!current) return;
    if (commit) { paint(); onChange(current.next); }
    else current.shell.style.setProperty(current.property, current.original);
    current.shell.removeAttribute("data-resizing");
    drag.current = null;
  };
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (drag.current) { drag.current.shell.style.setProperty(drag.current.property, drag.current.original); drag.current.shell.removeAttribute("data-resizing"); }
  }, []);
  useEffect(()=>{if(locked)finish(false)},[locked]);
  return <div className={`panel-resizer ${axis === "x" ? "resize-sidebar" : "resize-results"}`} role="separator" aria-disabled={locked||undefined} tabIndex={0} aria-label={label} aria-orientation={axis === "x" ? "vertical" : "horizontal"} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)}
    onPointerDown={event => {
      if (locked||event.button !== 0) return;
      event.preventDefault();
      const panel = event.currentTarget.parentElement.querySelector(panelSelector), shell = event.currentTarget.closest(".desktop-shell");
      const property = axis === "x" ? "--sidebar-width" : "--results-height";
      const current = axis === "x" ? panel.getBoundingClientRect().width : value;
      drag.current = { shell, property, original: shell.style.getPropertyValue(property), origin: axis === "x" ? event.clientX : event.clientY, value: current, next: current, scale: axis === "x" ? 1 : event.currentTarget.parentElement.getBoundingClientRect().height / 100 };
      shell.setAttribute("data-resizing", axis);
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={update} onPointerUp={event => { update(event); finish(true); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => finish(false)} onLostPointerCapture={() => finish(false)}
    onKeyDown={event => {
      if(locked)return;
      const steps = axis === "x" ? { ArrowLeft: -16, ArrowRight: 16 } : { ArrowUp: 2, ArrowDown: -2 };
      if (event.key in steps || event.key === "Home" || event.key === "End") { event.preventDefault(); onChange(event.key === "Home" ? min : event.key === "End" ? max : Math.max(min, Math.min(max, value + steps[event.key]))); }
    }} />;
}

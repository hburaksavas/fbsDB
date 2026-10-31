import { useEffect, useRef } from "react";
import { restoreFocus, visibleFocusTargets } from './focusManagement';

// Handle Escape before focused inputs or Monaco can consume it. Only dismiss
// the last rendered overlay, even when another dialog remains underneath.
export function ModalBackdrop({ onClose, children, className = "", ...props }) {
  const root = useRef(null), close = useRef(onClose);
  const opener = useRef(document.activeElement);
  close.current = onClose;
  useEffect(() => {
    const dismiss = event => {
      const overlays = document.querySelectorAll(".modal-backdrop");
      if (overlays[overlays.length - 1] !== root.current) return;
      if(event.key==='Tab') {
        if(event.target.closest?.('.feedback-stack'))return;
        const items=visibleFocusTargets(root.current),first=items[0],last=items.at(-1);
        if(!items.length){event.preventDefault();return;}
        if(event.shiftKey&&(document.activeElement===first||!root.current.contains(document.activeElement))){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||!root.current.contains(document.activeElement))){event.preventDefault();first.focus();}
        return;
      }
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) close.current?.();
    };
    document.addEventListener("keydown", dismiss, true);
    const element=root.current;
    if(!element.contains(document.activeElement))visibleFocusTargets(element)[0]?.focus({preventScroll:true});
    return () => {document.removeEventListener("keydown", dismiss, true);restoreFocus(opener.current,element)};
  }, []);
  return <div {...props} ref={root} className={`modal-backdrop ${className}`}>{children}</div>;
}

import { useEffect, useRef } from "react";

// Handle Escape before focused inputs or Monaco can consume it. Only dismiss
// the last rendered overlay, even when another dialog remains underneath.
export function ModalBackdrop({ onClose, children, className = "", ...props }) {
  const root = useRef(null), close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dismiss = event => {
      if (event.key !== "Escape" || event.isComposing) return;
      const overlays = document.querySelectorAll(".modal-backdrop");
      if (overlays[overlays.length - 1] !== root.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) close.current?.();
    };
    document.addEventListener("keydown", dismiss, true);
    return () => document.removeEventListener("keydown", dismiss, true);
  }, []);
  return <div {...props} ref={root} className={`modal-backdrop ${className}`}>{children}</div>;
}

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const tooltipId = "fbsdb-app-tooltip";
const editorSelector = ".monaco-editor, .editor-container";

function tooltipText(element) {
  return element.getAttribute("title")?.trim()
    || (element.matches("button[aria-label], [role='button'][aria-label]") ? element.getAttribute("aria-label")?.trim() : "")
    || "";
}

function prepareTooltip(element) {
  if (!(element instanceof Element) || element.closest(editorSelector)) return;
  const text = tooltipText(element);
  if (!text) return;
  element.dataset.appTooltip = text;
  if (element.hasAttribute("title")) element.removeAttribute("title");
}

export function GlobalTooltip() {
  const [tooltip, setTooltip] = useState(null);
  const timer = useRef(null);
  const activeElement = useRef(null);
  const tooltipElement = useRef(null);

  useEffect(() => {
    const removeDescription = (element) => {
      if (!element) return;
      const ids = (element.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean).filter(id => id !== tooltipId);
      if (ids.length) element.setAttribute("aria-describedby", ids.join(" "));
      else element.removeAttribute("aria-describedby");
    };
    const hide = () => {
      clearTimeout(timer.current);
      removeDescription(activeElement.current);
      activeElement.current = null;
      setTooltip(null);
    };
    const place = (element, text) => {
      if (!element?.isConnected || element.closest(editorSelector)) return;
      const rect = element.getBoundingClientRect();
      const ids = new Set((element.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
      ids.add(tooltipId);
      element.setAttribute("aria-describedby", [...ids].join(" "));
      activeElement.current = element;
      const shell = document.querySelector(".desktop-shell");
      setTooltip({ text, theme: shell?.dataset.theme || "default", accent: getComputedStyle(shell || document.documentElement).getPropertyValue("--accent").trim() || "#39b7a5", left: rect.left + rect.width / 2, top: rect.top, maxWidth: 320, maxHeight: 320 });
    };
    const schedule = (element, delay = 420) => {
      prepareTooltip(element);
      const text = element?.dataset.appTooltip;
      if (!text || element.closest(editorSelector)) return;
      clearTimeout(timer.current);
      if (activeElement.current !== element) removeDescription(activeElement.current);
      timer.current = setTimeout(() => place(element, text), delay);
    };
    const closestTarget = (target) => target instanceof Element ? target.closest("[data-app-tooltip]") : null;
    const onPointerOver = event => {
      const element = closestTarget(event.target);
      if (element && !element.contains(event.relatedTarget)) schedule(element);
    };
    const onPointerOut = event => {
      const element = closestTarget(event.target);
      if (element && !element.contains(event.relatedTarget)) hide();
    };
    const onFocusIn = event => {
      const element = closestTarget(event.target);
      if (element) schedule(element, 350);
    };
    const onFocusOut = event => {
      if (closestTarget(event.target)) hide();
    };
    const prepareTree = root => {
      if (root instanceof Element) prepareTooltip(root);
      root.querySelectorAll?.("[title], button[aria-label], [role='button'][aria-label]").forEach(prepareTooltip);
    };
    prepareTree(document.body);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "attributes") prepareTooltip(record.target);
        else record.addedNodes.forEach(node => prepareTree(node));
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title", "aria-label"] });
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      observer.disconnect();
      clearTimeout(timer.current);
      removeDescription(activeElement.current);
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tooltip || !tooltipElement.current || !activeElement.current) return;
    const anchor = activeElement.current.getBoundingClientRect();
    const box = tooltipElement.current.getBoundingClientRect();
    const shell = document.querySelector(".desktop-shell");
    const shellRect = shell?.getBoundingClientRect();
    const leftEdge = Math.max(8, shellRect?.left ?? 0);
    const rightEdge = Math.min(document.documentElement.clientWidth - 8, shellRect?.right ?? document.documentElement.clientWidth);
    const topEdge = Math.max(8, shellRect?.top ?? 0);
    const bottomEdge = Math.min(document.documentElement.clientHeight - 8, shellRect?.bottom ?? document.documentElement.clientHeight);
    const maxWidth = Math.max(100, Math.min(320, rightEdge - leftEdge));
    const maxHeight = Math.max(40, bottomEdge - topEdge);
    const left = Math.max(leftEdge, Math.min(anchor.left + anchor.width / 2 - box.width / 2, rightEdge - box.width));
    const aboveTop = anchor.top - box.height - 8;
    const belowTop = anchor.bottom + 8;
    const top = aboveTop >= topEdge
      ? aboveTop
      : belowTop + box.height <= bottomEdge
        ? belowTop
        : Math.max(topEdge, Math.min(aboveTop, bottomEdge - box.height));
    if (Math.abs(tooltip.left - left) > 1 || Math.abs(tooltip.top - top) > 1 || tooltip.maxWidth !== maxWidth || tooltip.maxHeight !== maxHeight) {
      setTooltip(current => current ? { ...current, left, top, maxWidth, maxHeight } : current);
    }
  }, [tooltip]);

  if (!tooltip) return null;
  return createPortal(<div ref={tooltipElement} id={tooltipId} className={`app-tooltip theme-${tooltip.theme}`} role="tooltip" style={{ left: tooltip.left, top: tooltip.top, maxWidth: tooltip.maxWidth, maxHeight: tooltip.maxHeight, "--accent": tooltip.accent }}>{tooltip.text}</div>, document.body);
}

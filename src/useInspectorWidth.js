import { useEffect, useRef, useState } from 'react';
import {loadSettings,resolveSetting} from './settingsModel';

const clamp=value=>Math.max(220,Math.min(560,value));
export function useInspectorWidth() {
  const [width,setWidth]=useState(()=>{try{return resolveSetting(loadSettings(localStorage),'ui.layout').value.inspectorWidth}catch{return 280}});
  const cleanupRef=useRef(null);
  useEffect(()=>{const reset=()=>{setWidth(280);try{localStorage.removeItem('fbsdb.resultsInspectorWidth')}catch{}};window.addEventListener('fbsdb.inspector.reset',reset);return()=>window.removeEventListener('fbsdb.inspector.reset',reset)},[]);
  useEffect(()=>{const update=event=>setWidth(clamp(event.detail));window.addEventListener('fbsdb.inspectorWidth',update);return()=>{cleanupRef.current?.();window.removeEventListener('fbsdb.inspectorWidth',update)}},[]);
  const save=value=>{const next=clamp(value);setWidth(next);window.dispatchEvent(new CustomEvent('fbsdb.inspectorWidth',{detail:next}))};
  const onPointerDown=event=>{
    if(event.button!==0)return;event.preventDefault();event.stopPropagation();cleanupRef.current?.();
    const panel=event.currentTarget.closest('.result-inspector, .object-definition-view'),start=event.clientX;let next=width,frame=null;
    const move=event=>{next=clamp(width+start-event.clientX);if(frame===null)frame=requestAnimationFrame(()=>{frame=null;panel?.style.setProperty('--inspector-width',`${next}px`)})};
    const cleanup=()=>{if(frame!==null)cancelAnimationFrame(frame);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',escape,true);window.removeEventListener('blur',cancel);cleanupRef.current=null;};
    const cancel=()=>{cleanup();panel?.style.setProperty('--inspector-width',`${width}px`)};
    const escape=event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();cancel()}};
    const finish=()=>{cleanup();save(next)};cleanupRef.current=cancel;
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',escape,true);window.addEventListener('blur',cancel);
  };
  const onKeyDown=event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();save(width+(event.key==='ArrowLeft'?10:-10))};
  return {width,onPointerDown,onKeyDown};
}

import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {clippedTreeLabel,treeOverlayRect} from './treeNameOverlayModel';

// Mounted once; reveals clipped tree names on hover and keyboard focus without changing tree layout.
export function TreeNameOverlay(){
 const [overlay,setOverlay]=useState(null);
 useEffect(()=>{
  let current=null;
  const show=event=>{
   const label=clippedTreeLabel(event.target);
   if(label===current)return;current=label;
   if(!label){setOverlay(null);return}
   const rect=label.getBoundingClientRect(),style=getComputedStyle(label);
   setOverlay({text:label.textContent.trim(),...treeOverlayRect(rect,label.scrollWidth,innerWidth),font:style.font,padding:`${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,lineHeight:style.lineHeight,theme:document.documentElement.dataset.theme||'default'});
  };
  const clear=()=>{current=null;setOverlay(null)};
  const focusout=event=>{if(current&&!(event.relatedTarget&&clippedTreeLabel(event.relatedTarget)===current))clear()};
  const pointerout=event=>{if(current&&!event.relatedTarget)clear()};
  const escape=event=>{if(event.key==='Escape')clear()};
  document.addEventListener('pointerover',show,true);document.addEventListener('focusin',show,true);
  document.addEventListener('pointerout',pointerout,true);document.addEventListener('focusout',focusout,true);
  window.addEventListener('scroll',clear,true);window.addEventListener('resize',clear);window.addEventListener('keydown',escape,true);
  return()=>{document.removeEventListener('pointerover',show,true);document.removeEventListener('focusin',show,true);document.removeEventListener('pointerout',pointerout,true);document.removeEventListener('focusout',focusout,true);window.removeEventListener('scroll',clear,true);window.removeEventListener('resize',clear);window.removeEventListener('keydown',escape,true)};
 },[]);
 if(!overlay)return null;
 return createPortal(<div className="tree-name-overlay theme-scope" data-theme={overlay.theme} role="tooltip" style={{left:overlay.left,top:overlay.top,minHeight:overlay.minHeight,width:overlay.width,font:overlay.font,padding:overlay.padding,lineHeight:overlay.lineHeight,whiteSpace:overlay.wraps?'normal':'nowrap'}}>{overlay.text}</div>,document.body);
}

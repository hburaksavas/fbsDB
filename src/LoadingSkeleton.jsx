import {useEffect,useState} from 'react';
import {shouldShowSkeleton,skeletonDelayMs,skeletonWidths} from './skeletonTiming';

// Grey placeholder rows with a hidden status line. Appears only after a short delay; hidden from assistive tech except the status text.
export function LoadingSkeleton({loading,hasItems,label,rows=7}) {
  const [waited,setWaited]=useState(0);
  useEffect(()=>{if(!loading||hasItems){setWaited(0);return undefined}const timer=setTimeout(()=>setWaited(skeletonDelayMs),skeletonDelayMs);return()=>clearTimeout(timer)},[loading,hasItems]);
  if(!shouldShowSkeleton({loading,hasItems,waitedMs:waited}))return null;
  return <div className="loading-skeleton" role="status" aria-busy="true"><span className="live-announcer">{label}</span><div aria-hidden="true">{skeletonWidths(rows).map((width,index)=><i key={index} style={{width:`${width}%`}}/>)}</div></div>;
}

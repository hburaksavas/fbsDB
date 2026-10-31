import {useEffect,useState,useId} from 'react';
import {Feedback,FeedbackDialog} from './Feedback';
export function ExternalFileNotice({change,dirty,onReload,onKeep,onRetry}) {
  const [confirm,setConfirm]=useState(false),noticeKey=useId();
  useEffect(()=>setConfirm(false),[change?.version]);
  if(!change)return null;
  const title=change.error?'File unavailable':change.missing?'File removed outside fbsDB':change.baselineUnknown?'Review disk version before saving':'File changed outside fbsDB';
  return <><Feedback id={`${noticeKey}:${change.noticeId||change.version||change.error||change.missing}`} source="external-file" kind={change.error?'error':'warning'} title={title} actions={change.error?[{label:'Retry',onClick:onRetry}]:[...(!change.missing?[{label:'Reload',onClick:()=>dirty?setConfirm(true):onReload()}]:[]),{label:change.missing?'Keep as draft':'Keep editor',onClick:onKeep}]}>{change.error||`${change.path||'The SQL file'}${dirty?' · unsaved edits kept':''}`}</Feedback>
    {confirm&&<FeedbackDialog kind="warning" title="Discard unsaved editor changes?" onClose={()=>setConfirm(false)} actions={<><button onClick={()=>setConfirm(false)}>Keep editing</button><button className="button-secondary danger" onClick={()=>{setConfirm(false);onReload()}}>Reload from disk</button></>}>The disk version will replace the unsaved SQL in this editor.</FeedbackDialog>}
  </>;
}

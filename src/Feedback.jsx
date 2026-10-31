import {useEffect,useId,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {AlertCircle,TriangleAlert,Info,CheckCircle2,LoaderCircle,X} from 'lucide-react';
import {ModalBackdrop} from './ModalBackdrop';
import {feedbackSnapshot,subscribeFeedback,notifyFeedback as publishFeedback,dismissFeedback} from './feedbackStore';
import {getNativeTabId} from './nativeBridge';
import {restoreFocus,visibleFocusTargets} from './focusManagement';
export {dismissFeedback,setFeedbackScopes} from './feedbackStore';
export function notifyFeedback(value){return publishFeedback({...value,scope:'scope' in value?value.scope:getNativeTabId()})}

function plainText(value){if(value==null||typeof value==='boolean')return '';if(typeof value==='string'||typeof value==='number')return String(value);if(Array.isArray(value))return value.map(plainText).join('\n');return plainText(value.props?.children)}
// Emit on every failed attempt, including resubmission of the same invalid
// input after its previous notification was dismissed.
export function useFeedbackState(initial,options={}){
  const [value,setValue]=useState(initial),id=useId(),origin=useRef(getNativeTabId()),config=useRef(options);config.current=options;
  const set=useRef(next=>{
    setValue(next);
    if(typeof next==='function'||!next)return;
    const message=typeof next==='object'?next.text:next;
    if(message)notifyFeedback({id:`field:${id}`,scope:config.current.scope===null?undefined:config.current.scope??origin.current,...config.current,kind:typeof next==='object'?(next.error?'error':'success'):config.current.kind||'error',message});
  });
  return [value,set.current];
}
export function Feedback({kind='error',title,children,message,actions,scope,source,id:givenId}){
  const uid=useId(),id=givenId||`feedback-${uid}`;
  const text=message??plainText(children),latest=useRef();latest.current={actions,content:children};
  useEffect(()=>{
    if(!text){dismissFeedback(id);return}
    const owner=scope??getNativeTabId();
    const publish=()=>notifyFeedback({id,kind,title,message:text,scope:owner,source,content:latest.current.content,actions:latest.current.actions?.map((action,index)=>({...action,onClick:()=>latest.current.actions?.[index]?.onClick?.()}))});
    if(kind==='progress'){const delay=setTimeout(publish,500);return()=>clearTimeout(delay)}
    publish();
  },[id,text,kind,title,scope,source]);
  useEffect(()=>()=>{if(kind==='progress'){if(feedbackSnapshot().find(item=>item.id===id)?.kind==='progress')dismissFeedback(id)}else if(latest.current.actions?.length)dismissFeedback(id)},[id,kind]);
  return null;
}
function useFeedbackTheme(){const [theme,setTheme]=useState(()=>document.documentElement.dataset.theme||'default');useEffect(()=>{const observer=new MutationObserver(()=>setTheme(document.documentElement.dataset.theme||'default'));observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});return()=>observer.disconnect()},[]);return theme}
const icons={error:AlertCircle,warning:TriangleAlert,info:Info,success:CheckCircle2,progress:LoaderCircle};
const titles={error:'Something went wrong',warning:'Attention needed',info:'Information',success:'Done',progress:'In progress'};
function FeedbackItem({item,onDismiss}){
  const Icon=icons[item.kind]||Info;
  return <article className="feedback-notification" data-kind={item.kind} data-source={item.source} role={item.kind==='error'||item.kind==='warning'?'alert':'status'}>
    <Icon size={17} className="feedback-symbol" aria-hidden="true"/>
    <div className="feedback-copy"><strong>{item.title||titles[item.kind]}</strong>{item.scopeLabel&&<small>{item.scopeLabel}</small>}<div className="feedback-message">{item.content||item.message}</div>
      {(item.actions?.length>0||item.kind==='error')&&<div className="feedback-actions">{item.actions?.map(action=><button type="button" key={action.label} disabled={action.disabled} onClick={()=>action.onClick?.()}>{action.label}</button>)}{item.kind==='error'&&<button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(item.message)}catch{notifyFeedback({id:'feedback-clipboard',kind:'error',title:'Clipboard unavailable',message:'Could not copy the error details.'})}}}>Copy details</button>}</div>}
    </div>
    <button type="button" className="feedback-dismiss" aria-label="Dismiss notification" onClick={event=>onDismiss(item.id,event.currentTarget.closest('article'))}><X size={13}/></button>
  </article>;
}
export function FeedbackHost(){
  const items=useSyncExternalStore(subscribeFeedback,feedbackSnapshot,feedbackSnapshot),theme=useFeedbackTheme(),[expanded,setExpanded]=useState(false),previousFocus=useRef(null);
  useEffect(()=>{const focus=event=>{if(event.key==='F8'&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&items.length){event.preventDefault();if(!document.activeElement?.closest('.feedback-stack'))previousFocus.current=document.activeElement;document.querySelector('.feedback-notification button')?.focus()}};window.addEventListener('keydown',focus,true);return()=>window.removeEventListener('keydown',focus,true)},[items.length]);
  const dismiss=(id,root)=>{const focused=root?.contains(document.activeElement);dismissFeedback(id);if(focused){const modal=[...document.querySelectorAll('.modal-backdrop')].at(-1);restoreFocus(modal?visibleFocusTargets(modal)[0]:previousFocus.current,root)}};
  return createPortal(<aside className="feedback-stack theme-scope" data-theme={theme} aria-label="Notifications" tabIndex={-1}>{items.length>3&&<button className="feedback-expand" onClick={()=>setExpanded(!expanded)}>{expanded?'Show recent':`${items.length} notifications · Show all`}</button>}{(expanded?items:items.slice(-3)).map(item=><FeedbackItem key={`${item.id}:${item.createdAt}`} item={item} onDismiss={dismiss}/>)}</aside>,document.body);
}
export function FeedbackDialog({title,children,kind='prompt',onClose,actions,busy=false}){
  const theme=useFeedbackTheme(),titleId=useId(),Icon=icons[kind]||Info;
  return createPortal(<div className="theme-scope feedback-dialog-scope" data-theme={theme}><ModalBackdrop onClose={()=>!busy&&onClose?.()} className="feedback-dialog-backdrop"><section className="feedback-dialog" data-kind={kind} role={kind==='warning'||kind==='error'?'alertdialog':'dialog'} aria-modal="true" aria-labelledby={titleId} aria-busy={busy||undefined}>
    <header><Icon size={20} className="feedback-symbol" aria-hidden="true"/><h2 id={titleId}>{title}</h2><button type="button" className="feedback-dismiss" disabled={busy} aria-label="Close dialog" onClick={onClose}><X size={15}/></button></header>
    <div className="feedback-dialog-body">{children}</div>{actions&&<footer>{actions}</footer>}
  </section></ModalBackdrop></div>,document.body);
}

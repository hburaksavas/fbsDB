import {useLayoutEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
export function tabPreviewText(tab){
 if(typeof tab?.content!=='string')return tab?.kind==='object'?'Server object · open its details to inspect source':'No source text available';
 const head=tab.content.slice(0,4000).split(/\r?\n/).slice(0,8).join('\n').slice(0,1000);
 return head+(head.length<tab.content.length?'\n…':'')||'Empty document';
}
export function TabPreviewContent({tab}){
 const environment=tab.connection?.environment&&tab.connection.environment!=='UNKNOWN'?tab.connection.environment:null;
 const flags=[tab.sourceEdited&&'Edited since last execution',tab.queryFailed&&'Last query failed',tab.packageMembers&&'Package specification and body'].filter(Boolean);
 return <><strong>{tab.name}{tab.dirty?' · unsaved':''}</strong><small>{tab.path||'Session document'}</small><p>{environment&&<span className="environment-badge" data-env={environment}>{environment}</span>} {tab.connection?.profileName||tab.profileName||tab.connectionProfileId||'No connection'} · {tab.connection?.text||'Disconnected'}</p>{flags.length>0&&<p className="tab-source-preview-flags">{flags.join(' · ')}</p>}<pre>{tabPreviewText(tab)}</pre></>;
}
export function TabPreview({tab,anchor,theme}){
 const ref=useRef(null);
 useLayoutEffect(()=>{const rect=anchor.getBoundingClientRect(),box=ref.current.getBoundingClientRect();ref.current.style.left=`${Math.max(6,Math.min(rect.left,innerWidth-box.width-6))}px`;ref.current.style.top=`${Math.max(6,Math.min(rect.bottom+5,innerHeight-box.height-6))}px`},[anchor,tab]);
 return createPortal(<div ref={ref} className="tab-source-preview theme-scope" data-theme={theme} role="tooltip" aria-label={`Preview ${tab.name}`}><TabPreviewContent tab={tab}/></div>,document.body);
}

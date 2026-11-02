import {useMemo,useState} from 'react';
import {offsetMinutes,timezoneLens} from './timezoneLens.js';

// Stored data and derived conversions stay visually separate; nothing is assumed until the user picks an offset.
export function TimezoneLens({value}){
 const [mode,setMode]=useState('none'),[custom,setCustom]=useState('+00:00');
 const assumption=mode==='utc'?'+00:00':mode==='custom'?custom:null;
 const localZone=useMemo(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone}catch{return null}},[]);
 const lens=useMemo(()=>timezoneLens(value,{localZone,assumption}),[value,localZone,assumption]);
 if(!lens)return null;
 return <section className="timezone-lens" aria-label="Timezone lens">
  <h4>Timezone lens</h4>
  <dl><div><dt>Stored ({lens.type})</dt><dd><code>{lens.stored}</code></dd></div>{lens.sessionTimeZone&&<div><dt>Session time zone</dt><dd>{lens.sessionTimeZone}</dd></div>}</dl>
  {lens.timezoneFree&&<div className="timezone-assumption"><label>Assume time zone <select aria-label="Time zone assumption" value={mode} onChange={event=>setMode(event.target.value)}><option value="none">None (no conversion)</option><option value="utc">UTC</option><option value="custom">Offset…</option></select></label>{mode==='custom'&&<input aria-label="Assumed offset" value={custom} onChange={event=>setCustom(event.target.value)} aria-invalid={offsetMinutes(custom)==null} placeholder="+03:00"/>}</div>}
  {lens.instant==null?<p role="status">{mode==='custom'&&offsetMinutes(custom)==null?'Enter an offset such as +03:00 or -05:30.':lens.note}</p>:<>
   <p className="timezone-basis">Conversions · derived from {lens.basis}</p>
   <dl>{lens.conversions.map(item=><div key={item.label}><dt>{item.label}</dt><dd><code>{item.text}</code></dd></div>)}</dl>
  </>}
 </section>;
}

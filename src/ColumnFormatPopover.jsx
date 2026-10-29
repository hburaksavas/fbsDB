import {useEffect,useRef} from 'react';
import {RotateCcw,X} from 'lucide-react';

export function ColumnFormatPopover({column,format={},position,onChange,onClose,triggerRef}){
 const popupRef=useRef(null);
 useEffect(()=>{
  const outside=event=>{if(!popupRef.current?.contains(event.target)&&!triggerRef.current?.contains(event.target))onClose()};
  const escape=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();triggerRef.current?.focus()}};
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true)};
 },[onClose,triggerRef]);
 const reset=()=>onChange(null);
 return <section ref={popupRef} className="column-format-popover" role="dialog" aria-label={`${column.name} column settings`} style={position}>
  <header><div><strong>{column.name}</strong><span>Column format</span></div><button type="button" aria-label="Close column settings" onClick={onClose}><X size={14}/></button></header>
  <label>Alignment<select aria-label={`${column.name} alignment`} value={format.alignment||'auto'} onChange={event=>onChange({alignment:event.target.value})}><option value="auto">Automatic</option><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
  <label>Display locale<select aria-label={`${column.name} display locale`} value={format.locale||''} onChange={event=>onChange({locale:event.target.value||undefined})}><option value="">Default</option>{['en-US','tr-TR','de-DE','en-GB'].map(locale=><option key={locale}>{locale}</option>)}</select></label>
  <label>Decimal places<input aria-label={`${column.name} decimal places`} type="number" min="0" max="12" placeholder="Raw" value={format.decimals??''} onChange={event=>onChange({decimals:event.target.value===''?undefined:Math.max(0,Math.min(12,Number(event.target.value)))})}/></label>
  <label>Date format<select aria-label={`${column.name} date format`} value={format.dateFormat||''} onChange={event=>onChange({dateFormat:event.target.value||undefined})}><option value="">Default</option><option value="raw">Raw</option><option value="iso">ISO / UTC</option><option value="local">Localized</option></select></label>
  <label>Sort locale<select aria-label={`${column.name} sort locale`} value={format.sortLocale||''} onChange={event=>onChange({sortLocale:event.target.value||undefined})}><option value="">System default</option>{['tr-TR','en-US','de-DE'].map(locale=><option key={locale}>{locale}</option>)}</select></label>
  <label className="column-format-check"><input type="checkbox" checked={format.naturalSort!==false} onChange={event=>onChange({naturalSort:event.target.checked})}/> Natural text sort</label>
  <label className="column-format-check"><input type="checkbox" checked={Boolean(format.linkify)} onChange={event=>onChange({linkify:event.target.checked})}/> Highlight HTTP/HTTPS values</label>
  <footer><button type="button" className="column-format-reset" onClick={reset}><RotateCcw size={12}/> Reset this column</button></footer>
 </section>;
}

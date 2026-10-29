import {RotateCcw} from 'lucide-react';

export function AppearancePopover({options,onOptionsChange,defaults={}}){
 const update=patch=>onOptionsChange?.({...options,...patch});
 const reset=()=>update({density:defaults.density??'compact',wrap:defaults.wrap??false,crosshair:defaults.crosshair??true,grouping:defaults.grouping??false,locale:defaults.locale??'en-US',decimals:defaults.decimals??undefined,dateFormat:defaults.dateFormat??'raw',timeZone:''});
 return <div className="result-hover-popover result-appearance-popover" role="region" aria-label="Appearance">
  <header><strong>Appearance</strong><button onClick={reset}><RotateCcw size={12}/> Reset appearance</button></header>
  <section className="result-appearance-options">
   <label>Density<select value={options.density||'compact'} onChange={event=>update({density:event.target.value})}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label>
   <label>Number locale<select value={options.locale||'en-US'} onChange={event=>update({locale:event.target.value})}>{['en-US','tr-TR','de-DE','en-GB'].map(locale=><option key={locale}>{locale}</option>)}</select></label>
   <label>Decimal places<input aria-label="Decimal places" type="number" min="0" max="12" placeholder="Raw" value={options.decimals??''} onChange={event=>update({decimals:event.target.value===''?'':Math.max(0,Math.min(12,Number(event.target.value)))})}/></label>
   <label>Date format<select value={options.dateFormat||'raw'} onChange={event=>update({dateFormat:event.target.value})}><option value="raw">Raw</option><option value="iso">ISO (preserve type)</option><option value="local">Localized</option></select></label>
   <label>Offset-aware timestamp zone<select value={options.timeZone||''} onChange={event=>update({timeZone:event.target.value})}><option value="">Source offset / zone</option>{['UTC','Europe/Istanbul','Europe/London','America/New_York','Asia/Tokyo'].map(zone=><option key={zone}>{zone}</option>)}</select></label>
   <label className="result-appearance-check"><input type="checkbox" checked={Boolean(options.wrap)} onChange={event=>update({wrap:event.target.checked})}/> Wrap cell text</label>
   <label className="result-appearance-check"><input type="checkbox" checked={options.crosshair!==false} onChange={event=>update({crosshair:event.target.checked})}/> Highlight hovered row and column</label>
   <label className="result-appearance-check"><input type="checkbox" checked={Boolean(options.grouping)} onChange={event=>update({grouping:event.target.checked})}/> Thousands separator</label>
  </section>
 </div>;
}

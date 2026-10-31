export const themeContrastAudit=`(()=>{
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
 const color=s=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=s;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v)};
 const over=(a,b)=>{const alpha=a[3]+b[3]*(1-a[3]);return [0,1,2].map(i=>(a[i]*a[3]+b[i]*b[3]*(1-a[3]))/alpha).concat(alpha)};
 const bg=e=>{if(!e)return color(getComputedStyle(document.documentElement).getPropertyValue('--bg'));return over(color(getComputedStyle(e).backgroundColor),bg(e.parentElement))};
 const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
 const failures=[],samples=[];
 for(const e of document.querySelectorAll('.desktop-shell *,.theme-scope,.theme-scope *')){
  const s=getComputedStyle(e),r=e.getBoundingClientRect();if(!r.width||!r.height||s.visibility==='hidden'||e.closest('[disabled],[aria-disabled="true"],.theme-option,.syntax-preview,.monaco-editor,.binary-image'))continue;
  if(e.matches(':focus-visible')&&e.matches('button,input,select,textarea,summary,a,[tabindex="0"]')){
   const focusBackground=bg(e.parentElement),ring=ratio(over(color(s.outlineColor),focusBackground),focusBackground);
   const composite=e.closest('.explorer-search,.picker-search,.workspace-search-input,.fetch-limit-picker,.result-settings-search,.result-popover-search,.ide-palette-search,.password-entry-frame');
   const field=e.matches('input:not([type=checkbox],[type=radio],[type=color],[type=file],[type=range]),textarea,select');
   const borderContrast=ratio(over(color(s.borderTopColor),focusBackground),focusBackground);
   const existingFrame=field&&parseFloat(s.borderTopWidth)>=1&&s.borderTopStyle!=='none'&&borderContrast+.02>=3;
   if(!composite&&!existingFrame&&(s.outlineStyle==='none'||parseFloat(s.outlineWidth)<1||ring+.02<3))failures.push({tag:e.tagName,cls:e.className,text:'focus indicator '+(e.getAttribute('aria-label')||e.textContent.trim()).slice(0,60),foreground:s.outlineColor,background:focusBackground.slice(0,3).map(Math.round),contrast:+ring.toFixed(2),min:3,outline:s.outline});
   if(field&&!composite&&(parseFloat(s.outlineWidth)>0&&s.outlineStyle!=='none'||s.boxShadow!=='none'))failures.push({tag:e.tagName,cls:e.className,text:'extra field focus frame',outline:s.outline,shadow:s.boxShadow});
  }
  const text=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim();const input=e.matches('input:not([type=checkbox],[type=radio],[type=color],[type=file],[type=range]),textarea,select');
  if(input){
   const composite=e.closest('.explorer-search,.picker-search,.workspace-search-input,.fetch-limit-picker,.result-settings-search,.result-popover-search,.ide-palette-search,.password-entry-frame'),expected=composite?[0,0,0,0]:color(s.getPropertyValue('--input'));
   if(color(s.backgroundColor).some((v,i)=>Math.abs(v-expected[i])>.01))failures.push({tag:e.tagName,cls:e.className,text:'field surface '+(e.getAttribute('aria-label')||''),background:s.backgroundColor,expected});
  }
  if(!text&&!input&&!e.matches('svg.lucide'))continue;
  if(e.matches('svg *'))continue;
  let opacity=1;for(let p=e;p;p=p.parentElement)opacity*=Number(getComputedStyle(p).opacity);
  if(opacity===0)continue;
  const background=bg(e),ink=color(s.color);ink[3]*=opacity;const foreground=over(ink,background),contrast=ratio(foreground,background),min=e.matches('svg')?3:4.5;
  const sample={tag:e.tagName,cls:e.className?.baseVal??e.className,text:(text||e.value||e.getAttribute('aria-label')||'icon').slice(0,75),foreground:s.color,background:background.slice(0,3).map(Math.round),contrast:+contrast.toFixed(2),min};
  samples.push(sample);if(contrast+.02<min)failures.push(sample);
  if(input&&!e.value&&e.getAttribute('placeholder')){const p=getComputedStyle(e,'::placeholder'),pc=ratio(over(color(p.color),background),background);if(pc+.02<4.5)failures.push({...sample,text:'placeholder '+e.placeholder,foreground:p.color,contrast:+pc.toFixed(2)})}
 }
 return {failures,samples:samples.length,errors:window.themeErrors};
})()`;

export function liveResultAppearance(options,patch){
 const safe={};
 if(['compact','comfortable'].includes(patch?.density))safe.density=patch.density;
 if(typeof patch?.nullLabel==='string')safe.nullLabel=patch.nullLabel.slice(0,30);
 return {...options,...safe,...Object.fromEntries(['pivotView','summaryView'].filter(key=>options[key]).map(key=>[key,{...options[key],...safe}]))};
}

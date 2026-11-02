const pathParts=path=>String(path||'').replace(/\\/g,'/').split('/').filter(Boolean);
const identity=tab=>tab.path?pathParts(tab.path).join('/').toLowerCase():tab.readOnly?'server':'draft';

// Only real file paths belong in path labels. Other same-name editors receive
// a quiet ordinal, never implementation labels such as draft/server/copy.
export function tabPathLabels(tabs) {
 const labels=new Map(),groups=new Map();
 for(const tab of tabs){const name=String(tab.name||'').toLowerCase();if(!groups.has(name))groups.set(name,[]);groups.get(name).push(tab)}
 for(const group of groups.values()){
  if(group.length<2)continue;
  for(const tab of group){
   const key=identity(tab),copies=group.filter(other=>identity(other)===key),directories=pathParts(tab.path).slice(0,-1);
   let label='';
   for(let count=1;count<=directories.length;count++){
    label=directories.slice(-count).join('/');
    if(group.every(other=>identity(other)===key||pathParts(other.path).slice(0,-1).slice(-count).join('/').toLowerCase()!==label.toLowerCase()))break;
   }
   const distinctPaths=new Set(group.filter(other=>other.path).map(identity));
   if(distinctPaths.size<2)label='';
   if(copies.indexOf(tab)>0)label+=(label?' ':'')+'('+(copies.indexOf(tab)+1)+')';
   if(label)labels.set(tab.id,label);
  }
 }
 return labels;
}

export function nextQueryName(tabs) {
 const numbers=tabs.filter(tab=>!tab.path).map(tab=>/^Query (\d+)$/i.exec(tab.name||'')).filter(Boolean).map(match=>Number(match[1]));
 return `Query ${Math.max(0,...numbers)+1}`;
}

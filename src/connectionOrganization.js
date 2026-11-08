export const emptyConnectionOrganization = () => ({version:1,folders:[],groups:[],assignments:{}});

export function connectionOrganization(profiles, saved) {
  if(saved?.version===1)return saved;
  const organization=emptyConnectionOrganization();
  for(const profile of profiles){
    const names=profile.groups??(profile.group!=null?[profile.group]:[profile.env==='DEV'?'Development':profile.env==='PROD'?'Production':['TEST','UAT'].includes(profile.env)?'Testing':'']);
    const groupIds=[...new Set(names.filter(Boolean))].map(name=>{
      let group=organization.groups.find(g=>g.name.toLocaleLowerCase()===name.toLocaleLowerCase());
      if(!group){group={id:'legacy-'+encodeURIComponent(name.toLocaleLowerCase()),name};organization.groups.push(group)}return group.id;
    });
    organization.assignments[profile.id]={folderId:profile.folderId||null,groupIds};
  }
  return organization;
}
export function folderDescendants(folders,id){
  const found=new Set([id]);let size;
  do{size=found.size;for(const folder of folders)if(found.has(folder.parentId))found.add(folder.id)}while(found.size!==size);
  return found;
}
export function folderOptions(folders){
  const byId=new Map(folders.map(f=>[f.id,f]));
  return folders.map(folder=>{const parts=[],seen=new Set();let current=folder;while(current&&!seen.has(current.id)){seen.add(current.id);parts.unshift(current.name);current=byId.get(current.parentId)}return {...folder,path:parts.join(' / ')}}).sort((a,b)=>a.path.localeCompare(b.path));
}
export function organizedProfiles(profiles,organization){
  const groups=new Map(organization.groups.map(g=>[g.id,g.name]));
  return profiles.map(profile=>{const a=organization.assignments[profile.id];return {...profile,folderId:a?.folderId||null,groupIds:a?.groupIds||[],groups:(a?.groupIds||[]).map(id=>groups.get(id)).filter(Boolean)}});
}
export function filterOrganizedConnections(profiles,organization,{search='',folderId='',groupId=''}={}){
  const folders=folderId&&folderId!=='__root__'?folderDescendants(organization.folders,folderId):null;
  const paths=new Map(folderOptions(organization.folders).map(f=>[f.id,f.path]));const query=search.trim().toLocaleLowerCase();
  return organizedProfiles(profiles,organization).filter(p=>(!folderId||(folderId==='__root__'?!p.folderId:folders.has(p.folderId)))&&(!groupId||p.groupIds.includes(groupId))&&[p.name,p.id,p.user,p.host,p.service,p.alias,p.env,paths.get(p.folderId),...p.groups].filter(Boolean).join(' ').toLocaleLowerCase().includes(query));
}
export function changeConnectionOrganization(organization,payload,profiles=[]){
 const next=structuredClone(organization),{operation,id}=payload;
 const kind=operation.split('.')[0],items=kind==='folder'?next.folders:next.groups,item=items.find(i=>i.id===id);
 const name=String(payload.name||'').trim();
 if(operation.endsWith('.create')||operation.endsWith('.rename')){
  if(!name||name.length>80||/[\u0000-\u001f]/.test(name))throw Error('Enter a name between 1 and 80 characters.');
  const parent=operation==='folder.rename'?item?.parentId:payload.parentId;
  if(items.some(i=>i.id!==id&&(kind!=='folder'||(i.parentId||null)===(parent||null))&&i.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('An item with this name already exists here.');
 }
 if(operation.endsWith('.create'))items.push({id:crypto.randomUUID(),name,...(kind==='folder'?{parentId:payload.parentId||null}:{})});
 else if(operation.endsWith('.rename')){if(!item)throw Error('Item no longer exists.');item.name=name}
 else if(operation==='folder.move'){
  if(!item)throw Error('Folder no longer exists.');
  if(payload.parentId&&folderDescendants(next.folders,id).has(payload.parentId))throw Error('A folder cannot be moved inside itself or a descendant.');
  item.parentId=payload.parentId||null;
 }else if(operation==='folder.delete'){
  if(next.folders.some(f=>f.parentId===id)||Object.values(next.assignments).some(a=>a.folderId===id))throw Error('Move the connections and subfolders before deleting this folder.');
  next.folders=next.folders.filter(f=>f.id!==id);
 }else if(operation==='group.delete'){
  next.groups=next.groups.filter(g=>g.id!==id);for(const a of Object.values(next.assignments))a.groupIds=a.groupIds.filter(g=>g!==id);
 }else if(operation==='profile.assign'){
  if(!profiles.some(p=>p.id===payload.profileId))throw Error('Connection no longer exists.');
  next.assignments[payload.profileId]={folderId:payload.folderId||null,groupIds:[...new Set(payload.groupIds)]};
 }else throw Error('Unsupported organization command.');
 for(const folder of next.folders)if(folder.parentId&&!next.folders.some(f=>f.id===folder.parentId))throw Error('Parent folder no longer exists.');
 for(const a of Object.values(next.assignments)){if(a.folderId&&!next.folders.some(f=>f.id===a.folderId))throw Error('Folder no longer exists.');if(a.groupIds.some(id=>!next.groups.some(g=>g.id===id)))throw Error('Group no longer exists.')}
 return next;
}

// A connection label: its identity never changes with it. The host checks again against every saved connection.
export function validateConnectionName(profiles, name, exceptId = null) {
  const text = String(name ?? '').trim();
  if (!text) return { error: 'Enter a connection name.' };
  if (text.length > 100) return { error: 'Use at most 100 characters.' };
  if (profiles.some(profile => profile.id !== exceptId && String(profile.name || profile.id).toLowerCase() === text.toLowerCase())) return { error: 'A connection with this name already exists.' };
  return { name: text };
}

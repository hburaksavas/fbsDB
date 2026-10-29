// Deliberately allowlist document fields. Session objects include credentials,
// bind values and result rows and must never be serialized into draft recovery.
export function draftSnapshot(tabs, activeTabId, activeFile, now=Date.now()) {
  const files=tabs.filter(tab=>!tab.readOnly).map(tab=>{
    const current=tab.id===activeTabId?{...tab,...activeFile}:tab;
    return {id:current.id,name:current.name,path:current.path||null,content:String(current.content||''),dirty:Boolean(current.dirty),connectionProfileId:current.connectionProfileId||null};
  });
  return {version:1,savedAt:now,activeTabId,files};
}

export function parseDraftSnapshot(value) {
  try {
    const data=JSON.parse(value);
    if(data?.version!==1||!Array.isArray(data.files)||!data.files.length)return null;
    const ids=new Set();
    const files=data.files.filter(file=>file&&typeof file.id==='string'&&typeof file.content==='string'&&typeof file.name==='string'&&!ids.has(file.id)&&(ids.add(file.id),true));
    if(!files.some(file=>file.dirty||!file.path&&file.content.trim()))return null;
    return draftSnapshot(files,files.some(file=>file.id===data.activeTabId)?data.activeTabId:files[0].id,null,data.savedAt);
  }catch{return null;}
}

import {isNativeHost,sendNativeCommand} from './nativeBridge';
export const workspaceTemplates=[{id:'blank',name:'Empty workspace',description:'A new empty folder.'},{id:'oracle-package',name:'Oracle package project',description:'Specification, body, example call draft and project path conventions.'},{id:'migrations',name:'Migration project',description:'Versioned SQL draft, scripts and project folders. Migration execution/tracking is separate.'}];
export function welcomeWorkspaceLists(workspace){
 const catalog=workspace.catalog||(workspace.recent||[]).map(path=>({id:path,path,name:path.split(/[\\/]/).at(-1),available:true}));
 const records=[...catalog].sort((a,b)=>new Date(b.lastOpened||0)-new Date(a.lastOpened||0));
 return {pinned:records.filter(item=>item.pinned).slice(0,8),recent:records.filter(item=>!item.pinned).slice(0,8)};
}
export function WelcomeWorkspaceHub({workspace={},startup,onStartup,onClose}){
 const lists=welcomeWorkspaceLists(workspace);
 const group=(label,items)=><section><h3>{label}</h3>{items.length?items.map(item=><button key={item.id} disabled={!isNativeHost||!item.available||item.active} title={item.path} onClick={()=>{onClose();sendNativeCommand('workspace.openRecent',{path:item.path})}}><b>{item.name}</b><small>{item.path}</small><span>{item.active?'Active':!item.available?'Unavailable':'Open'}</span></button>):<p>No {label.toLowerCase()} yet.</p>}</section>;
 return <div className="welcome-workspace-hub" aria-label="Welcome workspace hub"><div className="welcome-workspace-lists">{group('Pinned workspaces',lists.pinned)}{group('Recent projects',lists.recent)}</div><section><h3>Project templates</h3><p>Choose a parent folder and a new workspace name. Generated files are drafts; no SQL or connection is started.</p><div className="welcome-template-grid">{workspaceTemplates.map(template=><button key={template.id} disabled={!isNativeHost} aria-label={`Create ${template.name}`} onClick={()=>{onClose();sendNativeCommand('workspace.create',{template:template.id})}}><b>{template.name}</b><small>{template.description}</small></button>)}</div></section><label><input type="checkbox" aria-label="Show workspace hub on startup" checked={!!startup} onChange={event=>onStartup?.(event.target.checked)}/>Show this hub on startup</label></div>;
}

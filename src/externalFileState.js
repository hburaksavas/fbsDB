import {pathKey} from './workspaceTree.js';

export function applyExternalFileChange(tab, change, editorContent=tab.content) {
  if(pathKey(tab.path)!==pathKey(change.path)||(tab.diskVersion??null)!==change.expectedVersion)return tab;
  const snapshot=change.snapshot;
  if(tab.diskVersion==null&&!snapshot.error&&!snapshot.missing&&editorContent===snapshot.content)
    return {...tab,diskVersion:snapshot.version,externalChange:null};
  const next=snapshot.version===tab.diskVersion&&!snapshot.error?null:{...snapshot,baselineUnknown:tab.diskVersion==null};
  if(!next&&!tab.externalChange||next&&tab.externalChange?.version===next.version&&tab.externalChange?.error===next.error)return tab;
  return {...tab,externalChange:next};
}

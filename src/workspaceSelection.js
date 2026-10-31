import {pathKey} from './workspaceTree.js';

export function selectWorkspacePaths(current, visible, target, {toggle=false,range=false,anchor=null}={}) {
  const key=pathKey(target),keys=visible.map(pathKey);
  if(range&&anchor&&keys.includes(pathKey(anchor))&&keys.includes(key)){
    const start=keys.indexOf(pathKey(anchor)),end=keys.indexOf(key),slice=visible.slice(Math.min(start,end),Math.max(start,end)+1);
    return toggle?[...new Map([...current,...slice].map(path=>[pathKey(path),path])).values()]:slice;
  }
  if(toggle)return current.some(path=>pathKey(path)===key)?current.filter(path=>pathKey(path)!==key):[...current,target];
  return [target];
}

export function topLevelWorkspaceEntries(entries) {
  const unique=[...new Map(entries.map(entry=>[pathKey(entry.path),entry])).values()];
  return unique.filter(entry=>!unique.some(parent=>parent.isDirectory&&pathKey(entry.path).startsWith(pathKey(parent.path)+'/')));
}

export function canDropWorkspaceEntries(entries, destination) {
  const to=pathKey(destination);
  return entries.length>0&&entries.every(entry=>pathKey(entry.path.replace(/[\\/][^\\/]+$/,''))!==to&&(!entry.isDirectory||to!==pathKey(entry.path)&&!to.startsWith(pathKey(entry.path)+'/')));
}

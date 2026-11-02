import {pathKey} from './workspaceTree.js';
export const bookmarkStorageKey='fbsdb.sourceBookmarks.v1';
export const bookmarkScope=root=>pathKey(root)||'';
export function bookmarkMatches(mark,document,root){return bookmarkScope(mark.root)===bookmarkScope(root)&&(mark.path&&document?.path?pathKey(mark.path)===pathKey(document.path):mark.documentId===document?.id)}
export function readSourceBookmarks(value){
 if(!value)return {items:[],writable:true,error:''};
 try{
  const data=JSON.parse(value);if(data?.version!==1||!Array.isArray(data.items))throw Error('Unsupported bookmark data');
  const ids=new Set(),items=data.items.slice(0,200).filter(item=>item&&typeof item.id==='string'&&item.id.length<=100&&!ids.has(item.id)&&(ids.add(item.id),true)&&typeof item.name==='string'&&item.name.trim()&&item.name.length<=80&&typeof item.path==='string'&&item.path.length<=4000&&(!item.root||typeof item.root==='string'&&item.root.length<=4000)&&Number.isInteger(item.lineNumber)&&item.lineNumber>0&&item.lineNumber<=2147483647&&Number.isInteger(item.column)&&item.column>0&&item.column<=2147483647).map(item=>({id:item.id,name:item.name,path:item.path,root:item.root||null,lineNumber:item.lineNumber,column:item.column}));
  return {items,writable:true,error:''};
 }catch{return {items:[],writable:false,error:'Stored bookmarks could not be read or use another version. They are preserved; new marks remain in this session.'}}
}
export function serializeSourceBookmarks(items){return {version:1,items:items.filter(item=>item.path&&!item.server).slice(-200).map(({id,name,path,root,lineNumber,column})=>({id,name,path,root:root||null,lineNumber,column}))}}

import {useEffect,useRef,useState} from 'react';
import {bookmarkStorageKey,bookmarkScope,bookmarkMatches,readSourceBookmarks,serializeSourceBookmarks} from './sourceBookmarks';
import {transformEditOffset} from './editLocations';
import {persistLocal} from './localPersistence';

export function useSourceBookmarks(editor,document,root){
 const [initial]=useState(()=>{try{return readSourceBookmarks(localStorage.getItem(bookmarkStorageKey))}catch{return readSourceBookmarks('{')}});
 const [items,setItems]=useState(initial.items),itemsRef=useRef(items),documentRef=useRef(document),rootRef=useRef(root),offsets=useRef(new Map()),collection=useRef(null),previous=useRef(null);
 documentRef.current=document;rootRef.current=root;
 const commit=next=>{itemsRef.current=typeof next==='function'?next(itemsRef.current):next;setItems(itemsRef.current)};
 const sync=()=>{const model=editor?.getModel();if(!model)return;offsets.current=new Map(itemsRef.current.filter(mark=>bookmarkMatches(mark,documentRef.current,rootRef.current)).map(mark=>[mark.id,model.getOffsetAt(model.validatePosition(mark))]));};
 useEffect(()=>{if(initial.writable)persistLocal(localStorage,bookmarkStorageKey,JSON.stringify(serializeSourceBookmarks(items)))},[items]);
 useEffect(()=>{
  const old=previous.current;
  if(old?.id===document?.id&&old.path!==document?.path&&document?.path)commit(list=>list.map(mark=>mark.documentId===document.id||mark.path&&old.path&&mark.path.toLowerCase()===old.path.toLowerCase()?{...mark,path:document.path,server:false}:mark));
  previous.current={id:document?.id,path:document?.path};
 },[document?.id,document?.path]);
 useEffect(()=>{
  if(!editor)return;sync();collection.current=editor.createDecorationsCollection();
  const listener=editor.onDidChangeModelContent(event=>{
   if(event.isFlush||event.isEolChange||documentRef.current?.id!==document?.id){sync();return;}
   const model=editor.getModel();let changed=false;
   const next=itemsRef.current.map(mark=>{
    if(!offsets.current.has(mark.id)||!bookmarkMatches(mark,documentRef.current,rootRef.current))return mark;
    const offset=Math.min(model.getValueLength(),transformEditOffset(offsets.current.get(mark.id),event.changes));offsets.current.set(mark.id,offset);const position=model.getPositionAt(offset);changed=true;return {...mark,lineNumber:position.lineNumber,column:position.column};
   });
   if(changed)commit(next);
  });
  return()=>{listener.dispose();collection.current?.clear();collection.current=null};
 },[editor,document?.id,document?.path,root]);
 useEffect(()=>{
  sync();const model=editor?.getModel();
  collection.current?.set(model?items.filter(mark=>bookmarkMatches(mark,document,root)).map(mark=>{const position=model.validatePosition(mark);return {range:{startLineNumber:position.lineNumber,startColumn:1,endLineNumber:position.lineNumber,endColumn:1},options:{glyphMarginClassName:'source-bookmark-glyph',glyphMarginHoverMessage:{value:mark.name.replace(/[\\`*_{}\[\]<>]/g,'\\$&')}}}}):[]);
 },[items,editor,document?.id,document?.path,root]);
 const visible=items.filter(mark=>bookmarkScope(mark.root)===bookmarkScope(root));
 return {items:visible,full:items.length>=200,error:initial.error||(items.length>=200?'The 200 bookmark limit is reached. Remove a mark before adding another.':''),
  add(name,position){const doc=documentRef.current;if(!doc||!position||!name.trim()||itemsRef.current.length>=200)return;commit(list=>[...list,{id:crypto.randomUUID(),name:name.trim().slice(0,80),documentId:doc.id,path:doc.readOnly?null:doc.path||null,server:!!doc.readOnly,root:rootRef.current||null,lineNumber:position.lineNumber,column:position.column}].slice(-200))},
  remove(id){commit(list=>list.filter(mark=>mark.id!==id))},
  forgetDocument(id){if(!itemsRef.current.some(mark=>mark.documentId===id))return;commit(list=>list.flatMap(mark=>mark.documentId===id?mark.path?[{...mark,documentId:null}]:[]:[mark]))}
 };
}

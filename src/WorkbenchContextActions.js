// What the object, editor and connection context menus and the command palette do when an item is chosen. App keeps a function of the same name that passes its values in; see docs/architecture.md.
import { loadBindDefinitions, saveBindDefinitions } from "./bindDefinitions";
import { notifyFeedback } from "./Feedback";
import { persistLocal } from "./localPersistence.js";
import { isNativeHost, sendNativeCommand } from "./nativeBridge";
import { getOracleBindNames } from "./oracleBinds";
import { editableObjectDefinition, objectSqlDraft, qualifiedObject } from "./oracleObjectActions.js";
import { oracleSchemaKey } from "./OracleObjectTree.jsx";
import { resolveSetting } from "./settingsModel";

export async function objectContextAction(ctx, action, context) {
  const {
    closedTabsRef, completionMetadataRef, documents, inspectOracleObject, inspectorObject, objectTab, objectTabActive, openExplorerObject,
    openObjectSqlDraft, requestSchemaDetails, schemaObjects, sessionsRef, setObjectFavorites
  } = ctx;
    const {item,originTabId,editorTabId,profileId,epoch}=context,broker=completionMetadataRef.current;
    const valid=()=>!context.cancellation.token.isCancellationRequested&&documents.activeId===editorTabId&&!closedTabsRef.current.has(originTabId)&&broker.session(originTabId).epoch===epoch&&sessionsRef.current[originTabId]?.activeConnection?.id===profileId;
    const check=()=>{if(!valid())throw Error('The originating tab or connection changed. Open the menu again.')};
    const load=async(kind,target=item)=>{check();const value=await broker.load(originTabId,target,context.cancellation.token,kind);check();if(!value)throw Error(broker.session(originTabId).lastError||'Oracle metadata is unavailable for this object.');return value};
    check();
    if(action.startsWith('details:')){openExplorerObject(item,action.slice(8),originTabId);return}
    if(action==='favorite'){const key=oracleSchemaKey(item);setObjectFavorites(keys=>{const next=keys.includes(key)?keys.filter(k=>k!==key):[...keys,key];persistLocal(localStorage, 'fbsdb.objectFavorites',JSON.stringify(next));return next});return}
    if(action.startsWith('copy:')){await navigator.clipboard.writeText(action==='copy:name'?item.name:qualifiedObject(item));return}
    if(action==='refresh'){broker.invalidate(originTabId,item);requestSchemaDetails(item,originTabId,true);if(objectTabActive&&inspectorObject&&oracleSchemaKey(inspectorObject)===oracleSchemaKey(item))inspectOracleObject(item,originTabId,objectTab?.view==='Related tables');return}
    if(action==='target'){
      if(item.dbLink)throw Error('Remote synonym targets cannot be navigated locally. Use Open SELECT instead.');
      const target=item.targetName?item:await load('metadata');
      const owner=target.targetOwner,name=target.targetName;
      const found=(sessionsRef.current[originTabId]?.schemaObjects||schemaObjects).find(o=>o.owner===owner&&o.name===name&&['TABLE','VIEW','MATERIALIZED VIEW','SYNONYM'].includes(o.type));
      if(!found)throw Error('The target is not available in this session’s loaded object list.');
      openExplorerObject(found,'Overview',originTabId);return;
    }
    if(action==='table'){
      const detailed=(sessionsRef.current[originTabId]?.schemaObjects||schemaObjects).find(o=>oracleSchemaKey(o)===oracleSchemaKey(item))||item;
      const name=detailed.targetName;
      if(!name){if(detailed.details?.length)throw Error('This object has no accessible table target.');requestSchemaDetails(item,originTabId,true);throw Error('Table metadata is loading. Retry Go to table after it arrives.');}
      const found=(sessionsRef.current[originTabId]?.schemaObjects||schemaObjects).find(o=>o.owner===(detailed.targetOwner||item.owner)&&o.name===name&&['TABLE','VIEW'].includes(o.type));
      if(!found)throw Error('The related table is not available in the loaded object list.');
      openExplorerObject(found,'Overview',originTabId);return;
    }
    if(action.startsWith('ddl:')){
      const definition=await load('definition',action==='ddl:body-open'?{...item,body:true}:item),text=editableObjectDefinition(item,definition.text);
      if(action==='ddl:copy'){await navigator.clipboard.writeText(text);return}
      openObjectSqlDraft(text,item,profileId,action==='ddl:save');return;
    }
    if(action.startsWith('sql:')){
      const kind=action.slice(4),metadata=['insert','update','merge'].includes(kind)?await load('objectDraftMetadata'):kind.startsWith('call')?await load('metadata'):{};
      if(kind==='call'&&metadata.members?.length>1)return {choices:metadata.members.map(r=>({id:'sql:call:'+r.subprogramId,label:r.name+' ('+(r.parameters||[]).map(p=>p.name+' '+p.mode+' '+p.type).join(', ')+')'+(r.returnType?' → '+r.returnType:''),icon:'sql'}))};
      const text=objectSqlDraft(item,kind,metadata);check();openObjectSqlDraft(text,item,profileId);return;
    }
    throw Error('This object action is unavailable.');
  }

export async function editorContextAction(ctx, action, context) {
  const {
    coachShortcut, documents, editorCommandRunners, editorRef, explainQuery, filePath, formatSql, monacoRef, runQuery, settings
  } = ctx;
    const configured=resolveSetting(settings,'editor.shortcuts').value,shortcuts={run:configured.run,format:configured.format,comment:configured.commentLine,find:configured.find,replace:configured.replace,undo:'Ctrl+Z',redo:'Ctrl+Y',cut:'Ctrl+X',copy:'Ctrl+C',paste:'Ctrl+V',selectAll:'Ctrl+A'};
    if(shortcuts[action])coachShortcut(`editor:${action}`,{run:'Run SQL',format:'Format SQL',comment:'Toggle comment',selectAll:'Select all'}[action]||action[0].toUpperCase()+action.slice(1),shortcuts[action]);
    const editor=editorRef.current,valid=()=>documents.activeId===context.tabId&&editor.getModel()===context.model&&!context.model.isDisposed()&&context.model.getVersionId()===context.version;
    const check=()=>{if(!valid())throw Error('The editor changed. Open the menu again.')};check();editor.setSelection(context.selection);editor.focus();
    if(action.startsWith('bind:')&&context.bind){
      const bind=context.bind,from=context.model.getPositionAt(bind.start),to=context.model.getPositionAt(bind.end);
      if(action.startsWith('bind:type:')){
        const names=getOracleBindNames(context.model.getValue()),definitions=loadBindDefinitions(localStorage,filePath,names).map(item=>item.name===bind.name?{...item,type:action.slice(10)}:item);
        saveBindDefinitions(localStorage,filePath,definitions);
        notifyFeedback({kind:'success',title:'Bind type',message:`:${bind.name} is now ${action.slice(10)} in this file's bind form. SQL text is unchanged.`,scope:context.tabId});return;
      }
      if(action==='bind:copy'){await navigator.clipboard.writeText(`:${bind.name}`);return}
      if(action==='bind:find'){editor.setSelection(new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column));editor.getAction('actions.find')?.run();return}
      if(action==='bind:run'){runQuery();return}
    }
    if(action==='run'){runQuery();return}if(action==='explain'){explainQuery();return}if(action==='format'){await formatSql();return}
    if(editorCommandRunners[action]){await editorCommandRunners[action](context);return}
    if(action==='selectAll'){editor.setSelection(context.model.getFullModelRange());return}
    if(action==='copy'||action==='cut'){await navigator.clipboard.writeText(context.model.getValueInRange(context.selection));if(action==='copy')return;check()}
    if(action==='cut'||action==='paste'){if(context.readOnly)return;const text=action==='paste'?await navigator.clipboard.readText():'';check();editor.pushUndoStop();editor.executeEdits('context-menu',[{range:context.selection,text}]);editor.pushUndoStop();return}
    if(action==='undo'||action==='redo'){editor.trigger('context-menu',action,{});return}
    const command=editor.getAction({comment:'editor.action.commentLine',find:'actions.find',replace:'editor.action.startFindReplaceAction'}[action]);
    if(!command?.isSupported())throw Error('This editor action is unavailable.');await command.run();
  }

export function connectionContextAction(ctx, action, context) {
  const {
    beginConnection, disconnectActiveConnection, documents, newSqlFileNow, setConnectionRename, setFavorites, setProfileEditor,
    switchConnection
  } = ctx;
    const item=context.item,folderId=context.kind==='folder'?item.id:context.kind==='profile'?item.folderId:null;
    if(action==='newSql'){newSqlFileNow();if(isNativeHost)beginConnection({...item,tabId:documents.activeId});return;}
    if(action==='connect'||action==='reconnect')switchConnection(item,action==='reconnect');
    else if(action==='disconnect')disconnectActiveConnection();
    else if(action==='rename')setConnectionRename(item.id);
    else if(action==='edit')setProfileEditor(item);
    else if(action==='duplicate')setProfileEditor({...item,id:undefined,name:(item.name||item.id)+' copy',hasSavedCredentials:false,credentials:undefined});
    else if(action==='favorite')setFavorites(current=>current.includes(item.id)?current.filter(id=>id!==item.id):[...current,item.id]);
    else if(action==='delete')setProfileEditor({...item,libraryAction:'delete'});
    else if(action==='newConnection')setProfileEditor({method:'basic',folderId:folderId||null,groupIds:[]});
    else if(action==='newFolder'||action==='newGroup'||action==='manageFolder'||action==='renameFolder')setProfileEditor({libraryContext:{folderId:folderId||null,action}});
    else if(action==='manage')setProfileEditor(true);
    else if(action==='refresh')sendNativeCommand('connection.list');
  }

export function choosePaletteItem(ctx, item) {
  const {
    activateTab, coachShortcut, dbConnections, insertHistorySql, inspectOracleObject, jumpToOffset, newSqlFileNow, objectTabs,
    openExplorerObject, openWorkspaceFile, setActiveObject, setActiveObjectTabId, setObjectTabActive, setSettingsFocus, setShowAppearance,
    switchConnection
  } = ctx;
    if(item.kind==='file'){if(item.objectTab){const tab=objectTabs.find(t=>t.id===item.tabId);if(tab){setActiveObjectTabId(tab.id);setObjectTabActive(true);setActiveObject(tab.key);inspectOracleObject(tab.object,tab.originTabId,tab.view==='Related tables');}}else if(item.tabId){setObjectTabActive(false);activateTab(item.tabId);}else openWorkspaceFile(item);}
    else if(item.kind==='object')openExplorerObject(item,'Overview');
    else if(item.kind==='connection'){const profile=dbConnections.find(profile=>profile.id===item.profileId);if(profile)switchConnection(profile);}
    else if(item.kind==='history'){newSqlFileNow();requestAnimationFrame(()=>insertHistorySql(item.sql));}
    else if(item.kind==='outline'){setObjectTabActive(false);requestAnimationFrame(()=>jumpToOffset(item.start));}
    else if(item.kind==='setting'){setSettingsFocus({query:item.label,category:['privacy','accessibility'].includes(item.detail)?'preferences':item.detail});setShowAppearance(true);}
    else {item.run?.();if(item.detail)coachShortcut(`palette:${item.id}`,item.label,item.detail)}
  }

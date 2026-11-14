// What the context menus, the object explorer, the status bar indicators, the command palette, query history, workspace search and SQL snippets do when an item is chosen. App keeps a function of the same name that passes its values in; see docs/architecture.md.
import { loadBindDefinitions, saveBindDefinitions } from "./bindDefinitions";
import { notifyFeedback } from "./Feedback";
import { persistLocal } from "./localPersistence.js";
import { isNativeHost, sendNativeCommand } from "./nativeBridge";
import { getOracleBindNames } from "./oracleBinds";
import { completionCancellation } from "./oracleMetadataBroker";
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

export function openObjectContext(ctx, event, item) {
  const {
    completionMetadataRef, documents, metadataOriginTabId, schemaOwner, sessionsRef, setObjectMenu
  } = ctx;
    event.preventDefault();event.stopPropagation();
    const trigger=event.currentTarget,rect=trigger.getBoundingClientRect(),originTabId=metadataOriginTabId;
    const profileId=sessionsRef.current[originTabId]?.activeConnection?.id;
    if(!profileId||['No connection','Disconnected'].includes(profileId))return;
    setObjectMenu({cancellation:completionCancellation(),item:{...item,owner:item.owner||schemaOwner},trigger,x:event.type==='contextmenu'?event.clientX||rect.left:rect.left,y:event.type==='contextmenu'?event.clientY||rect.bottom:rect.bottom,editorTabId:documents.activeId,originTabId,profileId,epoch:completionMetadataRef.current.session(originTabId).epoch});
  }

export function statusIndicatorAction(ctx, action) {
  const {
    activeTabReadonly, editorRef, monaco, openWorkspaceDevelopment, setPaletteMode, setSettingsFocus, setShowAppearance,
    setShowSessionInspector, setStatusTick
  } = ctx;
    if(action==='outline')setPaletteMode('outline');
    else if(action==='objects')setPaletteMode('files');
    else if(action==='session')setShowSessionInspector(true);
    else if(action==='git')openWorkspaceDevelopment('git');
    else if(action==='indent'){setSettingsFocus({query:'Tab',category:'editor'});setShowAppearance(true)}
    else if(action==='eol'){const model=editorRef.current?.getModel();if(model&&!activeTabReadonly){model.pushEOL(model.getEOL()==='\r\n'?monaco.editor.EndOfLineSequence.LF:monaco.editor.EndOfLineSequence.CRLF);setStatusTick(tick=>tick+1)}}
  }

export function insertHistorySql(ctx, statement) {
  const {
    editorIsReadonly, editorRef, monacoRef, setShowHistory
  } = ctx; if (editorIsReadonly()) return; const editor = editorRef.current, model = editor?.getModel(), position = editor?.getPosition(); if (!editor || !model || !monacoRef.current) return; const target = position ?? { lineNumber: model.getLineCount(), column: model.getLineMaxColumn(model.getLineCount()) }; const range = new monacoRef.current.Range(target.lineNumber, target.column, target.lineNumber, target.column); editor.executeEdits("query-history", [{ range, text: `${target.column > 1 ? "\n" : ""}${statement}\n`, forceMoveMarkers: true }]); editor.focus(); setShowHistory(false); }

export function openWorkspaceSearchMatch(ctx, match) {
  const {
    activateTab, editorRef, pendingSearchPositionRef, rememberEditorPosition, setShowSearch, tabs
  } = ctx; const cached = tabs.find((tab) => tab.path?.toLowerCase() === match.path.toLowerCase()); if (cached) { activateTab(cached.id); setShowSearch(false); requestAnimationFrame(() => { editorRef.current?.setPosition({ lineNumber: match.lineNumber, column: match.column || 1 }); editorRef.current?.revealLineInCenter(match.lineNumber); editorRef.current?.focus(); }); return; } rememberEditorPosition(); pendingSearchPositionRef.current = { path: match.path, lineNumber: match.lineNumber, column: match.column }; setShowSearch(false); sendNativeCommand("file.openPath", { path: match.path }); }

export async function reviewDeleteImpact(ctx) {
  const {
    documents, editorRef, schemaObjects, schemaOwner, setDeleteReview, setSearchQuery, setShowSearch, setWorkspaceSearchScope, workspace
  } = ctx;
    const editor=editorRef.current,model=editor?.getModel(),position=editor?.getPosition(),tabId=documents.activeId,version=model?.getVersionId();
    if(!model||!position||!workspace.root||!isNativeHost){notifyFeedback({kind:'warning',title:'Delete review',message:'Open a workspace in the desktop app to inspect project references.',scope:tabId});return}
    const source=model.getValue(),cursor=Math.min(source.length,model.getOffsetAt(position)+1),{deleteImpactSeed}=await import('./deleteImpact.js');
    if(documents.activeId!==tabId||editor.getModel()!==model||model.getVersionId()!==version)return;
    const impact=deleteImpactSeed(source,cursor,{objects:schemaObjects,currentSchema:schemaOwner});
    if(impact.error){notifyFeedback({kind:'warning',title:'Delete review',message:impact.error,scope:tabId});return}
    setDeleteReview(impact);setWorkspaceSearchScope(null);setSearchQuery(impact.name);setShowSearch(true);
  }

export function saveCustomSqlSnippet(ctx) {
  const {
    allSqlSnippets, setCustomSqlSnippets, setSelectedSnippetTrigger, setSnippetDraft, setSnippetError, setSnippetFilter, setSnippetFormOpen,
    snippetDraft
  } = ctx;
    const trigger = snippetDraft.trigger.trim().toLowerCase(), label = snippetDraft.label.trim(), text = snippetDraft.text.trim();
    if (!/^[a-z][a-z0-9_]{1,23}$/.test(trigger)) { setSnippetError("Use 2–24 letters, numbers, or underscores; start with a letter."); return; }
    if (allSqlSnippets.some((snippet) => snippet.trigger.toLowerCase() === trigger)) { setSnippetError("That trigger is already in use."); return; }
    if (!label || !text) { setSnippetError("Add a name and SQL template before saving."); return; }
    const snippet = { trigger, label, detail: snippetDraft.detail.trim() || "Custom SQL snippet", text };
    setCustomSqlSnippets((current) => [...current, snippet]); setSelectedSnippetTrigger(trigger); setSnippetFilter(""); setSnippetError(""); setSnippetDraft({ trigger: "", label: "", detail: "", text: "SELECT ${1:column_name}\nFROM ${2:table_name};" }); setSnippetFormOpen(false);
  }

export async function inspectOracleObject(ctx, target, requestedOriginTabId, relationships) {
  const {
    completionMetadataRef, documents, objectAnalysisRequestRef, setObjectAnalysis
  } = ctx;
    objectAnalysisRequestRef.current?.cancel();const cancellation=completionCancellation();objectAnalysisRequestRef.current=cancellation;
    const originTabId=requestedOriginTabId,broker=completionMetadataRef.current,epoch=broker.session(originTabId).epoch;
    setObjectAnalysis({target,originTabId,loading:true});
    const editorTabId=documents.activeId;
    const [data,metadata]=await Promise.all([broker.load(originTabId,target,cancellation.token,'objectAnalysis'),relationships?broker.load(originTabId,target,cancellation.token,'metadata'):Promise.resolve(null)]);
    if(documents.activeId===editorTabId&&!cancellation.token.isCancellationRequested&&epoch===broker.session(originTabId).epoch)setObjectAnalysis({target,originTabId,data:data?{...data,relationships:metadata?.foreignKeys||[]}:null,loading:false});
  }

export function openExplorerObject(ctx, item, view, originTabId) {
  const {
    inspectOracleObject, objectTabs, requestSchemaDetails, setActiveObject, setActiveObjectTabId, setDefinitionError, setObjectTabActive,
    setObjectTabs, setRecentObjects
  } = ctx;
    setDefinitionError('');
    const key=oracleSchemaKey(item),existing=objectTabs.find(tab=>tab.key===key&&tab.originTabId===originTabId),id=existing?.id||`oracle-object:${originTabId}:${key}`;
    setActiveObject(key);setObjectTabs(current=>existing?current.map(tab=>tab.id===id?{...tab,object:item,view}:tab):[...current,{id,key,object:item,originTabId,view}]);
    setActiveObjectTabId(id);setObjectTabActive(true);
    requestAnimationFrame(()=>document.querySelector('.oracle-object-inspector [aria-selected="true"]')?.focus());
    setRecentObjects(keys=>{const next=[key,...keys.filter(value=>value!==key)].slice(0,30);persistLocal(localStorage, 'fbsdb.recentObjects',JSON.stringify(next));return next});
    requestSchemaDetails(item,originTabId);inspectOracleObject(item,originTabId,view==='Related tables');
  }

export async function openExplorerDefinition(ctx, target) {
  const {
    activeTabId, closedTabsRef, completionMetadataRef, documents, metadataOriginTabId, openOracleDefinition, setDefinitionError
  } = ctx;
    setDefinitionError('');
    const originTabId=metadataOriginTabId,broker=completionMetadataRef.current,epoch=broker.session(originTabId).epoch;
    const source=await broker.load(originTabId,target,undefined,'definition');
    if(source&&broker.session(originTabId).epoch===epoch&&!closedTabsRef.current.has(originTabId)&&documents.activeId===activeTabId)openOracleDefinition({...source,originTabId});
    else if(!source)setDefinitionError(broker.session(originTabId).lastError||'Oracle definition is unavailable for this object.');
  }

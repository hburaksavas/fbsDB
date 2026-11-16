// Handles native host messages for the workbench. App's mount effect calls this. The context is built when the effect runs, so it holds the values the effect read when it was written inline in App.
import { announce, resultAnnouncement } from "./announcer";
import { saveBindDefinitions } from "./bindDefinitions";
import { connectionOrganization, organizedProfiles } from "./connectionOrganization";
import { exportProgressText } from "./exportProgress.js";
import { dismissFeedback, notifyFeedback } from "./Feedback";
import { sendNativeCommand, setNativeTabId, subscribeNativeMessages } from "./nativeBridge";
import { isOracleRelation, makeOracleRelationLookup, oracleSchemaKey } from "./OracleObjectTree.jsx";
import { compilationProblemItems } from "./plsqlDiagnostics";
import { defaultProjectRules } from "./projectRules";
import { autoRunStatement } from "./relatedAutoRun.js";
import { runtimeStackProblems } from "./runtimeStack";
import { sourceBaseline, sourceCompilationUnits, sourceIdentity } from "./sourceCompilation";
import { pathKey, remapWorkspacePath } from "./workspaceTree";

export function subscribeWorkbenchMessages(ctx) {
  const {
    activateTab, activeConnectionRef, authProfileRef, authTestRequestRef, beginConnection, cancelQuery, closeTabRef, closedTabsRef,
    completionMetadataRef, dbConnectionsRef, documentSavesRef, documents, editorRef, favorites, filePollRef, fileWatchOffsetRef,
    finishHistoryEntry, getBindNames, newSqlFileNow, notifyExecutionFinished, openWorkspaceFile, operations, pageRequestRef,
    pendingConnectionsRef, pendingSearchPositionRef, pendingSwitchRef, pendingTabCloseRef, previewPathRef, previewTabRef, queueSchemaForSql,
    recentProfiles, refreshSchema, refreshWorkspaceGit, relatedRunRequestsRef, rememberEditorPosition, replyOwnerRef, results,
    schemaLoadedRef, schemaLookupRef, schemaObjects, schemaReadyRef, schemaRequestRef, schemaRequestedRef, searchRequestRef, sessionsRef,
    setActiveConnection, setAuthProfile, setCancelling, setConnecting, setConnectionDiagnostics, setConnectionError, setConnectionOrg,
    setDbConnections, setDefinition, setExecuting, setExplainMessage, setExplainResult, setFavorites, setFetchingPage, setKeyLookup,
    setKeyValues, setLookupPicker, setManagementError, setObjectTabs, setOutputMessage, setPageError, setPendingSwitch, setPendingTabClose,
    setPreviewTabId, setQueryResult, setQuickEval, setRecentProfiles, setRelatedAutoRun, setResultTab, setRunState, setSchemaError,
    setSchemaLoading, setSchemaObjects, setSchemaOwner, setSchemaStale, setSearchMatches, setSearchTruncated, setSearching, setSettingsError,
    setSourceCompile, setSqlResult, setSubqueryTrial, setTabSessions, setTabs, setTnsAliases, setTransactionPending,
    setUncertainCommit, setWorkspace, setWorkspaceDev, sourceBaselineRequests, sourceDefinitionRequestRef, tabCloseActionsRef, tabSessions,
    updateTabResult, updateTabSession, windowMessageRef, workspace, workspaceDevRequestsRef
  } = ctx;
    const unsubscribe = subscribeNativeMessages((message) => {
      if (message?.type?.startsWith("window.")) { windowMessageRef.current?.(message); return; }
      // FI-007: the debugger hook handles its own replies and events.
      if (message?.type?.startsWith("debug.")) return;
      const owner = message?.tabId || operations.owners.get(message?.requestId) || documents.activeId;
      const operation=operations.running.get(owner);
      if(typeof message.connected==='boolean')updateTabSession('connectionLost',!message.connected,owner);
      if((['sql.result','sql.timeout'].includes(message?.type)||message?.type==='host.error'&&operations.history.has(message.requestId))&&operation&&(operation.requestId!==message.requestId||operation.status!=='running'))return;
      replyOwnerRef.current = owner;
      try {
      if(typeof message?.autoCommit==='boolean')updateTabSession('autoCommit',message.autoCommit,owner);
      // Grid Apply and its undo change the session's transaction outside any query result; Commit and Rollback depend on this state.
      if(['sql.dmlApplied','sql.gridBatchRolledBack'].includes(message?.type)&&typeof message.transactionPending==='boolean')setTransactionPending(message.transactionPending,owner);
      if(message?.type==='transaction.autoCommit'){updateTabSession('autoCommitPending',false,owner);return;}
      if(['workspace.git','workspace.gitDiff','workspace.gitStage','workspace.gitUnstage','workspace.gitCommit','workspace.replacePreview','workspace.replaceApply'].includes(message?.type)) {
        if(workspaceDevRequestsRef.current.get(message.type)!==message.requestId)return;
        workspaceDevRequestsRef.current.delete(message.type);
        setWorkspaceDev(current=>({...current,busy:false,error:message.error||'',...(message.state?{git:message.state}:{}),...(message.type==='workspace.gitCommit'?{committed:message.commit||null}:message.type==='workspace.gitStage'||message.type==='workspace.gitUnstage'?{committed:null}:{}),...(message.diff?{diff:message.diff}:{}),...(message.preview?{preview:message.preview,applied:null}:{}),...(message.result?{applied:message.result,preview:null}:{} )}));
        if(message.type==='workspace.replaceApply'&&message.result){
          const changed=new Map(message.result.applied.map(file=>[file.path.toLowerCase(),file.content])),versions=new Map(message.result.applied.map(file=>[file.path.toLowerCase(),file.diskVersion]));
          setTabs(current=>current.map(tab=>{const dirty=tab.dirty,content=tab.path?changed.get(tab.path.toLowerCase()):undefined;return !dirty&&content!==undefined?{...tab,content,diskVersion:versions.get(tab.path.toLowerCase())??tab.diskVersion,externalChange:null}:tab}));
          refreshWorkspaceGit();
        }
        return;
      }
      if(message?.type==='ui.theme'){if(message.error)setSettingsError(message.error);return;}
      if(message?.type==='connection.managed'&&message.diagnostics)setConnectionDiagnostics(message.diagnostics);
      if(message?.type==='workspace.binds'&&message.operation==='load'&&Array.isArray(message.definitions)&&message.definitions.length){try{saveBindDefinitions(localStorage,message.path,message.definitions)}catch{/* the shared form stays on disk; the dialog falls back to its local copy */}}
      if(message?.type==='schema.error')notifyFeedback({id:`schema:${owner}`,kind:'error',title:'Oracle metadata could not be loaded',message:message.message||'Metadata unavailable.',scope:owner});
      if (completionMetadataRef.current?.handle(message)) return;
      if(message?.type==='session.context'){if(!closedTabsRef.current.has(owner)&&message.epoch===completionMetadataRef.current.session(owner).epoch){updateTabSession('sessionContext',message.context||null,owner);updateTabSession('sessionContextError',message.error||'',owner)}return;}
      if(message?.type==='sql.stage') {const run=operations.scripts.get(owner);if(operations.owners.has(message.requestId)||run?.running&&run.requestId===message.requestId&&run.index===message.scriptIndex){updateTabSession('sqlStage',message.stage,owner);setRunState(message.stage,owner)}return;}
      if(message?.type==='analysis.state') {updateTabSession('analysisReadOnly',Boolean(message.enabled),owner);setTransactionPending(Boolean(message.transactionPending),owner);setRunState(message.enabled?'Read-only consistent analysis active':'Read-only analysis ended',owner);return;}
      if(message?.type==='sql.runtimePlan') {setExecuting(false,owner);setCancelling(false,owner);if(message.error){setExplainMessage(message.error,owner);notifyFeedback({kind:'error',title:'Execution plan unavailable',message:message.error,scope:owner})}else{setExplainResult({...message,planKind:'runtime'},owner);setExplainMessage('',owner)}setResultTab('Explain',owner);return;}
      if(message?.type?.startsWith('script.')) {
        const previous=operations.scripts.get(owner)||{steps:[]};
        const run={...previous,steps:[...(previous.steps||[])]};
        if(message.type==='script.started'){notifyFeedback({id:`script:${owner}`,kind:'progress',title:'Running SQL script',message:'Starting script…',scope:owner,actions:[{label:'Cancel script',onClick:()=>cancelQuery(owner)}]});run.started=true;run.running=true;run.requestId=message.requestId;run.steps=[];run.completed=0;run.failed=0;}
        if(message.type==='script.sourceReviewRequired'){
          if(!run.running||run.requestId!==message.requestId)return;
          setTransactionPending(Boolean(message.transactionPending),owner);
          run.awaitingSourceReview={...message,profileId:sessionsRef.current[owner]?.activeConnection?.id,generation:sessionsRef.current[owner]?.connectionGeneration??0};
          updateTabSession('sqlStage',`Script paused for source review: statement ${message.index+1}`,owner);
        }
        if(message.type==='script.reviewAccepted'&&message.accepted)run.awaitingSourceReview=null;
        if(message.type==='script.step'){
          if(message.error)notifyFeedback({id:`script-error:${message.requestId}:${message.index}`,kind:'error',title:`Script statement ${message.index+1} failed`,message:message.error,scope:owner});
          run.steps[message.index]={...run.steps[message.index],...message};
          if(message.status==='Running'){notifyFeedback({id:`script:${owner}`,kind:'progress',title:'Running SQL script',message:`Statement ${message.index+1}`,scope:owner,actions:[{label:'Cancel script',onClick:()=>cancelQuery(owner)}]});
            run.index=message.index;updateTabSession('sqlStage','Executing script statement',owner);updateTabSession('operationStartedAt',Date.now(),owner);
            const context=operations.metadata.get(owner)||{};
            operations.metadata.set(owner,{...context,statementOffset:message.offset,executedSql:message.sql,executedAt:new Date().toISOString(),requestStartedAtPerf:performance.now(),executedParameters:(run.parameters||[]).filter(parameter=>getBindNames(message.sql).includes(parameter.name))});
            setExecuting(true,owner);setCancelling(false,owner);
          }
        }
        if(message.type==='script.completed'){notifyFeedback({id:`script:${owner}`,kind:message.failed?'error':message.cancelled?'warning':'success',title:message.cancelled?'Script cancelled':'Script completed',message:`${message.completed||0} completed · ${message.failed||0} failed`+(run.steps.filter(s=>s?.error).map(s=>'\n'+s.error).join('')),scope:owner});Object.assign(run,message,{running:false,awaitingSourceReview:null});setSourceCompile(current=>current?.scriptRequestId===message.requestId?null:current);setExecuting(false,owner);setCancelling(false,owner);setTransactionPending(Boolean(message.transactionPending),owner);}
        operations.scripts.set(owner,run);updateTabSession('scriptRun',run,owner);return;
      }
      if(message?.type==='host.error'&&operations.scripts.get(owner)?.running){const run=operations.scripts.get(owner),index=run.index;run.steps[index]={...run.steps[index],error:message.message};if(!run.started){run.running=false;updateTabSession('scriptRun',{...run},owner)}}

      if (message?.type === "completion.vocabulary") {
        if (sessionsRef.current[owner]?.activeConnection?.id === message.profileId) updateTabSession("oracleVocabulary", { version: message.version, words: message.words || [], error: message.error }, owner);
        return;
      }
      if (message?.type?.startsWith("schema.") && owner !== documents.activeId) {
        if (message.type === "schema.loaded") { setSchemaObjects(message.objects || []); setSchemaOwner(message.schema || ""); setSchemaLoading(false); setSchemaError(""); updateTabSession("schemaReady", true); }
        else if (message.type === "schema.loading") { setSchemaLoading(true); updateTabSession("schemaReady", false); }
        else if (message.type === "schema.error") { setSchemaLoading(false); setSchemaError(message.message || "Oracle metadata could not be loaded."); }
        else if ((message.type === "schema.table" || message.type === "schema.object") && message.item) setSchemaObjects(items => (items || []).map(item => oracleSchemaKey(item) === oracleSchemaKey(message.item) ? {...message.item,metadataFetchedAt:Date.now(),metadataExpiresAt:Date.now()+300000} : item));
        return;
      }

      const baselineRequest=sourceBaselineRequests.current.get(message.requestId);
      if(baselineRequest&&['source.review','source.review.error','host.error'].includes(message.type)){
        sourceBaselineRequests.current.delete(message.requestId);
        const tab=documents.tabs.find(tab=>tab.id===baselineRequest.tabId);
        if(message.type==='source.review'&&tab&&sessionsRef.current[tab.id]?.activeConnection?.id===baselineRequest.profile&&sourceCompilationUnits(tab,workspace.projectRules).some(prepared=>sourceIdentity(prepared.declaration)===baselineRequest.identity)){
          const snapshot=message.review.snapshot,baseline=sourceBaseline(snapshot);
          documents.patch(tab.id,{sourceBaseline:baseline,sourceBaselines:{...tab.sourceBaselines,[JSON.stringify([snapshot.owner,snapshot.name,snapshot.type,snapshot.profileId,snapshot.context])]:baseline}});
        }
        return;
      }
      if (message?.type === "tab.closed" || message?.type === "tab.closeFailed") {
        const action = tabCloseActionsRef.current.get(message.requestId); tabCloseActionsRef.current.delete(message.requestId);
        if (!action) return;
        if (message.type === "tab.closed") { setPendingTabClose(null); action.complete(); }
        else setPendingTabClose({ ...action, tabId: owner, message: message.message, pending: message.transactionPending, resolving: false });
      } else if (message?.type === "file.opened") {
        const cached = documents.tabs.find(tab => message.path && pathKey(tab.path) === pathKey(message.path));
        if (cached && !message.forceNew) { activateTab(cached.id); return; }
        rememberEditorPosition();
        const path = message.path ?? null, id = `file:${crypto.randomUUID()}`;
        documents.open({ id, name: message.fileName ?? "query.sql", path, content: message.content ?? "",savedContent:message.content??"", dirty: false, connectionProfileId: message.profileId ?? null, diskVersion: message.diskVersion ?? null });
        if (path && previewPathRef.current && pathKey(previewPathRef.current) === pathKey(path)) { previewPathRef.current = null; const old = previewTabRef.current; setPreviewTabId(id); if (old && old !== id) setTimeout(() => closeTabRef.current?.(old), 0); }
        setNativeTabId(id); sendNativeCommand("file.activate", { path, tabId: id });
        const searchPosition = pendingSearchPositionRef.current;
        if (searchPosition && path?.toLowerCase() === searchPosition.path.toLowerCase()) { pendingSearchPositionRef.current = null; requestAnimationFrame(() => { editorRef.current?.setPosition({ lineNumber: searchPosition.lineNumber, column: searchPosition.column||1 }); editorRef.current?.revealLineInCenter(searchPosition.lineNumber); editorRef.current?.focus(); }); }
        if (!message.profileId || message.profileId.toLowerCase() === (tabSessions[id]?.activeConnection?.id || "").toLowerCase()) queueSchemaForSql(documents.text);
        if (message.profileId) { const profile = dbConnectionsRef.current.find((item) => item.id.toLowerCase() === message.profileId.toLowerCase()); if (profile && profile.id.toLowerCase() !== (tabSessions[id]?.activeConnection?.id || "").toLowerCase()) { setTimeout(() => beginConnection({ ...profile, tabId: id }), 0); } }
      } else if(message?.type==='file.changes'){
        if(filePollRef.current?.id!==message.requestId)return;fileWatchOffsetRef.current=(filePollRef.current.offset+Math.max(1,message.processed||0))%filePollRef.current.total;filePollRef.current=null;
        documents.dispatch({ type: 'externalChanges', changes: message.changes || [] });
      } else if(message?.type==='file.conflict'){
        documentSavesRef.current.take(message.requestId, message.tabId);
        setTabs(current=>current.map(tab=>tab.id===owner?{...tab,externalChange:{...message.snapshot,noticeId:message.requestId,baselineUnknown:!!message.baselineUnknown}}:tab));
        setRunState('File changed on disk. Reload it or keep your editor text before saving.');
      } else if (message?.type === "file.saved") {
        const tab = documents.tabs.find(tab => tab.id === owner);
        const saved = documentSavesRef.current.saved(message, tab);
        if (!saved) return;
        const document = saved.document;
        documents.patch(owner, document);
        setRunState(document.dirty ? 'Saved earlier version; newer edits are still unsaved.' : `Saved ${document.name}`);
        saved.afterSave?.();
      } else if (message?.type === "file.connectionBound") {
        const profileId = message.profileId ?? null;
        documents.patch(owner, { connectionProfileId: profileId });
        setRunState(`${profileId} linked to ${documents.tabs.find(tab => tab.id === owner)?.name || 'SQL file'}`);
      } else if (message?.type === "file.saveCancelled") {
        documentSavesRef.current.take(message.requestId, message.tabId);
      } else if (message?.type === "workspace.state") {
        setWorkspace({ root: message.root ?? null, name: message.name ?? "No workspace", files: message.files ?? [], entries: message.entries ?? [], recent: message.recent ?? [], catalog:message.catalog??[],error:message.error??null,projectRules:message.projectRules??defaultProjectRules,fileConnections:message.fileConnections??{} });
       } else if (message?.type === "workspace.error") {
        notifyFeedback({id:`workspace:${message.requestId}`,kind:'error',title:'Workspace operation failed',message:message.message||'Workspace operation failed.',scope:owner});
        if(message.requestId===searchRequestRef.current){setSearching(false);searchRequestRef.current=null;}
        if([...workspaceDevRequestsRef.current.values()].includes(message.requestId)){setWorkspaceDev(current=>({...current,busy:false,error:message.message}));for(const [key,value] of workspaceDevRequestsRef.current)if(value===message.requestId)workspaceDevRequestsRef.current.delete(key);}
        setRunState(message.message || 'Workspace operation failed');
      } else if (message?.type === "workspace.changed") {
        if(message.error)notifyFeedback({id:`workspace:${message.requestId}`,kind:'error',title:'Workspace operation partially completed',message:message.error,scope:owner});
        const moves=message.moves||(message.source&&message.destination?[{source:message.source,destination:message.destination}]:[]);
        if (moves.length) {
          const remap = path => moves.reduce((value,move)=>remapWorkspacePath(value,move.source,move.destination),path);
          setTabs(current => current.map(tab => { const path = remap(tab.path); return path !== tab.path ? { ...tab, path, name: path.split(/[\\/]/).at(-1) } : tab; }));
        }
        if (message.entry && !message.entry.isDirectory) openWorkspaceFile(message.entry);
      } else if (message?.type === "workspace.searchResults") {
        if (message.requestId !== searchRequestRef.current) return;
        setSearchMatches(message.results ?? []); setSearchTruncated(Boolean(message.truncated)); setSearching(false);
      } else if (message?.type === "connection.profiles") {
        const organization=connectionOrganization(message.profiles??[],message.organization);
        const profiles = organizedProfiles(message.profiles??[],organization).map(profile=>({...profile,title:profile.name||profile.id,group:profile.groups[0]||'',color:profile.env==='PROD'?'rose':profile.env==='UAT'?'amber':profile.env==='TEST'?'blue':profile.env==='DEV'?'mint':'neutral',recent:recentProfiles.includes(profile.id),favorite:favorites.includes(profile.id)}));
        setConnectionOrg(organization);dbConnectionsRef.current=profiles;setDbConnections(profiles);setTnsAliases(message.aliases??[]);
        // Every connected tab shows the current label; the session behind it is not affected.
        setTabSessions(current=>Object.fromEntries(Object.entries(current).map(([id,session])=>{const profile=profiles.find(item=>item.id===session.activeConnection?.id);return [id,profile&&id!==owner?{...session,activeConnection:{...session.activeConnection,name:profile.name,title:profile.title}}:session]})));
        setActiveConnection((current) => {
          if (["No connection", "Disconnected"].includes(current.id)) return { id: "No connection", title: profiles.length ? "No active session" : "No TNS aliases found", host: profiles.length ? "" : "Add a tnsnames.ora file", port: "", service: "", env: "—", color: "mint" };
          return profiles.find((profile) => profile.id === current.id) ?? current;
        });
      } else if (message?.type === "connection.managed") {
        if (message.requestId === authTestRequestRef.current) {
          authTestRequestRef.current = null; setConnecting(false);
          setConnectionError(message.success ? "Test successful. Active session unchanged." : message.message);
        } else if (message.operation === "connection.rename") {
          // The field in the connection list reports this itself.
        } else if (message.operation === "connection.delete") {
          if (!message.success) setManagementError(message.message);
          else { setFavorites(current => current.filter(id => id !== message.profileId)); setRecentProfiles(current => current.filter(id => id !== message.profileId)); }
        }
      } else if (message?.type === "connection.connected") {
        completionMetadataRef.current.reset(owner);
        updateTabSession("connectionLost",false,owner);updateTabSession("connectionGeneration",generation=>(generation||0)+1,owner);updateTabSession("connectionEnvironment",message.profile?.env||'UNKNOWN',owner);
        updateTabSession("inactive",false,owner);
        updateTabSession("analysisReadOnly",false,owner);
        updateTabSession("oracleVocabulary", { version: message.serverVersion || 19, words: [] }, owner);
        pendingConnectionsRef.current.delete(message.requestId);
        updateTabSession('sessionContext',null,owner);updateTabSession('sessionContextError','',owner);
        sendNativeCommand('session.context',{tabId:owner,epoch:completionMetadataRef.current.session(owner).epoch});
        const profile = dbConnectionsRef.current.find((item) => item.id === message.profile?.id);
        if (profile) { if (owner === documents.activeId) { activeConnectionRef.current = profile; } setActiveConnection(profile); setTabs(current => current.map(tab => tab.id === owner ? { ...tab, connectionProfileId: profile.id } : tab)); }
        if (authProfileRef.current?.tabId === owner) setAuthProfile(null); setConnecting(false); setConnectionError(""); setQueryResult(current => current ? { ...current, hasMore: false, cursorUnavailable:current.hasMore } : current); updateTabResult("resultSets",sets=>(sets||[]).map(item=>({...item,result:{...item.result,hasMore:false,cursorUnavailable:item.result.hasMore}}))); setSchemaObjects([]); updateTabSession("schemaReady", false); setTransactionPending(false);
        if (owner === documents.activeId) { schemaReadyRef.current = false; schemaLookupRef.current = new Map(); schemaRequestedRef.current.clear(); schemaLoadedRef.current.clear(); }
        setRunState(`Connected to ${message.profile?.id ?? "Oracle"}`);
        if (message.profile?.id) setRecentProfiles((current) => [message.profile.id, ...current.filter((id) => id !== message.profile.id)].slice(0, 20));
      } else if (message?.type === "connection.inactive" || message?.type === "connection.resumed") {
        updateTabSession("inactive", message.type === "connection.inactive", owner);
        if(message.type==='connection.resumed'){updateTabSession("connectionLost",false,owner);updateTabSession("connectionGeneration",generation=>(generation||0)+1,owner);sendNativeCommand('session.context',{tabId:owner,epoch:completionMetadataRef.current.session(owner).epoch})}
        if (message.type === "connection.inactive") {
          setQueryResult(current => current ? { ...current, hasMore: false, cursorUnavailable: current.hasMore } : current);
          updateTabResult("resultSets", sets => (sets || []).map(item => ({ ...item, result: { ...item.result, hasMore: false, cursorUnavailable: item.result.hasMore } })));
        }
      } else if (message?.type === "connection.disconnected") {
        updateTabSession("sessionContext",null,owner);updateTabSession("rendering",false,owner);
        updateTabSession("analysisReadOnly",false,owner);
        completionMetadataRef.current.reset(owner);
        updateTabSession("completionMetadataStatus", "Offline Oracle vocabulary; connect to load object metadata.", owner);
        updateTabSession("oracleVocabulary", null, owner);
        setQueryResult(current=>current?{...current,hasMore:false,cursorUnavailable:current.hasMore||current.cursorUnavailable}:current);
        updateTabResult('resultSets',sets=>(sets||[]).map(item=>({...item,result:{...item.result,hasMore:false,cursorUnavailable:item.result.hasMore||item.result.cursorUnavailable}})));
        if (owner === documents.activeId) activeConnectionRef.current = { id: "Disconnected" }; setSchemaOwner(""); setRunState("Disconnected"); setActiveConnection({ id: "Disconnected", title: "No active session", host: "", port: "", service: "", env: "—", color: "mint" }); if (owner === documents.activeId) schemaReadyRef.current = false; setSchemaObjects([]); updateTabSession("schemaReady", false); setTransactionPending(false);
      } else if (message?.type === "sql.page") {
        if (pageRequestRef.current?.id !== message.requestId) return;
        const owner = pageRequestRef.current.owner; operations.cancellations.delete(owner);pageRequestRef.current = null; setFetchingPage(false); setCancelling(false,owner); setPageError("", owner);
        results.appendPage(owner, message);
      } else if (message?.type === "sql.pageError") {
        if (pageRequestRef.current?.id !== message.requestId) return;
        const owner = pageRequestRef.current.owner, failedId = pageRequestRef.current.resultId; operations.cancellations.delete(owner);pageRequestRef.current = null; setFetchingPage(false); setCancelling(false,owner);
        results.invalidateCursor(owner, failedId); setPageError(message.message || "Page could not be loaded. Run the query again.", owner);
      } else if (message?.type === "result.exportProgress" || message?.type === "result.exportComplete") {
        const exporting=message.type==='result.exportProgress',exportText=exporting?`${exportProgressText(message)} written…`:message.success&&message.bytesWritten!=null?`${message.message} (${exportProgressText(message)})`:message.message||`${message.rowsWritten||0} rows written`;
        updateTabResult('streamState',{busy:exporting,message:exportText},owner);
        notifyFeedback({id:`export:${owner}`,kind:exporting?'progress':message.cancelled?'info':message.success===false?'error':'success',title:exporting?'Exporting results':message.cancelled?'Export cancelled':message.success===false?'Export failed':'Export completed',message:exportText,scope:owner,actions:exporting?[{label:'Cancel export',onClick:()=>sendNativeCommand('result.cancelExport',{tabId:owner})}]:[]});
        if(message.type==='result.exportComplete'&&message.consumed) {
          results.invalidateCursor(owner, message.resultId);
        }
      } else if (message?.type === "result.columnDefinition") {
        if(sourceDefinitionRequestRef.current.get(owner)!==message.requestId){operations.owners.delete(message.requestId);return;}
        sourceDefinitionRequestRef.current.delete(owner);
        operations.owners.delete(message.requestId);
        setDefinition({...message.definition,tabId:owner,...(!message.definition?{message:"Source column not found"}:{})});
      } else if (message?.type === "result.primaryKey") {
        if(message.columns?.length){setKeyLookup({...message,tabId:owner});setKeyValues({})}else setRunState(message.message||'No primary key found.');
      } else if (message?.type === "result.children") {
        if(message.links?.length){setKeyLookup({links:message.links,tabId:owner});setKeyValues({})}else setRunState(message.message||'No child relationships found.');
      } else if (message?.type === "result.related") {
        // Only the foreign key lookups run by themselves; UPDATE drafts and primary key lookups share this reply and stay unrun.
        const runsItself=relatedRunRequestsRef.current.delete(message.requestId);
        if(message.sql) { const profile=sessionsRef.current[owner]?.activeConnection;newSqlFileNow(); const id=documents.activeId; setTabs(current=>current.map(tab=>tab.id===id?{...tab,name:'Related.sql',content:message.sql,dirty:true,connectionProfileId:profile?.id}:tab));if(profile?.id&&!['Disconnected','No connection'].includes(profile.id)){beginConnection({...profile,tabId:id});const statement=runsItself?autoRunStatement(message.sql):null;if(statement)setRelatedAutoRun({tabId:id,sql:statement})} } else setRunState(message.message||'No related records metadata available');
      } else if (message?.type === "sql.result") {
        const owner = message.tabId || operations.owners.get(message.requestId) || operations.lastOwner || documents.activeId; operations.owners.delete(message.requestId);
        if(operation)operation.status='complete';operations.cancellations.delete(owner);updateTabSession('queryOutcome',null,owner);
        if (closedTabsRef.current.has(owner)) { if (message.resultId) sendNativeCommand("sql.closeResult", { resultId: message.resultId, tabId: owner }); setExecuting(false); setCancelling(false); setTransactionPending(Boolean(message.transactionPending)); finishHistoryEntry("Succeeded", "Statement completed in closed tab"); return; }
        notifyExecutionFinished(owner,true,{elapsedMs:message.elapsedMs,rows:message.returnedRows,rowsAffected:message.rowsAffected,hasMore:message.hasMore,output:message.output});
        finishHistoryEntry("Succeeded", message.rowsAffected == null ? `${message.returnedRows ?? 0} rows · ${message.elapsedMs ?? 0} ms` : `${message.rowsAffected} rows affected · ${message.elapsedMs ?? 0} ms`);
        if (/^\s*(?:CREATE|ALTER|DROP|RENAME|COMMENT|GRANT|REVOKE)\b/i.test(operations.metadata.get(owner)?.executedSql || "")) { completionMetadataRef.current.reset(owner); refreshSchema(owner); }
        if(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*ALTER\s+SESSION\b/i.test(operations.metadata.get(owner)?.executedSql||'')){sendNativeCommand('session.nls',{tabId:owner,epoch:completionMetadataRef.current.session(owner).epoch});sendNativeCommand('session.context',{tabId:owner,epoch:completionMetadataRef.current.session(owner).epoch});}
        const executionMeta=operations.metadata.get(owner)||{},responseAt=performance.now(),renderRequestId=`${message.requestId||Date.now()}:${message.resultId||'statement'}`;
        updateTabSession("rendering",Boolean(message.columns?.length),owner);updateTabSession("renderingRequestId",renderRequestId,owner);
        if(message.columns?.length)announce(resultAnnouncement({rows:message.rows?.length??message.returnedRows,elapsedMs:message.elapsedMs,hasMore:message.hasMore}));
        setSqlResult({ ...message, ...executionMeta,renderRequestId,clientTiming:executionMeta.requestStartedAtPerf?{startedAtPerf:executionMeta.requestStartedAtPerf,responseAtPerf:responseAt,renderMs:null,totalMs:null}:undefined,fetchMetrics:[{offset:0,rows:message.rows?.length||0,elapsedMs:message.elapsedMs,bytes:new TextEncoder().encode(JSON.stringify(message.rows||[])).length}] }, owner); const output = [...(message.output ?? []),...(message.outParameters||[]).map(parameter=>`${executionMeta.parameterLabels?.[parameter.name]||parameter.name} (${parameter.type}) = ${parameter.value==null?'(NULL)':typeof parameter.value==='object'?JSON.stringify(parameter.value):parameter.value}`)].join("\n"); setOutputMessage(output, owner);updateTabResult("outputProvenance",{...message,...executionMeta},owner); setTransactionPending(Boolean(message.transactionPending)); setExecuting(false); setCancelling(false); setRunState(executionMeta.runConfiguration?`Call completed · ${message.elapsedMs??0} ms${message.transactionPending?' · pending transaction':''}`:message.rowsAffected == null ? `${message.returnedRows ?? 0} rows · ${message.elapsedMs ?? 0} ms` : `${message.rowsAffected} rows affected · ${message.elapsedMs ?? 0} ms`); setResultTab(output ? "Output" : "Results", owner);
      } else if (message?.type === "sql.compilation") {
        if(operation?.requestId===message.requestId){operation.status='complete';operations.cancellations.delete(owner);updateTabSession('queryOutcome',null,owner)}

        operations.owners.delete(message.requestId);
        if (closedTabsRef.current.has(owner)) return;
        const context = operations.metadata.get(owner) || {}, problems = compilationProblemItems(message.compilation, context, owner);
        if(message.compilation?.snapshot){const snapshot=message.compilation.snapshot,current=documents.tabs.find(tab=>tab.id===owner);documents.patch(owner,{sourceBaseline:sourceBaseline(snapshot),sourceBaselines:{...current?.sourceBaselines,[JSON.stringify([snapshot.owner,snapshot.name,snapshot.type,snapshot.profileId,snapshot.context])]:sourceBaseline(snapshot)}});}
        else if(context.sourceReviewId)documents.patch(owner,{sourceBaseline:null});
        updateTabSession("compilationProblems", problems, owner); updateTabSession("runtimeProblems", [], owner);
        setTransactionPending(!!message.transactionPending, owner); setExecuting(false, owner); setCancelling(false, owner);
        const errors = problems.filter(problem => problem.severity === "error").length;
        const summary = message.metadataError ? `Compilation completed; diagnostics unavailable: ${message.metadataError}` : errors ? `${errors} PL/SQL compilation error${errors === 1 ? "" : "s"}` : `PL/SQL compilation completed${problems.length ? ` with ${problems.length} warning(s)` : ""}`;
        setRunState(summary, owner); setOutputMessage([...(message.output || []), summary].join("\n"), owner);updateTabResult("outputProvenance",{...context,sqlVersion:message.sqlVersion,compiledSourceVersion:message.compilation?.snapshot?.version},owner); setResultTab(problems.length ? "Problems" : "Output", owner);
        notifyFeedback({id:`compilation:${message.requestId}`,kind:errors?"error":problems.length?"warning":"success",title:"PL/SQL compilation",message:summary,scope:owner,actions:problems.length?[{label:"View problems",onClick:()=>{activateTab(owner);setResultTab("Problems",owner)}}]:[]}); finishHistoryEntry(errors ? "Failed" : "Succeeded", summary);
        completionMetadataRef.current.reset(owner); refreshSchema(owner);
      } else if (message?.type === "sql.cancelled") {
        const fetching=sessionsRef.current[owner]?.fetchingPage;
        if(operation&&!fetching&&!sessionsRef.current[owner]?.scriptRun?.running&&(operation.status!=='running'||message.requestId&&![operation.requestId,operations.cancellations.get(owner)].includes(message.requestId)))return;
        setTransactionPending(Boolean(message.transactionPending));
        if (message.complete) { operations.cancellations.delete(owner);if(operation?.status==='running'){operations.owners.delete(operation.requestId);operation.status='complete';updateTabSession('queryOutcome',{transactionPending:message.transactionPending,kind:'cancelled',elapsedMs:Date.now()-operation.startedAt,requestId:operation.requestId},owner)}if(fetching){setFetchingPage(false,owner);setPageError('Row loading cancelled.',owner)}finishHistoryEntry("Cancelled", "Query cancelled"); setExecuting(false); setCancelling(false); setRunState("Query cancelled."); }
        else { setCancelling(true); setRunState("Waiting for Oracle to stop the query…"); }
      } else if (message?.type === "sql.timeout") {
        operations.owners.delete(message.requestId);
        if(operation)operation.status='complete';operations.cancellations.delete(owner);updateTabSession('queryOutcome',{transactionPending:message.transactionPending,kind:'timeout',message:message.message||'Query timed out.',elapsedMs:operation?Date.now()-operation.startedAt:undefined,requestId:message.requestId},owner);setResultTab('Results',owner);

        notifyExecutionFinished(owner,false,{message:'Query timed out.'});
        finishHistoryEntry("Failed", message.message || "Query timed out.");
        setTransactionPending(Boolean(message.transactionPending), owner); setExecuting(false, owner); setCancelling(false, owner); setRunState(message.message || "Query timed out.", owner);
      } else if (message?.type === "sql.explainResult") {
        const owner = message.tabId || operations.owners.get(message.requestId) || operations.lastOwner || documents.activeId; operations.owners.delete(message.requestId);
        setExplainResult(message, owner); setExplainMessage("", owner); setExecuting(false); setCancelling(false); setRunState(`Execution plan · ${message.returnedRows ?? 0} steps · ${message.elapsedMs ?? 0} ms`);
      } else if (message?.type === "transaction.state" && message.unconfirmed) {
        setUncertainCommit({ message: message.message || '' }); setRunState('Commit outcome not confirmed'); setTransactionPending(Boolean(message.pending), owner);
        if (pendingSwitchRef.current?.tabId === owner) setPendingSwitch(null);
        if (pendingTabCloseRef.current?.tabId === owner) setPendingTabClose(null);
      } else if (message?.type === "transaction.state") {
        if(!message.pending)updateTabSession("analysisReadOnly",false,owner); setTransactionPending(Boolean(message.pending)); setRunState(`Transaction ${message.state}`);
        if (!message.pending && pendingTabCloseRef.current?.tabId === owner && pendingTabCloseRef.current.resolving) { pendingTabCloseRef.current.retry(); setPendingTabClose(null); }
        if (!message.pending && pendingSwitchRef.current?.tabId === owner) { const profile = pendingSwitchRef.current; setPendingSwitch(null); if (profile.disconnect) sendNativeCommand("connection.disconnect", { tabId: owner }); else setTimeout(() => beginConnection(profile), 0); }
      } else if (message?.type === "sql.evaluated") { setLookupPicker(current => current && current.requestId === message.requestId ? { ...current, state: { running: false, ...(message.error ? { error: message.error } : { columns: message.columns, rows: message.rows, truncated: message.truncated }) } } : current); setSubqueryTrial(current => current && current.requestId === message.requestId ? { ...current, state: { running: false, ...(message.error ? { error: message.error } : { columns: message.columns, rows: message.rows, truncated: message.truncated, elapsedMs: message.elapsedMs, transactionPending: message.transactionPending }) } } : current); setQuickEval(current => current && current.requestId === message.requestId ? { ...current, state: { running: false, ...(message.error ? { error: message.error } : { columns: message.columns, rows: message.rows, elapsedMs: message.elapsedMs, transactionPending: message.transactionPending }) } } : current);
      } else if (message?.type === "schema.loading") { setSchemaLoading(true); setSchemaError(""); setSchemaStale((sessionsRef.current[owner]?.schemaObjects || []).length > 0); updateTabSession("schemaReady", false); schemaReadyRef.current = false;
      } else if (message?.type === "schema.loaded") {
        if (schemaRequestRef.current === message.requestId) schemaRequestRef.current = null; const objects = message.objects ?? []; schemaLookupRef.current = makeOracleRelationLookup(objects, message.schema ?? ""); setSchemaObjects(objects); setSchemaOwner(message.schema ?? ""); setSchemaLoading(false); setSchemaStale(false); setSchemaError(""); schemaReadyRef.current = true; updateTabSession("schemaReady", true); schemaRequestedRef.current.clear(); schemaLoadedRef.current.clear(); queueSchemaForSql(documents.text);
      } else if (message?.type === "schema.cancelled") {
        if (schemaRequestRef.current === message.requestId) schemaRequestRef.current = null; setSchemaLoading(false); setSchemaStale((sessionsRef.current[owner]?.schemaObjects || []).length > 0); setSchemaError('Metadata loading cancelled.');
      } else if (message?.type === "schema.table" || message?.type === "schema.object") {
        const item = message.item?{...message.item,metadataFetchedAt:Date.now(),metadataExpiresAt:Date.now()+300000}:null; if (item?.name) { const key = oracleSchemaKey(item).toLowerCase(); schemaLoadedRef.current.add(key); schemaRequestedRef.current.delete(key); if (isOracleRelation(item)) schemaLookupRef.current.set(item.name.toLowerCase(), item); setSchemaObjects((current) => current.map((entry) => oracleSchemaKey(entry) === oracleSchemaKey(item) ? item : entry)); setObjectTabs(current => current.map(tab => tab.key === oracleSchemaKey(item) ? { ...tab, object: item } : tab)); requestAnimationFrame(() => { const position = editorRef.current?.getPosition(); const line = position && editorRef.current?.getModel()?.getLineContent(position.lineNumber); if (line) editorRef.current?.render(); }); }
      } else if (message?.type === "schema.error") { setSchemaLoading(false); setSchemaError(message.message ?? "Oracle metadata could not be loaded."); schemaReadyRef.current = true; if (message.tableName || message.name) { const failed = [...schemaObjects].find(item => item.name.toLowerCase() === (message.tableName || message.name).toLowerCase() && (!message.owner || item.owner === message.owner)); if (failed) schemaRequestedRef.current.delete(oracleSchemaKey(failed).toLowerCase()); }
      } else if (message?.type === "host.error") {
        const failedQuery=!!operation&&operation.requestId===message.requestId&&operation.status==='running';
        if(failedQuery){notifyExecutionFinished(message.tabId||operations.owners.get(message.requestId)||operations.lastOwner||documents.activeId,false,{message:message.message})}
        if(failedQuery||message.explain)finishHistoryEntry("Failed", "Execution failed");
        documentSavesRef.current.take(message.requestId, message.tabId);
        if(message.requestId===filePollRef.current?.id)filePollRef.current=null;
        const owner = message.tabId || operations.owners.get(message.requestId) || operations.lastOwner || documents.activeId; operations.owners.delete(message.requestId);
        if(message.requestId===sessionsRef.current[owner]?.autoCommitRequestId)updateTabSession('autoCommitPending',false,owner);
        const failedConnection = pendingConnectionsRef.current.get(message.requestId);
        if (failedConnection) { pendingConnectionsRef.current.delete(message.requestId); setConnecting(false, owner); setAuthProfile({ ...dbConnectionsRef.current.find(p => p.id === failedConnection.id), ...failedConnection, credentials: undefined }); setConnectionError(message.message || "Connection failed", owner); }
        if(results.tabs[owner]?.streamState?.busy){updateTabResult("streamState",{busy:false,message:message.message||"Export failed"},owner);dismissFeedback(`export:${owner}`)} const error = message.message ?? "Desktop operation failed"; if(!failedQuery)notifyFeedback({id:`native:${message.requestId||owner}`,kind:"error",title:"Operation failed",message:error,scope:owner,scopeLabel:documents.tabs.find(t=>t.id===owner)?.name}); if(failedQuery)updateTabSession('runState',error,owner);else setRunState(error); if (typeof message.transactionPending === "boolean") setTransactionPending(message.transactionPending);
        if (authProfileRef.current?.tabId === owner) { setConnectionError(error); setConnecting(false); }
        if (pendingTabCloseRef.current?.tabId === owner) setPendingTabClose(current => current ? { ...current, resolving: false, message: error } : current);
        if(!operation||operation.status!=='running'||failedQuery||message.explain){setExecuting(false);setCancelling(false)}
        if(failedQuery){
          operation.status='complete';operations.cancellations.delete(owner);
          updateTabSession('queryOutcome',{transactionPending:message.transactionPending,kind:'error',message:error,elapsedMs:Date.now()-operation.startedAt,requestId:message.requestId},owner);setResultTab('Results',owner);setOutputMessage(error,owner);
          updateTabSession('runtimeProblems',[{id:`${owner}:runtime`,tabId:owner,severity:'error',source:'Oracle',message:error,fileName:documents.tabs.find(tab=>tab.id===owner)?.name||'SQL'},...runtimeStackProblems(error,operations.metadata.get(owner),owner)],owner);
        }
        else if ((!failedConnection && !authProfileRef.current && /ORA-\d+/i.test(error)) || message.explain) { if (message.explain) setExplainMessage(error, owner); else setOutputMessage(error, owner); setResultTab(message.explain ? "Explain" : "Output", owner); updateTabSession("runtimeProblems", [{ id: `${owner}:runtime`, tabId: owner, severity: "error", source: "Oracle", message: error, fileName: documents.tabs.find(tab => tab.id === owner)?.name || "SQL" },...runtimeStackProblems(error,operations.metadata.get(owner),owner)], owner); }
      }
      } finally { replyOwnerRef.current = null; }
    });
    return unsubscribe;
  }

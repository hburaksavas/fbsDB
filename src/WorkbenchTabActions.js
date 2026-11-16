// Creating, adopting, restoring, saving, closing, detaching and moving editor tabs, and polling open files. App keeps a function of the same name that passes its values in; see docs/architecture.md.
import { batchClosePlan } from "./batchClose";
import { countTabDrafts } from "./draftStore.js";
import { notifyFeedback } from "./Feedback";
import { hostWindow } from "./hostWindow.js";
import { isNativeHost, sendNativeCommand, setNativeTabId } from "./nativeBridge";
import { newQueryTemplates } from "./newQueryOptions";
import { projectOptions } from "./projectRules";
import { promptsOnClose } from "./scratchFiles";
import { nextQueryName } from "./tabPathLabels";
import { buildTabTransfer, tabMoveBlocker, windowDraftKey } from "./tabTransfer.js";
import { pathKey } from "./workspaceTree";

export function closeTabs(ctx, ids) {
  const {
    activateTab, batchDiscardRef, closeTab, documents, saveSqlFile, setBatchClose, setObjectTabActive
  } = ctx;
    const selected=[...new Set(ids)],dirty=selected.map(id=>documents.tabs.find(tab=>tab.id===id)).filter(promptsOnClose);
    const run=choices=>{
      let queue;try{queue=batchClosePlan(documents.tabs,selected,choices,dirty)}catch(error){setBatchClose(current=>({...current,error:error.message}));return;}
      setBatchClose(null);
      const next=()=>{
        const item=queue.shift();if(!item){batchDiscardRef.current.clear();return;}
        const tab=documents.tabs.find(tab=>tab.id===item.id);if(!tab){next();return;}
        const close=()=>closeTab(item.id,()=>setTimeout(next,0));
        if(item.action==='save'&&tab.dirty){setObjectTabActive(false);if(documents.activeId!==item.id)activateTab(item.id);saveSqlFile(close)}
        else {if(item.action==='discard')batchDiscardRef.current.add(item.id);close()}
      };next();
    };
    if(dirty.length>1)setBatchClose({items:dirty.map(tab=>({...tab})),cleanCount:selected.length-dirty.length,run});
    else {const queue=[...selected];const next=()=>{const id=queue.shift();if(id)closeTab(id,()=>setTimeout(next,0));else batchDiscardRef.current.clear()};next()}
  }

export function detachTabs(ctx, ids, sessionIds) {
  const {
    activateTab, batchDiscardRef, bookmarks, closedTabsRef, completionMetadataRef, completionRecentRef, documentSavesRef, documents,
    editLocationsRef, executionSummaries, newSqlFileNow, operations, results, runConsoleStore, setObjectDefinition, setSideEditor,
    setTabSessions, setTabs
  } = ctx;
    for (const id of ids) {
      setObjectDefinition(current => current?.originTabId === id ? null : current);
      documentSavesRef.current.forget(id); executionSummaries.current?.forget(id); runConsoleStore.current?.clear(id);
      bookmarks.forgetDocument(id); editLocationsRef.current.forget(id); batchDiscardRef.current.delete(id); closedTabsRef.current.add(id); operations.pages.delete(id); completionMetadataRef.current.forget(id); completionRecentRef.current.delete(id);
      operations.metadata.delete(id); results.forget(id);
    }
    setTabSessions(current => { const next = { ...current }; for (const id of sessionIds) delete next[id]; return next; });
    setSideEditor(current => current && ids.includes(current.tabId) ? null : current);
    const remaining = documents.tabs.filter(tab => !ids.includes(tab.id));
    const activeMoved = ids.includes(documents.activeId), index = documents.tabs.findIndex(tab => tab.id === documents.activeId);
    setTabs(current => current.filter(tab => !ids.includes(tab.id)));
    if (activeMoved) { if (remaining.length) activateTab(remaining[Math.max(0, Math.min(index, remaining.length) - 1)].id, false); else newSqlFileNow(); }
  }

export function newProjectSqlFile(ctx) {
  const {
    beginConnection, dbConnectionsRef, documents, newSqlFileNow, setObjectTabActive, setQueryTimeout, setRunState, updateTabSession,
    workspace
  } = ctx;
    setObjectTabActive(false);newSqlFileNow();
    const options=projectOptions(workspace.projectRules);setQueryTimeout(options.run.timeoutSeconds);updateTabSession('pageSizePreference',options.run.pageSize,documents.activeId);
    const profile=dbConnectionsRef.current.find(item=>item.id.toLowerCase()===options.defaultConnectionId?.toLowerCase());
    if(options.defaultConnectionId)documents.patch(documents.activeId,{connectionProfileId:options.defaultConnectionId});
    if(profile&&profile.available!==false){beginConnection({...profile,tabId:documents.activeId})}
    else setRunState(options.defaultConnectionId?'The project default profile is unavailable. Choose a saved connection.':'Project SQL file created; choose its connection.');
  }

export function newSqlFileFromTemplate(ctx, templateId) {
  const {
    activeConnectionRef, beginConnection, dbConnectionsRef, documents, newSqlFileNow, setActiveConnection, setObjectTabActive, setTabs
  } = ctx;
    const template=newQueryTemplates.find(item=>item.id===templateId);if(!template)return;
    const current=activeConnectionRef.current,profile=dbConnectionsRef.current.find(item=>item.id===(current&&!['No connection','Disconnected'].includes(current.id)?current.id:null));
    setObjectTabActive(false);newSqlFileNow(template.content);
    if(profile){if(isNativeHost)beginConnection({...profile,tabId:documents.activeId});else{setActiveConnection(profile);setTabs(tabs=>tabs.map(tab=>tab.id===documents.activeId?{...tab,connectionProfileId:profile.id}:tab))}}
  }

export function adoptTransfer(ctx, transfer) {
  const {
    activateTab, closedTabsRef, documents, draftsConfirmedRef, operations, rememberEditorPosition, results, sessionsRef, setTabSessions
  } = ctx;
    for (const id of [...transfer.sessionIds, ...transfer.documents.map(tab => tab.id)]) { closedTabsRef.current.delete(id); draftsConfirmedRef.current.delete(id); }
    for (const id of transfer.sessionIds) { results.revive(id, transfer.results[id]); if (transfer.metadata[id]) operations.metadata.set(id, transfer.metadata[id]); }
    sessionsRef.current = { ...sessionsRef.current, ...transfer.sessions };
    setTabSessions(current => ({ ...current, ...transfer.sessions }));
    rememberEditorPosition();
    for (const tab of transfer.documents) documents.open(tab);
    requestAnimationFrame(() => activateTab(transfer.activeId, false));
  }

export function worksetSnapshot(ctx) {
  const {
    documents, editorPositionsRef, editorRef, workspace
  } = ctx;
    const root=workspace.root;if(!root)return {files:[]};
    const inside=path=>pathKey(path).startsWith(pathKey(root)+'/');
    const files=[...new Map(documents.tabs.filter(tab=>tab.path&&!tab.readOnly&&inside(tab.path)).map(tab=>{const position=tab.id===documents.activeId?editorRef.current?.getPosition():editorPositionsRef.current.get(tab.id);return [pathKey(tab.path),{path:tab.path.slice(root.replace(/[\\/]$/,'').length+1).replace(/\\/g,'/'),line:position?.lineNumber||1,column:position?.column||1}]})).values()];
    return {files,activePath:documents.active?.path&&inside(documents.active.path)?documents.active.path.slice(root.length+1).replace(/\\/g,'/'):null};
  }

export function restoreDrafts(ctx, files, reconnect) {
  const {
    beginConnection, dbConnectionsRef, documents, recovery, setRecovery
  } = ctx;
    const restored=files.map(file=>({...file,id:`recovered-${crypto.randomUUID()}`})),selectedIndex=files.findIndex(file=>file.id===recovery.activeTabId),active=restored[Math.max(0,selectedIndex)];
    const live=documents.tabs.filter(tab=>tab.dirty||tab.path||tab.content.trim());
    documents.replace([...live,...restored], active.id);setNativeTabId(active.id);
    setRecovery(null);if(isNativeHost)sendNativeCommand('file.activate',{tabId:active.id,path:active.path});
    if(reconnect&&active.connectionProfileId){const profile=dbConnectionsRef.current.find(item=>item.id===active.connectionProfileId);if(profile)beginConnection({...profile,tabId:active.id});}
  }

export function pollOpenFiles(ctx) {
  const {
    documents, filePollRef, fileWatchOffsetRef
  } = ctx;
    if(!isNativeHost||document.hidden||filePollRef.current&&Date.now()-filePollRef.current.at<12000)return;
    const files=[...new Map(documents.tabs.filter(tab=>tab.path&&!tab.readOnly).map(tab=>[pathKey(tab.path),{path:tab.path,version:tab.diskVersion??null,hasError:!!tab.externalChange?.error}])).values()];
    if(files.length){const offset=fileWatchOffsetRef.current%files.length,rotated=[...files.slice(offset),...files.slice(0,offset)].slice(0,100);filePollRef.current={id:sendNativeCommand('file.poll',{files:rotated}),at:Date.now(),offset,total:files.length};}
  }

export function closeTab(ctx, id, onClosed) {
  const {
    activateTab, batchDiscardRef, bookmarks, closeTab, closedTabsRef, completionMetadataRef, completionRecentRef, documentSavesRef,
    documents, draftsConfirmedRef, editLocationsRef, executionSummaries, newSqlFileNow, operations, results, runConsoleStore, sessionsRef,
    setDraftGuard, setObjectDefinition, setPendingFileAction, setTabSessions, setTabs, sourceBaselineAttempts, sourceBaselineRequests,
    tabCloseActionsRef
  } = ctx;
    const tab = documents.tabs.find(item => item.id === id); if (!tab) return;
    const complete = () => {
      setObjectDefinition(current => current?.originTabId === id ? null : current);
      documentSavesRef.current.forget(id);executionSummaries.current?.forget(id);runConsoleStore.current?.clear(id);
      for(const [request,entry] of sourceBaselineRequests.current)if(entry.tabId===id)sourceBaselineRequests.current.delete(request);
      for(const key of sourceBaselineAttempts.current)if(JSON.parse(key)[0]===id)sourceBaselineAttempts.current.delete(key);
      bookmarks.forgetDocument(id);editLocationsRef.current.forget(id);batchDiscardRef.current.delete(id);closedTabsRef.current.add(id); operations.pages.delete(id); completionMetadataRef.current.forget(id); completionRecentRef.current.delete(id);
      setTabSessions(current => { const next = { ...current }; delete next[id]; return next; });
      results.forget(id);
      const activeIdBeforeClose = documents.activeId;
      const currentTabs = documents.tabs;
      const remaining = currentTabs.filter(item => item.id !== id);
      setTabs(current => current.filter(item => item.id !== id));
      if (id !== activeIdBeforeClose) { onClosed?.(); return; }
      if (remaining.length) { const next = remaining[Math.max(0, currentTabs.findIndex(item => item.id === id) - 1)]; activateTab(next.id, false); }
      else newSqlFileNow();
      onClosed?.();
    };
    const draftCount = countTabDrafts(id);
    if (draftCount && !draftsConfirmedRef.current.has(id)) { if (id !== documents.activeId) activateTab(id); setDraftGuard({ reason: 'close', name: tab.name, tabId: id, count: draftCount, transaction: Boolean(sessionsRef.current[id]?.transactionPending), run: () => { draftsConfirmedRef.current.add(id); closeTab(id, onClosed); } }); return; }
    const retry = () => { const request = sendNativeCommand("tab.close", { tabId: id }); tabCloseActionsRef.current.set(request, { complete, retry }); };
    const close = () => isNativeHost && !tab.readOnly ? retry() : complete();
    if (promptsOnClose(tab) && !batchDiscardRef.current.has(id)) { if (id !== documents.activeId) activateTab(id); setPendingFileAction({ run: close }); }
    else close();
  }

export function moveTabsToWindow(ctx, ids, target, closeWindow) {
  const {
    documents, operations, pendingWindowMovesRef, results, sessionsRef, windowClosingRef
  } = ctx;
    if (!isNativeHost) return false;
    const sessionIds = [...new Set(ids.map(id => documents.tabs.find(tab => tab.id === id)).filter(Boolean).map(tab => tab.metadataOriginTabId || tab.id))];
    const refuse = message => { notifyFeedback({ kind: 'warning', title: closeWindow ? 'Window not closed' : 'Tab not moved', message, scope: sessionIds[0] }); if (closeWindow) sendNativeCommand('window.closeCancelled', {}); return false; };
    if (!sessionIds.length) {
      if (closeWindow) { windowClosingRef.current = true; try { localStorage.removeItem(windowDraftKey(hostWindow.id)); } catch {} sendNativeCommand('window.close', {}); }
      return false;
    }
    for (const id of sessionIds) {
      const blocker = tabMoveBlocker(sessionsRef.current[id], { gridDrafts: countTabDrafts(id), paging: operations.pages.has(id), exporting: Boolean(results.tabs[id]?.streamState?.busy) });
      if (blocker) return refuse(`${documents.tabs.find(tab => tab.id === id)?.name || 'This tab'}: ${blocker}`);
    }
    let transfer;
    try { transfer = buildTabTransfer({ tabIds: sessionIds, documents: documents.tabs, sessions: sessionsRef.current, results: results.tabs, metadata: Object.fromEntries(sessionIds.filter(id => operations.metadata.has(id)).map(id => [id, operations.metadata.get(id)])), activeId: documents.activeId, from: hostWindow.id }); }
    catch (error) { return refuse(error.message); }
    const movedIds = documents.tabs.filter(tab => sessionIds.includes(tab.metadataOriginTabId || tab.id)).map(tab => tab.id);
    const request = sendNativeCommand('window.moveTab', { tabId: sessionIds[0], tabIds: sessionIds, target, transfer, closeWindow });
    pendingWindowMovesRef.current.set(request, { ids: movedIds, sessionIds, closeWindow });
    return true;
  }

export function saveSqlFile(ctx, afterSave) {
  const {
    documentSavesRef, documents, fileName, learnSqlUsage, setFileDirty, setRunState, sql
  } = ctx;
    learnSqlUsage(documents.text);
    if (documents.tabs.find(tab => tab.id === documents.activeId)?.readOnly) return;
    if (isNativeHost) {
      const tab = documents.tabs.find(tab => tab.id === documents.activeId);
      if (!tab) return;
      const document = tab;
      if (!documentSavesRef.current.start(sendNativeCommand, document, afterSave)) setRunState('A save is already in progress for this file.');
      return;
    }
    const url = URL.createObjectURL(new Blob([sql], { type: "text/sql;charset=utf-8" })), link = document.createElement("a"); link.href = url; link.download = fileName || "query.sql"; link.click(); URL.revokeObjectURL(url); setFileDirty(false); afterSave?.();
  }

export function newSqlFileFromLastConnection(ctx, extra) {
  const {
    activeConnectionRef, beginConnection, dbConnectionsRef, documents, newSqlFileNow, setActiveConnection, setTabs
  } = ctx; const current = activeConnectionRef.current; const profile = dbConnectionsRef.current.find(item => item.id === (current && !['No connection', 'Disconnected'].includes(current.id) ? current.id : null)); newSqlFileNow("", extra); if (profile) { if (isNativeHost) beginConnection({ ...profile, tabId: documents.activeId }); else { setActiveConnection(profile); setTabs(tabs => tabs.map(tab => tab.id === documents.activeId ? { ...tab, connectionProfileId: profile.id } : tab)); } } }

export function newSqlFileNow(ctx, content, extra) {
  const {
    documents, editorRef, rememberEditorPosition, schemaLoadedRef, schemaLookupRef, schemaReadyRef, schemaRequestedRef
  } = ctx;
    const id = `new-${crypto.randomUUID()}`;
    rememberEditorPosition();
    documents.open({ id, name: nextQueryName(documents.tabs), path: null, content, dirty: Boolean(content), connectionProfileId: null, ...extra });
    setNativeTabId(id);
    if (isNativeHost) sendNativeCommand("file.new", { tabId: id });
    schemaReadyRef.current = false; schemaLookupRef.current = new Map(); schemaLoadedRef.current.clear(); schemaRequestedRef.current.clear();
    requestAnimationFrame(() => editorRef.current?.focus());
  }

export function updateTabSession(ctx, key, value, owner) {
  const {
    closedTabsRef, setTabSessions
  } = ctx;
    if (closedTabsRef.current.has(owner)) return;
    setTabSessions(current => { const previous = current[owner] || {}; return { ...current, [owner]: { ...previous, [key]: typeof value === "function" ? value(previous[key] ?? (key === "activeConnection" ? { id: "No connection" } : undefined)) : value } }; });
  }

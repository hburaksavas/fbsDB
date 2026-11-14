// Closing and detaching editor tabs. App keeps a function of the same name that passes its values in; see docs/architecture.md.
import { batchClosePlan } from "./batchClose";
import { promptsOnClose } from "./scratchFiles";

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


// Read current ports on every action; callbacks never retain an old active tab.
export function createConnectionLifecycle(getPorts, {native, send}) {
  function connectInBackground(item, credentials={}) {
    const p=getPorts(), tabId=item.tabId || p.documents.activeId;
    if ([...p.pendingConnectionsRef.current.values()].some(profile=>profile.tabId===tabId)) return;
    p.updateTabSession('sessionContext',null,tabId);
    p.updateTabSession('operationStartedAt',Date.now(),tabId);
    p.setConnecting(true,tabId); p.setConnectionError('',tabId);
    p.updateTabSession('connectingProfile',item.name || item.id,tabId);
    p.updateTabSession('connectingProfileId',item.id,tabId);
    p.updateTabSession('connectingEnvironment',item.env||'UNKNOWN',tabId);
    const requestId=send('connection.connect',{profileId:item.id,...credentials,tabId});
    p.pendingConnectionsRef.current.set(requestId,{...item,user:credentials.user || item.user || item.savedUser,credentials:undefined,tabId});
  }
  function beginConnection(item) {
    const p=getPorts(), tabId=item.tabId || p.documents.activeId;
    item={...item,tabId};
    if (item.credentials || item.hasSavedCredentials) {
      p.setAuthProfile(null); connectInBackground(item,item.credentials || {});
    } else {
      p.setAuthProfile(item); p.setConnectionError('',tabId); p.setConnecting(false,tabId);
    }
  }
  function switchConnection(item,force=false) {
    const p=getPorts();
    if (p.editorIsReadonly()) return;
    if (item.available===false) { p.setManagementError('TNS source unavailable. Edit this connection or refresh sources.'); return; }
    p.setShowPicker(false);
    if (!force && !p.connectionLost && item.id.toLowerCase()===p.activeConnection.id.toLowerCase()) return;
    if (native && p.guardDrafts?.({ reason: 'switch', name: item.name || item.id, tabId: p.documents.activeId }, () => switchConnection(item, force))) return;
    if (native && p.transactionPending) { p.setPendingSwitch({...item,tabId:p.documents.activeId}); return; }
    if (native) { beginConnection(item); return; }
    p.setActiveConnection(item); p.setRunState(`Connected to ${item.id}`);
  }
  function disconnectActiveConnection() {
    const p=getPorts(); if(p.editorIsReadonly())return; p.setShowPicker(false);
    if (native && p.guardDrafts?.({ reason: 'disconnect', name: 'this connection', tabId: p.documents.activeId }, () => disconnectActiveConnection())) return;
    if (p.transactionPending) p.setPendingSwitch({id:'disconnect',disconnect:true,tabId:p.documents.activeId});
    else if (native) send('connection.disconnect',{tabId:p.documents.activeId});
    else p.setActiveConnection({id:'Disconnected',title:'No active session',env:'—'});
  }
  function submitConnectionCredentials(credentials) {
    const p=getPorts(), profile=p.authProfile;
    if (!profile) return;
    if (profile.testOnly) {
      p.setConnecting(true,profile.tabId);
      p.authTestRequestRef.current=send('connection.test',{profileId:profile.id,...credentials,tabId:profile.tabId}); return;
    }
    p.setAuthProfile(null); connectInBackground(profile,credentials);
  }
  function finishTransaction(action) {
    const p=getPorts();
    if(p.editorIsReadonly()&&!p.pendingSwitch)return;
    if (native) send(`transaction.${action}`,{tabId:p.pendingSwitch?.tabId || p.documents.activeId});
    else p.setRunState(action==='commit'?'Transaction committed':'Transaction rolled back');
  }
  return {connectInBackground,beginConnection,switchConnection,disconnectActiveConnection,submitConnectionCredentials,finishTransaction};
}

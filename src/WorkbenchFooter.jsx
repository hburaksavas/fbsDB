// The status bar at the bottom of the window. App calls this inside its return; see docs/architecture.md.
import { EnvironmentBadge } from "./ExecutionContextBadges";
import { FooterDrafts } from "./FooterDrafts";
import { hostWindow } from "./hostWindow.js";
import { WorkbenchStatus } from "./WorkbenchStatus";
import { transactionStatus } from "./workbenchStatusModel.js";
import { CircleHelp, Folder, LockKeyhole } from "lucide-react";

export function renderFooter(ctx) {
  const {
    activeTabId, otherWindows, resultTab, setResultTab, setShowGettingStarted, setShowPicker, summarySession, tabResults, tabSession, view,
    visibleConnection, visibleOrigin, workspace
  } = ctx;
  return <footer className="app-status"><div className="footer-workspace"><Folder size={12}/><span title={workspace.root||'Open a workspace'}>{workspace.name}</span></div>{(hostWindow.secondary||otherWindows.length>0)&&<span className="footer-window" title={`Database sessions of the tabs in this window belong to ${hostWindow.label}. Move a tab to hand its session to another window.`}>{hostWindow.label}</span>}<button type="button" className="footer-target" aria-label={`Connection ${visibleConnection.profileName||'none'}${visibleConnection.environment&&visibleConnection.environment!=='UNKNOWN'?`, ${visibleConnection.environment}`:''}. Choose another connection`} onClick={()=>setShowPicker(true)}><EnvironmentBadge compact environment={visibleConnection.environment} profileName={visibleConnection.profileName}/><span>{visibleConnection.profileName||'No connection'}</span></button><FooterDrafts tabId={activeTabId} onShow={()=>setResultTab('Results')}/><div className="footer-context"><button type="button" aria-label="Getting started" onClick={()=>setShowGettingStarted(true)}><CircleHelp size={11}/><span>Getting started</span></button><WorkbenchStatus session={{...summarySession,exporting:!!tabResults[visibleOrigin]?.streamState?.busy}} connection={visibleConnection} selection={visibleOrigin===activeTabId&&resultTab==='Results'?view.selectionSummary:null} error={visibleOrigin===activeTabId?view.pageError:''}/></div><div className="footer-transaction" title={`${visibleConnection.profileName} · ${transactionStatus(summarySession)}`}><LockKeyhole size={12}/><span>{transactionStatus(summarySession)}</span></div></footer>;
}

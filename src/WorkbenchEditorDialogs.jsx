// Dialogs opened from the editor: run configurations, compare and compile, refactorings and code navigation.
import { Suspense } from "react";
import { EditorContextMenu } from './EditorContextMenu';
import { changeSetting } from './settingsModel';
import { RelatedSourcesDialog } from './RelatedSourcesDialog';
import { IdentifierCaseDialog } from './IdentifierCaseDialog';
import { ProjectRulesDialog } from './ProjectRulesDialog';
import { SourceCompileDialog } from './SourceCompileDialog';
import { RunConfigurationsDialog } from './RunConfigurationsDialog';
import { sourceBaseline } from './sourceCompilation';
import { pathKey } from './workspaceTree';
import { CodeCellDialog } from './CodeCellDialog.jsx';
import { statusIndicators, toggleStatusIndicator } from './statusBarModel';
import { isNativeHost, sendNativeCommand } from "./nativeBridge";
import { CallHierarchyDialog, ChangeSignatureDialog, DependencyGraphDialog, EmbeddedSqlDialog, ExpressionExplainDialog, ExtractProcedureDialog, LocalRenameDialog, QuickFixDialog, StructuralSearchDialog } from './lazyViews.js';

export function renderEditorDialogs(ctx) {
  const {
    activeTabId, applyChangeSignature, applyEmbeddedSql, applyExtractProcedure, applyIdentifierCase, applyLocalRename, applyQuickFix, applySettings,
    applySurround, callHierarchy, changeSignature, codeCell, dbConnections, dependencyGraph, documents, editorRef, editorThemeName, embeddedSql,
    enabledStatusIndicators, executeStatement, expressionExplanation, extractProcedure, identifierCase, localRename, newSqlFileNow,
    openCallHierarchyPlace, openWorkspaceFile, quickFix, relatedSources, runConfigurations, sessionsRef, setCallHierarchy, setChangeSignature,
    setCodeCell, setDependencyGraph, setEmbeddedSql, setExpressionExplanation, setExtractProcedure, setIdentifierCase, setLocalRename,
    setObjectTabActive, setQuickFix, setRelatedSources, setRunConfigurations, setRunState, setShowProjectRules, setSourceCompile, setStatusMenu,
    setStructuralSearch, setSurroundMenu, setWorkspace, settings, showProjectRules, sourceCompile, sql, statusMenu, structuralSearch, surroundMenu,
    tabResults, tabSession, tabSessions, tabs, workspace
  } = ctx;
  return <>
    {runConfigurations&&<RunConfigurationsDialog {...runConfigurations} profileId={tabSessions[runConfigurations.tabId]?.activeConnection?.id} autoCommit={!!tabSessions[runConfigurations.tabId]?.autoCommit} connected={isNativeHost&&!tabSessions[runConfigurations.tabId]?.connectionLost&&!!tabSessions[runConfigurations.tabId]?.activeConnection&&!['No connection','Disconnected'].includes(tabSessions[runConfigurations.tabId]?.activeConnection?.id)} busy={!!tabSessions[runConfigurations.tabId]?.executing||!!tabSessions[runConfigurations.tabId]?.fetchingPage||!!tabSessions[runConfigurations.tabId]?.connecting} status={tabSessions[runConfigurations.tabId]?.runState||'Ready'} output={tabResults[runConfigurations.tabId]?.outputMessage||''} onClose={()=>setRunConfigurations(null)} onRun={(sql,parameters,configuration)=>{if(documents.activeId!==runConfigurations.tabId){setRunState('Return to the call configuration tab before running.');return;}const labels=Object.fromEntries(configuration.parameters.map((parameter,index)=>['arg_'+index,parameter.name]));labels.run_result='Return value';const sensitive=new Set(configuration.parameters.flatMap((parameter,index)=>parameter.sensitive?['arg_'+index]:[]));executeStatement(sql,parameters,{executedParameters:parameters.filter(parameter=>!sensitive.has(parameter.name)),parameterLabels:labels,runConfiguration:{id:configuration.id,name:configuration.name,revision:configuration.revision}})}}/>}
    {sourceCompile&&<SourceCompileDialog {...sourceCompile} theme={editorThemeName} valid={activeTabId===sourceCompile.tabId&&sql===sourceCompile.document.content&&tabSession.activeConnection?.id===sourceCompile.profileId&&(!sourceCompile.scriptRequestId||(tabSession.connectionGeneration??0)===sourceCompile.generation)} transactionPending={!!tabSession.transactionPending} onClose={()=>{if(sourceCompile.scriptRequestId)sendNativeCommand('sql.cancel',{tabId:sourceCompile.tabId});setSourceCompile(null)}} confirmLabel={sourceCompile.scriptRequestId?'Compile this script source':'Compile reviewed source'} reviewContext={sourceCompile.scriptRequestId?`Script paused before statement ${sourceCompile.scriptIndex+1}. Earlier statements remain completed; Cancel stops the remaining script.`:null} onBaseline={snapshot=>{const current=documents.tabs.find(tab=>tab.id===sourceCompile.tabId);if(current?.content===sourceCompile.document.content)documents.patch(current.id,{sourceBaseline:sourceBaseline(snapshot),sourceBaselines:{...current.sourceBaselines,[JSON.stringify([snapshot.owner,snapshot.name,snapshot.type,snapshot.profileId,snapshot.context])]:sourceBaseline(snapshot)}})}} onCompile={review=>{if(documents.activeId!==sourceCompile.tabId||documents.text!==sourceCompile.document.content||sessionsRef.current[sourceCompile.tabId]?.activeConnection?.id!==sourceCompile.profileId)return;const request=sourceCompile;
      if(request.scriptRequestId){const session=sessionsRef.current[request.tabId]||{};if((session.connectionGeneration??0)!==request.generation)return;sendNativeCommand('script.sourceReviewed',{tabId:request.tabId,scriptRequestId:request.scriptRequestId,index:request.scriptIndex,reviewNonce:request.reviewNonce,reviewId:review.reviewId});setSourceCompile(null);return;}
      setSourceCompile(null);executeStatement(request.prepared.sql,[],{ddlConfirmed:true,sourceReviewId:review.reviewId,submittedSql:request.prepared.sql,executedSql:request.prepared.original,statementOffset:request.statementOffset})}}/>}
    {showProjectRules&&workspace.root&&<ProjectRulesDialog profiles={dbConnections} root={workspace.root} onClose={()=>setShowProjectRules(false)} onSaved={rules=>{setWorkspace(current=>({...current,projectRules:rules}));setShowProjectRules(false)}}/>}
    {statusMenu&&<EditorContextMenu context={statusMenu} onClose={()=>setStatusMenu(null)} onAction={id=>{settings&&applySettings(changeSetting(settings,'ui.statusIndicators',toggleStatusIndicator(enabledStatusIndicators,id)))}} actions={statusIndicators.filter(item=>!item.fixed).map(item=>({id:item.id,label:`${enabledStatusIndicators.includes(item.id)?'✓ ':'    '}${item.label}`}))}/>}
    {surroundMenu&&<EditorContextMenu context={surroundMenu} onClose={()=>setSurroundMenu(null)} onAction={applySurround} actions={surroundMenu.options.map(option=>({id:surroundMenu.paste?option.id:`surround:${option.id}`,label:option.label}))}/>}
    {codeCell&&<CodeCellDialog cell={codeCell} theme={editorThemeName} onClose={()=>setCodeCell(null)} onOpenSql={text=>{setCodeCell(null);setObjectTabActive(false);newSqlFileNow(text)}}/>}
    {identifierCase&&<IdentifierCaseDialog request={identifierCase} onApply={applyIdentifierCase} onClose={()=>{setIdentifierCase(null);editorRef.current?.focus()}}/>}
    {localRename&&<Suspense fallback={null}><LocalRenameDialog request={localRename} onApply={applyLocalRename} onClose={()=>{setLocalRename(null);editorRef.current?.focus()}}/></Suspense>}
    {changeSignature&&<Suspense fallback={null}><ChangeSignatureDialog request={changeSignature} onApply={applyChangeSignature} onClose={()=>{setChangeSignature(null);editorRef.current?.focus()}}/></Suspense>}
    {extractProcedure&&<Suspense fallback={null}><ExtractProcedureDialog request={extractProcedure} onApply={applyExtractProcedure} onClose={()=>{setExtractProcedure(null);editorRef.current?.focus()}}/></Suspense>}
    {embeddedSql&&<Suspense fallback={null}><EmbeddedSqlDialog request={embeddedSql} onApply={applyEmbeddedSql} onClose={()=>{setEmbeddedSql(null);editorRef.current?.focus()}}/></Suspense>}
    {quickFix&&<Suspense fallback={null}><QuickFixDialog request={quickFix} onApply={applyQuickFix} onClose={()=>{setQuickFix(null);editorRef.current?.focus()}}/></Suspense>}
    {expressionExplanation&&<Suspense fallback={<div role="status">Loading…</div>}><ExpressionExplainDialog explanation={expressionExplanation} onClose={()=>setExpressionExplanation(null)}/></Suspense>}
    {dependencyGraph&&<Suspense fallback={<div role="status">Loading…</div>}><DependencyGraphDialog {...dependencyGraph} documents={tabs} onOpen={openCallHierarchyPlace} onClose={()=>setDependencyGraph(null)}/></Suspense>}
    {structuralSearch&&<Suspense fallback={<div role="status">Loading…</div>}><StructuralSearchDialog {...structuralSearch} documents={tabs} onOpen={openCallHierarchyPlace} onClose={()=>setStructuralSearch(null)}/></Suspense>}
    {callHierarchy&&<Suspense fallback={<div role="status">Loading…</div>}><CallHierarchyDialog {...callHierarchy} documents={tabs} onOpen={openCallHierarchyPlace} onClose={()=>setCallHierarchy(null)}/></Suspense>}
    {relatedSources&&<RelatedSourcesDialog rules={workspace.projectRules} root={relatedSources.root} document={relatedSources.document} documents={tabs} onClose={()=>setRelatedSources(null)} onOpen={file=>{if(pathKey(workspace.root)!==pathKey(relatedSources.root))return;setRelatedSources(null);openWorkspaceFile(file)}}/>}
  </>;
}

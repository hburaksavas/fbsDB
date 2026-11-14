// The hidden file input and the File menu with its Run and View menus. App calls this inside its return; see docs/architecture.md.
import { ConnectionControl } from "./ConnectionControl";
import { FileMenu } from "./FileMenu";
import { isNativeHost, setNativeTabId } from "./nativeBridge";
import { defaultProjectRules } from "./projectRules";
import { RunMenu } from "./RunMenu";
import { changeSetting, resolveSetting } from "./settingsModel";
import { ViewMenu } from "./ViewMenu";

export function renderFileMenu(ctx) {
  const {
    activeTabReadonly, applySavedLayout, applySettings, currentResultOptions, documents, executing, fetchingPage, focusMode, language,
    layout, metadataOriginTabId, navigateHistory, newSqlFile, openFileInputRef, openScriptPreview, openSqlFile, openWorkspace,
    plsqlDebugger, plsqlProfiler, previewResultAppearance, queryResult, rememberEditorPosition, resetPanelLayout, runQuery, saveSqlFile,
    setFocusMode, setObjectDefinition, setPaletteMode, setResultTab, setShowAppearance, setShowPicker, setShowWorkspaceManager, settings,
    showDockPanel, showPicker, summaryConnected, summaryConnection, summarySession, tabResults, updateLayout, workspace
  } = ctx;
  return <>
    <input ref={openFileInputRef} type="file" accept={(workspace.projectRules||defaultProjectRules).associations.map(item=>item.extension).join(',')+',text/plain'} hidden onChange={async (event) => { const file = event.target.files?.[0]; if (file) { const content = await file.text(); rememberEditorPosition(); const id = `file:${crypto.randomUUID()}`; documents.open({ id, name: file.name, path: null, content,savedContent:content, dirty: false, connectionProfileId: null }); setNativeTabId(id); } event.target.value = ""; }} />
    <FileMenu connectionControl={<ConnectionControl key={metadataOriginTabId} context={summarySession.sessionContext} contextError={summarySession.sessionContextError} executing={summarySession.executing} fetching={summarySession.fetchingPage} rendering={summarySession.rendering} cancelling={summarySession.cancelling} stage={summarySession.sqlStage} startedAt={summarySession.operationStartedAt} transactionPending={summarySession.transactionPending} readOnlyAnalysis={summarySession.analysisReadOnly} exporting={Boolean(tabResults[metadataOriginTabId]?.streamState?.busy)} inactive={Boolean(summarySession.inactive)&&!summarySession.connectionLost} profile={summaryConnection} connected={summaryConnected} connecting={summarySession.connecting} connectingProfile={summarySession.connectingProfile} disabled={activeTabReadonly} open={showPicker} onOpen={() => setShowPicker(true)}/>} onManageWorkspaces={()=>setShowWorkspaceManager(true)} workspace={workspace} onNew={newSqlFile} onOpen={openSqlFile} onSave={() => {if(!activeTabReadonly)saveSqlFile()}} onOpenWorkspace={openWorkspace} language={language}>
      <RunMenu actions={[{label:'Run statement',shortcut:resolveSetting(settings,'editor.shortcuts').value.run,disabled:activeTabReadonly||executing||fetchingPage,run:runQuery},{label:'Profile statement',disabled:!isNativeHost||activeTabReadonly||executing||fetchingPage||!!plsqlDebugger.debug,run:plsqlProfiler.start},{label:'Debug statement',disabled:!isNativeHost||activeTabReadonly||executing||fetchingPage||!!plsqlDebugger.debug,run:plsqlDebugger.start},{label:'Preview / run script',disabled:activeTabReadonly,run:openScriptPreview},{id:'navigation',separator:true},{label:'File outline',shortcut:resolveSetting(settings,'editor.shortcuts').value.outline,run:()=>setPaletteMode('outline')},{label:'Navigate back',shortcut:'Alt+Left',run:()=>navigateHistory(-1)},{label:'Navigate forward',shortcut:'Alt+Right',run:()=>navigateHistory(1)}]}/>
      <ViewMenu onApplyLayout={applySavedLayout} resultOptions={currentResultOptions} canPreviewResult={!!queryResult?.columns?.length} onResultAppearance={previewResultAppearance} settings={settings} layout={layout} language={language} onSetting={(id, value) => applySettings(changeSetting(settings, id, value))} onLayout={updateLayout} onPanel={showDockPanel} focusMode={focusMode} onFocusMode={setFocusMode} onResults={name => { setFocusMode(false); updateLayout(current => ({ ...current, resultsCollapsed: false })); setResultTab(name); }} onReset={resetPanelLayout} onSettings={() => setShowAppearance(true)} onCloseDetails={() => { setObjectDefinition(null); window.dispatchEvent(new Event('fbsdb.closeDetails')); }}/>
    </FileMenu>
  </>;
}

// The command palette (Ctrl+P) and the list of workbench commands it offers.
import { notifyFeedback } from './Feedback';
import { resolveSetting, settingDefinitions } from './settingsModel';
import { projectOptions } from './projectRules';
import { IdeCommandPalette } from './IdeCommandPalette';
import { paletteEditorCommand } from './editorCommands.js';
import { activeGridActions } from './gridActionBridge';
import { activeResultActions } from './resultActionBridge.js';
import { relatedFileProposals } from './contextualFiles';
import { prepareEvaluation } from "./quickEval.js";
import { prepareSubqueryTrial } from "./subqueryTrial.js";
import { isNativeHost, sendNativeCommand } from "./nativeBridge";

export function renderCommandPalette(ctx) {
  const {
    activeEditorTab, activeSource, activeTabReadonly, applyProjectRunDefaults, beginReadOnlyAnalysis, cancelQuery, cancelling, choosePaletteItem,
    completionObjects, connecting, dbConnections, documentOutline, documents, editorCommandRunners, editorCommandState, editorRef, executing,
    fetchingPage, filePath, finishTransaction, formatterRef, layout, moveTabsToWindow, navigateBookmark, navigateEdit, newProjectSqlFile,
    newScratchFile, newSqlFileFromLastConnection, objectTabs, openCallHierarchy, openDependencyGraph, openRunConfigurations, openScriptPreview,
    openSqlFile, openStructuralSearch, openWorkspaceDevelopment, otherWindows, paletteMode, plsqlDebugger, plsqlProfiler, queryHistory, queryResult,
    relatedPackage, resetPanelLayout, returnToExecution, reviewSourceForCompilation, runQueryRef, saveSqlFile, sessionConnected, setCompareSources,
    setDateFormatDesigner, setFilePanelView, setFocusMode, setPaletteMode, setQuickEval, setRelatedFileCreate, setRelatedSources, setResultTab,
    setRunState, setShortcutMap, setShowAppearance, setShowBookmarks, setShowLocalHistory, setShowPicker, setShowProjectRules, setShowRunConsole,
    setShowSearch, setShowSessionInspector, setShowWorksets, setSubqueryTrial, setWorkbenchDensity, settings, showDockPanel, showRuntimePlan,
    smartEnterRef, sql, switchConnection, switchPackageSource, tabSession, tabSessions, tabs, toggleSideEditor, transactionPending, updateLayout,
    view, visibleConnection, windowTargets, workspace
  } = ctx;
  return <>
    {paletteMode&&<IdeCommandPalette settings={Object.entries(settingDefinitions).filter(([id])=>!['ui.layout','ui.density','ui.scale'].includes(id)).map(([id,definition])=>({id,label:definition.label,detail:definition.category}))} mode={paletteMode} onClose={()=>setPaletteMode(null)} onChoose={choosePaletteItem}
      history={queryHistory} files={[...objectTabs.map(tab=>({id:tab.id,tabId:tab.id,name:`${tab.object.owner}.${tab.object.name}`,objectTab:true,connectionProfileId:tabSessions[tab.originTabId]?.activeConnection?.id})),...tabs.map(tab=>({...tab,tabId:tab.id,profileName:dbConnections.find(p=>p.id===tab.connectionProfileId)?.name})),...workspace.files.filter(file=>!tabs.some(tab=>tab.path?.toLowerCase()===file.path.toLowerCase()))]}
      objects={completionObjects.map(item=>({...item,disabled:!isNativeHost||executing||connecting||fetchingPage}))}
      connections={dbConnections.map(item=>({...item,disabled:activeTabReadonly||connecting||executing}))} outline={documentOutline}
      commands={[
        {id:'run',label:'Run current SQL statement',detail:'Ctrl+Enter',disabled:activeTabReadonly||executing||connecting,run:()=>runQueryRef.current?.()},
        {id:'analysis',label:tabSession.analysisReadOnly?'End read-only analysis':'Begin read-only consistent analysis',disabled:!sessionConnected||executing||fetchingPage||view.streamState?.busy||transactionPending&&!tabSession.analysisReadOnly,run:()=>tabSession.analysisReadOnly?sendNativeCommand('analysis.end'):beginReadOnlyAnalysis()},
        {id:'runtimePlan',label:'Show executed cursor plan / statistics',disabled:!queryResult?.sqlId||executing,run:showRuntimePlan},
        {id:'script',label:'Preview / run SQL script',disabled:activeTabReadonly,run:openScriptPreview},
        {id:'cancel',label:'Cancel SQL operation',disabled:(!executing&&!fetchingPage)||cancelling,run:cancelQuery},
        {id:'new',label:'New SQL file',detail:'Ctrl+N',run:newSqlFileFromLastConnection},{id:'open',label:'Open SQL file',detail:'Ctrl+Shift+O',run:openSqlFile},
        {id:'save',label:'Save SQL file',detail:'Ctrl+S',disabled:activeTabReadonly,run:saveSqlFile},
        {id:'format',label:'Format SQL / PL/SQL',disabled:activeTabReadonly||!sql.trim(),run:()=>formatterRef.current?.()},
        {id:'connect',label:'Switch connection',detail:'Ctrl+O',disabled:activeTabReadonly||connecting||executing,run:()=>setShowPicker(true)},
        {id:'commit',label:'Commit transaction',disabled:activeTabReadonly||!transactionPending||executing,run:()=>finishTransaction('commit')},
        {id:'rollback',label:'Rollback transaction',disabled:activeTabReadonly||!transactionPending||executing,run:()=>finishTransaction('rollback')},
        {id:'settings',label:'Open settings',run:()=>setShowAppearance(true)},
        {id:'relatedPackage',label:'Switch package specification / body',detail:'Alt+O',disabled:!relatedPackage.target&&(!isNativeHost||!workspace.root||!['PACKAGE','PACKAGE BODY'].includes(activeSource.declaration?.type)),run:switchPackageSource},
        {id:'bookmarks',label:'Source bookmarks / add named position',detail:resolveSetting(settings,'editor.shortcuts').value.bookmark,run:()=>setShowBookmarks(true)},
        {id:'nextBookmark',label:'Next source bookmark',detail:resolveSetting(settings,'editor.shortcuts').value.nextBookmark,run:()=>navigateBookmark(1)},
        {id:'previousBookmark',label:'Previous source bookmark',detail:resolveSetting(settings,'editor.shortcuts').value.previousBookmark,run:()=>navigateBookmark(-1)},
        {id:'focusRoutine',label:'Focus current PL/SQL routine',run:()=>{const editor=editorRef.current,model=editor?.getModel(),offset=model&&editor?.getPosition()?model.getOffsetAt(editor.getPosition()):0;const current=documentOutline.filter(item=>['PROCEDURE','FUNCTION'].includes(item.kind)&&item.start<=offset&&item.end>=offset).sort((a,b)=>b.depth-a.depth)[0];if(!current){setRunState('Place the caret inside a procedure or function to focus its code.');return;}editor?.trigger('toolbar','editor.foldAllExcept',{});editor?.focus()}},
        paletteEditorCommand('identifierCase',editorCommandState,editorCommandRunners.identifierCase),
        paletteEditorCommand('localRename',editorCommandState,editorCommandRunners.localRename),
        paletteEditorCommand('changeSignature',editorCommandState,editorCommandRunners.changeSignature),
        paletteEditorCommand('extractProcedure',editorCommandState,editorCommandRunners.extractProcedure),
        paletteEditorCommand('moveUp',editorCommandState,editorCommandRunners.moveUp),
        paletteEditorCommand('moveDown',editorCommandState,editorCommandRunners.moveDown),
        paletteEditorCommand('embeddedSql',editorCommandState,editorCommandRunners.embeddedSql),
        paletteEditorCommand('quickFix',editorCommandState,editorCommandRunners.quickFix),
        paletteEditorCommand('deleteReview',editorCommandState,editorCommandRunners.deleteReview),
        paletteEditorCommand('pasteAs',editorCommandState,editorCommandRunners.pasteAs),
        {id:'expandSelection',label:'Expand selection to enclosing SQL structure',detail:'Shift+Alt+Right',run:()=>{editorRef.current?.focus();editorRef.current?.trigger('palette','editor.action.smartSelect.expand',{})}},
        {id:'shrinkSelection',label:'Shrink selection',detail:'Shift+Alt+Left',run:()=>{editorRef.current?.focus();editorRef.current?.trigger('palette','editor.action.smartSelect.shrink',{})}},
        {id:'quickEval',label:'Evaluate the selected SQL expression…',detail:'Runs only on confirmation',disabled:!isNativeHost||!visibleConnection||visibleConnection.id==='Disconnected',run:()=>{const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection();const text=model&&selection&&!selection.isEmpty()?model.getValueInRange(selection):'';const plan=prepareEvaluation(text);if(plan.error){notifyFeedback({kind:'warning',title:'Evaluate expression',message:plan.error,scope:documents.activeId});return}setQuickEval({plan,state:null,requestId:null})}},
        {id:'subqueryTrial',label:'Try the selected subquery…',detail:'Runs only on confirmation',disabled:!isNativeHost||!visibleConnection||visibleConnection.id==='Disconnected',run:()=>{const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection();const text=model&&selection&&!selection.isEmpty()?model.getValueInRange(selection):'';const plan=prepareSubqueryTrial(text);if(plan.error){notifyFeedback({kind:'warning',title:'Try subquery',message:plan.error,scope:documents.activeId});return}setSubqueryTrial({plan,state:null,requestId:null})}},
        {id:'dateFormatDesigner',label:'Date format designer…',detail:'Preview TO_CHAR / TO_DATE models',run:()=>{const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection();const picked=model&&selection&&!selection.isEmpty()?model.getValueInRange(selection).trim().replace(/^'|'$/g,''):'';setDateFormatDesigner({initial:/^[A-Za-z0-9\s\-\/,.:;"]{1,60}$/.test(picked)?picked:''})}},
        {id:'compareClipboard',label:'Compare the editor (or selection) with the clipboard',run:async()=>{const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection();const text=model&&selection&&!selection.isEmpty()?model.getValueInRange(selection):model?.getValue()??sql;let clip='';try{clip=await navigator.clipboard.readText()}catch{notifyFeedback({kind:'warning',title:'Compare',message:'The clipboard could not be read.',scope:documents.activeId});return}setCompareSources({left:{label:selection&&!selection.isEmpty()?'Selection':'Current editor',text},right:{label:'Clipboard',text:clip}})}},
        {id:'compareFiles',label:'Compare two files: drop them into the comparison window',run:()=>setCompareSources({left:null,right:null})},
        {id:'localHistory',label:'Local history: compare and restore earlier saved versions of this file',disabled:!isNativeHost||!filePath,run:()=>setShowLocalHistory(true)},
        {id:'relatedFile',label:'Create related file: test draft, migration draft or example call for this package',disabled:!isNativeHost||!workspace.root||activeTabReadonly,run:()=>{const result=relatedFileProposals(documents.active||{name:'',content:''},workspace.projectRules,workspace.files.map(file=>file.relativePath||''));setRelatedFileCreate(result)}},
        {id:'runConsole',label:'Run console: recent executions, output and errors of this tab',run:()=>setShowRunConsole(true)},
        {id:'newScratch',label:'New scratch file (experiment, not added to the project)',run:newScratchFile},
        {id:'sessionInspector',label:'Session inspector: schema, NLS, transaction and cursor of this tab',run:()=>setShowSessionInspector(true)},
        paletteEditorCommand('docComment',editorCommandState,editorCommandRunners.docComment),
        paletteEditorCommand('extractCte',editorCommandState,editorCommandRunners.extractCte),
        paletteEditorCommand('columnCursors',editorCommandState,editorCommandRunners.columnCursors),
        {id:'smartEnter',label:'Complete statement (Smart Enter)',detail:resolveSetting(settings,'editor.shortcuts').value.smartEnter,disabled:activeTabReadonly,run:()=>smartEnterRef.current?.()},
        paletteEditorCommand('surround',editorCommandState,editorCommandRunners.surround),
        {id:'unfoldSource',label:'Show all source regions',run:()=>{editorRef.current?.trigger('toolbar','editor.unfoldAll',{});editorRef.current?.focus()}},
        {id:'foldRegions',label:'Fold named code regions',run:()=>{editorRef.current?.trigger('toolbar','editor.foldAllMarkerRegions',{});editorRef.current?.focus()}},
        {id:'lastEdit',label:'Return to last edit',detail:resolveSetting(settings,'editor.shortcuts').value.lastEdit,run:()=>navigateEdit('last')},
        {id:'previousEdit',label:'Previous edit location',detail:resolveSetting(settings,'editor.shortcuts').value.previousEdit,run:()=>navigateEdit(-1)},
        {id:'nextEdit',label:'Next edit location',detail:resolveSetting(settings,'editor.shortcuts').value.nextEdit,run:()=>navigateEdit(1)},
        {id:'lastExecution',label:'Return to latest executed SQL',detail:resolveSetting(settings,'editor.shortcuts').value.lastExecution,run:returnToExecution},
        {id:'layoutLock',label:layout.locked?'Unlock panel layout':'Lock panel layout',run:()=>updateLayout(current=>({...current,locked:!current.locked}))},
        {id:'structure',label:'Show file structure panel',run:()=>{setFilePanelView('structure');showDockPanel('files')}},
        ...activeGridActions(),
        ...activeResultActions(),
        {id:'resetLayout',label:'Reset panel layout',detail:'Restores the default panel arrangement',run:resetPanelLayout},
        {id:'shortcutMap',label:'Keyboard shortcut map',detail:'?',run:()=>setShortcutMap({context:'general'})},
        {id:'openLogFolder',label:'Open log folder: errors recorded on this computer',disabled:!isNativeHost,run:()=>sendNativeCommand('ui.openLogFolder',{})},
        {id:'outline',label:'Show file outline',run:()=>setPaletteMode('outline')},
        {id:'sideEditor',label:'Toggle side editor: edit a second document beside this one',run:toggleSideEditor},
        ...(isNativeHost?[{id:'profile.start',label:'Profile: Profile statement at the caret (line times with DBMS_PROFILER)',run:plsqlProfiler.start},...(plsqlProfiler.profile?.status==='running'?[{id:'profile.finish',label:'Profile: Finish profiling now',run:plsqlProfiler.finish}]:[]),...(plsqlProfiler.profile?.status==='done'?[{id:'profile.clear',label:'Profile: Close profile results',run:plsqlProfiler.clear}]:[])]:[]),
        ...(isNativeHost?[{id:'debug.start',label:'Debug: Debug statement at the caret (pauses at breakpoints)',run:plsqlDebugger.start},{id:'debug.toggle',label:'Debug: Toggle breakpoint (F9)',run:()=>plsqlDebugger.toggleAt(editorRef.current?.getPosition()?.lineNumber||1)},{id:'debug.clear',label:'Debug: Remove all breakpoints',run:plsqlDebugger.clearBreakpoints},...(plsqlDebugger.debug?.status==='paused'?[['continue','Continue (F8)'],['over','Step over (F10)'],['into','Step into (F11)'],['out','Step out (Shift+F11)']].map(([mode,label])=>({id:`debug.${mode}`,label:`Debug: ${label}`,run:()=>plsqlDebugger.step(mode)})):[]),...(plsqlDebugger.debug?[{id:'debug.stop',label:'Debug: Stop debugging',run:plsqlDebugger.stop}]:[])]:[]),
        ...windowTargets.map(item=>({id:`window.move.${item.id}`,label:`Window: ${item.label} (keeps its session and results)`,run:()=>moveTabsToWindow([documents.activeId],item.id)})),
        ...(isNativeHost?otherWindows.map(item=>({id:`window.focus.${item.id}`,label:`Window: Switch to ${item.label}`,run:()=>sendNativeCommand('window.focus',{target:item.id})})):[]),
        paletteEditorCommand('explainExpression',editorCommandState,editorCommandRunners.explainExpression),
        {id:'dependencyGraph',label:'Show dependency graph: packages, views and tables',run:openDependencyGraph},
        {id:'structuralSearch',label:'Structural search: tables, columns and exception handlers',run:openStructuralSearch},
        {id:'callHierarchy',label:'Show call hierarchy',detail:resolveSetting(settings,'editor.shortcuts').value.callHierarchy||undefined,run:openCallHierarchy},
        {id:'density',label:'Toggle compact / comfortable workbench density',run:()=>setWorkbenchDensity(value=>value==='compact'?'comfortable':'compact')},
        {id:'focus',label:'Toggle editor focus mode',detail:'Ctrl+Alt+Z',run:()=>setFocusMode(value=>!value)},
        {id:'problems',label:'Show Problems',run:()=>setResultTab('Problems')},
        {id:'runConfigurations',label:'Open procedure/function run configurations',disabled:!isNativeHost,run:openRunConfigurations},
        {id:'compileSource',label:'Compare and compile Oracle source',disabled:activeTabReadonly||!activeSource.declaration||!!activeSource.warning||executing||fetchingPage,run:reviewSourceForCompilation},
        ...projectOptions(workspace.projectRules).connectionIds.map(id=>{const profile=dbConnections.find(item=>item.id.toLowerCase()===id.toLowerCase());return {id:'project-connect:'+id,label:'Connect project: '+(profile?.name||id),detail:profile?'Project saved profile':'Profile unavailable',disabled:!profile||activeTabReadonly||connecting||executing||fetchingPage,run:()=>profile&&switchConnection(profile)}}),
        {id:'newProjectSql',label:'New project SQL file',disabled:!workspace.root,run:newProjectSqlFile},
        {id:'projectDefaults',label:'Use project run defaults',disabled:!workspace.root||activeTabReadonly||executing||fetchingPage,run:applyProjectRunDefaults},
        {id:'projectRules',label:'Configure project rules',disabled:!isNativeHost||!workspace.root,run:()=>setShowProjectRules(true)},
        {id:'relatedFiles',label:'Find related package sources and tests',detail:'Alt+Shift+O',disabled:!isNativeHost||!workspace.root||activeTabReadonly||!activeEditorTab?.path,run:()=>setRelatedSources({root:workspace.root,document:documents.active})},
        {id:'worksets',label:'Manage workspace worksets',disabled:!isNativeHost||!workspace.root,run:()=>setShowWorksets(true)},
        {id:'git',label:'Workspace Git: stage, review and commit SQL changes',disabled:!isNativeHost||!workspace.root,run:()=>openWorkspaceDevelopment('git')},
        {id:'replace',label:'Preview replace in workspace SQL files',disabled:!isNativeHost||!workspace.root,run:()=>openWorkspaceDevelopment('replace')},
        {id:'search',label:'Search workspace',detail:'Ctrl+Shift+F',run:()=>setShowSearch(true)},
      ]}/>}
  </>;
}

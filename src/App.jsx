import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {nextQueryName} from './tabPathLabels';
import {useEditorOverview} from './useEditorOverview.js';
import { largeFilePolicy, LARGE_FILE_THRESHOLD } from './largeFilePolicy.js';
import { layoutPresets, restoreLayout } from './savedLayouts.js';
import { useConnectionLifecycle } from './useConnectionLifecycle.js';
import { retainHistory, historyAllowed } from './queryHistory.js';
import { persistLocal } from './localPersistence.js';
import './startupPerformance.js';
import './editorStartup.js';
import { DocumentSaves } from './documentSaves.js';
import {useDocumentSessions} from './useDocumentSessions.js';
import {useResultSessions} from './useResultSessions.js';
import {useQueryExecution} from './useQueryExecution.js';
import {createQueryOperations} from './queryExecution.js';
import './RunMenu';
import { configureFeedback } from './feedbackStore';
import { useFeedbackState, notifyFeedback, dismissFeedback, setFeedbackScopes } from './Feedback';
import './oracleObjectActions.js';
import './editorShortcuts.js';
import './sqlFormatterSettings.js';
import { SuggestionLearning, learningScope } from './suggestionLearning.js';
import { automaticCompletionAllowed } from './oracleCompletionContext.js';
import { loadSettings,saveSettings,newResultDefaults,saveResultDefaults,resolveSetting,changeSetting,settingDefinitions,resultPageSizes } from './settingsModel';
import './EditorTabs';
import './ConnectionControl';
import './ConnectionTree';
import './ConnectionContextMenu';
import {connectionOrganization,emptyConnectionOrganization,organizedProfiles,changeConnectionOrganization,filterOrganizedConnections} from './connectionOrganization';
import './WorkspaceExplorer';
import './WorkspaceWorksets';
import './WorkspaceOpenPopup';
import './ExternalFileNotice';
import {describeOracleSource, relatedPackageDocument, packageDocumentGroups} from './oracleSourceIdentity.js';
import './OracleSourceHeader';
import './projectUsageCache.js';
import { explainExpressionAt } from './expressionExplain.js';
import './SideEditorPane.jsx';
import { newQueryTemplates } from './newQueryOptions';
import {dismissShortcutHint,nextShortcutHint} from './shortcutCoach';
import { sourceRunConfigurations } from './runConfigurations';
import { documentConnection } from './executionContext';
import './ExecutionContextBadges';
import { prepareSourceCompilation } from './sourceCompilation';
import { projectOptions } from './projectRules';
import './FileMenu';
import './ViewMenu';
import { DockWorkbench } from './DockWorkbench';
import { defaultDockLayout, normalizeDockLayout } from './dockLayout';
import { pathKey } from './workspaceTree';
import { draftSnapshot, parseDraftSnapshot } from './draftRecovery';
import './EditorSymbolBreadcrumb';
import './workbenchUx';
import './ActionableState';
import { ExecutionTargetContext } from './executionTarget';
import './reversibility';
import './EditorToolbarOverflow';
import { themePresets, applyDocumentTheme, monacoThemeColors, monacoTokenRules, resolveTokenColors } from './themeModel';
import { EditorNavigationHistory,sourceLineEnding,sourcePositionAt } from './editorNavigation';
import './EditorSessionStatus';
import { deriveResultData, csvText } from './resultWorkbench';
import { buildServerFilter } from "./resultAdvanced";
import { applyResultFeatures, copyResultData } from "./resultFeatures";
import { getVisibleResultRows } from "./resultRows";
import { projectDisplayExport } from "./resultPresentationData";
import { GlobalTooltip } from "./GlobalTooltip";
import {TreeNameOverlay} from './TreeNameOverlay.jsx';
import { projectionRanges } from './projectionMap';
import {surroundOptions,surroundSnippet} from './surroundWith';
import {inListSql,insertTemplateSql,jsonTableSql} from './pasteToCode';
import './insertPairProviders';
import {smartEnter} from './smartEnter';
import './structuralSelection';
import {layoutToolbar} from './editorToolbarModel';
import './bindContext';
import {docSkeletonAt} from './docSkeleton';
import {minimapSections,minimapLabel} from './minimapSections';
import './statusBarModel';
import {previewOpenPlan,settlePreview} from './previewTabs';
import { nextScratchName, promptsOnClose } from './scratchFiles';
import {codeLensItems} from './codeLenses';
import {createConsoleEntry,createConsoleStore} from './runConsole';
import { loadBindDefinitions } from './bindDefinitions';
import { createSummaryStore } from './executionSummaries';
import './postfixProvider';
import {formatElapsed,playCompletionTone,postExecutionActions,taskbarProgressState} from './postExecution';
import './postfixCompletion';
import './columnMulticursor';
import './dragToSql';
import {contextualQuickFixes} from './quickFixes';
import {planStatementMove} from './statementMove';
import {embeddedSqlAt} from './embeddedSql';
import { overridableSnippetTriggers, sqlSnippets } from './liveTemplates';
import { effectiveLanguage, effectiveRegion } from './localeProfile';
import { KeyTips } from "./KeyTips.jsx";
import "./ServerSourceTree.jsx";
import "./quickEval.js";
import "./resultBindDrop.js";
import "./exportProgress.js";
import { loadIconPacks, resolveIconTheme, setIconTheme } from "./iconTheme.js";
import { countTabDrafts } from "./draftStore.js";
import './FooterDrafts';
import './LoadingSkeleton';
import './announcer';
import { contextOf, opensShortcutMap } from './shortcutMap';
import "./InlineBindZone.jsx";
import "./subqueryTrial.js";
import "./bindLookup.js";
import { InlineBindStore, inlineBindParameters } from "./inlineBinds.js";
import { ToolbarPrefsContext } from "./toolbarPrefs.js";
import { isNativeHost, sendNativeCommand, subscribeNativeMessages, setNativeTabId } from "./nativeBridge";
import "./plsqlDiagnostics";
import './runtimeStack';
import './StackTraceLinks';
import { useSourceBookmarks } from './useSourceBookmarks';
import './WorkbenchStatus';
import './workbenchStatusModel.js';
import { EditLocations } from './editLocations';
import './batchClose';
import {LayoutLockContext} from './LayoutLockContext';
import './FileStructurePanel';
import "./ProblemsPanel";
import { getOracleBindNames } from "./oracleBinds";
import "./sqlStatements.js";
import { OracleCompletionClient } from "./oracleCompletionClient";
import { OracleMetadataBroker, completionCancellation } from "./oracleMetadataBroker";
import "./oracleLanguageProviders";
import { hostWindow } from "./hostWindow.js";
import { usePlsqlDebugger } from "./usePlsqlDebugger.js";
import { DebugPanel, DebugCompileDialog } from "./DebugPanel.jsx";
import { usePlsqlProfiler } from "./usePlsqlProfiler.js";
import { ProfilePanel, ProfileTablesDialog } from "./ProfilePanel.jsx";
import { buildTabTransfer, collectWindowDrafts, parseTabTransfer, tabMoveBlocker, windowDraftKey } from "./tabTransfer.js";
import { Activity, Play } from "lucide-react";
import { autoRunStep } from './relatedAutoRun.js';
import { OracleObjectInspector } from './lazyViews.js';
import { ResizeHandle } from './ResizeHandle.jsx';
import { isOracleRelation, makeOracleRelationLookup, oracleObjectLabel, oracleSchemaKey } from './OracleObjectTree.jsx';
import './SqlResultsView.jsx';
import { renderWorkbenchPrompts } from './WorkbenchPrompts.jsx';
import { renderWorkbenchOverlays } from './WorkbenchOverlays.jsx';
import { renderEditorDialogs } from './WorkbenchEditorDialogs.jsx';
import { renderCommandPalette } from './WorkbenchCommandPalette.jsx';
import { renderToolDialogs } from './WorkbenchToolDialogs.jsx';
import { renderEditorWorkspace } from './WorkbenchEditorWorkspace.jsx';
import { renderResultPanel } from './WorkbenchResultPanel.jsx';
import { subscribeWorkbenchMessages } from './WorkbenchNativeMessages.jsx';
import { renderFileMenu } from './WorkbenchFileMenu.jsx';
import { renderActivityRail } from './WorkbenchActivityRail.jsx';
import { renderFooter } from './WorkbenchFooter.jsx';
import { renderDockPanels } from './WorkbenchDockPanels.jsx';
import { renderToolbarDefs } from './WorkbenchToolbarDefs.jsx';
import { renderManagementContent } from './WorkbenchManagementContent.jsx';
import { installWorkbenchShortcuts, installEditorShortcuts } from './WorkbenchShortcutEffects.js';
import { reviewSourceBaselines, installLanguageProviders, scheduleDiagnostics, installEditorContextMenu } from './WorkbenchEditorEffects.js';
import * as contextActions from './WorkbenchContextActions.js';
import * as editorActions from './WorkbenchEditorActions.js';
import * as tabActions from './WorkbenchTabActions.js';
import * as resultExports from './WorkbenchResultExports.js';

const EMPTY_SCHEMA_OBJECTS = [];
const mockConnections = [
  { id: "FINANCE_DEV", title: "Finance · Development", host: "ora-dev-02.acme.net", port: "1521", service: "fin_dev", env: "DEV", color: "mint", group: "Development", favorite: true, recent: true, source: "C:\\oracle\\network\\admin\\tnsnames.ora" },
  { id: "FINANCE_TEST", title: "Finance · QA", host: "ora-qa-01.acme.net", port: "1521", service: "fin_qa", env: "TEST", color: "blue", group: "Testing", favorite: true, recent: true, source: "C:\\oracle\\network\\admin\\tnsnames.ora" },
  { id: "FINANCE_PROD", title: "Finance · Production", host: "ora-prd-scan.acme.net", port: "1521", service: "fin_prod", env: "PROD", color: "rose", group: "Production", favorite: false, recent: false, source: "C:\\oracle\\network\\admin\\tnsnames.ora" },
];

const initialSql = `-- Monthly invoice review\n\nSELECT\n    i.invoice_id,\n    i.invoice_date,\n    c.customer_name,\n    i.total_amount,\n    i.status\nFROM finance.invoices i\nINNER JOIN finance.customers c\n    ON c.customer_id = i.customer_id\nWHERE i.invoice_date >= :from_date\n  AND i.invoice_date <  :to_date\n  AND i.status = :status\nORDER BY i.invoice_date DESC;`;


function loadCustomSqlSnippets() {
  try {
    const saved = JSON.parse(localStorage.getItem("fbsdb.customSqlSnippets") || "[]");
    if (!Array.isArray(saved)) return [];
    const builtInTriggers = new Set(sqlSnippets.map((snippet) => snippet.trigger).filter((trigger) => !overridableSnippetTriggers.has(trigger)));
    return saved.filter((snippet) => snippet && /^[a-z][a-z0-9_]{1,23}$/i.test(snippet.trigger) && !builtInTriggers.has(snippet.trigger.toLowerCase()) && typeof snippet.label === "string" && typeof snippet.text === "string" && snippet.label.trim() && snippet.text.trim())
      .slice(0, 100).map((snippet) => ({ ...snippet, trigger: snippet.trigger.toLowerCase(), detail: typeof snippet.detail === "string" ? snippet.detail : "Custom SQL snippet" }));
  } catch { return []; }
}

const uiFontStacks = {
  'DM Sans': "'DM Sans','Segoe UI',sans-serif",
  'Segoe UI': "'Segoe UI',sans-serif",
  Arial: "Arial,sans-serif",
  Tahoma: "Tahoma,'Segoe UI',sans-serif",
  Verdana: "Verdana,'Segoe UI',sans-serif",
};
const defaultTokenColors = Object.fromEntries(Object.entries(themePresets).map(([key, value]) => [key, { keyword: value.keyword, string: value.string, comment: value.comment, number: value.number }]));













function getBindNames(sql) {
  return getOracleBindNames(sql);
}

// A window opened by moving a tab starts with that tab instead of an empty query.
const bootTransfer = (() => { try { return hostWindow.initialTransfer ? parseTabTransfer(hostWindow.initialTransfer) : null; } catch { return null; } })();

export function App() {
  const [monaco, setMonaco] = useState(null);
  const [pendingDdl,setPendingDdl]=useState(null);
  const [showGettingStarted,setShowGettingStarted]=useState(()=>{if(hostWindow.secondary)return false;try{return !localStorage.getItem('fbsdb.onboardingSeen')||resolveSetting(loadSettings(localStorage),'ui.startupWorkspaceHub').value}catch{return true}});
  const [settings,setSettings]=useState(()=>loadSettings(localStorage)),[settingsError,setSettingsError]=useFeedbackState('',{title:'Settings',scope:null});
  const settingsRef=useRef(settings);settingsRef.current=settings;
  useEffect(()=>{try{saveSettings(localStorage,settings);setSettingsError('')}catch{setSettingsError('Settings could not be saved on this device.')}},[settings]);
  const [showOpenWorkspace,setShowOpenWorkspace]=useState(false),[showWorksets,setShowWorksets]=useState(false),[showWorkspaceManager,setShowWorkspaceManager]=useState(false),[workspaceSearchScope,setWorkspaceSearchScope]=useState(null),[workspaceReplaceScope,setWorkspaceReplaceScope]=useState(null);
  const [workspaceDevMode,setWorkspaceDevMode]=useState(null),[workspaceDev,setWorkspaceDev]=useState({});
  const workspaceDevRequestsRef=useRef(new Map());
  const [connectionDiagnostics,setConnectionDiagnostics]=useState(null),[showSessionInspector,setShowSessionInspector]=useState(false),[showRunConsole,setShowRunConsole]=useState(false),[relatedFileCreate,setRelatedFileCreate]=useState(null),[showLocalHistory,setShowLocalHistory]=useState(false),[compareSources,setCompareSources]=useState(null),[quickEval,setQuickEval]=useState(null),[subqueryTrial,setSubqueryTrial]=useState(null),[lookupPicker,setLookupPicker]=useState(null),[draftGuard,setDraftGuard]=useState(null),[dateFormatDesigner,setDateFormatDesigner]=useState(null),[uncertainCommit,setUncertainCommit]=useState(null),[bindStoreVersion,setBindStoreVersion]=useState(0);
  const [objectAnalysis,setObjectAnalysis]=useState(null);
  const [objectMenu,setObjectMenu]=useState(null);
  const [objectTabs,setObjectTabs]=useState([]),[activeObjectTabId,setActiveObjectTabId]=useState(null),[objectTabActive,setObjectTabActive]=useState(false);
  const [schemaStale,setSchemaStale]=useState(false);
  const objectAnalysisRequestRef=useRef(null);
  const schemaRequestRef=useRef(null);
  const [scriptDialog,setScriptDialog]=useState(null);
  const operations = useMemo(createQueryOperations, []);
  const [queryTimeout,setQueryTimeout]=useState(()=>resolveSetting(settings,'editor.queryTimeout').value);
  const [systemLocale,setSystemLocale]=useState(()=>({uiLanguage:navigator.language,region:navigator.language}));
  const language=effectiveLanguage(),region=effectiveRegion(resolveSetting(settings,'ui.region').value,systemLocale);
  useEffect(()=>{document.documentElement.lang=language;document.documentElement.dataset.region=region},[language,region]);
  useEffect(()=>{
    if(!isNativeHost)return;
    const unsubscribe=subscribeNativeMessages(message=>{
      if(message?.type!=='system.locale')return;
      setSystemLocale(message);
    });
    sendNativeCommand('system.locale');
    return unsubscribe;
  },[]);
  useEffect(()=>{try{persistLocal(localStorage, 'fbsdb.queryTimeout',String(queryTimeout))}catch{}},[queryTimeout]);
  const [recovery,setRecovery]=useState(()=>{if(hostWindow.secondary)return null;try{return collectWindowDrafts(localStorage)}catch{try{return parseDraftSnapshot(localStorage.getItem('fbsdb.sqlDrafts'))}catch{return null}}});
  const layout = resolveSetting(settings, 'ui.layout').value;
  const workbenchDensity = resolveSetting(settings, 'ui.density').value;
  const viewScale = resolveSetting(settings, 'ui.scale').value;
  const uiFontFamily = resolveSetting(settings, 'ui.fontFamily').value;
  useEffect(() => { document.documentElement.style.setProperty('--ui-font-family', uiFontStacks[uiFontFamily]); }, [uiFontFamily]);
  const sidebarOpen = layout.visible && layout.hidden.length < 4, resultsHeight = layout.resultsHeight;
  const explorerSectionHeights = { connections: layout.groups.find(group => group.panels.includes('connections'))?.height || 220 };
  function updateLayout(next) { setSettings(current => current.readOnly ? current : changeSetting(current, 'ui.layout', normalizeDockLayout(typeof next === 'function' ? next(resolveSetting(current, 'ui.layout').value) : next))); }
  function setSidebarOpen(next) { updateLayout(current => { const visible = typeof next === 'function' ? next(current.visible && current.hidden.length < 4) : next; return { ...current, visible, hidden: visible && current.hidden.length === 4 ? [] : current.hidden }; }); }
  function setResultsHeight(height) { updateLayout(current => ({ ...current, resultsHeight: height, resultsCollapsed: false })); }
  function setWorkbenchDensity(next) { setSettings(current => current.readOnly ? current : changeSetting(current, 'ui.density', typeof next === 'function' ? next(resolveSetting(current, 'ui.density').value) : next)); }
  useEffect(() => { if (isNativeHost) sendNativeCommand('ui.setZoom', { factor: viewScale / 100 }); }, [viewScale]);
  useEffect(() => { const update = event => updateLayout(current => current.inspectorWidth === event.detail ? current : { ...current, inspectorWidth: event.detail }); window.addEventListener('fbsdb.inspectorWidth', update); return () => window.removeEventListener('fbsdb.inspectorWidth', update); }, []);
  useEffect(() => { window.dispatchEvent(new CustomEvent('fbsdb.inspectorWidth', { detail: layout.inspectorWidth })); }, [layout.inspectorWidth]);

  const [settingsFocus,setSettingsFocus]=useState(null);
  useEffect(()=>{
    const state={pressed:0,last:0,clean:false};
    const down=event=>{if(event.key==='Shift'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.repeat){state.pressed=Date.now();state.clean=true}else{state.clean=false;state.last=0}};
    const up=event=>{if(event.key!=='Shift'||!state.clean)return;const now=Date.now();state.clean=false;if(now-state.pressed>300){state.last=0;return}if(state.last&&now-state.last<450&&resolveSetting(settingsRef.current,'ui.doubleShiftSearch').value&&!document.querySelector('.modal-backdrop')){state.last=0;setPaletteMode('files')}else state.last=now};
    window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);return()=>{window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true)};
  },[]);
  const [filePanelView,setFilePanelView]=useState('files');
  const [paletteMode,setPaletteMode]=useState(null),[documentOutline,setDocumentOutline]=useState([]);
  const editLocationsRef=useRef(new EditLocations());
  const navigationHistoryRef=useRef(new EditorNavigationHistory()),navigatingRef=useRef(false);
  const [showPackageApi,setShowPackageApi]=useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [maximizedPanel,setMaximizedPanel]=useState(null);
  const maximizedRef=useRef(null);maximizedRef.current=maximizedPanel;
  function togglePanelMaximized(panel){setMaximizedPanel(current=>current===panel?null:panel)}
  function applySavedLayout(entry){updateLayout(current=>restoreLayout(entry,current));setFocusMode(entry.focus===true);setMaximizedPanel(null)}
  useEffect(()=>{const key=event=>{
    if(document.querySelector('.modal-backdrop')||event.repeat)return;
    if(event.key==='Escape'&&maximizedRef.current){event.preventDefault();setMaximizedPanel(null);return}
    if(event.ctrlKey&&event.altKey&&!event.shiftKey&&['1','2','3'].includes(event.key)){event.preventDefault();const entry=layoutPresets()[Number(event.key)-1];applySavedLayout(entry)}
  };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[]);

  useEffect(() => { const open = () => setShowTnsSources(true); window.addEventListener("fbsdb.openTnsSources", open); return () => window.removeEventListener("fbsdb.openTnsSources", open); }, []);
  const controlledEditorUpdateRef=useRef(false);
  const editorRef = useRef(null), openFileInputRef = useRef(null), lastEditorPositionRef = useRef(null), runQueryRef = useRef(null), sourceDefinitionRequestRef=useRef(new Map());
  const [dbConnections, setDbConnections] = useState(isNativeHost ? [] : mockConnections);
  const [tnsAliases, setTnsAliases] = useState(isNativeHost ? [] : mockConnections.map(p => ({ ...p, name: p.id })));
  const [connectionMenu,setConnectionMenu]=useState(null);
  const [profileEditor, setProfileEditor] = useState(null), [showTnsSources, setShowTnsSources] = useState(false), [managementError, setManagementError] = useFeedbackState("",{title:'Connection manager'});
  const authTestRequestRef = useRef(null);
  const pendingConnectionsRef = useRef(new Map());

  const [definition,setDefinition]=useState(null),[resultSetSearch,setResultSetSearch]=useState(''),[renameResult,setRenameResult]=useState(null),[newResultName,setNewResultName]=useState('');
  const relatedRunRequestsRef=useRef(new Set()),[relatedAutoRun,setRelatedAutoRun]=useState(null);
  const [keyLookup,setKeyLookup]=useState(null),[keyValues,setKeyValues]=useState({});
  const [showPicker, setShowPicker] = useState(false), [authProfile, setAuthProfile] = useState(null);
  const [pendingSwitch, setPendingSwitch] = useState(null), [showAppearance, setShowAppearance] = useState(false), [showHistory, setShowHistory] = useState(false), [showSearch, setShowSearch] = useState(false), [showSnippets, setShowSnippets] = useState(false), [snippetFilter, setSnippetFilter] = useState(""), [selectedSnippetTrigger, setSelectedSnippetTrigger] = useState("sel"), [snippetFormOpen, setSnippetFormOpen] = useState(false), [snippetError, setSnippetError] = useFeedbackState('',{title:'Snippet could not be saved'}), [snippetDraft, setSnippetDraft] = useState({ trigger: "", label: "", detail: "", text: "SELECT ${1:column_name}\nFROM ${2:table_name};" }), [customSqlSnippets, setCustomSqlSnippets] = useState(loadCustomSqlSnippets);
  useEffect(()=>{if(showAppearance&&isNativeHost)sendNativeCommand('system.locale')},[showAppearance]);
  const [queryHistory, setQueryHistory] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("fbsdb.queryHistory") || "[]");
      if (!Array.isArray(saved)) return [];
      return saved.filter((entry) => entry && typeof entry.sql === "string" && typeof entry.profile === "string" && Number.isFinite(entry.startedAt))
        .filter(entry => historyAllowed(entry.profile, resolveSetting(settings,'privacy.excludedProfiles').value) && (!resolveSetting(settings,'privacy.historyDays').value || entry.startedAt >= Date.now()-resolveSetting(settings,'privacy.historyDays').value*86400000)).slice(0,resolveSetting(settings,'privacy.historyLimit').value).map((entry) => entry.status === "Running" ? { ...entry, status: "Interrupted", detail: "App closed before completion" } : entry);
    } catch { return []; }
  });
  const [searchQuery, setSearchQuery] = useState(""), [historyFilter, setHistoryFilter] = useState(""), [searchMatches, setSearchMatches] = useState([]), [searching, setSearching] = useState(false), [searchTruncated, setSearchTruncated] = useState(false);
  const [deleteReview,setDeleteReview]=useState(null);
  const [favorites, setFavorites] = useState(() => { try { return JSON.parse(localStorage.getItem("fbsdb.favorites") || (isNativeHost ? "[]" : "null")) ?? mockConnections.filter((item) => item.favorite).map((item) => item.id); } catch { return isNativeHost ? [] : mockConnections.filter((item) => item.favorite).map((item) => item.id); } });
  const [recentProfiles, setRecentProfiles] = useState(() => { try { return JSON.parse(localStorage.getItem("fbsdb.recent") || "[]"); } catch { return []; } });
  const [connectionOrg,setConnectionOrg]=useState(()=>{if(isNativeHost)return emptyConnectionOrganization();try{return connectionOrganization(mockConnections,JSON.parse(localStorage.getItem("fbsdb.connectionOrganization")||"null"))}catch{return connectionOrganization(mockConnections)}});
  const [explorerQuery, setExplorerQuery] = useState(""), [explorerTab, setExplorerTab] = useState("All"), [groupFilter, setGroupFilter] = useState("All groups"), [schemaQuery, setSchemaQuery] = useState(""), [schemaOwnerFilter, setSchemaOwnerFilter] = useState("All"), [objectScope, setObjectScope] = useState("All"), [objectFavorites, setObjectFavorites] = useState(() => { try { return JSON.parse(localStorage.getItem("fbsdb.objectFavorites") || "[]"); } catch { return []; } }), [recentObjects, setRecentObjects] = useState(() => { try { return JSON.parse(localStorage.getItem("fbsdb.recentObjects") || "[]"); } catch { return []; } }), [activeObject, setActiveObject] = useState("");
  const [resultSearchOpen, setResultSearchOpen] = useState(false);

  function setMaxRows(value){updateTabSession("pageSizePreference",value);}
  const { documents, tabs, activeTabId, sql, fileName, filePath, fileDirty, fileConnectionProfileId } = useDocumentSessions(
    () => bootTransfer ? bootTransfer.documents : [{ id: "tab-1", name: isNativeHost ? "Query 1" : "monthly-invoices.sql", path: null, content: isNativeHost ? "" : initialSql,savedContent:isNativeHost?"":initialSql, dirty: false }]);
  const setTabs = documents.setTabs;
  const setFileDirty = dirty => documents.patch(documents.activeId, { dirty });
  useEffect(() => { setActiveObject(''); setObjectTabActive(false); if(schemaRequestRef.current){sendNativeCommand('schema.cancel',{requestId:schemaRequestRef.current});schemaRequestRef.current=null;} }, [activeTabId]);
  const [pendingFileAction, setPendingFileAction] = useState(null);
  const [pendingTabClose, setPendingTabClose] = useState(null);
  const [editorContext,setEditorContext]=useState(null);
  const [batchClose,setBatchClose]=useState(null);const batchDiscardRef=useRef(new Set());
  const pendingTabCloseRef = useRef(null); pendingTabCloseRef.current = pendingTabClose;
  const tabCloseActionsRef = useRef(new Map());
  const bindPrefillRef = useRef({}), draftsConfirmedRef = useRef(new Set()), inlineBindStoreRef = useRef(null),  [pendingBindSql, setPendingBindSql] = useState(null), [copiedResults, setCopiedResults] = useState(false);
  const [tabSessions, setTabSessions] = useState({});
  const [connectionRename, setConnectionRename] = useState(null);
  const replyOwnerRef = useRef(null);
  const tabSession = tabSessions[activeTabId] || {};
  useLayoutEffect(() => { setNativeTabId(documents.active?.metadataOriginTabId || activeTabId); }, [activeTabId, documents]);
  function updateTabSession(key, value, owner = replyOwnerRef.current || documents.activeId) {
    if (closedTabsRef.current.has(owner)) return;
    setTabSessions(current => { const previous = current[owner] || {}; return { ...current, [owner]: { ...previous, [key]: typeof value === "function" ? value(previous[key] ?? (key === "activeConnection" ? { id: "No connection" } : undefined)) : value } }; });
  }
  const activeConnection = tabSession.activeConnection ?? (!isNativeHost && activeTabId === "tab-1" ? mockConnections[0] : { id: "No connection", title: "No active session", host: "", port: "", service: "", env: "—", color: "neutral" });
  const setActiveConnection = (value, owner) => updateTabSession("activeConnection", value, owner);
  const transactionPending = tabSession.transactionPending ?? false;
  const setTransactionPending = (value, owner) => updateTabSession("transactionPending", value, owner);
  const executing = Boolean(tabSession.executing || tabSession.scriptRun?.running);
  const setExecuting = (value, owner) => updateTabSession("executing", value, owner);
  const cancelling = tabSession.cancelling ?? false;
  const setCancelling = (value, owner) => updateTabSession("cancelling", value, owner);
  const connecting = tabSession.connecting ?? false;
  const setConnecting = (value, owner) => updateTabSession("connecting", value, owner);
  const connectionError = tabSession.connectionError ?? "";
  const setConnectionError = (value, owner) => updateTabSession("connectionError", value, owner);
  const executionKind = tabSession.executionKind ?? null;
  const setExecutionKind = (value, owner) => updateTabSession("executionKind", value, owner);
  useEffect(()=>configureFeedback(Object.fromEntries(['info','success','warning','error','progress','max'].map(key=>[key,resolveSetting(settings,'notifications.'+key).value]))),[settings]);
  const runState = tabSession.runState ?? "Ready";
  useEffect(()=>setFeedbackScopes(Object.fromEntries(tabs.map(tab=>[tab.id,tab.name]))),[tabs]);
  const allProblems = tabs.flatMap(tab => [...(tabSessions[tab.id]?.lintProblems || []), ...(tabSessions[tab.id]?.compilationProblems || []), ...(tabSessions[tab.id]?.runtimeProblems || [])]);
  const activeProblems = allProblems.filter(problem => problem.tabId === activeTabId);
  const problemsRef = useRef(allProblems), problemCursorRef = useRef(-1); problemsRef.current = allProblems;
  const setRunState = (value, owner) => {
    updateTabSession("runState", value, owner);
    if(typeof value!=='string'||!/clipboard|no primary|no child|no related|place the cursor|before (executing|binding|explaining)|^Saved | linked to |analysis (active|ended)|switch cancelled/i.test(value))return;
    const tabId=owner||replyOwnerRef.current||documents.activeId;
    notifyFeedback({id:`workbench:${tabId}:${value}`,kind:/fail|error/i.test(value)?'error':/before |no primary|no child|no related|place the cursor/i.test(value)?'warning':'info',title:'SQL workbench',message:value,scope:tabId,scopeLabel:documents.tabs.find(t=>t.id===tabId)?.name});
  };
  const schemaObjects = tabSession.schemaObjects ?? EMPTY_SCHEMA_OBJECTS;
  const setSchemaObjects = (value, owner) => updateTabSession("schemaObjects", value, owner);
  const schemaOwner = tabSession.schemaOwner ?? "";
  const setSchemaOwner = (value, owner) => updateTabSession("schemaOwner", value, owner);
  const schemaLoading = tabSession.schemaLoading ?? false;
  const setSchemaLoading = (value, owner) => updateTabSession("schemaLoading", value, owner);
  const schemaError = tabSession.schemaError ?? "";
  const setSchemaError = (value, owner) => updateTabSession("schemaError", value, owner);
  const editorPositionsRef=useRef(new Map()),filePollRef=useRef(null),fileWatchOffsetRef=useRef(0);
  const sessionsRef = useRef(tabSessions); sessionsRef.current = tabSessions;
  const { results, tabResults } = useResultSessions();
  const setTabResults = results.set;
  const closedTabsRef = useRef(new Set());
  const windowClosingRef = useRef(false), pendingWindowMovesRef = useRef(new Map()), windowMessageRef = useRef(null);
  const [sshHostKey, setSshHostKey] = useState(null);
  const [appWindows, setAppWindows] = useState({ current: hostWindow.id, label: hostWindow.label, windows: [] });
  const view = tabResults[activeTabId] || {};
  const queryResult = (view.selectedResultKey ? (view.resultSets || []).find(item=>item.key===view.selectedResultKey)?.result : view.queryResult) || null, explainResult = view.explainResult || null, explainMessage = view.explainMessage || "", outputMessage = view.outputMessage || "", resultTab = view.resultTab || "Results", resultFilter = view.resultFilter || "";
  function updateTabResult(key, value, owner = replyOwnerRef.current || documents.activeId) {
    if (closedTabsRef.current.has(owner)) return;
    results.update(owner, key, value);
  }
  const setQueryResult = (value, owner) => updateTabResult("queryResult", value, owner);
  const setExplainResult = (value, owner) => updateTabResult("explainResult", value, owner);
  const setExplainMessage = (value, owner) => updateTabResult("explainMessage", value, owner);
  const [resultLiveAppearance,setResultLiveAppearance]=useState(null),resultAppearanceSequence=useRef(0);
  const currentAppearanceKey=`${activeTabId}:${view.selectedResultKey||'latest'}:${queryResult?.viewIdentity||queryResult?.resultId||queryResult?.requestId||''}`;
  const currentResultOptions=(view.selectedResultKey?view.resultSets?.find(item=>item.key===view.selectedResultKey)?.view?.options:view.queryView?.options)||queryResult?.defaultOptions||{};
  function previewResultAppearance(patch){if(!queryResult?.columns?.length)return;setResultLiveAppearance({key:currentAppearanceKey,sequence:++resultAppearanceSequence.current,patch})}
  const setOutputMessage = (value, owner) => updateTabResult("outputMessage", value, owner);
  const setResultTab = (value, owner) => updateTabResult("resultTab", value, owner);
  const setResultFilter = value => updateTabResult("resultFilter", value);
  const fetchingPage = tabSession.fetchingPage || false;
  const setFetchingPage = (value, owner) => updateTabSession("fetchingPage", value, owner);
  const pageError = view.pageError || "";
  const setPageError = (value, owner) => {updateTabResult("pageError", value, owner);if(value)notifyFeedback({id:`page:${owner||replyOwnerRef.current||documents.activeId}`,kind:/cancelled/i.test(value)?'info':'error',title:'Result rows',message:value,scope:owner||replyOwnerRef.current||documents.activeId})};
  const pageRequestRef = useMemo(() => ({
    get current() { return operations.pages.get(replyOwnerRef.current || documents.activeId) || null; },
    set current(value) { const id = replyOwnerRef.current || documents.activeId; if (value) operations.pages.set(id, value); else operations.pages.delete(id); },
  }), []);
  useEffect(() => {
    const dismiss = event => {
      for (const menu of document.querySelectorAll(".result-export-menu[open], .result-grid-tools details[open]")) {
        if (event.type === "keydown" && event.key === "Escape" || event.type === "pointerdown" && !menu.contains(event.target)) menu.open = false;
      }
    };
    document.addEventListener("keydown", dismiss); document.addEventListener("pointerdown", dismiss);
    return () => { document.removeEventListener("keydown", dismiss); document.removeEventListener("pointerdown", dismiss); };
  }, []);
  const sqlResult = resultTab === "Explain" ? explainResult : queryResult;
  // Result columns and projection expressions link only while the editor still matches the executed snapshot.
  const projectionMapping=useMemo(()=>resultTab==='Results'&&sqlResult?.columns?.length?projectionRanges(sqlResult,sql):null,[resultTab,sqlResult,sql]);
  const [linkedProjectionColumn,setLinkedProjectionColumn]=useState(null),projectionDecorations=useRef(null),projectionCursorRef=useRef(null);
  projectionCursorRef.current=position=>{const model=editorRef.current?.getModel();if(!model||!projectionMapping){setLinkedProjectionColumn(null);return}const offset=model.getOffsetAt(position),index=projectionMapping.findIndex(range=>range&&offset>=range.start&&offset<=range.end);setLinkedProjectionColumn(index<0?null:index)};
  useEffect(()=>{if(!projectionMapping){setLinkedProjectionColumn(null);projectionDecorations.current?.clear()}},[projectionMapping]);
  function showProjectionSource(columnIndex,reveal=false){
    const editor=editorRef.current,model=editor?.getModel(),range=projectionMapping?.[columnIndex];
    projectionDecorations.current?.clear();
    if(!editor||!model||!range){if(reveal)notifyFeedback({kind:'warning',title:'Source expression',message:projectionMapping?'This column comes from * or an unmatched projection.':'The editor changed since this execution, so result columns are not linked to the SQL.',scope:documents.activeId});return}
    const from=model.getPositionAt(range.start),to=model.getPositionAt(range.end),monacoRange=new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column);
    projectionDecorations.current=editor.createDecorationsCollection([{range:monacoRange,options:{inlineClassName:'projection-source-highlight'}}]);
    if(reveal){editor.setSelection(monacoRange);editor.revealRangeInCenterIfOutsideViewport(monacoRange);editor.focus()}
  }
  const panelMessage = resultTab === "Explain" ? explainMessage : outputMessage;
  useEffect(()=>{
    const save=event=>{if(settingsRef.current.readOnly){setSettingsError('Settings belong to a newer app version.');return;}setSettings(current=>saveResultDefaults(current,event.detail||{}))};
    const reset=()=>{if(settingsRef.current.readOnly){setSettingsError('Settings belong to a newer app version.');return;}setSettings(current=>Object.keys(settingDefinitions).filter(id=>id.startsWith('results.')||id.startsWith('export.')).reduce((next,id)=>changeSetting(next,id,undefined),current))};
    window.addEventListener('fbsdb.results.saveDefaults',save);window.addEventListener('fbsdb.results.resetDefaults',reset);
    return()=>{window.removeEventListener('fbsdb.results.saveDefaults',save);window.removeEventListener('fbsdb.results.resetDefaults',reset)};
  },[]);
  function setSqlResult(value, owner = replyOwnerRef.current || documents.activeId) {
    if (value) {
      const defaults = newResultDefaults(settingsRef.current, operations.metadata.get(owner)?.workspaceRoot ?? workspace.root, systemLocale);
      results.publish(owner, value, defaults, operations.scripts.get(owner));
    } else setQueryResult(value, owner);
    if (value === null) { setExplainResult(null, owner); setExplainMessage("", owner); operations.pages.delete(owner); setFetchingPage(false, owner); setPageError("", owner); }
  }
  const resultRenderMeasured = useCallback(timing => {
    setTabSessions(current => Object.fromEntries(Object.entries(current).map(([id, session]) => [id, session.renderingRequestId === timing.requestId ? { ...session, rendering: false } : session])));
    results.measure(timing);
  }, [results]);
  const [relatedSources, setRelatedSources] = useState(null);
  const [callHierarchy, setCallHierarchy] = useState(null);
  const [structuralSearch, setStructuralSearch] = useState(null);
  const [dependencyGraph, setDependencyGraph] = useState(null);
  const [expressionExplanation, setExpressionExplanation] = useState(null);
  const [sideEditor, setSideEditor] = useState(null);
  const [identifierCase, setIdentifierCase] = useState(null);
  const [localRename, setLocalRename] = useState(null);
  const [changeSignature,setChangeSignature]=useState(null);
  const [extractProcedure,setExtractProcedure]=useState(null);
  const [embeddedSql,setEmbeddedSql]=useState(null);
  const [quickFix,setQuickFix]=useState(null),quickFixRef=useRef(null);
  // Optional cues after long runs; nothing is played or flashed unless the user enabled it.
  const notifyExecutionFinishedRef=useRef(null),failedUnseenRef=useRef(false),taskbarStateRef=useRef('none');
  const anyExecuting=Object.values(tabSessions).some(session=>session?.executing);
  useEffect(()=>{
    if(!isNativeHost)return;
    const apply=()=>{const state=taskbarProgressState({running:anyExecuting,failedUnseen:failedUnseenRef.current});if(state!==taskbarStateRef.current){taskbarStateRef.current=state;sendNativeCommand('ui.setTaskbarProgress',{state})}};
    const seen=()=>{failedUnseenRef.current=false;apply()};
    apply();window.addEventListener('focus',seen);
    return()=>window.removeEventListener('focus',seen);
  },[anyExecuting]);
  const runConsoleStore=useRef(null);if(!runConsoleStore.current)runConsoleStore.current=createConsoleStore();
  const executionSummaries=useRef(null);if(!executionSummaries.current)executionSummaries.current=createSummaryStore();
  notifyExecutionFinishedRef.current=(owner,success,details={})=>{
    const meta=operations.metadata.get(owner),started=meta?.requestStartedAtPerf;if(started==null)return;
    executionSummaries.current.record(owner,meta.executedSql,{ok:success,elapsedMs:details.elapsedMs??performance.now()-started,rows:details.rows,rowsAffected:details.rowsAffected,hasMore:details.hasMore,message:details.message,profile:meta.executedProfile,executedAt:meta.executedAt});
    runConsoleStore.current.record(owner,createConsoleEntry({sql:meta.executedSql,parameters:meta.executedParameters,output:details.output,ok:success,message:details.message,elapsedMs:details.elapsedMs??performance.now()-started,rows:details.rows,rowsAffected:details.rowsAffected,profile:meta.executedProfile,executedAt:meta.executedAt},{retainValues:resolveSetting(settings,'privacy.consoleBindValues').value}));
    window.dispatchEvent(new Event('fbsdb.refreshRunGutter'));
    const actions=postExecutionActions({elapsedMs:performance.now()-started,focused:document.hasFocus()&&document.visibilityState==='visible',sound:resolveSetting(settings,'notifications.completionSound').value,attention:resolveSetting(settings,'notifications.windowAttention').value,thresholdSeconds:resolveSetting(settings,'notifications.longQuerySeconds').value});
    if(actions.sound)playCompletionTone(success);
    if(actions.attention&&isNativeHost)sendNativeCommand('ui.requestAttention',{tabId:owner});
    if(actions.attention||actions.sound)notifyFeedback({kind:success?'success':'error',title:success?'Query finished':'Query failed',message:`Elapsed ${formatElapsed(performance.now()-started)}`,scope:owner});
    if(!success&&!document.hasFocus())failedUnseenRef.current=true;
  };
  const notifyExecutionFinished=(owner,success,details)=>notifyExecutionFinishedRef.current?.(owner,success,details);
  const insertPairProvidersRef = useRef(null),smartEnterRef = useRef(null),structuralSelectionRef = useRef(null);
  const postfixProviderRef = useRef(null);
  useEffect(()=>()=>{structuralSelectionRef.current?.dispose();postfixProviderRef.current?.dispose()},[]);
  // Status bar indicators are user-selectable; each optional one carries its own tooltip and action.
  const [statusMenu,setStatusMenu]=useState(null),[cursorLine,setCursorLine]=useState(0),[,setStatusTick]=useState(0);
  const enabledStatusIndicators=resolveSetting(settings,'ui.statusIndicators').value;
  const breadcrumbRoutine=useMemo(()=>{const position=editorRef.current?.getPosition(),model=editorRef.current?.getModel();if(!position||!model)return '';const offset=model.getOffsetAt(position);return documentOutline.filter(item=>['PROCEDURE','FUNCTION'].includes(item.kind)&&item.start<=offset&&item.end>=offset).sort((a,b)=>b.depth-a.depth).map(item=>minimapLabel(item).replace(/^\w+ /,''))[0]||''},[documentOutline,cursorLine]);
  // Evaluated while rendering the status bar, after the session values below are initialized.
  const buildStatusContext=()=>({procedure:breadcrumbRoutine,schema:tabSession.sessionContext?.schema,oracleVersion:sessionConnected?completionSession.oracleVocabulary?.version:null,branch:workspaceDev.git?.repository?workspaceDev.git.branch:null,tabSize:codeStyle.tabSize,insertSpaces:codeStyle.insertSpaces,lineEnding:editorRef.current?.getModel()?.getEOL()==='\r\n'?'CRLF':editorRef.current?.getModel()?.getEOL()?'LF':''});
  function statusIndicatorAction(action) {
    if(action==='outline')setPaletteMode('outline');
    else if(action==='objects')setPaletteMode('files');
    else if(action==='session')setShowSessionInspector(true);
    else if(action==='git')openWorkspaceDevelopment('git');
    else if(action==='indent'){setSettingsFocus({query:'Tab',category:'editor'});setShowAppearance(true)}
    else if(action==='eol'){const model=editorRef.current?.getModel();if(model&&!activeTabReadonly){model.pushEOL(model.getEOL()==='\r\n'?monaco.editor.EndOfLineSequence.LF:monaco.editor.EndOfLineSequence.CRLF);setStatusTick(tick=>tick+1)}}
  }
  // Code lenses: reference counts and explicit actions; every action opens the existing review/form, nothing runs by itself.
  const lensActionRef=useRef(null),lensesOn=resolveSetting(settings,'editor.codeLenses').value;
  lensActionRef.current=(action,line)=>{
    const editor=editorRef.current,model=editor?.getModel();if(!editor||!model)return;
    editor.setPosition({lineNumber:line,column:1});editor.focus();
    if(action==='references'){const content=model.getLineContent(line),match=/(?:PACKAGE BODY|PACKAGE|PROCEDURE|FUNCTION|TRIGGER)\s+("?[\w$#.]+"?)/i.exec(content);if(match){const start=match.index+match[0].length-match[1].length;editor.setSelection(new monaco.Range(line,start+1,line,start+1+match[1].length));editor.getAction('actions.find')?.run()}}
    else if(action==='switch')switchPackageSource();
    else if(action==='compile')reviewSourceForCompilation();
    else if(action==='run')openRunConfigurations();
  };
  useEffect(()=>{
    if(!monaco)return;
    const command=monaco.editor.registerCommand('fbsdb.codeLens',(_accessor,action,line)=>lensActionRef.current?.(action,line));
    return()=>command.dispose();
  },[monaco]);
  useEffect(()=>{
    const editor=editorRef.current,model=editor?.getModel();
    if(!editor||!model||!monaco||!lensesOn||!documentOutline.length)return;
    const provider=monaco.languages.registerCodeLensProvider('sql',{provideCodeLenses(target){
      if(target!==editorRef.current?.getModel())return {lenses:[],dispose(){}};
      const lenses=codeLensItems(documentOutline,target.getValue(),offset=>target.getPositionAt(offset)).flatMap(item=>item.actions.map(action=>({range:new monaco.Range(item.line,1,item.line,1),command:{id:'fbsdb.codeLens',title:action.title,arguments:[action.id,item.line]}})));
      return {lenses,dispose(){}};
    }});
    return()=>provider.dispose();
  },[documentOutline,monaco,lensesOn,activeTabId]);
  // Routine and package boundaries are labeled in the minimap from the same outline model as breadcrumbs.
  const minimapOn=resolveSetting(settings,'editor.minimap').value;
  useEffect(()=>{
    const editor=editorRef.current,model=editor?.getModel();
    if(!editor||!model||!monaco||!minimapOn||!documentOutline.length)return;
    const collection=editor.createDecorationsCollection(minimapSections(documentOutline,offset=>model.getPositionAt(offset)).map(({line,text})=>({range:new monaco.Range(line,1,line,1),options:{minimap:{position:monaco.editor.MinimapPosition.Inline,sectionHeaderStyle:monaco.editor.MinimapSectionHeaderStyle.Underlined,sectionHeaderText:text}}})));
    return()=>collection.clear();
  },[documentOutline,monaco,minimapOn,activeTabId]);
  // Inserts a documentation comment above the routine at the cursor; Tab walks the description and parameter stops.
  function generateDocComment() {
    const editor=editorRef.current,model=editor?.getModel(),position=editor?.getPosition();
    if(!model||!position||activeTabReadonly)return;
    const result=docSkeletonAt(model.getValue(),model.getOffsetAt(position));
    if(result.error){notifyFeedback({kind:'warning',title:'Documentation comment',message:result.error,scope:documents.activeId});return}
    const at=model.getPositionAt(result.insertAt);
    editor.setPosition(at);editor.focus();
    editor.getContribution('snippetController2').insert(result.snippet.replace(/\r?\n/g,model.getEOL()),{adjustWhitespace:false,undoStopBefore:true,undoStopAfter:true});
  }
  // Rewrites only the statement around the selection; Tab edits the CTE name in both places at once.
  function extractSelectionToCte() {
    return editorActions.extractSelectionToCte({
      activeTabReadonly, documents, editorRef, monacoRef
    });
  }
  // Completes the construct on the cursor line as one undoable edit; it never runs SQL.
  smartEnterRef.current=()=>{
    const editor=editorRef.current,model=editor?.getModel(),position=editor?.getPosition();
    if(!model||!position||editorIsReadonly())return;
    const options=model.getOptions(),indent=options.insertSpaces?' '.repeat(options.indentSize||options.tabSize||2):'	';
    const result=smartEnter(model.getLinesContent(),position.lineNumber-1,{indent});
    if(!result){editor.trigger('keyboard','type',{text:model.getEOL()});return}
    const range=new monacoRef.current.Range(position.lineNumber,1,position.lineNumber,model.getLineMaxColumn(position.lineNumber));
    editor.pushUndoStop();editor.executeEdits('smart-enter',[{range,text:result.lines.join(model.getEOL())}]);editor.pushUndoStop();
    editor.setPosition({lineNumber:position.lineNumber+result.cursor.line,column:result.cursor.column});editor.focus();
  };
  useEffect(()=>()=>insertPairProvidersRef.current?.dispose(),[]);
  const [codeCell, setCodeCell] = useState(null),[surroundMenu,setSurroundMenu]=useState(null);
  useEffect(()=>{const open=event=>setCodeCell(event.detail);window.addEventListener('fbsdb.result.openCode',open);return()=>window.removeEventListener('fbsdb.result.openCode',open)},[]);
  // SQL drafts from value viewers open as unsaved editor text and are never executed automatically.
  const sqlDraftRef=useRef(null);sqlDraftRef.current=sql=>{setObjectTabActive(false);newSqlFileNow(sql)};
  useEffect(()=>{const loaded=event=>{const {lobId,value}=event.detail||{};if(lobId&&value!=null)results.replaceLob(lobId,value)};window.addEventListener('fbsdb.result.lobLoaded',loaded);return()=>window.removeEventListener('fbsdb.result.lobLoaded',loaded)},[results]);
  useEffect(()=>{const open=event=>{if(typeof event.detail?.sql==='string')sqlDraftRef.current?.(event.detail.sql)};window.addEventListener('fbsdb.result.sqlDraft',open);return()=>window.removeEventListener('fbsdb.result.sqlDraft',open)},[]);
  const [showProjectRules,setShowProjectRules]=useState(false);
  const [sourceCompile,setSourceCompile]=useState(null);
  const [runConfigurations,setRunConfigurations]=useState(null);
  const sourceBaselineRequests=useRef(new Map()),sourceBaselineAttempts=useRef(new Set());
  const [workspace, setWorkspace] = useState({ root: null, name: "Open workspace", files: [], entries: [], recent: [] });
  const [completionSettings, setCompletionSettings] = useState(()=>resolveSetting(settings,'editor.completion').value);
  const learningEpochRef = useRef(0), suggestionLearningRef = useRef(null), lastSuggestionAcceptanceRef = useRef(null);
  if (!suggestionLearningRef.current) suggestionLearningRef.current = new SuggestionLearning(localStorage);
  const suggestionWorkspaceRef = useRef(workspace.root); suggestionWorkspaceRef.current = workspace.root;
  const suggestionScope = () => learningScope(suggestionWorkspaceRef.current, activeConnectionRef.current?.id);
  const publishLearning = () => completionClientRef.current?.worker.postMessage({ type: 'learning', entries: completionSettingsRef.current.learning ? suggestionLearningRef.current.snapshot(suggestionScope()) : [] });
  function learnSqlUsage(source) {
    if (source.length>=LARGE_FILE_THRESHOLD || !completionSettingsRef.current.learning || !completionClientRef.current) return;
    const scope = suggestionScope(), epoch = learningEpochRef.current;
    completionClientRef.current.request('learn', source, 0).then(result => {
      if (!completionSettingsRef.current.learning || epoch !== learningEpochRef.current) return;
      suggestionLearningRef.current.observe(scope, result.observations || []); publishLearning();
    });
  }
  const completionTabKeyRef = useRef(null);
  const completionClientRef = useRef(null), completionAcceptanceRef = useRef(null), completionRecentRef = useRef(new Map());
  const [completionError, setCompletionError] = useFeedbackState('',{title:'Completion',scope:null});
  const [definitionError, setDefinitionError] = useFeedbackState('',{title:'Definition unavailable'});
  const [objectDefinition, setObjectDefinition] = useState(null);
  const completionMetadataRef = useRef(null), definitionModelsRef = useRef(new Map()), manualSuggestionRef = useRef(false);
  const schemaWarmupRef = useRef(null);
  const formatterRef = useRef(null);
  const [plscopeReport, setPlscopeReport] = useState(null);
  if (!completionMetadataRef.current) completionMetadataRef.current = new OracleMetadataBroker(sendNativeCommand, (owner, status) => updateTabSession("completionMetadataStatus", status, owner));
  useEffect(()=>{setRelatedSources(null);setShowProjectRules(false);setRunConfigurations(null)},[workspace.root]);
  const activeEditorTab = tabs.find(tab => tab.id === activeTabId);
  const [largeFileOverrides,setLargeFileOverrides]=useState({});
  const largeFileOverridesRef=useRef(largeFileOverrides);largeFileOverridesRef.current=largeFileOverrides;
  const largePolicy=largeFilePolicy(sql,largeFileOverrides[activeTabId]);
  const languageTabs=useMemo(()=>tabs.filter(tab=>largeFilePolicy(tab.content,largeFileOverrides[tab.id]).source),[tabs,largeFileOverrides]);
  useEffect(()=>{window.dispatchEvent(new Event('fbsdb.refreshRunGutter'));queueSchemaForSql(documents.text)},[activeTabId,largePolicy.source,largePolicy.completion]);

  const activeTabReadonly = !!activeEditorTab?.readOnly || objectTabActive;
  useEffect(()=>{
    const model=editorRef.current?.getModel();if(!model||!monaco)return;
    const ending=sourceLineEnding(documents.text);if(model.getEOL()===ending)return;
    controlledEditorUpdateRef.current=true;
    try{model.setEOL(ending==='\r\n'?monaco.editor.EndOfLineSequence.CRLF:monaco.editor.EndOfLineSequence.LF)}finally{controlledEditorUpdateRef.current=false}
  },[activeTabId,monaco,sourceLineEnding(sql)]);
  const bookmarks=useSourceBookmarks(editorRef.current,activeEditorTab,workspace.root),bookmarkCursorRef=useRef(null);
  const [showBookmarks,setShowBookmarks]=useState(false);
  const editorConnection = documentConnection(activeEditorTab||{},tabSessions,dbConnections);
  const activeSource = useMemo(() => largePolicy.source?describeOracleSource(activeEditorTab || {}, workspace.projectRules):{}, [activeEditorTab,workspace.projectRules,largePolicy.source]);
  const relatedPackage = useMemo(() => relatedPackageDocument(largePolicy.source?activeEditorTab || {}:{}, languageTabs, {root: workspace.root, sessions: tabSessions, rules:workspace.projectRules}), [activeEditorTab, languageTabs, workspace.root, tabSessions,workspace.projectRules,largePolicy.source]);
  const packageGroups = useMemo(() => packageDocumentGroups(languageTabs, {root: workspace.root, sessions: tabSessions, rules:workspace.projectRules}), [languageTabs, workspace.root, tabSessions,workspace.projectRules]);
  const metadataOriginTabId = activeEditorTab?.metadataOriginTabId || activeTabId;
  const completionSession = tabSessions[metadataOriginTabId] || {};
  useEffect(()=>{setObjectMenu(null)},[activeTabId,metadataOriginTabId,completionSession.activeConnection?.id,completionSession.connecting,completionMetadataRef.current.session(metadataOriginTabId).epoch]);
  useEffect(()=>reviewSourceBaselines({
    completionSession, documents, largePolicy, sourceBaselineAttempts, sourceBaselineRequests, tabSessions, workspace
  }),[activeTabId,filePath,sql,tabSession.activeConnection?.id,tabSession.executing,tabSession.connecting,tabSession.inactive,tabSession.connectionLost,tabSession.scriptRun?.running,workspace.projectRules,completionSession.schemaOwner,largePolicy.source]);
  const completionObjects = completionSession.schemaObjects || EMPTY_SCHEMA_OBJECTS;
  const completionSchema = completionSession.schemaOwner || "";
  const completionSettingsRef = useRef(completionSettings); completionSettingsRef.current = completionSettings;
  const autoCompletion = completionSettings.popup;
  const [codeStyle,setCodeStyle]=useState(()=>Object.fromEntries(['fontSize','tabSize','insertSpaces'].map(field=>[field,resolveSetting(settings,'editor.'+field).value])));
  const [theme,setTheme]=useState(()=>resolveSetting(settings,'ui.theme').value);
  useLayoutEffect(()=>applyDocumentTheme(theme),[theme]);
  useEffect(()=>{if(isNativeHost)sendNativeCommand('ui.setTheme',{theme})},[theme]);
  const [allTokenColors,setAllTokenColors]=useState(()=>{const saved=resolveSetting(settings,'ui.tokenColors').value;return resolveTokenColors(saved)});
  const [editorThemeName, setEditorThemeName] = useState("vs-dark");
  const overview=useEditorOverview(editorRef.current,monaco,activeEditorTab,completionClientRef.current,theme,resolveSetting(settings,'editor.overviewRuler').value);
  useEffect(()=>{setQueryHistory(current=>retainHistory(current,{limit:resolveSetting(settings,'privacy.historyLimit').value,days:resolveSetting(settings,'privacy.historyDays').value,excludedProfiles:resolveSetting(settings,'privacy.excludedProfiles').value}))},[settings.user['privacy.historyLimit'],settings.user['privacy.historyDays'],settings.user['privacy.excludedProfiles']]);
  useEffect(()=>{const timer=setInterval(()=>setQueryHistory(current=>retainHistory(current,{limit:resolveSetting(settings,'privacy.historyLimit').value,days:resolveSetting(settings,'privacy.historyDays').value,excludedProfiles:resolveSetting(settings,'privacy.excludedProfiles').value})),60000);return()=>clearInterval(timer)},[settings]);
  useEffect(()=>{const clear=()=>setQueryHistory([]);window.addEventListener('fbsdb.history.clear',clear);return()=>window.removeEventListener('fbsdb.history.clear',clear)},[]);
  const motionPreference=resolveSetting(settings,'ui.motion').value,historyLimit=resolveSetting(settings,'privacy.historyLimit').value;
  const [systemReducedMotion,setSystemReducedMotion]=useState(()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false);
  const reduceMotion=motionPreference==='reduce'||motionPreference==='system'&&systemReducedMotion;
  useEffect(()=>{const query=window.matchMedia?.('(prefers-reduced-motion: reduce)');if(!query)return;const update=()=>setSystemReducedMotion(query.matches);query.addEventListener('change',update);return()=>query.removeEventListener('change',update)},[]);
  useEffect(()=>{setSettings(current=>{
    if(current.readOnly)return current;let next=current;
    const observed={'ui.theme':theme,'ui.tokenColors':allTokenColors,'editor.fontSize':codeStyle.fontSize,'editor.tabSize':codeStyle.tabSize,'editor.insertSpaces':codeStyle.insertSpaces,'editor.queryTimeout':queryTimeout,'editor.completion':completionSettings};
    for(const[id,value]of Object.entries(observed)){
      const product=id==='ui.tokenColors'?defaultTokenColors:settingDefinitions[id].default;
      if(!Object.hasOwn(current.user,id)&&JSON.stringify(value)===JSON.stringify(product))continue;
      if(JSON.stringify(current.user[id])!==JSON.stringify(value))next=changeSetting(next,id,value);
    }
    return next;
  })},[theme,allTokenColors,codeStyle,queryTimeout,completionSettings]);
  function applySettings(next){
    const density=resolveSetting(next,'ui.density').value;
    if(!next.readOnly&&density!==resolveSetting(settingsRef.current,'ui.density').value){next=changeSetting(next,'results.density',density);previewResultAppearance({density})}
    setSettings(next);setTheme(resolveSetting(next,'ui.theme').value);setQueryTimeout(resolveSetting(next,'editor.queryTimeout').value);setCompletionSettings(resolveSetting(next,'editor.completion').value);
    setCodeStyle(Object.fromEntries(['fontSize','tabSize','insertSpaces'].map(field=>[field,resolveSetting(next,'editor.'+field).value])));
    const colors=resolveSetting(next,'ui.tokenColors').value;setAllTokenColors(resolveTokenColors(colors));
  }
  const tokenColors = allTokenColors[theme] || defaultTokenColors[theme], themeConfig = themePresets[theme];
  const allSqlSnippets = useMemo(() => { const custom = new Set(customSqlSnippets.map((snippet) => snippet.trigger)); return [...sqlSnippets.filter((snippet) => !custom.has(snippet.trigger)), ...customSqlSnippets]; }, [customSqlSnippets]);
  const { visibleSchemaObjects, schemaSearchKinds } = useMemo(() => { const query = schemaQuery.trim().toLowerCase(); const kinds = new Map(); const visible = schemaObjects.filter(item => { if ((objectScope === "Favorites" && !objectFavorites.includes(oracleSchemaKey(item))) || (objectScope === "Recent" && !recentObjects.includes(oracleSchemaKey(item))) || (schemaOwnerFilter !== "All" && (item.owner || schemaOwner) !== schemaOwnerFilter)) return false; if (!query) return true; const schemaMatch = String(item.owner || schemaOwner).toLowerCase().includes(query); const objectMatch = String(item.name).toLowerCase().includes(query) || String(item.targetOwner || "").toLowerCase().includes(query) || String(item.targetName || "").toLowerCase().includes(query) || String(item.dbLink || "").toLowerCase().includes(query); const typeMatch = `${item.type} ${oracleObjectLabel(item.type)}`.toLowerCase().includes(query); const columnMatch = (item.columns || []).some(column => `${column.name} ${column.type} ${column.comment || ""}`.toLowerCase().includes(query)); const kind = objectMatch ? 'Object' : columnMatch ? 'Column' : schemaMatch ? 'Schema' : typeMatch ? 'Type' : ''; if (kind) kinds.set(oracleSchemaKey(item), kind); return Boolean(kind); }); return { visibleSchemaObjects: visible, schemaSearchKinds: kinds }; }, [schemaObjects, schemaQuery, schemaOwnerFilter, schemaOwner, objectScope, objectFavorites, recentObjects]);
  const schemaLookup = useMemo(() => makeOracleRelationLookup(schemaObjects, schemaOwner), [schemaObjects, schemaOwner]);
  const objectTab = objectTabs.find(tab => tab.id === activeObjectTabId) || null;
  const inspectorObject = objectTab?.object;
  const objectTabId = activeObjectTabId;
  const objectInspectorView = objectTabActive && inspectorObject ? <Suspense fallback={<div role="status">Loading…</div>}><OracleObjectInspector key={objectTabId} object={inspectorObject} analysis={objectAnalysis} activeDetailTab={objectTab.view} onDetailTabChange={view=>{setObjectTabs(current=>current.map(tab=>tab.id===objectTabId?{...tab,view}:tab));if(view==='Related tables')inspectOracleObject(inspectorObject,objectTab.originTabId,true)}} onClose={() => { setActiveObject(''); setObjectTabActive(false); setObjectTabs(current => current.filter(tab => tab.id !== objectTabId)); setActiveObjectTabId(null); objectAnalysisRequestRef.current?.cancel(); setObjectAnalysis(null); requestAnimationFrame(()=>editorRef.current?.focus()); }} onNavigate={target=>openExplorerObject(target,'Overview',objectTab.originTabId)} onLookup={() => requestPrimaryKey({ schema: inspectorObject.owner, table: inspectorObject.name, tabId: objectTab.originTabId })} /></Suspense> : null;
  const schemaNameSet = useMemo(() => new Set(schemaLookup.keys()), [schemaLookup]);
  const connectionGroupNames = useMemo(() => [...new Set(dbConnections.flatMap((item) => item.groups||[]).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [dbConnections]);
  const filteredConnections=useMemo(()=>filterOrganizedConnections(dbConnections,connectionOrg,{search:explorerQuery,groupId:groupFilter==='All groups'?'':connectionOrg.groups.find(g=>g.name===groupFilter)?.id||''}).filter(item=>explorerTab==='Recent'?recentProfiles.includes(item.id):explorerTab==='Favorites'?favorites.includes(item.id):true),[dbConnections,connectionOrg,explorerQuery,explorerTab,favorites,groupFilter,recentProfiles]);
  const pageSizes=resultPageSizes(settings,workspace.root,tabSession,queryResult),maxRows=pageSizes.current;
  const filteredQueryHistory = useMemo(() => {
    const term = historyFilter.trim().toLowerCase();
    return term ? queryHistory.filter((entry) => [entry.sql, entry.profile, entry.status, entry.detail].some((value) => String(value ?? "").toLowerCase().includes(term))) : queryHistory;
  }, [queryHistory, historyFilter]);
  const filteredSnippets = useMemo(() => {
    const term = snippetFilter.trim().toLowerCase();
    return term ? allSqlSnippets.filter((snippet) => `${snippet.trigger} ${snippet.label} ${snippet.detail}`.toLowerCase().includes(term)) : allSqlSnippets;
  }, [snippetFilter, allSqlSnippets]);
  const selectedSnippet = filteredSnippets.find((snippet) => snippet.trigger === selectedSnippetTrigger) ?? filteredSnippets[0] ?? null;
  const dbConnectionsRef = useRef(dbConnections), activeConnectionRef = useRef(activeConnection), authProfileRef = useRef(authProfile), pendingSwitchRef = useRef(pendingSwitch), transactionPendingRef = useRef(transactionPending), schemaLookupRef = useRef(schemaLookup), schemaReadyRef = useRef(false), schemaRequestedRef = useRef(new Set()), schemaLoadedRef = useRef(new Set()), monacoRef = useRef(monaco), documentSavesRef = useRef(null), pendingHistoryRef = useRef(new Map()), searchRequestRef = useRef(null), searchTimerRef = useRef(null), pendingSearchPositionRef = useRef(null);
  if (!documentSavesRef.current) documentSavesRef.current = new DocumentSaves();
  dbConnectionsRef.current = dbConnections; activeConnectionRef.current = activeConnection; authProfileRef.current = authProfile; pendingSwitchRef.current = pendingSwitch; transactionPendingRef.current = transactionPending; schemaLookupRef.current = schemaLookup; monacoRef.current = monaco;

  function queueSchemaForSql(text) {
    if (schemaWarmupRef.current) { clearTimeout(schemaWarmupRef.current.timer); schemaWarmupRef.current.cancel(); }
    if (!largeFilePolicy(text,largeFileOverridesRef.current[documents.activeId]).completion || !isNativeHost || !schemaReadyRef.current || (sessionsRef.current[documents.activeId]?.executing||sessionsRef.current[documents.activeId]?.scriptRun?.running)) return;
    const owner = documents.activeId, cancellation = completionCancellation();
    const timer = setTimeout(async () => {
      const client = completionClientRef.current;
      if (!client || owner !== documents.activeId || text !== documents.text || cancellation.token.isCancellationRequested) return;
      const model = editorRef.current?.getModel(), position = editorRef.current?.getPosition(), revision = client.revision;
      const analysis = await client.request('analyze', text, model && position ? model.getOffsetAt(position) : text.length, cancellation.token, { mode: 'complete' });
      if (revision !== client.revision || owner !== documents.activeId || cancellation.token.isCancellationRequested) return;
      await Promise.all((analysis.targets || []).map(target => completionMetadataRef.current.load(owner, target, cancellation.token)));
      if (revision === client.revision && owner === documents.activeId && !cancellation.token.isCancellationRequested) client.metadata(completionMetadataRef.current.objects(owner), completionMetadataRef.current.systemObjects(owner), completionMetadataRef.current.version(owner));
    }, 200);
    schemaWarmupRef.current = { ...cancellation, timer };
  }

  function finishHistoryEntry(status, detail) {
    const owner = replyOwnerRef.current || documents.activeId;
    const id = pendingHistoryRef.current.get(owner);
    if (!id) return;
    setQueryHistory((current) => current.map((entry) => entry.id === id ? { ...entry, status, detail } : entry));
    pendingHistoryRef.current.delete(owner);
  }

  function pollOpenFiles(){
    if(!isNativeHost||document.hidden||filePollRef.current&&Date.now()-filePollRef.current.at<12000)return;
    const files=[...new Map(documents.tabs.filter(tab=>tab.path&&!tab.readOnly).map(tab=>[pathKey(tab.path),{path:tab.path,version:tab.diskVersion??null,hasError:!!tab.externalChange?.error}])).values()];
    if(files.length){const offset=fileWatchOffsetRef.current%files.length,rotated=[...files.slice(offset),...files.slice(0,offset)].slice(0,100);filePollRef.current={id:sendNativeCommand('file.poll',{files:rotated}),at:Date.now(),offset,total:files.length};}
  }
  useEffect(()=>{if(!isNativeHost)return;const timer=setInterval(pollOpenFiles,4000);window.addEventListener('focus',pollOpenFiles);return()=>{clearInterval(timer);window.removeEventListener('focus',pollOpenFiles)}},[]);
  useEffect(()=>{if(!showSearch)setWorkspaceSearchScope(null)},[showSearch]);
  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchRequestRef.current = null;
    const query = searchQuery.trim();
    if (!showSearch || !isNativeHost || query.length < 2) { setSearchMatches([]); setSearching(false); setSearchTruncated(false); return; }
    setSearching(true);
    searchTimerRef.current = setTimeout(() => { searchRequestRef.current = sendNativeCommand("workspace.search", { query,scope:workspaceSearchScope,root:workspace.root }); }, 250);
    return () => clearTimeout(searchTimerRef.current);
  }, [showSearch, searchQuery, workspace.root,workspaceSearchScope]);
  useEffect(()=>{if(!showSearch)setDeleteReview(null)},[showSearch]);

  useEffect(() => subscribeWorkbenchMessages({
      activateTab, activeConnectionRef, authProfileRef, authTestRequestRef, beginConnection, cancelQuery, closeTabRef, closedTabsRef,
      completionMetadataRef, dbConnectionsRef, documentSavesRef, documents, editorRef, favorites, filePollRef, fileWatchOffsetRef,
      finishHistoryEntry, getBindNames, newSqlFileNow, notifyExecutionFinished, openWorkspaceFile, operations, pageRequestRef,
      pendingConnectionsRef, pendingSearchPositionRef, pendingSwitchRef, pendingTabCloseRef, previewPathRef, previewTabRef,
      queueSchemaForSql, recentProfiles, refreshSchema, refreshWorkspaceGit, relatedRunRequestsRef, rememberEditorPosition, replyOwnerRef,
      results, schemaLoadedRef, schemaLookupRef, schemaObjects, schemaReadyRef, schemaRequestRef, schemaRequestedRef, searchRequestRef,
      sessionsRef, setActiveConnection, setAuthProfile, setCancelling, setConnecting, setConnectionDiagnostics, setConnectionError,
      setConnectionOrg, setDbConnections, setDefinition, setExecuting, setExplainMessage, setExplainResult, setFavorites, setFetchingPage,
      setKeyLookup, setKeyValues, setLookupPicker, setManagementError, setObjectTabs, setOutputMessage, setPageError, setPendingSwitch,
      setPendingTabClose, setPreviewTabId, setQueryResult, setQuickEval, setRecentProfiles, setRelatedAutoRun, setResultTab, setRunState,
      setSchemaError, setSchemaLoading, setSchemaObjects, setSchemaOwner, setSchemaStale, setSearchMatches, setSearchTruncated, setSearching,
      setSettingsError, setSourceCompile, setSqlResult, setSshHostKey, setSubqueryTrial, setTabSessions, setTabs, setTnsAliases,
      setTransactionPending, setUncertainCommit, setWorkspace, setWorkspaceDev, sourceBaselineRequests, sourceDefinitionRequestRef,
      tabCloseActionsRef, tabSessions, updateTabResult, updateTabSession, windowMessageRef, workspace, workspaceDevRequestsRef
    }), []);

  useEffect(() => {
    const refreshCompletionMetadata = () => {
      const tab = documents.tabs.find(item => item.id === documents.activeId), owner = tab?.metadataOriginTabId || documents.activeId;
      const connection = sessionsRef.current[owner]?.activeConnection;
      if (!isNativeHost || !connection || ["No connection", "Disconnected"].includes(connection.id)) return;
      completionMetadataRef.current.reset(owner);
      schemaLoadedRef.current.clear(); schemaRequestedRef.current.clear();
      refreshSchema(owner); sendNativeCommand("completion.vocabulary", { tabId: owner });
    };
    window.addEventListener("fbsdb.refreshCompletionMetadata", refreshCompletionMetadata);
    return () => window.removeEventListener("fbsdb.refreshCompletionMetadata", refreshCompletionMetadata);
  }, []);

  useEffect(() => {
    const manualCompletion = event => {
      if ((event.ctrlKey || event.metaKey) && event.code === "Space" && editorRef.current?.hasTextFocus()) manualSuggestionRef.current = true;
    };
    window.addEventListener("keydown", manualCompletion, true);
    return () => window.removeEventListener("keydown", manualCompletion, true);
  }, []);

  useEffect(() => installWorkbenchShortcuts({
    cycleSqlTab, documents, editorIsReadonly, editorRef, manualSuggestionRef, navigateBookmark, navigateEdit, navigateHistory,
    navigateProblem, newSqlFileFromLastConnection, openCallHierarchy, openSqlFile, paletteMode, problemCursorRef, problemsRef,
    returnToExecution, saveSqlFile, setFocusMode, setPaletteMode, setRelatedSources, setShowBookmarks, setShowHistory, setShowPicker,
    setShowSearch, settingsRef, switchPackageSource, workspace
  }), [showPicker, showAppearance, showHistory, showSearch, showSnippets, fileDirty, sql, filePath, fileName, recentProfiles, workspace.root,workspace.projectRules]);

  useEffect(() => {
    if (!autoCompletion) return;
    const editor = editorRef.current, model = editor?.getModel(), position = editor?.getPosition();
    if (model && position && /\.\s*$/.test(model.getValue().slice(0, model.getOffsetAt(position)))) return;
    const timer = setTimeout(() => {
      const editor = editorRef.current, model = editor?.getModel(), position = editor?.getPosition();
      if (!model || !position || !editor.hasTextFocus() || document.querySelector(".modal-backdrop")) return;
      const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      if (automaticCompletionAllowed(model.getValue(), model.getOffsetAt(position),completionSettingsRef.current) && (!before || /[\p{L}\p{N}_$#."\s]$/u.test(before))) editor.trigger("sql-context", "editor.action.triggerSuggest", {});
    }, completionSettings.delay);
    return () => clearTimeout(timer);
  }, [sql, autoCompletion, completionSettings.delay, completionSettings.minCharacters, schemaObjects]);

  useEffect(() => installEditorShortcuts({
    editorIsReadonly, editorRef, formatterRef, manualSuggestionRef, runQueryRef, settingsRef
  }), [settings.user['editor.shortcuts']]);

  useEffect(() => { persistLocal(localStorage, "fbsdb.theme", theme); persistLocal(localStorage, "fbsdb.tokenColors", JSON.stringify(allTokenColors)); }, [theme, allTokenColors]);
  useEffect(() => {
    const reset = () => { learningEpochRef.current++; suggestionLearningRef.current.clear(); lastSuggestionAcceptanceRef.current = null; publishLearning(); };
    window.addEventListener('fbsdb.resetSuggestionLearning', reset);
    return () => window.removeEventListener('fbsdb.resetSuggestionLearning', reset);
  }, [completionSettings.learning, activeTabId, workspace.root]);
  useEffect(() => { persistLocal(localStorage, "fbsdb.completion", JSON.stringify(completionSettings)); persistLocal(localStorage, "fbsdb.autoCompletion", String(autoCompletion)); persistLocal(localStorage, "fbsdb.codeStyle", JSON.stringify(codeStyle)); }, [completionSettings, autoCompletion, codeStyle]);
  useEffect(() => { completionTabKeyRef.current?.set(completionSettings.acceptTab); }, [completionSettings.acceptTab]);
  useEffect(() => { persistLocal(localStorage, "fbsdb.favorites", JSON.stringify(favorites)); persistLocal(localStorage, "fbsdb.recent", JSON.stringify(recentProfiles)); }, [favorites, recentProfiles]);
  useEffect(()=>{if(!isNativeHost)persistLocal(localStorage, "fbsdb.connectionOrganization",JSON.stringify(connectionOrg))},[connectionOrg]);
  useEffect(() => { persistLocal(localStorage, "fbsdb.maxRows", String(maxRows)); }, [maxRows]);
  useEffect(() => { persistLocal(localStorage, "fbsdb.queryHistory", JSON.stringify(retainHistory(queryHistory,{limit:historyLimit,days:resolveSetting(settings,'privacy.historyDays').value,excludedProfiles:resolveSetting(settings,'privacy.excludedProfiles').value}))); }, [queryHistory,historyLimit]);
  useEffect(() => { persistLocal(localStorage, "fbsdb.customSqlSnippets", JSON.stringify(customSqlSnippets)); }, [customSqlSnippets]);


  useEffect(() => {
    if (!monaco) return;
    const name = `fbsdb-${theme}-${Date.now()}`;
    monaco.editor.defineTheme(name, { base: theme === "light" ? "vs" : "vs-dark", inherit: true,
      rules: [...monacoTokenRules(theme, tokenColors),{token:'parameter',foreground:tokenColors.keyword.replace('#',''),fontStyle:'italic'},{token:'variable',foreground:themeConfig.foreground?.replace('#','')||tokenColors.number.replace('#','')},{token:'property',foreground:tokenColors.string.replace('#','')},{token:'method',foreground:tokenColors.number.replace('#','')}], colors: monacoThemeColors(theme) });
    setEditorThemeName(name);
  }, [monaco, theme, themeConfig, tokenColors]);

  useEffect(() => {
    if (!monaco) return;
    const client = new OracleCompletionClient(new Worker(new URL('./oracleCompletionWorker.js', import.meta.url), { type: 'module' }), setCompletionError);
    completionClientRef.current = client;
    return () => { client.dispose(); completionClientRef.current = null; for (const source of definitionModelsRef.current.values()) source.model.dispose(); definitionModelsRef.current.clear(); };
  }, [monaco]);

  // What project usage examples in completion details are built from: the workspace and the current text of open editors.
  const usageSourcesRef = useRef(null);
  usageSourcesRef.current = () => ({ root: isNativeHost ? workspace.root || null : null, activePath: documents.active?.path || null, documents: [...documents.tabs.filter(tab => tab.id !== documents.activeId), { ...documents.active, content: documents.text }].map(tab => ({ path: tab?.path, content: tab?.content, dirty: tab?.dirty })) });
  useEffect(() => installLanguageProviders({
    activateTab, activeTabId, allSqlSnippets, completionAcceptanceRef, completionClientRef, completionMetadataRef, completionObjects,
    completionRecentRef, completionSchema, completionSession, completionSettings, definitionModelsRef, documents, editorRef,
    largeFileOverridesRef, manualSuggestionRef, metadataOriginTabId, monaco, openOracleDefinition, rememberLocation, requestSchemaDetails,
    sessionsRef, setActiveObject, setCompletionError, setPlscopeReport, setSchemaQuery, setSidebarOpen, settingsRef, suggestionLearningRef,
    suggestionScope, usageSourcesRef
  }), [monaco, completionSettings, completionObjects, completionSchema, completionSession.oracleVocabulary, allSqlSnippets, activeTabId, metadataOriginTabId,largeFileOverrides,settings.user['editor.semanticHighlighting']]);

  useEffect(() => scheduleDiagnostics({
    activeTabId, completionClientRef, documents, editorRef, largePolicy, monaco, updateTabSession
  }), [monaco, sql, activeTabId, completionSettings, completionObjects, completionSchema, completionSession.oracleVocabulary,largePolicy.diagnostics]);

  useEffect(() => {
    const model = editorRef.current?.getModel(); if (!monaco || !model) return;
    const items = [...(tabSession.compilationProblems || []), ...(tabSession.runtimeProblems || [])].filter(problem => problem.offset != null && problem.editorSnapshot === sql);
    monaco.editor.setModelMarkers(model, "fbsdb-runtime", items.map(problem => { const position = model.getPositionAt(problem.offset); return { message: problem.message, severity: problem.severity === "warning" ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error, startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: Math.min(position.column + 1, model.getLineMaxColumn(position.lineNumber)) }; }));
  }, [monaco, sql, activeTabId, tabSession.compilationProblems, tabSession.runtimeProblems]);

  function updateTokenColor(token, color) { setAllTokenColors((current) => ({ ...current, [theme]: { ...current[theme], [token]: color } })); }
  function editorIsReadonly() { return objectTabActive || !!documents.tabs.find(tab => tab.id === documents.activeId)?.readOnly; }
  function navigateProblem(problem) {
    return editorActions.navigateProblem({
      activateTab, closedTabsRef, completionMetadataRef, documents, editorRef, openOracleDefinition, rememberLocation, sessionsRef,
      setResultTab
    }, problem);
  }
  function rememberLocation(tabId=documents.activeId,position=editorRef.current?.getPosition()) { if(!navigatingRef.current&&position)navigationHistoryRef.current.push({tabId,...position}); }
  function navigateHistory(direction) {
    if(direction<0&&navigationHistoryRef.current.index===navigationHistoryRef.current.items.length-1)rememberLocation();
    const location=navigationHistoryRef.current.move(direction,item=>documents.tabs.some(tab=>tab.id===item.tabId));if(!location)return;
    navigatingRef.current=true;
    if(location.tabId!==documents.activeId)activateTab(location.tabId);
    requestAnimationFrame(()=>{editorRef.current?.setPosition(location);editorRef.current?.revealPositionInCenter(location);editorRef.current?.focus();navigatingRef.current=false});
  }
  function openBookmark(mark){
    bookmarkCursorRef.current=mark.id;setObjectTabActive(false);
    const tab=documents.tabs.find(tab=>tab.id===mark.documentId)||documents.tabs.find(tab=>mark.path&&pathKey(tab.path)===pathKey(mark.path));
    if(tab){if(documents.activeId!==tab.id)activateTab(tab.id);requestAnimationFrame(()=>{const editor=editorRef.current,position=editor?.getModel()?.validatePosition(mark);if(position){editor.setPosition(position);editor.revealPositionInCenter(position);editor.focus()}});return;}
    if(mark.path&&isNativeHost){pendingSearchPositionRef.current={path:mark.path,lineNumber:mark.lineNumber,column:mark.column};sendNativeCommand('file.openPath',{path:mark.path});return;}
    setRunState('This session-only bookmark source is no longer open.');
  }
  function navigateBookmark(direction){
    if(!bookmarks.items.length){setRunState('No bookmarks in this workspace.');return;}
    const index=bookmarks.items.findIndex(mark=>mark.id===bookmarkCursorRef.current),next=index<0?(direction>0?0:bookmarks.items.length-1):(index+direction+bookmarks.items.length)%bookmarks.items.length;openBookmark(bookmarks.items[next]);
  }
  function navigateEdit(direction) {
    const history=editLocationsRef.current,available=item=>documents.tabs.some(tab=>tab.id===item.tabId);
    const item=direction==='last'?history.last(available):history.move(direction,available);
    if(!item){setRunState('No further edit location is available.');return;}
    setObjectTabActive(false);if(documents.activeId!==item.tabId)activateTab(item.tabId);
    requestAnimationFrame(()=>jumpToOffset(Math.min(item.offset,editorRef.current?.getModel()?.getValueLength()||0)));
  }
  function returnToExecution() {
    return editorActions.returnToExecution({
      activateTab, documents, jumpToOffset, operations, rememberEditorPosition, setObjectTabActive, setRunState
    });
  }
  function jumpToOffset(offset) {const editor=editorRef.current;if(!editor?.getModel())return;rememberLocation();const position=editor.getModel().validatePosition(sourcePositionAt(documents.text,offset));editor.setPosition(position);editor.revealPositionInCenter(position);editor.focus();rememberLocation();}
  useEffect(()=>installEditorContextMenu({
    bindTypeFor, completionObjects, completionSchema, documents, editorIsReadonly, editorRef, monaco, openObjectContext, setEditorContext
  }),[monaco,activeTabId,completionObjects,completionSchema]);
  // Saved bind types live in the file's bind form definition; unsaved documents have no file key, so types stay read-only there.
  function bindTypeFor(bind,text) {
    if(!bind||!filePath)return 'VARCHAR2';
    return loadBindDefinitions(localStorage,filePath,getOracleBindNames(text)).find(item=>item.name===bind.name)?.type||'VARCHAR2';
  }
  function editorContextAction(action,context){
    return contextActions.editorContextAction({
      coachShortcut, documents, editorCommandRunners, editorRef, explainQuery, filePath, formatSql, monacoRef, runQuery, settings
    }, action, context);
  }
  function openObjectContext(event,item) {
    event.preventDefault();event.stopPropagation();
    const trigger=event.currentTarget,rect=trigger.getBoundingClientRect(),originTabId=metadataOriginTabId;
    const profileId=sessionsRef.current[originTabId]?.activeConnection?.id;
    if(!profileId||['No connection','Disconnected'].includes(profileId))return;
    setObjectMenu({cancellation:completionCancellation(),item:{...item,owner:item.owner||schemaOwner},trigger,x:event.type==='contextmenu'?event.clientX||rect.left:rect.left,y:event.type==='contextmenu'?event.clientY||rect.bottom:rect.bottom,editorTabId:documents.activeId,originTabId,profileId,epoch:completionMetadataRef.current.session(originTabId).epoch});
  }
  // Result values only navigate to objects already present in the loaded schema metadata.
  function showSmartObject({owner,name}) {
    const item=completionObjects.find(object=>(object.owner||schemaOwner)===owner&&object.name===name&&object.type);
    if(item)openExplorerObject(item,'Overview');
    else notifyFeedback({kind:'warning',title:'Oracle object',message:`${owner}.${name} is not in the loaded schema metadata. Refresh the explorer or check access.`,scope:documents.activeId});
  }
  function openExplorerObject(item,view='Overview',originTabId=metadataOriginTabId) {
    setDefinitionError('');
    const key=oracleSchemaKey(item),existing=objectTabs.find(tab=>tab.key===key&&tab.originTabId===originTabId),id=existing?.id||`oracle-object:${originTabId}:${key}`;
    setActiveObject(key);setObjectTabs(current=>existing?current.map(tab=>tab.id===id?{...tab,object:item,view}:tab):[...current,{id,key,object:item,originTabId,view}]);
    setActiveObjectTabId(id);setObjectTabActive(true);
    requestAnimationFrame(()=>document.querySelector('.oracle-object-inspector [aria-selected="true"]')?.focus());
    setRecentObjects(keys=>{const next=[key,...keys.filter(value=>value!==key)].slice(0,30);persistLocal(localStorage, 'fbsdb.recentObjects',JSON.stringify(next));return next});
    requestSchemaDetails(item,originTabId);inspectOracleObject(item,originTabId,view==='Related tables');
  }
  function openObjectSqlDraft(text,item,profileId,save=false) {
    setObjectTabActive(false);newSqlFileNow();
    const id=documents.activeId,name=(item.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,100)||'Object')+'.sql';

    setTabs(current=>current.map(tab=>tab.id===id?{...tab,name,content:text,dirty:true,connectionProfileId:profileId}:tab));
    const profile=dbConnectionsRef.current.find(item=>item.id.toLowerCase()===profileId?.toLowerCase());
    if(isNativeHost&&profile)beginConnection({...profile,tabId:id});
    if(save&&isNativeHost)documentSavesRef.current.start(sendNativeCommand,{id,path:null,name,content:text,dirty:true,connectionProfileId:profileId});
    else if(save){const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),0)}
  }
  function objectContextAction(action,context) {
    return contextActions.objectContextAction({
      closedTabsRef, completionMetadataRef, documents, inspectOracleObject, inspectorObject, objectTab, objectTabActive, openExplorerObject,
      openObjectSqlDraft, requestSchemaDetails, schemaObjects, sessionsRef, setObjectFavorites
    }, action, context);
  }
  async function inspectOracleObject(target,requestedOriginTabId=metadataOriginTabId,relationships=false) {
    objectAnalysisRequestRef.current?.cancel();const cancellation=completionCancellation();objectAnalysisRequestRef.current=cancellation;
    const originTabId=requestedOriginTabId,broker=completionMetadataRef.current,epoch=broker.session(originTabId).epoch;
    setObjectAnalysis({target,originTabId,loading:true});
    const editorTabId=documents.activeId;
    const [data,metadata]=await Promise.all([broker.load(originTabId,target,cancellation.token,'objectAnalysis'),relationships?broker.load(originTabId,target,cancellation.token,'metadata'):Promise.resolve(null)]);
    if(documents.activeId===editorTabId&&!cancellation.token.isCancellationRequested&&epoch===broker.session(originTabId).epoch)setObjectAnalysis({target,originTabId,data:data?{...data,relationships:metadata?.foreignKeys||[]}:null,loading:false});
  }
  async function openExplorerDefinition(target) {
    setDefinitionError('');
    const originTabId=metadataOriginTabId,broker=completionMetadataRef.current,epoch=broker.session(originTabId).epoch;
    const source=await broker.load(originTabId,target,undefined,'definition');
    if(source&&broker.session(originTabId).epoch===epoch&&!closedTabsRef.current.has(originTabId)&&documents.activeId===activeTabId)openOracleDefinition({...source,originTabId});
    else if(!source)setDefinitionError(broker.session(originTabId).lastError||'Oracle definition is unavailable for this object.');
  }
  // Coaches pointer/menu use only; hints are counted per action and can be dismissed for good.
  function coachShortcut(id,label,shortcut) {
    const hint=nextShortcutHint(globalThis.localStorage,{id,label,shortcut,enabled:resolveSetting(settings,'ui.shortcutCoach').value});
    if(!hint)return;const feedbackId=`shortcut-coach:${id}`;
    notifyFeedback({id:feedbackId,kind:'info',title:'Keyboard shortcut',message:hint.message,actions:[{label:"Don't show again",onClick:()=>{dismissShortcutHint(globalThis.localStorage,id);dismissFeedback(feedbackId)}}]});
  }
  function choosePaletteItem(item) {
    return contextActions.choosePaletteItem({
      activateTab, coachShortcut, dbConnections, insertHistorySql, inspectOracleObject, jumpToOffset, newSqlFileNow, objectTabs,
      openExplorerObject, openWorkspaceFile, setActiveObject, setActiveObjectTabId, setObjectTabActive, setSettingsFocus, setShowAppearance,
      switchConnection
    }, item);
  }
  useEffect(()=>{
    setDocumentOutline([]);if(!largePolicy.outline||!monaco||!completionClientRef.current)return;
    let cancelled=false;const source=sql,tabId=activeTabId;
    const timer=setTimeout(async()=>{const result=await completionClientRef.current?.request('outline',source,0);if(!cancelled&&tabId===documents.activeId&&documents.text===source)setDocumentOutline(result?.outline||[])},250);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[sql,activeTabId,monaco,completionSettings,completionObjects,completionSchema,completionSession.oracleVocabulary,allSqlSnippets,largePolicy.outline]);
  // Dropping a result cell inserts only a bind placeholder; the cell value is kept in memory for the next bind prompt and never written to the SQL or to disk.
  function attachBindDrop(editor) {
    return editorActions.attachBindDrop({
      bindPrefillRef, documents, editorIsReadonly, monacoRef
    }, editor);
  }
  function openOracleDefinition(source, selection) {
    return editorActions.openOracleDefinition({
      documents, editorRef, rememberEditorPosition, rememberLocation, setObjectDefinition
    }, source, selection);
  }
  useEffect(()=>{
    if(recovery)return;
    const save=()=>{if(!windowClosingRef.current)persistLocal(localStorage, windowDraftKey(hostWindow.id),JSON.stringify(draftSnapshot(documents.tabs,documents.activeId)))};
    const timer=setTimeout(save,700);window.addEventListener('pagehide',save);
    return()=>{clearTimeout(timer);window.removeEventListener('pagehide',save)};
  },[tabs,sql,fileDirty,filePath,fileConnectionProfileId,activeTabId,recovery]);
  function restoreDrafts(files,reconnect) {
    const restored=files.map(file=>({...file,id:`recovered-${crypto.randomUUID()}`})),selectedIndex=files.findIndex(file=>file.id===recovery.activeTabId),active=restored[Math.max(0,selectedIndex)];
    const live=documents.tabs.filter(tab=>tab.dirty||tab.path||tab.content.trim());
    documents.replace([...live,...restored], active.id);setNativeTabId(active.id);
    setRecovery(null);if(isNativeHost)sendNativeCommand('file.activate',{tabId:active.id,path:active.path});
    if(reconnect&&active.connectionProfileId){const profile=dbConnectionsRef.current.find(item=>item.id===active.connectionProfileId);if(profile)beginConnection({...profile,tabId:active.id});}
  }
  function worksetSnapshot(){
    const root=workspace.root;if(!root)return {files:[]};
    const inside=path=>pathKey(path).startsWith(pathKey(root)+'/');
    const files=[...new Map(documents.tabs.filter(tab=>tab.path&&!tab.readOnly&&inside(tab.path)).map(tab=>{const position=tab.id===documents.activeId?editorRef.current?.getPosition():editorPositionsRef.current.get(tab.id);return [pathKey(tab.path),{path:tab.path.slice(root.replace(/[\\/]$/,'').length+1).replace(/\\/g,'/'),line:position?.lineNumber||1,column:position?.column||1}]})).values()];
    return {files,activePath:documents.active?.path&&inside(documents.active.path)?documents.active.path.slice(root.length+1).replace(/\\/g,'/'):null};
  }
  function openWorkset(message){
    if(pathKey(message.root)!==pathKey(workspace.root))return;rememberEditorPosition();
    const current=documents.tabs,ordered=[];
    for(const file of message.files||[]){const existing=current.find(tab=>pathKey(tab.path)===pathKey(file.path));const tab=existing||{id:`file:${crypto.randomUUID()}`,name:file.fileName,path:file.path,content:file.content,dirty:false,connectionProfileId:file.profileId??null,restoreConnectionOnActivate:!!file.profileId,diskVersion:file.diskVersion};ordered.push(tab);editorPositionsRef.current.set(tab.id,{lineNumber:file.line,column:file.column});if(!existing)sendNativeCommand('file.activate',{path:tab.path,tabId:tab.id})}
    if(!ordered.length)return;const ids=new Set(ordered.map(tab=>tab.id)),next=[...current.filter(tab=>!ids.has(tab.id)),...ordered];setTabs(next);setObjectTabActive(false);
    const wanted=message.workset.activePath?pathKey(message.root+'/'+message.workset.activePath):null;const active=ordered.find(tab=>pathKey(tab.path)===wanted)||ordered[0];activateTab(active.id);const source=message.files.find(file=>pathKey(file.path)===pathKey(active.path));requestAnimationFrame(()=>{const position={lineNumber:source.line,column:source.column};editorRef.current?.setPosition(position);editorRef.current?.revealPositionInCenterIfOutsideViewport(position)});
  }
  function resolveExternalFile(reload) {
    const tab = documents.active, change = tab?.externalChange;
    if (!change || change.error || reload && change.missing) return;
    documents.dispatch({ type: 'resolveExternal', id: tab.id, reload });
    if (!reload && change.missing) sendNativeCommand('file.activate', { path: null, tabId: tab.id });
  }
  function rememberEditorPosition() {
    if (documents.activeId && editorRef.current?.getPosition()) editorPositionsRef.current.set(documents.activeId, editorRef.current.getPosition());
  }
  function openSqlFileNow() { if (isNativeHost) sendNativeCommand("file.open"); else openFileInputRef.current?.click(); }
  function openSqlFile() { rememberEditorPosition(); openSqlFileNow(); }
  function openWorkspace() {setShowOpenWorkspace(true);}
  // Companion bind forms are shared through the workspace: load once per file so the form is ready on first use; nothing runs.
  const bindFormRequested=useRef(new Set());
  useEffect(()=>{if(isNativeHost&&workspace.root&&filePath&&!bindFormRequested.current.has(filePath)){bindFormRequested.current.add(filePath);sendNativeCommand('workspace.binds.load',{path:filePath})}},[filePath,workspace.root]);
  // Single clicks in the Explorer reuse one clean preview tab; editing, double-click or an explicit open keeps the file.
  const [previewTabId, setPreviewTabId] = useState(null), previewPathRef = useRef(null), previewTabRef = useRef(null), closeTabRef = useRef(null);
  previewTabRef.current = previewTabId; closeTabRef.current = closeTab;
  useEffect(() => { const settled = settlePreview(previewTabId, documents.tabs); if (settled !== previewTabId) setPreviewTabId(settled); }, [documents.tabs, previewTabId]);
  function promotePreview(file) { const tab = documents.tabs.find(item => item.path && pathKey(item.path) === pathKey(file.path)); if (tab && tab.id === previewTabId) setPreviewTabId(null); }
  function openWorkspaceFile(file, options = {}) {
    const plan = previewOpenPlan({ previewId: previewTabId, tabs: documents.tabs }, file, { preview: Boolean(options.preview) && !file.newTab, enabled: resolveSetting(settings, 'ui.previewTabs').value });
    if (plan.type === 'open' && plan.asPreview) previewPathRef.current = file.path; else previewPathRef.current = null;
    if (plan.type === 'activate' && plan.promote) setPreviewTabId(null);
    return openWorkspaceFileNow(file);
  }
  function openWorkspaceFileNow(file) { const cached = documents.tabs.find((tab) => pathKey(tab.path) === pathKey(file.path)); if (cached && !file.newTab) { activateTab(cached.id); return; } rememberEditorPosition(); if (isNativeHost) sendNativeCommand("file.openPath", { path: file.path, forceNew:!!file.newTab }); else openSqlFileNow(); }
  function activateTab(id, remember = true) { if (remember) { rememberLocation(); rememberEditorPosition(); } const tab = documents.tabs.find((item) => item.id === id); if (!tab) return; const restorePosition=editorPositionsRef.current.get(id); setNativeTabId(tab.metadataOriginTabId || id); documents.activate(id); schemaLookupRef.current = makeOracleRelationLookup(sessionsRef.current[id]?.schemaObjects || [], sessionsRef.current[id]?.schemaOwner); schemaReadyRef.current = Boolean(sessionsRef.current[id]?.schemaReady); schemaLoadedRef.current.clear(); schemaRequestedRef.current.clear(); if (isNativeHost && !tab.readOnly) sendNativeCommand("file.activate", { path: tab.path, tabId: id }); queueSchemaForSql(tab.content);
    if(isNativeHost&&tab.restoreConnectionOnActivate){
      setTabs(current=>current.map(item=>item.id===id?{...item,restoreConnectionOnActivate:false}:item));
      const profile=dbConnectionsRef.current.find(item=>item.id.toLowerCase()===tab.connectionProfileId?.toLowerCase());
      if(profile)beginConnection({...profile,tabId:id});
    }
    requestAnimationFrame(() => {const position=restorePosition;if(position){editorRef.current?.setPosition(position);editorRef.current?.revealPositionInCenterIfOutsideViewport(position)}editorRef.current?.focus();rememberLocation(id)}); }
  function cycleSqlTab(direction) { const items = documents.tabs; if (items.length < 2) return; const index = items.findIndex(item => item.id === documents.activeId); activateTab(items[(index + direction + items.length) % items.length].id); }
  function openIdentifierCase() {
    const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection();
    if(!model||activeTabReadonly)return;
    if(!selection||selection.isEmpty()){notifyFeedback({kind:'warning',title:'Convert identifier case',message:'Select the identifiers to convert.',scope:documents.activeId});return}
    setIdentifierCase({tabId:documents.activeId,model,version:model.getVersionId(),source:model.getValue(),range:{start:model.getOffsetAt(selection.getStartPosition()),end:model.getOffsetAt(selection.getEndPosition())},dictionary:workspace.root?projectOptions(workspace.projectRules).dictionary:null});
  }
  function openLocalRename(){
    const editor=editorRef.current,model=editor?.getModel(),position=editor?.getPosition();
    if(!model||!position||editorIsReadonly())return;
    setLocalRename({tabId:documents.activeId,model,version:model.getVersionId(),source:model.getValue(),cursor:Math.min(model.getValueLength(),model.getOffsetAt(position)+1),options:{objects:schemaObjects,currentSchema:schemaOwner}});
  }
  function openChangeSignature(){
    const editor=editorRef.current,model=editor?.getModel(),position=editor?.getPosition();
    if(!model||!position||editorIsReadonly())return;
    setChangeSignature({tabId:documents.activeId,model,version:model.getVersionId(),source:model.getValue(),cursor:Math.min(model.getValueLength(),model.getOffsetAt(position)+1)});
  }
  function openExtractProcedure(){
    const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection();
    if(!model||!selection||selection.isEmpty()||editorIsReadonly()){notifyFeedback({kind:'warning',title:'Extract Procedure',message:'Select complete PL/SQL assignment statements first.',scope:documents.activeId});return}
    setExtractProcedure({tabId:documents.activeId,model,version:model.getVersionId(),source:model.getValue(),start:model.getOffsetAt(selection.getStartPosition()),end:model.getOffsetAt(selection.getEndPosition())});
  }
  function moveStatement(direction){
    const editor=editorRef.current,model=editor?.getModel(),position=editor?.getPosition();if(!model||!position||editorIsReadonly())return;
    const plan=planStatementMove(model.getValue(),model.getOffsetAt(position),direction);
    if(plan.error){notifyFeedback({kind:'warning',title:'Move statement',message:plan.error,scope:documents.activeId});return false}
    const from=model.getPositionAt(plan.edit.start),to=model.getPositionAt(plan.edit.end);
    editor.pushUndoStop();editor.executeEdits('move-statement',[{range:new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column),text:plan.edit.after}]);editor.pushUndoStop();editor.focus();
    return true;
  }
  function openEmbeddedSql(){
    const editor=editorRef.current,model=editor?.getModel(),position=editor?.getPosition();if(!model||!position||editorIsReadonly())return;
    const source=model.getValue(),context=embeddedSqlAt(source,model.getOffsetAt(position));
    setEmbeddedSql({tabId:documents.activeId,model,version:model.getVersionId(),source,context});
  }
  function openQuickFix(){
    const editor=editorRef.current,model=editor?.getModel(),position=editor?.getPosition();
    if(!model||!position||editorIsReadonly())return;
    const source=model.getValue(),cursor=model.getOffsetAt(position),fixes=contextualQuickFixes(source,cursor,allProblems.filter(problem=>problem.tabId===documents.activeId));
    setQuickFix({tabId:documents.activeId,model,version:model.getVersionId(),source,fixes});
  }
  quickFixRef.current=openQuickFix;
  async function reviewDeleteImpact(){
    const editor=editorRef.current,model=editor?.getModel(),position=editor?.getPosition(),tabId=documents.activeId,version=model?.getVersionId();
    if(!model||!position||!workspace.root||!isNativeHost){notifyFeedback({kind:'warning',title:'Delete review',message:'Open a workspace in the desktop app to inspect project references.',scope:tabId});return}
    const source=model.getValue(),cursor=Math.min(source.length,model.getOffsetAt(position)+1),{deleteImpactSeed}=await import('./deleteImpact.js');
    if(documents.activeId!==tabId||editor.getModel()!==model||model.getVersionId()!==version)return;
    const impact=deleteImpactSeed(source,cursor,{objects:schemaObjects,currentSchema:schemaOwner});
    if(impact.error){notifyFeedback({kind:'warning',title:'Delete review',message:impact.error,scope:tabId});return}
    setDeleteReview(impact);setWorkspaceSearchScope(null);setSearchQuery(impact.name);setShowSearch(true);
  }
  function pasteColumnCursors() {
    return editorActions.pasteColumnCursors({
      documents, editorIsReadonly, editorRef, monacoRef
    });
  }
  // Wraps whole selected lines with a snippet so Tab moves through the placeholders.
  function openSurroundMenu(x,y,trigger) {
    const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection();
    if(!model||activeTabReadonly)return;
    if(!selection||selection.isEmpty()){notifyFeedback({kind:'warning',title:'Surround with',message:'Select the code to wrap.',scope:documents.activeId});return}
    const lines=new monacoRef.current.Range(selection.startLineNumber,1,selection.endColumn===1&&selection.endLineNumber>selection.startLineNumber?selection.endLineNumber-1:selection.endLineNumber,Number.MAX_SAFE_INTEGER),range=model.validateRange(lines),options=surroundOptions(model.getValueInRange(range));
    if(!options.length)return;
    setSurroundMenu({tabId:documents.activeId,model,version:model.getVersionId(),selection:range,trigger,x,y,options});
  }
  const pasteAsOptions=[{id:'paste:in',label:'IN list from copied values'},{id:'paste:json',label:'JSON_TABLE draft from copied JSON'},{id:'paste:insert',label:'INSERT template from copied column names'}];
  function openPasteAsMenu(x,y,trigger) {
    const editor=editorRef.current,model=editor?.getModel();if(!model||activeTabReadonly)return;
    setSurroundMenu({tabId:documents.activeId,model,version:model.getVersionId(),selection:editor.getSelection(),trigger,x,y,paste:true,options:pasteAsOptions});
  }
  // Converted clipboard text replaces the selection as one undoable edit; it is never executed.
  async function applyPasteAs(action,context) {
    const editor=editorRef.current,model=context.model;
    const text=await navigator.clipboard.readText();
    if(documents.activeId!==context.tabId||editor.getModel()!==model||model.isDisposed()||model.getVersionId()!==context.version)throw Error('The editor changed. Choose Paste as again.');
    const result=action==='paste:in'?inListSql(text):action==='paste:json'?jsonTableSql(text):insertTemplateSql(text);
    if(result.error)throw Error(result.error);
    const sqlText=result.sql.replace(/\n/g,model.getEOL());
    editor.setSelection(context.selection);editor.focus();editor.pushUndoStop();editor.executeEdits('paste-as',[{range:context.selection,text:sqlText,forceMoveMarkers:true}]);editor.pushUndoStop();
  }
  function applySurround(action,context) {
    if(action.startsWith('paste:'))return applyPasteAs(action,context);
    const editor=editorRef.current,model=context.model,id=action.replace(/^surround:/,'');
    if(documents.activeId!==context.tabId||editor.getModel()!==model||model.isDisposed()||model.getVersionId()!==context.version)throw Error('The editor changed. Choose Surround with again.');
    const modelOptions=model.getOptions(),indent=modelOptions.insertSpaces?' '.repeat(modelOptions.indentSize||modelOptions.tabSize||2):'	';
    editor.setSelection(context.selection);editor.focus();
    editor.getContribution('snippetController2').insert(surroundSnippet(id,model.getValueInRange(context.selection),{indent,newline:model.getEOL()}),{adjustWhitespace:false,undoStopBefore:true,undoStopAfter:true});
  }
  function applyIdentifierCase(plan) {
    const editor=editorRef.current,request=identifierCase,model=request?.model;
    if(!model||model.isDisposed()||documents.activeId!==request.tabId||editor.getModel()!==model||model.getVersionId()!==request.version)throw Error('The editor changed after the preview. Close and convert again.');
    editor.pushUndoStop();
    editor.executeEdits('identifier-case',plan.edits.map(edit=>{const from=model.getPositionAt(edit.start),to=model.getPositionAt(edit.end);return {range:new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column),text:edit.text}}));
    editor.pushUndoStop();setIdentifierCase(null);editor.focus();
  }
  function applyLocalRename(plan){
    const editor=editorRef.current,request=localRename,model=request?.model;
    if(!plan?.edits?.length||!model||model.isDisposed()||documents.activeId!==request.tabId||editor.getModel()!==model||model.getVersionId()!==request.version)throw Error('The editor changed after the preview. Close and rename again.');
    editor.pushUndoStop();editor.executeEdits('rename-local',plan.edits.map(edit=>{const from=model.getPositionAt(edit.start),to=model.getPositionAt(edit.end);return {range:new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column),text:edit.after}}));editor.pushUndoStop();setLocalRename(null);editor.focus();
  }
  function applyChangeSignature(plan){
    const editor=editorRef.current,request=changeSignature,model=request?.model;
    if(!plan?.edits?.length||!model||model.isDisposed()||documents.activeId!==request.tabId||editor.getModel()!==model||model.getVersionId()!==request.version||model.getValue()!==request.source)throw Error('The editor changed after the preview. Reopen Change Signature.');
    editor.pushUndoStop();editor.executeEdits('change-signature',plan.edits.map(edit=>{const from=model.getPositionAt(edit.start),to=model.getPositionAt(edit.end);return {range:new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column),text:edit.after}}));editor.pushUndoStop();setChangeSignature(null);editor.focus();
  }
  function applyExtractProcedure(plan){
    const editor=editorRef.current,request=extractProcedure,model=request?.model;
    if(!plan?.edits?.length||!model||model.isDisposed()||documents.activeId!==request.tabId||editor.getModel()!==model||model.getVersionId()!==request.version||model.getValue()!==request.source)throw Error('The editor changed after the preview. Reopen Extract Procedure.');
    editor.pushUndoStop();editor.executeEdits('extract-procedure',plan.edits.map(edit=>{const from=model.getPositionAt(edit.start),to=model.getPositionAt(edit.end);return {range:new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column),text:edit.after}}));editor.pushUndoStop();setExtractProcedure(null);editor.focus();
  }
  function applyEmbeddedSql(plan){
    const editor=editorRef.current,request=embeddedSql,model=request?.model;
    if(!plan?.edit||!model||model.isDisposed()||documents.activeId!==request.tabId||editor.getModel()!==model||model.getVersionId()!==request.version||model.getValue()!==request.source)throw Error('The editor changed after the preview. Reopen embedded SQL.');
    const edit=plan.edit,from=model.getPositionAt(edit.start),to=model.getPositionAt(edit.end);
    editor.pushUndoStop();editor.executeEdits('embedded-sql',[{range:new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column),text:edit.after}]);editor.pushUndoStop();setEmbeddedSql(null);editor.focus();
  }
  function applyQuickFix(fix){
    const editor=editorRef.current,request=quickFix,model=request?.model;
    if(!fix?.edits?.length||!model||model.isDisposed()||documents.activeId!==request.tabId||editor.getModel()!==model||model.getVersionId()!==request.version||model.getValue()!==request.source)throw Error('The editor changed after the preview. Reopen Quick fixes.');
    editor.pushUndoStop();editor.executeEdits('quick-fix',fix.edits.map(edit=>{const from=model.getPositionAt(edit.start),to=model.getPositionAt(edit.end);return {range:new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column),text:edit.text}}));editor.pushUndoStop();setQuickFix(null);editor.focus();
  }
  function switchPackageSource() {
    const result = relatedPackageDocument(documents.active || {}, documents.tabs, {root: workspace.root, sessions: sessionsRef.current,rules:workspace.projectRules});
    if (result.target) activateTab(result.target.id);
    else if (isNativeHost && workspace.root && ['PACKAGE','PACKAGE BODY'].includes(describeOracleSource(documents.active || {},workspace.projectRules).declaration?.type)) setRelatedSources({root:workspace.root,document:documents.active});
  }
  function reviewSourceForCompilation(statement, target) {
    const document=documents.active,session=sessionsRef.current[document?.id]||{};
    if(!document||document.readOnly||objectTabActive||session.executing||session.fetchingPage||session.scriptRun?.running)return;
    if(!isNativeHost||!session.activeConnection||['No connection','Disconnected'].includes(session.activeConnection.id)){setShowPicker(true);return;}
    const prepared=prepareSourceCompilation(typeof statement==='string'?{...document,content:statement}:document,workspace.projectRules);
    if(prepared.error){setRunState(prepared.error);return;}
    setSourceCompile({document:{...document},prepared,statementOffset:typeof statement==='string'?target?.start??null:0,tabId:document.id,profileId:session.activeConnection.id});
  }
  function reviewPausedScript(owner) {
    const run=operations.scripts.get(owner),waiting=run?.awaitingSourceReview,document=documents.tabs.find(tab=>tab.id===owner);
    if(!waiting||!document)return;
    if(documents.activeId!==owner)activateTab(owner);
    const prepared={sql:waiting.sql,original:waiting.sql};
    setSourceCompile({document:{...document,content:run.source},prepared,statementOffset:waiting.offset,tabId:owner,profileId:waiting.profileId,generation:waiting.generation,scriptRequestId:run.requestId,scriptIndex:waiting.index,reviewNonce:waiting.reviewNonce});
  }
  useEffect(()=>{
    if(tabSession.scriptRun?.awaitingSourceReview)reviewPausedScript(activeTabId);
  },[activeTabId,tabSession.scriptRun?.awaitingSourceReview?.reviewNonce]);
  function openRunConfigurations() {
    let source=objectTabActive?{name:'',content:''}:documents.active;if(!source)return;
    const origin=objectTabActive&&objectTab?objectTab.originTabId:source.metadataOriginTabId||source.id;setObjectTabActive(false);
    if(describeOracleSource(source,workspace.projectRules).declaration?.type==='PACKAGE BODY')source=relatedPackageDocument(source,documents.tabs,{root:workspace.root,sessions:sessionsRef.current,rules:workspace.projectRules}).target||source;
    const generated=sourceRunConfigurations(source,workspace.projectRules,sessionsRef.current[origin]?.schemaOwner||'');
    if(documents.activeId!==origin)activateTab(origin);
    if(documents.active?.readOnly)return;
    setRunConfigurations({root:workspace.root,tabId:origin,signatures:generated.configurations,signatureErrors:generated.errors});
  }
  function newSqlFileNow(content = "", extra = {}) {
    const id = `new-${crypto.randomUUID()}`;
    rememberEditorPosition();
    documents.open({ id, name: nextQueryName(documents.tabs), path: null, content, dirty: Boolean(content), connectionProfileId: null, ...extra });
    setNativeTabId(id);
    if (isNativeHost) sendNativeCommand("file.new", { tabId: id });
    schemaReadyRef.current = false; schemaLookupRef.current = new Map(); schemaLoadedRef.current.clear(); schemaRequestedRef.current.clear();
    requestAnimationFrame(() => editorRef.current?.focus());
  }
  function applyProjectRunDefaults() {
    if(editorIsReadonly()||executing||fetchingPage||tabSession.scriptRun?.running)return;
    const defaults=projectOptions(workspace.projectRules).run;setQueryTimeout(defaults.timeoutSeconds);setMaxRows(defaults.pageSize);setRunState('Project run defaults applied; SQL has not been executed.');
  }
  function newProjectSqlFile() {
    setObjectTabActive(false);newSqlFileNow();
    const options=projectOptions(workspace.projectRules);setQueryTimeout(options.run.timeoutSeconds);updateTabSession('pageSizePreference',options.run.pageSize,documents.activeId);
    const profile=dbConnectionsRef.current.find(item=>item.id.toLowerCase()===options.defaultConnectionId?.toLowerCase());
    if(options.defaultConnectionId)documents.patch(documents.activeId,{connectionProfileId:options.defaultConnectionId});
    if(profile&&profile.available!==false){beginConnection({...profile,tabId:documents.activeId})}
    else setRunState(options.defaultConnectionId?'The project default profile is unavailable. Choose a saved connection.':'Project SQL file created; choose its connection.');
  }
  function newScratchFile() { setObjectTabActive(false); setActiveObject(''); newSqlFileFromLastConnection({ name: nextScratchName(documents.tabs), scratch: true }); }
  function promoteScratch(id) { if (documents.activeId !== id) activateTab(id); setObjectTabActive(false); saveSqlFile(); }
  function newSqlFileFromLastConnection(extra = {}) { const current = activeConnectionRef.current; const profile = dbConnectionsRef.current.find(item => item.id === (current && !['No connection', 'Disconnected'].includes(current.id) ? current.id : null)); newSqlFileNow("", extra); if (profile) { if (isNativeHost) beginConnection({ ...profile, tabId: documents.activeId }); else { setActiveConnection(profile); setTabs(tabs => tabs.map(tab => tab.id === documents.activeId ? { ...tab, connectionProfileId: profile.id } : tab)); } } }
  function closeTab(id, onClosed = null) {
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
  function closeTabs(ids) {
    return tabActions.closeTabs({
      activateTab, batchDiscardRef, closeTab, documents, saveSqlFile, setBatchClose, setObjectTabActive
    }, ids);
  }
  function newSqlFile() { newSqlFileFromLastConnection(); }
  function newSqlFileOnProfile(profileId) {
    setObjectTabActive(false);newSqlFileNow();
    const profile=dbConnectionsRef.current.find(item=>item.id===profileId);
    if(!profile)return;
    if(isNativeHost)beginConnection({...profile,tabId:documents.activeId});
    else{setActiveConnection(profile);setTabs(tabs=>tabs.map(tab=>tab.id===documents.activeId?{...tab,connectionProfileId:profile.id}:tab))}
  }
  // Starter text never runs; the current connection is reused like the main New action.
  function newSqlFileFromTemplate(templateId) {
    const template=newQueryTemplates.find(item=>item.id===templateId);if(!template)return;
    const current=activeConnectionRef.current,profile=dbConnectionsRef.current.find(item=>item.id===(current&&!['No connection','Disconnected'].includes(current.id)?current.id:null));
    setObjectTabActive(false);newSqlFileNow(template.content);
    if(profile){if(isNativeHost)beginConnection({...profile,tabId:documents.activeId});else{setActiveConnection(profile);setTabs(tabs=>tabs.map(tab=>tab.id===documents.activeId?{...tab,connectionProfileId:profile.id}:tab))}}
  }
  function saveSqlFile(afterSave = null) {
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




  const guardDrafts = (info, run) => { const count = countTabDrafts(info.tabId); if (!count || draftsConfirmedRef.current.has(`${info.tabId}:${info.reason}`)) return false; setDraftGuard({ ...info, count, transaction: Boolean(sessionsRef.current[info.tabId]?.transactionPending), run: () => { draftsConfirmedRef.current.add(`${info.tabId}:${info.reason}`); run(); draftsConfirmedRef.current.delete(`${info.tabId}:${info.reason}`); } }); return true; };
  const { connectInBackground, beginConnection, switchConnection, disconnectActiveConnection, submitConnectionCredentials, finishTransaction } = useConnectionLifecycle({ guardDrafts, connectionLost:!!tabSession.connectionLost, documents, pendingConnectionsRef, updateTabSession, setConnecting, setConnectionError, setAuthProfile, editorIsReadonly, setManagementError, setShowPicker, activeConnection, transactionPending, setPendingSwitch, setActiveConnection, setRunState, authProfile, authTestRequestRef, pendingSwitch });
  function previewConnectionOrganization(payload){const next=changeConnectionOrganization(connectionOrg,payload,dbConnections);setConnectionOrg(next);setDbConnections(current=>organizedProfiles(current,next).map(p=>({...p,group:p.groups[0]||''})))}
  function connectionContextAction(action,context){
    return contextActions.connectionContextAction({
      beginConnection, disconnectActiveConnection, documents, newSqlFileNow, setConnectionRename, setFavorites, setProfileEditor,
      switchConnection
    }, action, context);
  }



  function resultExportData(overrideOptions) {
    const state=(resultTab==='Results'&&view.selectedResultKey?view.resultSets?.find(item=>item.key===view.selectedResultKey)?.view:view[resultTab==='Explain'?'planView':'queryView'])||{};
    const options=overrideOptions||state.options||{};const data=deriveResultData(sqlResult?.rows||[],sqlResult?.columns||[],options.derivedColumns||[]);
    return {columns:data.columns,rows:applyResultFeatures(getVisibleResultRows(data.rows,data.columns,resultTab==='Results'?resultFilter:'',state.sortColumn??-1,state.sortDirection||'asc',state.rowOrder||[],options),data.columns,options).map(item=>item.row),settings:options.exportSettings||{}};
  }
  function resultExportRows(){return resultExportData().rows;}
  function resultExportColumns(){return resultExportData().columns;}
  function exportResultsCsv() {
    if (!sqlResult?.columns?.length) return;
    const data=resultExportData();
    if(isNativeHost){updateTabResult('streamState',{busy:true,message:'Choose CSV destination…'});sendNativeCommand('result.export',{format:'csv',columns:data.columns,rows:data.rows,hasMore:false,csvOptions:data.settings,fileName:'results.csv'});return;}
    const blob=new Blob([(data.settings.bom?'\uFEFF':''),csvText(data.rows,data.columns,data.settings)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='results.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
  }
  function exportResultsJson() {
    if (!sqlResult?.columns?.length) return;
    const used = new Map();
    const names = resultExportColumns().map((column, index) => {
      const base = String(column.name || `COLUMN_${index + 1}`), key = base.toUpperCase();
      const count = (used.get(key) ?? 0) + 1; used.set(key, count);
      return count === 1 ? base : `${base}_${count}`;
    });
    const rows = resultExportRows().map((row) => Object.fromEntries(names.map((name, index) => [name, row[index] ?? null])));
    const blob = new Blob([`${JSON.stringify(rows, null, 2)}\n`], { type: "application/json;charset=utf-8" }), url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = `${(fileName || "query").replace(/\.sql$/i, "")}-results.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function exportResultsInsertSql() {
    return resultExports.exportResultsInsertSql({
      fileName, resultExportColumns, resultExportRows, sqlResult
    });
  }
  async function copyResultsTsv() {
    if (!sqlResult?.columns?.length) return;
    const cell = (value) => { const text = String(value ?? ""); return /[\t\r\n"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
    const lines = [resultExportColumns().map((column) => cell(column.name)).join("\t"), ...resultExportRows().map((row) => row.map(cell).join("\t"))];
    try { await navigator.clipboard.writeText(lines.join("\r\n")); setCopiedResults(true); setTimeout(() => setCopiedResults(false), 1600); }
    catch { setRunState("Clipboard access failed. Export the fetched rows as CSV instead."); }
  }
  function requestSchemaDetails(item,originTabId=metadataOriginTabId,force=false) { const key = oracleSchemaKey(item).toLowerCase(); if(force){schemaLoadedRef.current.delete(key);schemaRequestedRef.current.delete(key)} if (!isNativeHost || schemaLoadedRef.current.has(key) || schemaRequestedRef.current.has(key)) return; schemaRequestedRef.current.add(key); sendNativeCommand("schema.objectDetails", { tabId:originTabId, owner: item.owner, name: item.name, objectType: item.type }); }
  function refreshSchema(owner = documents.activeId) { if (schemaRequestRef.current) sendNativeCommand('schema.cancel', { requestId: schemaRequestRef.current, tabId: owner }); const id = sendNativeCommand("schema.refresh", { tabId: owner }); schemaRequestRef.current = id || null; return id; }
  function insertEditorText(text) { const editor = editorRef.current; if (!editor || editorIsReadonly()) return; editor.executeEdits("schema-explorer", [{ range: editor.getSelection(), text, forceMoveMarkers: true }]); editor.focus(); setFileDirty(true); }
  function startSchemaDrag(event,item,column=null){
    if(!isOracleRelation(item)||!event.dataTransfer)return;
    event.dataTransfer.setData('application/x-fbsdb-schema',JSON.stringify({key:oracleSchemaKey(item),column,tabId:metadataOriginTabId}));
    event.dataTransfer.effectAllowed='copy';
  }
  function dropSchemaInEditor(event){
    return editorActions.dropSchemaInEditor({
      editorIsReadonly, editorRef, metadataOriginTabId, monacoRef, schemaObjects, setFileDirty
    }, event);
  }
  function handleEditorChange(value) { if (controlledEditorUpdateRef.current||editorIsReadonly()) return; documents.edit(value ?? ""); queueSchemaForSql(documents.text); }
  function formatSql() {
    return editorActions.formatSql({
      codeStyle, completionClientRef, documents, editorIsReadonly, editorRef, setFileDirty, setRunState, settingsRef
    });
  }
  formatterRef.current = formatSql;

  function installRunGutter(editor, monacoInstance) {
    return editorActions.installRunGutter({
      documents, editorIsReadonly, executionSummaries, largeFileOverridesRef, runQueryRef, setResultTab, updateLayout
    }, editor, monacoInstance);
  }
  function beginReadOnlyAnalysis() {
    if(!isNativeHost||executing||connecting||transactionPending||fetchingPage||view.streamState?.busy)return;
    const invalidate=result=>result?{...result,hasMore:false,cursorUnavailable:result.hasMore||result.cursorUnavailable}:result;
    setQueryResult(invalidate);updateTabResult('resultSets',sets=>(sets||[]).map(item=>({...item,result:invalidate(item.result)})));
    sendNativeCommand('analysis.begin');
  }
  function showRuntimePlan() {
    if(!queryResult?.sqlId||executing)return;
    updateTabSession('sqlStage','Loading cursor plan');updateTabSession('operationStartedAt',Date.now());setExecutionKind('runtimePlan');setExecuting(true);setExplainMessage('');setResultTab('Explain');
    sendNativeCommand('sql.runtimePlan',{sqlId:queryResult.sqlId});
  }
  function workspaceDevelopmentCommand(command,payload={}) {const id=sendNativeCommand(command,{root:workspace.root,...payload});workspaceDevRequestsRef.current.set(command,id);setWorkspaceDev(current=>({...current,busy:true,error:''}));}
  useEffect(()=>{workspaceDevRequestsRef.current.clear();setWorkspaceDev({});setWorkspaceSearchScope(null);setWorkspaceReplaceScope(null);setWorkspaceDevMode(null);setShowWorksets(false);searchRequestRef.current=null;if(workspace.root&&isNativeHost)refreshWorkspaceGit();},[workspace.root]);
  function refreshWorkspaceGit() {if(isNativeHost)workspaceDevelopmentCommand('workspace.git');}
  function openWorkspaceDevelopment(mode,scope=null) {setWorkspaceReplaceScope(scope);setWorkspaceDev(current=>({...current,preview:null,applied:null}));setWorkspaceDevMode(mode);if(mode==='git')refreshWorkspaceGit();}
  function unsavedWorkspacePaths() {return documents.tabs.filter(tab=>tab.dirty&&tab.path).map(tab=>tab.path);}
  function previewWorkspaceReplace(search,replacement,caseSensitive){setWorkspaceDev(current=>({...current,preview:null,applied:null}));workspaceDevelopmentCommand('workspace.replacePreview',{search,replacement,caseSensitive,scope:workspaceReplaceScope,excluded:unsavedWorkspacePaths()});}
  function applyWorkspaceReplace(selected){if(!workspaceDev.preview)return;workspaceDevelopmentCommand('workspace.replaceApply',{previewId:workspaceDev.preview.id,selected,excluded:unsavedWorkspacePaths()});}
  function openScriptPreview() { if(editorIsReadonly())return; const tabId=documents.activeId,run=operations.scripts.get(tabId),source=describeOracleSource(documents.active||{},workspace.projectRules);if(!run?.running&&!prepareSourceCompilation(documents.active||{},workspace.projectRules).error){reviewSourceForCompilation();return;}if(!run?.running&&source.expectedType&&source.warning){setRunState(source.warning+' Review the source declaration before compiling.');return;}setScriptDialog({tabId,source:run?.running?run.source:documents.text}); }

  const executionFlashRef=useRef(null),executionFlashTimerRef=useRef(null);
  function flashExecutionTarget(target) {
    const editor=editorRef.current,model=editor?.getModel();
    if(!model||target?.start==null||target?.end==null)return;
    clearTimeout(executionFlashTimerRef.current);executionFlashRef.current?.clear();
    const start=model.getPositionAt(target.start),end=model.getPositionAt(target.end);
    const decorations=editor.createDecorationsCollection([{range:{startLineNumber:start.lineNumber,startColumn:start.column,endLineNumber:end.lineNumber,endColumn:end.column},options:{className:'sql-execution-target',isWholeLine:false,description:'SQL execution target'}}]);
    executionFlashRef.current=decorations;
    executionFlashTimerRef.current=setTimeout(()=>decorations.clear(),1600);
    updateTabSession('executionTarget',`${target.kind} · Ln ${start.lineNumber}–${end.lineNumber}`,documents.activeId);
  }
  useEffect(()=>{executionFlashRef.current?.clear();return()=>{clearTimeout(executionFlashTimerRef.current);executionFlashRef.current?.clear()}},[activeTabId]);



  function streamResultToFile(format="csv",overrideOptions) {
    updateTabSession('operationStartedAt',Date.now());
    if(!isNativeHost || !sqlResult?.columns?.length)return;
    updateTabResult('streamState',{busy:true,message:'Choose a CSV destination…'});
    sendNativeCommand('result.export',{format,csvOptions:resultExportData(overrideOptions).settings,resultId:sqlResult.resultId,columns:sqlResult.columns,rows:sqlResult.rows,hasMore:sqlResult.hasMore,fileName:(fileName||'query').replace(/\.sql$/i,'')+'-results.'+format});
  }
  function applyServerFilters(options) {
    if(view.streamState?.busy||executing||pageRequestRef.current)throw new Error('Wait for the active operation first.');
    const base=sqlResult?.serverFilter||{sql:sqlResult?.executedSql,parameters:sqlResult?.executedParameters||[]};
    const filtered=buildServerFilter(base.sql,sqlResult?.columns||[],options,base.parameters);
    executeStatement(filtered.sql,filtered.parameters,{serverFilter:{...base,ruleCount:options.filters?.length||0}});
  }
  function exportChosenColumns(format,indices,overrideOptions,displayData) {
    if(!sqlResult?.columns)return;
    const data=displayData||resultExportData(overrideOptions),{columns,rows}=projectDisplayExport(data,indices,overrideOptions);
    const settings=overrideOptions?.exportSettings||data.settings;
    if(format==='xlsx'||format==='csv.gz'||format==='csv') {updateTabResult('streamState',{busy:true,message:'Choose an export destination…'});sendNativeCommand('result.export',{format,columns,rows,hasMore:false,csvOptions:settings,includeMetadata:Boolean(settings.includeMetadata),fileName:(fileName||'query').replace(/\.sql$/i,'')+'-results.'+format});return;}
    const blob=new Blob([copyResultData(rows,columns,format,true)],{type:format==='json'?'application/json':'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='results.'+format;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
  }
  function requestPrimaryKey(target) {sendNativeCommand('result.primaryKey',target);}
  function openChildRecords(column,rowValues) {sendNativeCommand('result.children',{column,rowValues});}
  function openRelatedRecords(column,value,rowValues) {
    relatedRunRequestsRef.current.add(sendNativeCommand('result.related',{column,value,rowValues}));
  }
  function bindCurrentConnectionToFile() { if (!isNativeHost || !filePath) return; if (["No connection", "Disconnected"].includes(activeConnection.id)) { setRunState("Connect to Oracle before binding this file."); return; } sendNativeCommand("file.bindConnection"); }
  function insertHistorySql(statement) { if (editorIsReadonly()) return; const editor = editorRef.current, model = editor?.getModel(), position = editor?.getPosition(); if (!editor || !model || !monacoRef.current) return; const target = position ?? { lineNumber: model.getLineCount(), column: model.getLineMaxColumn(model.getLineCount()) }; const range = new monacoRef.current.Range(target.lineNumber, target.column, target.lineNumber, target.column); editor.executeEdits("query-history", [{ range, text: `${target.column > 1 ? "\n" : ""}${statement}\n`, forceMoveMarkers: true }]); editor.focus(); setShowHistory(false); }
  function insertSqlSnippet(snippet) { const editor = editorRef.current; if (!editor || !snippet || editorIsReadonly()) return; editor.focus(); editor.getContribution("snippetController2")?.insert(snippet.text); setShowSnippets(false); }
  function saveCustomSqlSnippet() {
    const trigger = snippetDraft.trigger.trim().toLowerCase(), label = snippetDraft.label.trim(), text = snippetDraft.text.trim();
    if (!/^[a-z][a-z0-9_]{1,23}$/.test(trigger)) { setSnippetError("Use 2–24 letters, numbers, or underscores; start with a letter."); return; }
    if (allSqlSnippets.some((snippet) => snippet.trigger.toLowerCase() === trigger)) { setSnippetError("That trigger is already in use."); return; }
    if (!label || !text) { setSnippetError("Add a name and SQL template before saving."); return; }
    const snippet = { trigger, label, detail: snippetDraft.detail.trim() || "Custom SQL snippet", text };
    setCustomSqlSnippets((current) => [...current, snippet]); setSelectedSnippetTrigger(trigger); setSnippetFilter(""); setSnippetError(""); setSnippetDraft({ trigger: "", label: "", detail: "", text: "SELECT ${1:column_name}\nFROM ${2:table_name};" }); setSnippetFormOpen(false);
  }
  function deleteCustomSqlSnippet(trigger) { setCustomSqlSnippets((current) => current.filter((snippet) => snippet.trigger !== trigger)); setSelectedSnippetTrigger("sel"); }
  // Opens the hierarchy for the routine at the caret; the index reads workspace sources plus the current text of open editors.
  function openCallHierarchy() { const editor = editorRef.current, model = editor?.getModel(), position = editor?.getPosition(); if (!model || !position) return; setCallHierarchy({ root: isNativeHost ? workspace.root || null : null, document: { ...documents.active, content: documents.text }, offset: model.getOffsetAt(position) }); }
  // Starts with the selected text or the word at the caret as the name to search.
  function openStructuralSearch() { const editor = editorRef.current, model = editor?.getModel(), selection = editor?.getSelection(), position = editor?.getPosition(); const selected = model && selection && !selection.isEmpty() ? model.getValueInRange(selection).trim() : ''; const initialName = /^[\w$#".]{1,128}$/.test(selected) ? selected : model && position ? model.getWordAtPosition(position)?.word || '' : ''; setStructuralSearch({ root: isNativeHost ? workspace.root || null : null, document: { ...documents.active, content: documents.text }, initialName }); }
  // The side editor shows a second document beside the main editor; it starts on the active document.
  // FI-106: moving tabs between application windows. The session stays in the
  // desktop process; documents and fetched results move as transfer text.
  function moveTabsToWindow(ids, target, closeWindow = false) {
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
  // The tabs now live in another window: forget them here without closing their sessions.
  function detachTabs(ids, sessionIds) {
    return tabActions.detachTabs({
      activateTab, batchDiscardRef, bookmarks, closedTabsRef, completionMetadataRef, completionRecentRef, documentSavesRef, documents,
      editLocationsRef, executionSummaries, newSqlFileNow, operations, results, runConsoleStore, setObjectDefinition, setSideEditor,
      setTabSessions, setTabs
    }, ids, sessionIds);
  }
  function adoptTransfer(transfer) {
    for (const id of [...transfer.sessionIds, ...transfer.documents.map(tab => tab.id)]) { closedTabsRef.current.delete(id); draftsConfirmedRef.current.delete(id); }
    for (const id of transfer.sessionIds) { results.revive(id, transfer.results[id]); if (transfer.metadata[id]) operations.metadata.set(id, transfer.metadata[id]); }
    sessionsRef.current = { ...sessionsRef.current, ...transfer.sessions };
    setTabSessions(current => ({ ...current, ...transfer.sessions }));
    rememberEditorPosition();
    for (const tab of transfer.documents) documents.open(tab);
    requestAnimationFrame(() => activateTab(transfer.activeId, false));
  }
  windowMessageRef.current = message => {
    if (message.type === 'window.list') { setAppWindows({ current: message.current, label: message.label, windows: message.windows || [] }); return; }
    if (message.type === 'window.closeRequested') {
      // Empty, unconnected scratch queries are not worth handing back.
      const keep = documents.tabs.filter(tab => tab.dirty || tab.path || tab.readOnly || String(tab.content || '').trim() || !['No connection', 'Disconnected', undefined].includes(sessionsRef.current[tab.metadataOriginTabId || tab.id]?.activeConnection?.id));
      moveTabsToWindow(keep.map(tab => tab.id), 'main', true);
      return;
    }
    if (message.type === 'window.incoming') {
      let transfer; try { transfer = parseTabTransfer(message.transfer); } catch (error) { notifyFeedback({ kind: 'error', title: 'Tab not received', message: error.message }); return; }
      adoptTransfer(transfer);
      const names = transfer.documents.filter(tab => !tab.readOnly).map(tab => tab.name);
      notifyFeedback({ kind: 'info', title: `${names[0] || 'Tab'}${names.length > 1 ? ` and ${names.length - 1} more` : ''} moved here`, message: `From ${message.fromLabel}. Its database session, transaction and results came along and now belong to ${hostWindow.label}.`, scope: transfer.sessionIds[0] });
      // Save at once: the application may be closing right after other windows hand their tabs back.
      if (!windowClosingRef.current) try { const tabs = [...documents.tabs.filter(tab => !transfer.documents.some(item => item.id === tab.id)), ...transfer.documents]; persistLocal(localStorage, windowDraftKey(hostWindow.id), JSON.stringify(draftSnapshot(tabs, transfer.activeId))); } catch {}
      return;
    }
    const pending = pendingWindowMovesRef.current.get(message.requestId);
    if (!pending) return;
    pendingWindowMovesRef.current.delete(message.requestId);
    if (message.type === 'window.moveFailed') { notifyFeedback({ kind: 'error', title: pending.closeWindow ? 'Window not closed' : 'Tab not moved', message: message.message }); return; }
    if (message.type !== 'window.moved') return;
    const name = documents.tabs.find(tab => tab.id === pending.ids[0])?.name || 'Tab';
    // A window left without tabs closes; its unsaved SQL now lives in the other window.
    if (pending.closeWindow || hostWindow.secondary && !documents.tabs.some(tab => !pending.ids.includes(tab.id))) {
      windowClosingRef.current = true;
      try { localStorage.removeItem(windowDraftKey(hostWindow.id)); } catch {}
      if (!pending.closeWindow) sendNativeCommand('window.close', {});
      return;
    }
    detachTabs(pending.ids, pending.sessionIds);
    notifyFeedback({ kind: 'success', title: `${name} moved to ${message.label}`, message: `Its database session, transaction and results now belong to ${message.label}.`, actions: [{ label: `Show ${message.label}`, onClick: () => sendNativeCommand('window.focus', { target: message.target }) }] });
  };
  useEffect(() => { if (isNativeHost) sendNativeCommand('window.state', {}); }, []);
  useLayoutEffect(() => { if (bootTransfer) adoptTransfer(bootTransfer); }, []);
  const otherWindows = appWindows.windows.filter(item => item.id !== hostWindow.id);
  const windowTargets = isNativeHost ? [{ id: 'new', label: 'Move to New Window' }, ...otherWindows.map(item => ({ id: item.id, label: `Move to ${item.label}` }))] : [];
  function toggleSideEditor() { setSideEditor(current => current ? null : { tabId: documents.activeId }); }
  const sideEditorOptions = { fontFamily: `"${resolveSetting(settings,"editor.fontFamily").value}", Consolas, monospace`, fontSize: codeStyle.fontSize, lineHeight: Math.max(codeStyle.fontSize + 2, resolveSetting(settings,"editor.lineHeight").value), minimap: { enabled: false }, lineNumbers: resolveSetting(settings,"editor.lineNumbers").value ? "on" : "off", wordWrap: resolveSetting(settings,"editor.wordWrap").value ? "on" : "off", tabSize: codeStyle.tabSize, insertSpaces: codeStyle.insertSpaces, scrollBeyondLastLine: false, automaticLayout: true, contextmenu: false, quickSuggestions: false, padding: { top: 12, bottom: 12 } };
  // Explains the CASE expression or analytic function around the caret; nothing is executed.
  function openExpressionExplain() { const editor = editorRef.current, model = editor?.getModel(), position = editor?.getPosition(); if (!model || !position) return; const explanation = explainExpressionAt(model.getValue(), model.getOffsetAt(position)); if (explanation) setExpressionExplanation(explanation); else notifyFeedback({ kind: 'info', title: 'Explain expression', message: 'Place the caret inside a CASE expression or an analytic function (… OVER (…)).' }); }
  function openDependencyGraph() { const editor = editorRef.current, model = editor?.getModel(), position = editor?.getPosition(); if (!model || !position) return; setDependencyGraph({ root: isNativeHost ? workspace.root || null : null, document: { ...documents.active, content: documents.text }, offset: model.getOffsetAt(position) }); }
  function openCallHierarchyPlace(place) { setCallHierarchy(null); setStructuralSearch(null); setDependencyGraph(null); if (!place.path || pathKey(place.path) === pathKey(documents.active?.path || '')) { requestAnimationFrame(() => jumpToOffset(place.start)); return; } openWorkspaceSearchMatch(place); }
  function openWorkspaceSearchMatch(match) { const cached = tabs.find((tab) => tab.path?.toLowerCase() === match.path.toLowerCase()); if (cached) { activateTab(cached.id); setShowSearch(false); requestAnimationFrame(() => { editorRef.current?.setPosition({ lineNumber: match.lineNumber, column: match.column || 1 }); editorRef.current?.revealLineInCenter(match.lineNumber); editorRef.current?.focus(); }); return; } rememberEditorPosition(); pendingSearchPositionRef.current = { path: match.path, lineNumber: match.lineNumber, column: match.column }; setShowSearch(false); sendNativeCommand("file.openPath", { path: match.path }); }


  const { runQuery, explainQuery, executeStatement, fetchMoreResults, cancelQuery, startScript } = useQueryExecution({
    documents, results, operations, native: isNativeHost, send: sendNativeCommand,
    readSession: owner => sessionsRef.current[owner] || (owner === documents.activeId ? { activeConnection: activeConnectionRef.current } : {}),
    settings: { pageSize: pageSizes.next, scriptPageSize: maxRows, timeout: queryTimeout, workspaceRoot: workspace.root, activateResults: resolveSetting(settings,'notifications.activateResults').value },
    editor: { current: editorRef.current, lastPosition: lastEditorPositionRef.current, flash: flashExecutionTarget },
    session: { update: updateTabSession, status: setRunState },
    ui: { readOnly:activeTabReadonly, inlineBinds: statement => { if (!resolveSetting(settings,'editor.inlineBinds').value) return false; inlineBindStoreRef.current ??= new InlineBindStore(); const key = `${documents.activeId}|${visibleConnection?.id||''}`; const { parameters, missing } = inlineBindParameters(getOracleBindNames(statement), name => inlineBindStoreRef.current.get(key, name)); if (missing.length) { setRunState(`Enter a value or choose NULL for :${missing[0]} beside the SQL.`); window.dispatchEvent(new CustomEvent('fbsdb.inlineBind.focus', { detail: { name: missing[0] } })); return true; } executeStatement(statement, parameters); return true; }, reviewSource: (statement,target) => {const source=describeOracleSource({...documents.active,content:statement},workspace.projectRules);if(!source.declaration||!['PACKAGE','PACKAGE BODY','PROCEDURE','FUNCTION','TRIGGER','TYPE','TYPE BODY'].includes(source.declaration.type))return false;reviewSourceForCompilation(statement,target);return true}, confirmDdl: request => {setPendingDdl(request);return false}, pendingBind: pendingBindSql, bind: setPendingBindSql, showConnections: () => setShowPicker(true), scriptDialog },
    history: {
      learn: learnSqlUsage,
      start(owner, statement, profile) {
        if (!historyLimit || !historyAllowed(profile, resolveSetting(settings,'privacy.excludedProfiles').value)) return;
        const id = crypto.randomUUID(); pendingHistoryRef.current.set(owner, id);
        setQueryHistory(current => [{ id, sql: statement, profile, startedAt: Date.now(), status: 'Running', detail: 'Executing…' }, ...current].slice(0, historyLimit));
      },
    },
  });
  runQueryRef.current = runQuery;
  const pinCurrentResult = () => results.pin(documents.activeId);
  function releaseResult(result, owner = activeTabId) {
    if (result.resultId) sendNativeCommand('sql.closeResult', { tabId: owner, resultId: result.resultId });
    results.release(owner, result);
  }
  const managementContent=renderManagementContent({
    activeTabId, definition, keyLookup, keyValues, newResultName, relatedRunRequestsRef, renameResult, setKeyLookup, setKeyValues,
    setNewResultName, setRenameResult, updateTabResult, view
  });
  const sessionConnected = !tabSession.connectionLost && !["No connection", "Disconnected"].includes(activeConnection.id);
  // A foreign key lookup opens its SELECT in a new tab and runs it once that tab's own session is connected.
  useEffect(()=>{const step=autoRunStep(relatedAutoRun,{activeTabId,connected:sessionConnected,connecting,executing,connectionError,generation:tabSession.connectionGeneration});if(step==='wait')return;const statement=relatedAutoRun.sql;setRelatedAutoRun(null);if(step==='run')executeStatement(statement)},[relatedAutoRun,activeTabId,sessionConnected,connecting,executing,connectionError,tabSession.connectionGeneration]);
  const plsqlProfiler = usePlsqlProfiler({ documents, activeTabId, sessions: tabSessions, runQuery: () => runQueryRef.current?.(), openDefinition: (source, selection) => openOracleDefinition(source, selection), activateTab: id => activateTab(id), isConnected: sessionConnected, busy: executing || fetchingPage });
  const plsqlDebugger = usePlsqlDebugger({ documents, activeTabId, runQuery: () => runQueryRef.current?.(), cancelQuery: owner => cancelQuery(owner), openDefinition: (source, selection) => openOracleDefinition(source, selection), activateTab: id => activateTab(id), isConnected: sessionConnected });
  const visibleOrigin=objectTabActive&&objectTab?objectTab.originTabId:metadataOriginTabId;
  const visibleConnection=objectTabActive&&objectTab?documentConnection({id:objectTab.originTabId},tabSessions,dbConnections):editorConnection;
  const summarySession=tabSessions[visibleOrigin]||tabSession;
  const summaryConnectionSnapshot=summarySession.activeConnection||activeConnection;
  const summaryConnected=!summarySession.connectionLost&&!["No connection","Disconnected"].includes(summaryConnectionSnapshot.id);
  const summaryConnection=dbConnections.find(profile=>profile.id===(summarySession.connecting?summarySession.connectingProfileId:summaryConnectionSnapshot.id))||summaryConnectionSnapshot;
  const dockPanels = renderDockPanels({
    activateTab, activeConnection, activeObject, activeTabId, closeTab, connecting, connectionGroupNames, connectionMenu, connectionOrg,
    connectionRename, dbConnections, definitionError, documentOutline, explorerQuery, explorerTab, favorites, fileDirty, fileName,
    filePanelView, filePath, filteredConnections, groupFilter, insertEditorText, jumpToOffset, layout, objectMenu, objectScope,
    openExplorerDefinition, openExplorerObject, openObjectContext, openWorkspace, openWorkspaceDevelopment, openWorkspaceFile,
    promotePreview, refreshSchema, schemaError, schemaLoading, schemaObjects, schemaOwner, schemaOwnerFilter, schemaQuery, schemaRequestRef,
    schemaSearchKinds, schemaStale, sessionConnected, setConnectionMenu, setConnectionRename, setDefinitionError, setExplorerQuery,
    setExplorerTab, setFavorites, setFilePanelView, setGroupFilter, setObjectScope, setObjectTabActive, setProfileEditor,
    setSchemaOwnerFilter, setSchemaQuery, setShowPicker, setShowProjectRules, setShowSearch, setShowWorksets, setShowWorkspaceManager,
    setWorkspaceSearchScope, startSchemaDrag, switchConnection, tabSessions, tabs, updateLayout, visibleConnection, visibleSchemaObjects,
    workspace, workspaceDev
  });
  function showDockPanel(panel) {
    setFocusMode(false);
    updateLayout(current => ({ ...current, visible: true, hidden: current.hidden.filter(id => id !== panel), groups: current.groups.map(group => group.panels.includes(panel) ? { ...group, active: panel } : group) }));
    requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector(`[data-panel-id="${panel}"] input, [data-panel-id="${panel}"] button, [data-panel-id="${panel}"] [tabindex="0"]`)?.focus()));
  }
  function resetPanelLayout() {
    updateLayout(defaultDockLayout()); setFocusMode(false);
    try { localStorage.removeItem('fbsdb.explorerExpandedPaths'); } catch {}
    window.dispatchEvent(new Event('fbsdb.explorer.reset'));
    window.dispatchEvent(new Event('fbsdb.inspector.reset'));
  }
  const iconThemeId = resolveSetting(settings, 'ui.iconTheme').value;
  useEffect(() => { setIconTheme(resolveIconTheme(iconThemeId, loadIconPacks(localStorage))); }, [iconThemeId]);
  const bottomCollapsed = maximizedPanel==='results'?false:layout.resultsCollapsed || focusMode;
  // Editor toolbar: every action is declared once; the model decides which fit inline and which go to the overflow menu.
  const commandBarObserver=useRef(null);
  const [commandBarWidth,setCommandBarWidth]=useState(1200);
  const commandBarRef=useCallback(node=>{commandBarObserver.current?.disconnect();commandBarObserver.current=null;if(!node||typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(([entry])=>setCommandBarWidth(Math.round(entry.contentRect.width)));observer.observe(node);commandBarObserver.current=observer},[]);
  const shortcutsSetting=resolveSetting(settings,'editor.shortcuts').value,busy=executing||fetchingPage;
  const editorCommand=(command)=>{editorRef.current?.trigger('toolbar',command,{});editorRef.current?.focus()};
  const toolbarDefs=renderToolbarDefs({
    activeTabId, activeTabReadonly, busy, connecting, editorCommand, explainQuery, finishTransaction, formatSql, newSqlFile, openSqlFile,
    saveSqlFile, setActiveObject, setObjectTabActive, shortcutsSetting, tabSession, transactionPending, updateTabSession
  });
  const toolbarPrefs=resolveSetting(settings,'ui.toolbars').value,toolbarLayout=layoutToolbar(commandBarWidth,undefined,toolbarPrefs.editor);
  const renderToolbarItem=item=>{
    if(item.kind==='rows')return <label key={item.id} className="fetch-limit-picker" title="Rows per result page"><span>Rows</span><select aria-label="Rows per result page" value={maxRows} onChange={event=>setMaxRows(Number(event.target.value))}>{[100,500,1000,5000,10000].map(limit=><option key={limit} value={limit}>{limit.toLocaleString()}</option>)}</select></label>;
    const def=toolbarDefs[item.id];
    return <button key={item.id} type="button" className={def.className||'icon-button'} title={def.title} aria-label={def.aria} aria-pressed={def.pressed} disabled={def.disabled} onMouseDown={def.keepFocus?event=>event.preventDefault():undefined} onClick={def.onClick}>{def.icon}</button>;
  };
  const runButton=<button className={`run-button${!executing && !fetchingPage && !cancelling ? " idle" : ""}`} aria-label={cancelling ? "Cancelling SQL statement" : busy ? "Cancel current SQL statement" : "Run SQL statement"} disabled={cancelling || activeTabReadonly} title={cancelling ? "Waiting for Oracle to stop this statement" : busy ? "Cancel current SQL statement" : `Run SQL statement (${shortcutsSetting.run||"unassigned"})`} onMouseDown={(event) => event.preventDefault()} onClick={() => busy ? cancelQuery() : runQuery()}>{cancelling ? <Activity size={14} className="spin" /> : <Play size={14} fill="currentColor" />} <span className="sr-only">{busy && (cancelling ? "Cancelling…" : "Cancel")}</span></button>;
  const [shortcutMap,setShortcutMap]=useState(null);
  useEffect(()=>{const key=event=>{if(opensShortcutMap(event)){event.preventDefault();setShortcutMap({context:contextOf(event.target)})}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[]);
  const executionTarget=useMemo(()=>({profileName:visibleConnection?.profileName||visibleConnection?.short||'',environment:visibleConnection?.environment||''}),[visibleConnection?.profileName,visibleConnection?.short,visibleConnection?.environment]);
  // Runners for the commands described in editorCommands.js. From the context menu they get the menu's position; the palette opens at the caret.
  const atCaret=open=>{const editor=editorRef.current,position=editor?.getPosition(),point=position&&editor.getScrolledVisiblePosition(position),rect=editor?.getDomNode()?.getBoundingClientRect();open((rect?.left||0)+(point?.left||0),(rect?.top||0)+(point?.top||0)+(point?.height||0),editor?.getDomNode())};
  const editorCommandRunners={identifierCase:()=>openIdentifierCase(),localRename:()=>openLocalRename(),changeSignature:()=>openChangeSignature(),extractProcedure:()=>openExtractProcedure(),moveUp:()=>moveStatement(-1),moveDown:()=>moveStatement(1),embeddedSql:()=>openEmbeddedSql(),quickFix:()=>openQuickFix(),deleteReview:()=>{reviewDeleteImpact()},explainExpression:()=>openExpressionExplain(),extractCte:()=>extractSelectionToCte(),docComment:()=>generateDocComment(),columnCursors:()=>pasteColumnCursors(),
    surround:context=>context?openSurroundMenu(context.x,context.y,context.trigger):atCaret(openSurroundMenu),pasteAs:context=>context?openPasteAsMenu(context.x,context.y,context.trigger):atCaret(openPasteAsMenu)};
  const editorCommandState={readOnly:activeTabReadonly,workspaceReady:isNativeHost&&Boolean(workspace.root)};
  return <ToolbarPrefsContext.Provider value={toolbarPrefs}><ExecutionTargetContext.Provider value={executionTarget}><main className="desktop-shell" data-window={hostWindow.secondary?'secondary':undefined} data-maximized={maximizedPanel||undefined} data-language={language} data-region={region} data-results-collapsed={bottomCollapsed} data-focus={focusMode} data-density={workbenchDensity} data-reduce-motion={reduceMotion} data-theme={theme} style={{ "--accent": themeConfig.accent, "--syntax-keyword":tokenColors.keyword,"--syntax-string":tokenColors.string,"--syntax-comment":tokenColors.comment,"--syntax-number":tokenColors.number, "--ui-font-family": uiFontStacks[uiFontFamily], "--sidebar-width": `${layout.widths.left}px`, "--results-height": `${resultsHeight}%` }}>
    <GlobalTooltip /><TreeNameOverlay /><KeyTips enabled={resolveSetting(settings,'ui.keyTips').value}/>
    {renderToolDialogs({
      activeConnection, activeTabId, activeTabReadonly, applyWorkspaceReplace, bindStoreVersion, compareSources, completionMetadataRef,
      connectionDiagnostics, documents, editorRef, editorThemeName, executing, fetchingPage, filePath, inlineBindStoreRef, lookupPicker,
      metadataOriginTabId, monaco, newSqlFileNow, openWorkset, openWorkspaceFile, previewWorkspaceReplace, queryResult, queryTimeout, quickEval,
      recovery, refreshWorkspaceGit, relatedFileCreate, restoreDrafts, reviewPausedScript, runConsoleStore, runQuery, scriptDialog,
      setBindStoreVersion, setCompareSources, setConnectionDiagnostics, setLookupPicker, setObjectTabActive, setQueryTimeout, setQuickEval,
      setRecovery, setRelatedFileCreate, setScriptDialog, setShowLocalHistory, setShowOpenWorkspace, setShowRunConsole, setShowSessionInspector,
      setShowWorksets, setShowWorkspaceManager, setSubqueryTrial, setWorkspaceDev, setWorkspaceDevMode, settings, showLocalHistory,
      showOpenWorkspace, showRunConsole, showSessionInspector, showWorksets, showWorkspaceManager, sourceCompile, sql, startScript, subqueryTrial,
      tabSession, tabSessions, transactionPending, visibleConnection, worksetSnapshot, workspace, workspaceDev, workspaceDevMode,
      workspaceDevRequestsRef, workspaceDevelopmentCommand, workspaceReplaceScope
    })}
    {renderCommandPalette({
      activeEditorTab, activeSource, activeTabReadonly, applyProjectRunDefaults, beginReadOnlyAnalysis, cancelQuery, cancelling, choosePaletteItem,
      completionObjects, connecting, dbConnections, documentOutline, documents, editorCommandRunners, editorCommandState, editorRef, executing,
      fetchingPage, filePath, finishTransaction, formatterRef, layout, moveTabsToWindow, navigateBookmark, navigateEdit, newProjectSqlFile,
      newScratchFile, newSqlFileFromLastConnection, objectTabs, openCallHierarchy, openDependencyGraph, openRunConfigurations, openScriptPreview,
      openSqlFile, openStructuralSearch, openWorkspaceDevelopment, otherWindows, paletteMode, plsqlDebugger, plsqlProfiler, queryHistory,
      queryResult, relatedPackage, resetPanelLayout, returnToExecution, reviewSourceForCompilation, runQueryRef, saveSqlFile, sessionConnected,
      setCompareSources, setDateFormatDesigner, setFilePanelView, setFocusMode, setPaletteMode, setQuickEval, setRelatedFileCreate,
      setRelatedSources, setResultTab, setRunState, setShortcutMap, setShowAppearance, setShowBookmarks, setShowLocalHistory, setShowPicker,
      setShowProjectRules, setShowRunConsole, setShowSearch, setShowSessionInspector, setShowWorksets, setSubqueryTrial, setWorkbenchDensity,
      settings, showDockPanel, showRuntimePlan, smartEnterRef, sql, switchConnection, switchPackageSource, tabSession, tabSessions, tabs,
      toggleSideEditor, transactionPending, updateLayout, view, visibleConnection, windowTargets, workspace
    })}
    {renderEditorDialogs({
      activeTabId, applyChangeSignature, applyEmbeddedSql, applyExtractProcedure, applyIdentifierCase, applyLocalRename, applyQuickFix,
      applySettings, applySurround, callHierarchy, changeSignature, codeCell, dbConnections, dependencyGraph, documents, editorRef, editorThemeName,
      embeddedSql, enabledStatusIndicators, executeStatement, expressionExplanation, extractProcedure, identifierCase, localRename, newSqlFileNow,
      openCallHierarchyPlace, openWorkspaceFile, quickFix, relatedSources, runConfigurations, sessionsRef, setCallHierarchy, setChangeSignature,
      setCodeCell, setDependencyGraph, setEmbeddedSql, setExpressionExplanation, setExtractProcedure, setIdentifierCase, setLocalRename,
      setObjectTabActive, setQuickFix, setRelatedSources, setRunConfigurations, setRunState, setShowProjectRules, setSourceCompile, setStatusMenu,
      setStructuralSearch, setSurroundMenu, setWorkspace, settings, showProjectRules, sourceCompile, sql, statusMenu, structuralSearch, surroundMenu,
      tabResults, tabSession, tabSessions, tabs, workspace
    })}
    {renderFileMenu({
      activeTabReadonly, applySavedLayout, applySettings, currentResultOptions, documents, executing, fetchingPage, focusMode, language,
      layout, metadataOriginTabId, navigateHistory, newSqlFile, openFileInputRef, openScriptPreview, openSqlFile, openWorkspace,
      plsqlDebugger, plsqlProfiler, previewResultAppearance, queryResult, rememberEditorPosition, resetPanelLayout, runQuery, saveSqlFile,
      setFocusMode, setObjectDefinition, setPaletteMode, setResultTab, setShowAppearance, setShowPicker, setShowWorkspaceManager, settings,
      showDockPanel, showPicker, summaryConnected, summaryConnection, summarySession, tabResults, updateLayout, workspace
    })}
    <div className="workbench">{renderActivityRail({
      focusMode, setFocusMode, setPaletteMode, setShowAppearance, setShowHistory, setShowSearch, setShowSnippets, setSidebarOpen,
      setSnippetFilter, sidebarOpen
    })}
      <LayoutLockContext.Provider value={!!layout.locked}><DockWorkbench layout={layout} onChange={updateLayout} panels={dockPanels} hidden={focusMode||!!maximizedPanel||hostWindow.secondary}>
      <div className="editor-results-stack">{renderEditorWorkspace({
      activateTab, activeConnection, activeEditorTab, activeObjectTabId, activeSource, activeTabId, activeTabReadonly, attachBindDrop,
      autoCompletion, bindCurrentConnectionToFile, buildStatusContext, cancelling, closeTab, closeTabs, codeStyle, commandBarRef,
      completionAcceptanceRef, completionClientRef, completionRecentRef, completionSchema, completionSettings, completionSettingsRef,
      completionTabKeyRef, connecting, controlledEditorUpdateRef, dbConnections, documentOutline, documents, dropSchemaInEditor,
      editLocationsRef, editorPositionsRef, editorRef, editorThemeName, enabledStatusIndicators, executing, fetchingPage,
      fileConnectionProfileId, fileDirty, fileName, filePath, focusMode, formatterRef, handleEditorChange, insertPairProvidersRef,
      inspectOracleObject, inspectorObject, installRunGutter, jumpToOffset, largePolicy, lastEditorPositionRef, lastSuggestionAcceptanceRef,
      maxRows, maximizedPanel, metadataOriginTabId, moveTabsToWindow, newSqlFile, newSqlFileFromTemplate, newSqlFileOnProfile,
      objectAnalysisRequestRef, objectDefinition, objectInspectorView, objectTabActive, objectTabId, objectTabs, openRunConfigurations,
      operations, overview, packageGroups, plsqlDebugger, plsqlProfiler, pollOpenFiles, postfixProviderRef, previewTabId,
      projectionCursorRef, promoteScratch, publishLearning, quickFixRef, reduceMotion, relatedPackage, renderToolbarItem,
      resolveExternalFile, reviewSourceForCompilation, runButton, runQueryRef, saveSqlFile, sessionConnected, setActiveObject,
      setActiveObjectTabId, setCursorLine, setLargeFileOverrides, setMaxRows, setMonaco, setObjectAnalysis, setObjectDefinition,
      setObjectTabActive, setObjectTabs, setPreviewTabId, setRelatedSources, setShowPackageApi, setSideEditor, setStatusMenu, settings,
      sideEditor, sideEditorOptions, smartEnterRef, sql, statusIndicatorAction, structuralSelectionRef, suggestionLearningRef,
      suggestionScope, switchPackageSource, tabSession, tabSessions, tabs, theme, togglePanelMaximized, toolbarDefs, toolbarLayout,
      transactionPending, view, visibleConnection, windowTargets, workspace
    })}
      <ResizeHandle locked={layout.locked} axis="y" value={resultsHeight} onChange={value=>{setFocusMode(false);setResultsHeight(value)}} min={15} max={70} label="Resize results" panelSelector=".result-panel" />
      {renderResultPanel({
      activeEditorTab, activeProblems, activeTabId, allProblems, applyServerFilters, bottomCollapsed, cancelQuery, cancelling,
      currentAppearanceKey, definition, documents, editorConnection, editorRef, executeStatement, executing, executionKind, explainMessage,
      explainQuery, explainResult, exportChosenColumns, exportResultsInsertSql, fetchMoreResults, fetchingPage, insertEditorText, language,
      linkedProjectionColumn, maxRows, maximizedPanel, navigateProblem, openChildRecords, openRelatedRecords, operations, pageError,
      pageRequestRef, panelMessage, pinCurrentResult, queryResult, region, releaseResult, requestPrimaryKey, resultFilter,
      resultLiveAppearance, resultRenderMeasured, resultSetSearch, resultTab, runQueryRef, runState, sessionConnected, setDefinition,
      setFocusMode, setNewResultName, setPaletteMode, setRenameResult, setResultFilter, setResultLiveAppearance, setResultSetSearch,
      setResultTab, setShowPicker, settings, showProjectionSource, showSmartObject, sourceDefinitionRequestRef, sql, sqlResult,
      streamResultToFile, tabSession, togglePanelMaximized, transactionPending, updateLayout, updateTabResult, view
    })}
    </div>
      </DockWorkbench></LayoutLockContext.Provider>
    </div>
    <DebugPanel debug={plsqlDebugger.debug} onStep={plsqlDebugger.step} onStop={plsqlDebugger.stop} onSelectFrame={plsqlDebugger.selectFrame} />
    <DebugCompileDialog prompt={plsqlDebugger.compilePrompt} />
    {!plsqlDebugger.debug && <ProfilePanel profile={plsqlProfiler.profile} onFinish={plsqlProfiler.finish} onClose={plsqlProfiler.clear} onOpenLine={plsqlProfiler.openLine} />}
    <ProfileTablesDialog prompt={plsqlProfiler.tablePrompt} />
    {renderFooter({
      activeTabId, otherWindows, resultTab, setResultTab, setShowGettingStarted, setShowPicker, summarySession, tabResults, tabSession,
      view, visibleConnection, visibleOrigin, workspace
    })}
    {renderWorkbenchOverlays({
      activeConnection, activeTabReadonly, applySettings, beginConnection, cancelling, connecting, connectionContextAction, connectionGroupNames,
      connectionMenu, connectionOrg, customSqlSnippets, dbConnections, dbConnectionsRef, deleteCustomSqlSnippet, deleteReview,
      disconnectActiveConnection, documents, editorCommandState, editorContext, editorContextAction, executing, favorites, fetchingPage, filePath,
      filteredQueryHistory, filteredSnippets, historyFilter, historyLimit, insertHistorySql, insertSqlSnippet, managementError, newSqlFileNow,
      objectContextAction, objectFavorites, objectMenu, openWorkspaceSearchMatch, previewConnectionOrganization, profileEditor, queryHistory,
      recentProfiles, saveCustomSqlSnippet, searchMatches, searchQuery, searchTruncated, searching, selectedSnippet, setAuthProfile, setConnecting,
      setConnectionError, setConnectionMenu, setConnectionOrg, setDbConnections, setEditorContext, setFavorites, setHistoryFilter,
      setManagementError, setObjectMenu, setProfileEditor, setQueryHistory, setSearchMatches, setSearchQuery, setSelectedSnippetTrigger,
      setShowGettingStarted, setShowHistory, setShowPicker, setShowSearch, setShowSnippets, setShowTnsSources, setSnippetDraft, setSnippetError,
      setSnippetFilter, setSnippetFormOpen, settings, showGettingStarted, showHistory, showPicker, showSearch, showSnippets, showTnsSources,
      snippetDraft, snippetError, snippetFilter, snippetFormOpen, switchConnection, tabSessions, tnsAliases, workspace, workspaceSearchScope
    })}

    {renderWorkbenchPrompts({
      activeEditorTab, activeTabId, applySettings, authProfile, batchClose, batchDiscardRef, beginConnection, bindPrefillRef, bookmarks, codeStyle,
      completionError, completionMetadataRef, completionSession, completionSettings, dateFormatDesigner, dbConnections, dbConnectionsRef, documents,
      draftGuard, editorRef, executeStatement, fileName, filePath, finishTransaction, jumpToOffset, keyLookup, managementContent,
      metadataOriginTabId, objectTabActive, openBookmark, openOracleDefinition, pendingBindSql, pendingDdl, pendingFileAction, pendingSwitch,
      pendingTabClose, pendingTabCloseRef, plscopeReport, queryTimeout, renameResult, saveSqlFile, sessionsRef, setAuthProfile, setBatchClose,
      setCodeStyle, setCompletionSettings, setDateFormatDesigner, setDraftGuard, setKeyLookup, setNewResultName, setPendingBindSql, setPendingDdl,
      setPendingFileAction, setPendingSwitch, setPendingTabClose, setPlscopeReport, setQueryTimeout, setRenameResult, setRunState, setSettingsFocus,
      setShortcutMap, setShowAppearance, setShowBookmarks, setShowPackageApi, setShowPicker, setSshHostKey, setTheme, setUncertainCommit, settings,
      settingsError, settingsFocus, shortcutMap, showAppearance, showBookmarks, showPackageApi, sshHostKey, submitConnectionCredentials,
      systemLocale, tabResults, tabSessions, theme, tnsAliases, tokenColors, uncertainCommit, updateTokenColor, workspace
    })}
  </main></ExecutionTargetContext.Provider></ToolbarPrefsContext.Provider>;
}

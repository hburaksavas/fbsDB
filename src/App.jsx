import {nextQueryName} from './tabPathLabels';
import {useEditorOverview} from './useEditorOverview.js';
import {largeFilePolicy,lightweightEditorOptions,LARGE_FILE_THRESHOLD} from './largeFilePolicy.js';
import {PackageApiDialog} from './PackageApiDialog.jsx';
import {layoutPresets,restoreLayout} from './savedLayouts.js';
import { useConnectionLifecycle } from './useConnectionLifecycle.js';
import { GettingStartedDialog } from './GettingStartedDialog';
import { QueryHistoryDialog } from './QueryHistoryDialog';
import { retainHistory, historyAllowed } from './queryHistory.js';
import { persistLocal } from './localPersistence.js';
import { recordStartupMilestone } from './startupPerformance.js';
import { editorPresentable } from './editorStartup.js';
import {EditorContextMenu} from './EditorContextMenu';
import {DocumentSaves} from './documentSaves.js';
import {useDocumentSessions} from './useDocumentSessions.js';
import {useResultSessions} from './useResultSessions.js';
import {useQueryExecution} from './useQueryExecution.js';
import {createQueryOperations} from './queryExecution.js';
import {RunMenu} from './RunMenu';
import {OracleObjectIcon,oracleObjectClass} from './OracleObjectIcon';
import {configureFeedback} from './feedbackStore';
import {useFeedbackState,Feedback,FeedbackDialog,notifyFeedback,dismissFeedback,setFeedbackScopes} from './Feedback';
import { ResultIdle,ResultNotice,ResultFailure,ResultRunning } from './ResultStatus.jsx';
import { OracleObjectMenu } from './OracleObjectMenu.jsx';
import { objectSqlDraft,qualifiedObject,editableObjectDefinition } from './oracleObjectActions.js';
import { ConnectionPassword } from './ConnectionPassword.jsx';
import { matchesShortcut,editorShortcutActions } from './editorShortcuts.js';
import { sqlFormatterStyle } from './sqlFormatterSettings.js';
import { SuggestionLearning, learningScope } from './suggestionLearning.js';
import { automaticCompletionAllowed } from './oracleCompletionContext.js';
import { loadSettings,saveSettings,newResultDefaults,saveResultDefaults,resolveSetting,changeSetting,settingDefinitions,resultPageSizes } from './settingsModel';
import { EditorTabs } from './EditorTabs';
import { ConnectionControl } from './ConnectionControl';
import {ConnectionLibrary} from './ConnectionLibrary';
import {ConnectionTree} from './ConnectionTree';
import {ConnectionContextMenu,connectionContext,connectionContextKey} from './ConnectionContextMenu';
import {connectionOrganization,emptyConnectionOrganization,organizedProfiles,changeConnectionOrganization,filterOrganizedConnections} from './connectionOrganization';
import { WorkspaceExplorer, OpenEditors } from './WorkspaceExplorer';
import {WorkspaceWorksets} from './WorkspaceWorksets';
import {WorkspaceOpenPopup} from './WorkspaceOpenPopup';
import {ExternalFileNotice} from './ExternalFileNotice';
import {describeOracleSource, relatedPackageDocument, packageDocumentGroups} from './oracleSourceIdentity.js';
import {OracleSourceHeader} from './OracleSourceHeader';
import {RelatedSourcesDialog} from './RelatedSourcesDialog';
import { projectUsage as loadProjectUsage } from './projectUsageCache.js';
import { explainExpressionAt } from './expressionExplain.js';
import { SideEditorPane } from './SideEditorPane.jsx';
const CallHierarchyDialog = lazy(() => import('./CallHierarchyDialog.jsx').then(module => ({ default: module.CallHierarchyDialog })));
const ExpressionExplainDialog = lazy(() => import('./ExpressionExplainDialog.jsx').then(module => ({ default: module.ExpressionExplainDialog })));
const DependencyGraphDialog = lazy(() => import('./DependencyGraphDialog.jsx').then(module => ({ default: module.DependencyGraphDialog })));
const StructuralSearchDialog = lazy(() => import('./StructuralSearchDialog.jsx').then(module => ({ default: module.StructuralSearchDialog })));
import {IdentifierCaseDialog} from './IdentifierCaseDialog';
import {loadTemplateAliases,queryTemplateFingerprint,saveTemplateAlias} from './columnAliases';
import {newQueryMainLabel,newQueryProfileItems,newQueryTemplates} from './newQueryOptions';
import {dismissShortcutHint,nextShortcutHint} from './shortcutCoach';
import {ProjectRulesDialog} from './ProjectRulesDialog';
import {SourceCompileDialog} from './SourceCompileDialog';
import {RunConfigurationsDialog} from './RunConfigurationsDialog';
import {sourceRunConfigurations} from './runConfigurations';
import {documentConnection,editedSinceExecution} from './executionContext';
import {EnvironmentBadge,ResultSourceProvenance} from './ExecutionContextBadges';
import {prepareSourceCompilation,sourceBaseline,sourceCompilationUnits,sourceIdentity} from './sourceCompilation';
import {defaultProjectRules,projectOptions} from './projectRules';
import { FileMenu } from './FileMenu';
import { ViewMenu } from './ViewMenu';
import { DockWorkbench } from './DockWorkbench';
import { defaultDockLayout, normalizeDockLayout } from './dockLayout';
import { remapWorkspacePath, pathKey } from './workspaceTree';
import { assertMiniToolSelect } from './miniTools';
import { draftSnapshot, parseDraftSnapshot } from './draftRecovery';
import { EditorSymbolBreadcrumb } from './EditorSymbolBreadcrumb';
import { IdeCommandPalette } from './IdeCommandPalette';
import { activeGridActions } from './gridActionBridge';
import { actionableState } from './workbenchUx';
import { ActionableState } from './ActionableState';
import { ExecutionTargetContext } from './executionTarget';
import { commitButtonTitle, rollbackButtonTitle } from './reversibility';
import { idleGuidance, noRowsGuidance } from './emptyGuidance';
import { EditorToolbarOverflow } from './EditorToolbarOverflow';
import { ResultScope } from './ResultScope.jsx';
import { nextColumnSort } from './resultColumnActions';
import { themePresets, applyDocumentTheme, monacoThemeColors, monacoTokenRules, resolveTokenColors } from './themeModel';
import { EditorNavigationHistory,sourceLineEnding,sourcePositionAt } from './editorNavigation';
import { EditorSessionStatus } from './EditorSessionStatus';
import { ResultToolbar } from './ResultToolbar';
import { PivotOptionsPanel, TransposePivotInspector } from './PivotPopover';
import {deriveResultData,estimateResultMemory,csvText,exportMetadata} from './resultWorkbench';
import { ResultsPresentation } from "./ResultExtensions";
import { buildServerFilter } from "./resultAdvanced";
import { applyResultFeatures, copyResultData } from "./resultFeatures";
import { getVisibleResultRows, moveResultRow } from "./resultRows";
import { buildResultDisplay, displayedColumnIndices, projectDisplayExport, resultViewMode, updateResultViewOptions } from "./resultPresentationData";
import { ResultsGrid } from "./ResultsGrid";
import { ModalBackdrop } from "./ModalBackdrop";
import { GlobalTooltip } from "./GlobalTooltip";
import {TreeNameOverlay} from './TreeNameOverlay.jsx';
import {CodeCellDialog} from './CodeCellDialog.jsx';
import {projectionRanges} from './projectionMap';
import {surroundOptions,surroundSnippet} from './surroundWith';
import {inListSql,insertTemplateSql,jsonTableSql} from './pasteToCode';
import {installInsertPairProviders} from './insertPairProviders';
import {smartEnter} from './smartEnter';
import {installStructuralSelection} from './structuralSelection';
import {layoutToolbar} from './editorToolbarModel';
import {bindAtOffset,bindMenuActions} from './bindContext';
import {docSkeletonAt} from './docSkeleton';
import {minimapSections,minimapLabel} from './minimapSections';
import {statusIndicators,statusIndicatorContent,toggleStatusIndicator} from './statusBarModel';
import {previewOpenPlan,settlePreview} from './previewTabs';
import {estimateResultBytes,evaluateBudget} from './executionBudgets';
import {nextScratchName,promptsOnClose} from './scratchFiles';
import {codeLensItems} from './codeLenses';
import {createConsoleEntry,createConsoleStore} from './runConsole';
import {relatedFileProposals} from './contextualFiles';
import {loadBindDefinitions,saveBindDefinitions} from './bindDefinitions';
import {createSummaryStore,summaryHover,summaryLabel} from './executionSummaries';
import {installPostfixCompletion} from './postfixProvider';
import {formatElapsed,playCompletionTone,postExecutionActions,taskbarProgressState} from './postExecution';
import {extractCteSnippet} from './postfixCompletion';
import {columnCursorDraft} from './columnMulticursor';
import {dragSqlDraft} from './dragToSql';
import {contextualQuickFixes} from './quickFixes';
import {planStatementMove} from './statementMove';
import {embeddedSqlAt} from './embeddedSql';
import {rememberClipboard,clipboardPasteTexts} from './clipboardHistory';
import {recordMacroStep,createEditorMacro} from './editorMacros';
import { overridableSnippetTriggers, sqlSnippets } from './liveTemplates';
import {detectedRegion,effectiveLanguage,effectiveRegion,translate as t} from './localeProfile';
import { Fragment, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
const AppearanceSettings = lazy(() => import("./AppearanceSettings.jsx").then(module => ({ default: module.AppearanceSettings })));
const MiniToolsDialog = lazy(() => import("./MiniToolsDialog.jsx").then(module => ({ default: module.MiniToolsDialog })));
const ExplainPlanView = lazy(() => import("./ExplainPlanView.jsx").then(module => ({ default: module.ExplainPlanView })));
const OracleObjectInspector = lazy(() => import("./OracleObjectInspector.jsx").then(module => ({ default: module.OracleObjectInspector })));
const OracleDefinitionView = lazy(() => import("./OracleDefinitionView.jsx").then(module => ({ default: module.OracleDefinitionView })));
const OracleObjectDialog = lazy(() => import("./OracleObjectDialog.jsx").then(module => ({ default: module.OracleObjectDialog })));
const BindParameterDialog = lazy(() => import("./BindParameterDialog.jsx").then(module => ({ default: module.BindParameterDialog })));
const SqlScriptDialog = lazy(() => import("./SqlScriptDialog.jsx").then(module => ({ default: module.SqlScriptDialog })));
const DraftRecoveryDialog = lazy(() => import("./DraftRecoveryDialog.jsx").then(module => ({ default: module.DraftRecoveryDialog })));
const BindLookupDialog = lazy(() => import("./BindLookupDialog.jsx").then(module => ({ default: module.BindLookupDialog })));
const RegexWorkbenchDialog = lazy(() => import("./RegexWorkbenchDialog.jsx").then(module => ({ default: module.RegexWorkbenchDialog })));
const DateFormatDialog = lazy(() => import("./DateFormatDialog.jsx").then(module => ({ default: module.DateFormatDialog })));
const SubqueryTrialDialog = lazy(() => import("./SubqueryTrialDialog.jsx").then(module => ({ default: module.SubqueryTrialDialog })));
const QuickEvalDialog = lazy(() => import("./QuickEvalDialog.jsx").then(module => ({ default: module.QuickEvalDialog })));
const CompareDialog = lazy(() => import("./CompareDialog.jsx").then(module => ({ default: module.CompareDialog })));
import { KeyTips } from "./KeyTips.jsx";
import { ServerSourceTree } from "./ServerSourceTree.jsx";
import { prepareEvaluation, evaluationParameters } from "./quickEval.js";
import { cellDragType, planBindDrop } from "./resultBindDrop.js";
import { exportProgressText } from "./exportProgress.js";
import { loadIconPacks, resolveIconTheme, setIconTheme } from "./iconTheme.js";
import { clearTabDrafts, countTabDrafts, draftStoreKey, settleStoredTransactions } from "./draftStore.js";
import { HeldDraftsNotice } from './HeldDraftsNotice';
import { ShortcutMapDialog } from './ShortcutMapDialog';
import { LiveAnnouncer } from './LiveAnnouncer';
import { FooterDrafts } from './FooterDrafts';
import { LoadingSkeleton } from './LoadingSkeleton';
import { announce, resultAnnouncement } from './announcer';
import { contextOf, opensShortcutMap } from './shortcutMap';
import { InlineBindZone } from "./InlineBindZone.jsx";
import { prepareSubqueryTrial, trialRowLimit } from "./subqueryTrial.js";
import { loadBindLookups, lookupParameters, lookupRowLimit, saveBindLookup } from "./bindLookup.js";
import { InlineBindStore, inlineBindParameters } from "./inlineBinds.js";
import { ToolbarPrefsContext } from "./toolbarPrefs.js";
const LocalHistoryDialog = lazy(() => import("./LocalHistoryDialog.jsx").then(module => ({ default: module.LocalHistoryDialog })));
const RelatedFileCreateDialog = lazy(() => import("./RelatedFileCreateDialog.jsx").then(module => ({ default: module.RelatedFileCreateDialog })));
const PortabilityDialog = lazy(() => import("./PortabilityDialog.jsx").then(module => ({ default: module.PortabilityDialog })));
const RunConsoleDialog = lazy(() => import("./RunConsoleDialog.jsx").then(module => ({ default: module.RunConsoleDialog })));
const SessionInspectorDialog = lazy(() => import("./SessionInspectorDialog.jsx").then(module => ({ default: module.SessionInspectorDialog })));
const ConnectionDiagnosticsDialog = lazy(() => import("./ConnectionDiagnosticsDialog.jsx").then(module => ({ default: module.ConnectionDiagnosticsDialog })));
const WorkspaceDevelopmentDialog = lazy(() => import("./WorkspaceDevelopmentDialog.jsx").then(module => ({ default: module.WorkspaceDevelopmentDialog })));
const WorkspaceManager = lazy(() => import("./WorkspaceManager.jsx").then(module => ({ default: module.WorkspaceManager })));
const ResultValueDialog = lazy(() => import("./ResultDialogs.jsx").then(module => ({ default: module.ResultValueDialog })));
const Editor = lazy(() => import("./monacoEditor.js"));
const LocalRenameDialog = lazy(() => import('./LocalRenameDialog.jsx').then(module=>({default:module.LocalRenameDialog})));
const ChangeSignatureDialog = lazy(() => import('./ChangeSignatureDialog.jsx').then(module=>({default:module.ChangeSignatureDialog})));
const ExtractProcedureDialog = lazy(() => import('./ExtractProcedureDialog.jsx').then(module=>({default:module.ExtractProcedureDialog})));
const EmbeddedSqlDialog = lazy(() => import('./EmbeddedSqlDialog.jsx').then(module=>({default:module.EmbeddedSqlDialog})));
const ClipboardHistoryDialog = lazy(() => import('./ClipboardHistoryDialog.jsx').then(module=>({default:module.ClipboardHistoryDialog})));
const EditorMacrosDialog = lazy(() => import('./EditorMacrosDialog.jsx').then(module=>({default:module.EditorMacrosDialog})));
const QuickFixDialog = lazy(() => import('./QuickFixDialog.jsx').then(module=>({default:module.QuickFixDialog})));
import { announceUiReady, isNativeHost, sendNativeCommand, subscribeNativeMessages, setNativeTabId, getNativeTabId } from "./nativeBridge";
import { TnsSources, useDialogFocus } from "./ConnectionManager";
import { compilationProblemItems, offsetAtOraclePosition } from "./plsqlDiagnostics";
import {runtimeStackProblems} from './runtimeStack';
import {StackTraceLinks} from './StackTraceLinks';
import {BatchCloseDialog} from './BatchCloseDialog';
import {useSourceBookmarks} from './useSourceBookmarks';
import {SourceBookmarksDialog} from './SourceBookmarksDialog';
import {WorkbenchStatus} from './WorkbenchStatus';
import {transactionStatus} from './workbenchStatusModel.js';
import {liveResultAppearance} from './resultLiveAppearance';
import {EditLocations,currentExecutionOffset} from './editLocations';
import {batchClosePlan} from './batchClose';
import {LayoutLockContext} from './LayoutLockContext';
import {FileStructurePanel} from './FileStructurePanel';
import { ProblemsPanel } from "./ProblemsPanel";
import { getOracleBindNames } from "./oracleBinds";
import { getSqlStatements } from "./sqlStatements.js";
import { OracleCompletionClient } from "./oracleCompletionClient";
import { OracleMetadataBroker, completionCancellation } from "./oracleMetadataBroker";
import { installOracleLanguageProviders } from "./oracleLanguageProviders";
import { loadCompletionSettings } from "./editorCompletionSettings.js";
import {
  Activity, AlignLeft, ArrowDown, ArrowDownUp, ArrowUp, ArrowUpDown, Bell, BookOpen, Braces, Check, ChevronDown, ClipboardCopy,
  ChevronRight, CircleHelp, Clock3, Code2, Database, Eye, FileCode2, FilePlus2, Filter, Globe2,
  Folder, FolderOpen, GitBranch, History, KeyRound, Layers3, Link2, ListFilter, LockKeyhole,
  MoreHorizontal, Package, Palette, Play, Plus, RefreshCw, Save, Search, Settings2,
  Redo2, Shapes, ShieldCheck, Star, Table2, Terminal, Timer, Trash2, Undo2, Workflow, X, Zap,
} from "lucide-react";

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
function ResizeHandle({ axis, value, onChange, min, max, label, panelSelector,locked }) {
  const drag = useRef(null), frame = useRef(null);
  const paint = () => {
    frame.current = null;
    if (drag.current) drag.current.shell.style.setProperty(drag.current.property, `${drag.current.next}${axis === "x" ? "px" : "%"}`);
  };
  const update = event => {
    if (!drag.current) return;
    const delta = axis === "x" ? event.clientX - drag.current.origin : drag.current.origin - event.clientY;
    drag.current.next = Math.max(min, Math.min(max, drag.current.value + delta / drag.current.scale));
    if (frame.current === null) frame.current = requestAnimationFrame(paint);
  };
  const finish = commit => {
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
    const current = drag.current;
    if (!current) return;
    if (commit) { paint(); onChange(current.next); }
    else current.shell.style.setProperty(current.property, current.original);
    current.shell.removeAttribute("data-resizing");
    drag.current = null;
  };
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (drag.current) { drag.current.shell.style.setProperty(drag.current.property, drag.current.original); drag.current.shell.removeAttribute("data-resizing"); }
  }, []);
  useEffect(()=>{if(locked)finish(false)},[locked]);
  return <div className={`panel-resizer ${axis === "x" ? "resize-sidebar" : "resize-results"}`} role="separator" aria-disabled={locked||undefined} tabIndex={0} aria-label={label} aria-orientation={axis === "x" ? "vertical" : "horizontal"} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)}
    onPointerDown={event => {
      if (locked||event.button !== 0) return;
      event.preventDefault();
      const panel = event.currentTarget.parentElement.querySelector(panelSelector), shell = event.currentTarget.closest(".desktop-shell");
      const property = axis === "x" ? "--sidebar-width" : "--results-height";
      const current = axis === "x" ? panel.getBoundingClientRect().width : value;
      drag.current = { shell, property, original: shell.style.getPropertyValue(property), origin: axis === "x" ? event.clientX : event.clientY, value: current, next: current, scale: axis === "x" ? 1 : event.currentTarget.parentElement.getBoundingClientRect().height / 100 };
      shell.setAttribute("data-resizing", axis);
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={update} onPointerUp={event => { update(event); finish(true); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => finish(false)} onLostPointerCapture={() => finish(false)}
    onKeyDown={event => {
      if(locked)return;
      const steps = axis === "x" ? { ArrowLeft: -16, ArrowRight: 16 } : { ArrowUp: 2, ArrowDown: -2 };
      if (event.key in steps || event.key === "Home" || event.key === "End") { event.preventDefault(); onChange(event.key === "Home" ? min : event.key === "End" ? max : Math.max(min, Math.min(max, value + steps[event.key]))); }
    }} />;
}

function EnvBadge({ env, color, small = false }) { return <span className={`env-badge ${color} ${small ? "small" : ""}`} data-env={String(env || 'UNKNOWN').toUpperCase()}><i />{env}</span>; }

function ConnectionRow({ item, selected, onSelect, onConnect, onToggleFavorite, compact = false, style }) {
  return <div style={style} className={`connection-row ${selected ? "selected" : ""} ${compact ? "compact" : ""}`} ><button className="connection-select" onClick={() => onSelect(item)} onDoubleClick={onConnect ? () => onConnect(item) : undefined} aria-label={`${item.name || item.id} · ${item.env}`}>
    <span className={`db-icon ${item.color}`}><Database size={15} /></span><span className="connection-main"><span className="connection-name">{item.name || item.id}{item.duplicate && <span className="duplicate-alias" title="This alias is defined in another TNS file">!</span>}<EnvBadge env={item.env} color={item.color} small /></span>{!compact && <span className="connection-sub">{item.host}<span className="sub-sep">·</span>{item.service}</span>}</span>
    </button>{onToggleFavorite && <button type="button" className={`star-button ${item.favorite ? "active" : ""}`} onClick={(event) => { event.stopPropagation(); onToggleFavorite(item.id); }} onDoubleClick={(event) => event.stopPropagation()} aria-label={`Favorite ${item.name || item.id}`} aria-pressed={item.favorite}><Star size={14} fill={item.favorite ? "currentColor" : "none"} /></button>}
  </div>;
}

function VirtualConnectionRows({ items, selected, onSelect, onConnect, onToggleFavorite, favorites, compact = false, viewportHeight }) {
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef(null), [measuredHeight, setMeasuredHeight] = useState(null);
  useEffect(() => { if (!listRef.current || typeof ResizeObserver === 'undefined') return; const observer = new ResizeObserver(entries => { const height = entries[0]?.contentRect.height; if (height > 0) setMeasuredHeight(height); }); observer.observe(listRef.current); return () => observer.disconnect(); }, []);
  const rowHeight = compact ? 36 : 60, viewport = measuredHeight ?? viewportHeight ?? (compact ? 184 : 430);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 2), end = Math.min(items.length, start + Math.ceil(viewport / rowHeight) + 5);
  return <div ref={listRef} className={compact ? "alias-list virtual-list" : "picker-list"} style={{ height: viewportHeight ?? (compact ? 184 : 430), overflow: "auto" }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}><div style={{ height: start * rowHeight }} />{items.slice(start, end).map((item) => <ConnectionRow key={item.id} item={{ ...item, favorite: favorites.includes(item.id) }} selected={selected?.id === item.id} onSelect={onSelect} onConnect={onConnect} onToggleFavorite={onToggleFavorite} compact={compact} style={{ height: rowHeight, flexShrink: 0 }} />)}<div style={{ height: Math.max(0, (items.length - end) * rowHeight) }} /></div>;
}

const oracleObjectKinds = [
  ["TABLE", "Tables"], ["VIEW", "Views"], ["MATERIALIZED VIEW", "Materialized Views"], ["SYNONYM", "Synonyms"],
  ["PACKAGE", "Packages"], ["PROCEDURE", "Procedures"], ["FUNCTION", "Functions"], ["TRIGGER", "Triggers"],
  ["SEQUENCE", "Sequences"], ["INDEX", "Indexes"], ["CONSTRAINT", "Constraints"], ["TYPE", "Types"], ["DATABASE LINK", "Database Links"],
];
const oracleSchemaKey = (item) => item.key || `${item.owner || ""}.${item.type || ""}.${item.name || ""}`;
const oracleObjectLabel = (type) => oracleObjectKinds.find(([kind]) => kind === type)?.[1] || type;
const isOracleRelation = (item) => ["TABLE", "VIEW", "MATERIALIZED VIEW", "SYNONYM"].includes(item?.type);
const makeOracleRelationLookup = (items, currentSchema) => new Map(items.filter(isOracleRelation).sort((a, b) => Number(a.owner === currentSchema) - Number(b.owner === currentSchema)).map((item) => [item.name.toLowerCase(), item]));

function VirtualOracleObjects({ items, renderItem }) {
  const [top, setTop] = useState(0);
  const rowHeight = 25, viewport = 250, threshold = 100;
  if (items.length <= threshold) return items.map(renderItem);
  const start = Math.min(items.length, Math.floor(top / rowHeight));
  const count = Math.ceil(viewport / rowHeight) + 5;
  return <div className="oracle-object-virtual-list" style={{ maxHeight: viewport }} onScroll={event => setTop(event.currentTarget.scrollTop)} role="group" aria-label={`${items.length} Oracle objects`}>
    <div style={{ height: start * rowHeight }} />{items.slice(start, start + count).map(renderItem)}<div style={{ height: Math.max(0, (items.length - start - count) * rowHeight) }} />
  </div>;
}

function OracleObjectRow({ item, activeKey, onToggle, onContext, onDragStart, contextKey, query = "", searchMatch = "" }) {
  const key = oracleSchemaKey(item), isSelected = activeKey === key;
  return <div className="oracle-object-node" key={key}>
    <div className="oracle-object-line">
    <button className={`oracle-object-row ${isSelected ? "active" : ""}`} data-object-key={key} data-context-selected={contextKey===key||undefined} draggable={isOracleRelation(item)} onDragStart={event=>onDragStart?.(event,item)} onContextMenu={event=>onContext?.(event,item)} onKeyDown={event=>{if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){event.preventDefault();onContext?.(event,item)}}} title="Double-click to open object details; drag to editor for SELECT" onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggle(item); }}>
      <OracleObjectIcon type={item.type} size={14} /><span className="oracle-object-name">{item.name}</span>{searchMatch && <small className="oracle-search-match">{searchMatch}</small>}{item.type === "SYNONYM" && <small className="oracle-object-target">→ {item.targetOwner || "PUBLIC"}.{item.targetName}{item.dbLink ? `@${item.dbLink}` : ""}</small>}
    </button>
    </div>
    {isOracleRelation(item)&&item.columns?.length>0&&<details className="oracle-object-columns"><summary>Columns ({item.columns.length})</summary>{item.columns.slice(0,200).map(column=><button type="button" key={column.name} draggable onDragStart={event=>onDragStart?.(event,item,column.name)} title={`Drag ${column.name} to editor for SELECT`}>{column.name}</button>)}{item.columns.length>200&&<small>First 200 columns shown</small>}</details>}
  </div>;
}

function OracleObjectCategory({ owner, type, label, items, currentSchema, query, activeKey, onToggle, onContext, onDragStart, contextKey, searchKinds }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (query) setOpen(true); }, [query]);
  return <details className="oracle-category-node" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><ChevronRight size={12} className="schema-chevron" /><OracleObjectIcon type={type} /><span>{label}</span><span className="object-count">{items.length}</span></summary>
    {open && (items.length ? <VirtualOracleObjects items={items} renderItem={item => <OracleObjectRow key={oracleSchemaKey(item)} item={item} activeKey={activeKey} onToggle={onToggle} onContext={onContext} onDragStart={onDragStart} contextKey={contextKey} query={query} searchMatch={searchKinds.get(oracleSchemaKey(item))}/>} /> : <div className="oracle-empty-category">No {label.toLowerCase()} visible</div>)}
  </details>;
}

function OracleSchemaNode({ owner, categories, objectCount, currentSchema, query, activeKey, onToggle, onContext, onDragStart, contextKey, searchKinds }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (query) setOpen(true); }, [query]);
  const kinds = oracleObjectKinds.filter(([type]) => !query || categories.has(type));
  return <details className="oracle-schema-node" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><ChevronRight size={13} className="schema-chevron" /><Database size={14} className="oracle-schema-icon" /><span>{owner}</span><span className="object-count">{objectCount}</span></summary>
    {open && kinds.map(([type, label]) => {
      const items = (categories.get(type) || []).slice().sort((a, b) => a.name.localeCompare(b.name));
      return <OracleObjectCategory key={`${owner}-${type}`} owner={owner} type={type} label={label} items={items} currentSchema={currentSchema} query={query} activeKey={activeKey} onToggle={onToggle} onContext={onContext} onDragStart={onDragStart} contextKey={contextKey} searchKinds={searchKinds}/>;
    })}
  </details>;
}

function OracleObjectTree({ items, activeKey, onToggle, onContext, onDragStart, contextKey, emptyLabel, currentSchema, query, searchKinds = new Map() }) {
  if (!items.length) return <div className="schema-tree"><div className="explorer-empty">{emptyLabel}</div></div>;
  const schemas = new Map();
  for (const item of items) {
    const owner = item.owner || currentSchema || "CURRENT USER";
    if (!schemas.has(owner)) schemas.set(owner, new Map());
    const categories = schemas.get(owner);
    if (!categories.has(item.type)) categories.set(item.type, []);
    categories.get(item.type).push(item);
  }
  const owners = [...schemas.keys()].sort((a, b) => a.localeCompare(b));
  if (currentSchema && owners.includes(currentSchema)) owners.splice(owners.indexOf(currentSchema), 1), owners.unshift(currentSchema);
  return <div className="schema-tree oracle-object-tree">{owners.map((owner) => {
    const categories = schemas.get(owner), objectCount = [...categories.values()].reduce((sum, list) => sum + list.length, 0);
    return <OracleSchemaNode key={owner} owner={owner} categories={categories} objectCount={objectCount} currentSchema={currentSchema} query={query} activeKey={activeKey} onToggle={onToggle} onContext={onContext} onDragStart={onDragStart} contextKey={contextKey} searchKinds={searchKinds}/>;
  })}</div>;
}

function ConnectionPicker({ items, current, onClose, onConnect, favorites, setFavorites, groups, onManage, onNew, onEdit, onDuplicate, onDelete, onDisconnect, onReconnect, onTest, managementError }) {
  const dialogRef = useRef(null); useDialogFocus(dialogRef, onClose);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("All connections");
  const [selected, setSelected] = useState(current);
  const searchRef = useRef(null);
  const filtered = useMemo(() => items.filter((item) => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const searchable = `${item.name || item.id} ${item.user || ""} ${item.alias || ""} ${item.title} ${item.host} ${item.port} ${item.service} ${item.env} ${(item.groups||[]).join(" ")}`.toLowerCase();
    return words.every((word) => searchable.includes(word)) && (tab === "All connections" || (tab === "Favorites" && favorites.includes(item.id)) || (tab === "Recent" && item.recent));
  }), [items, query, tab, favorites]);
  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => { if (!filtered.some((item) => item.id === selected?.id)) setSelected(filtered[0] ?? null); }, [filtered, selected]);
  useEffect(() => { setConfirmDelete(false); }, [selected?.id]);
  const toggleFavorite = (id) => setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return <ModalBackdrop onClose={onClose} onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="connection-modal" role="dialog" aria-modal="true" aria-label="Change connection">
    <div className="modal-header"><div><div className="eyebrow">DATABASE SESSION</div><h2>Switch connection</h2><p>Choose a saved profile. Each SQL tab has its own Oracle session and transaction.</p></div><button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={17} /></button></div>
    <label className="picker-search"><Search size={17} /><input ref={searchRef} value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const index = filtered.findIndex((item) => item.id === selected?.id); const next = Math.max(0, Math.min(filtered.length - 1, index < 0 ? 0 : index + (event.key === "ArrowDown" ? 1 : -1))); setSelected(filtered[next] ?? null); } else if (event.key === "Enter" && selected) { event.preventDefault(); onConnect(selected); } }} placeholder="Search alias, host, service, environment…" /><kbd>ESC</kbd></label>
    <div className="picker-tabs">{["All connections", "Favorites", "Recent"].map((name) => <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{name}{name === "Favorites" && <span>{favorites.length}</span>}</button>)}<button className="manage-connections" onClick={onNew}><Plus size={14} /> New connection</button></div>
    <div className="picker-body">{filtered.length ? <VirtualConnectionRows items={filtered} selected={selected} onSelect={setSelected} onConnect={onConnect} favorites={favorites} onToggleFavorite={toggleFavorite} /> : <div className="picker-list"><div className="empty-state"><Search size={20} /><b>No connections found</b><span>{items.length ? "Try another alias, host, or service." : "Create a connection using an alias discovered from TNS_ADMIN."}</span></div></div>}
      <aside className="connection-detail">{selected ? <><div className="detail-title"><span className={`db-icon large ${selected.color}`}><Database size={20} /></span><div><strong>{selected.name || selected.id}</strong><span>{selected.user ? `${selected.user} · ` : ""}{selected.method === "basic" ? "Basic" : selected.method === "descriptor" ? "Custom descriptor" : selected.alias || selected.id}</span></div></div><EnvBadge env={selected.env} color={selected.color} />{selected.available === false && <Feedback kind="warning" title="TNS source unavailable">Edit the alias source or refresh TNS sources in Settings.</Feedback>}<div className="profile-management"><button className="button-secondary" onClick={() => onEdit(selected)} disabled={current.id === selected.id}>Edit</button><button className="button-secondary" onClick={() => onDuplicate(selected)}>Duplicate</button><button className="button-secondary" onClick={() => onTest(selected)} disabled={selected.available === false}>Test</button>{current.id === selected.id && <><button className="button-secondary" onClick={() => onReconnect(selected)}>Reconnect</button><button className="button-secondary" onClick={onDisconnect}>Disconnect</button></>}<button className="button-secondary" onClick={() => setConfirmDelete(true)} disabled={current.id === selected.id}>Delete</button></div>{current.id === selected.id && <small className="profile-hint">Disconnect before editing or deleting this profile.</small>}{confirmDelete && <FeedbackDialog kind="warning" title="Delete connection?" onClose={()=>setConfirmDelete(false)}><p>{selected.name || selected.id}</p><button className="button-secondary" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="button-secondary" onClick={() => { onDelete(selected); setConfirmDelete(false); }}>Delete profile</button></FeedbackDialog>}{managementError && <Feedback title="Connection action failed">{managementError}</Feedback>}<div className="detail-fields"><div><span>HOST</span><b>{selected.host}</b></div><div><span>PORT</span><b>{selected.port}</b></div><div><span>{selected.targetType === "sid" ? "SID" : "SERVICE NAME"}</span><b>{selected.service || "See descriptor"}</b></div>{(!selected.method || selected.method === "tns") && <div><span>CONFIG SOURCE</span><b className="source-path">{selected.source}</b></div>}{selected.method === "descriptor" && <div><span>DESCRIPTOR</span><b className="source-path">{selected.descriptor}</b></div>}</div><div className="connection-labels">{(selected.groups||[]).map(name=><i key={name}>{name}</i>)}</div><button className="button-secondary" onClick={onManage}><Settings2 size={13}/>Manage folders and groups</button><div className="secure-note"><ShieldCheck size={15} /><span>Credentials are encrypted on this device.</span></div>{selected.duplicate && <Feedback kind="warning" title="Duplicate TNS alias">This alias exists in multiple TNS files. This profile uses the source shown above.</Feedback>}</> : <div className="detail-empty">Select a connection to view its details.</div>}</aside>
    </div><footer className="modal-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate <kbd>↵</kbd> Connect</span><div><button className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary" disabled={!selected || selected.available === false || selected.id === current.id} onClick={() => selected && onConnect(selected)}><Zap size={14} /> Connect</button></div></footer>
  </section></ModalBackdrop>;
}

function ConnectionAuthDialog({ profile, connecting, error, onClose, onConnect }) {
  const dialogRef = useRef(null); useDialogFocus(dialogRef, () => !connecting && onClose());
  const [user, setUser] = useState(profile.user || profile.savedUser || "");
  const [useSavedPassword, setUseSavedPassword] = useState(Boolean(profile.hasSavedCredentials));
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(Boolean(profile.hasSavedCredentials));
  return <ModalBackdrop onClose={onClose}><form ref={dialogRef} role="dialog" aria-modal="true" aria-label={profile.testOnly ? "Test connection" : "Connect to Oracle"} className="connection-modal auth-modal" onSubmit={(event) => { event.preventDefault(); onConnect({ user, password, remember }); }}><header className="modal-header"><div><div className="eyebrow">ORACLE AUTHENTICATION</div><h2>{profile.testOnly ? "Test" : "Connect to"} {profile.name || profile.id}</h2><p>{connecting ? "Opening Oracle session…" : `${profile.host}:${profile.port}/${profile.service}`}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={17} /></button></header><div className="auth-fields"><label>Username<input autoFocus autoComplete="username" readOnly={Boolean(profile.user)} value={user} onChange={(event) => setUser(event.target.value)} /></label><ConnectionPassword value={password} onChange={value=>{setUseSavedPassword(false);setPassword(value)}} remember={remember} onRememberChange={setRemember} saved={useSavedPassword} disabled={connecting}/>{error && <Feedback kind={error.startsWith("Test successful")?"success":"error"} title="Oracle connection">{error}</Feedback>}</div><footer className="modal-footer"><div><button type="button" className="button-secondary" onClick={onClose} disabled={connecting}>Cancel</button><button className="button-primary" disabled={connecting || !user || (!password && !profile.hasSavedCredentials)}><Zap size={14} /> {connecting ? "Working…" : profile.testOnly ? "Test connection" : "Connect"}</button></div></footer></form></ModalBackdrop>;
}

function ResultRenderMeasurement({result,onMeasured}){
  const callback=useRef(onMeasured);callback.current=onMeasured;const measured=useRef(new Set());
  useLayoutEffect(()=>{
    const timing=result?.clientTiming,requestId=result?.renderRequestId;
    if(!timing?.startedAtPerf||!timing?.responseAtPerf||!requestId||measured.current.has(requestId)||!result?.columns?.length)return;
    let second=0;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{measured.current.add(requestId);const paintedAt=performance.now();callback.current?.({requestId,renderMs:paintedAt-timing.responseAtPerf,totalMs:paintedAt-timing.startedAtPerf})})});
    return()=>{cancelAnimationFrame(first);if(second)cancelAnimationFrame(second)};
  },[result?.renderRequestId,result?.clientTiming?.responseAtPerf,result?.columns?.length]);
  return null;
}

function SqlResultsView({ onRun, runShortcut, onFindObject, result, editorSql, runState, executing, cancelling, outcome,startedAt,onCancel, filter = "", pageSize = 1000, region,language='en',onFetchMore, fetching = false, pageError = "", initialView = {}, onViewStateChange, onResultRendered,onSql, onRelated, onStreamExport, streamState, onCancelExport, onServerFilter, onClearServerFilter, onConnect, connected, onEdit, onExportColumns, onLookup, onClearFilter, onChildren, onSourceDefinition,sourceDefinition,onCloseSourceDefinition, onUpdateDraft,onGenerateSql,onMetadata,onPin,onExplain,memoryItems=[],onReleaseResult,onExportInsert,liveAppearance,onAppearanceApplied,onSelectionSummary,onSmartObject,linkedColumn,onColumnSource,budget }) {
  const [page, setPage] = useState(initialView.page || 0), [requestedPage, setRequestedPage] = useState(null);
  const [sortColumn, setSortColumn] = useState(initialView.sortColumn ?? -1);
  const [sortDirection, setSortDirection] = useState(initialView.sortDirection || "asc");
  const [rowOrder, setRowOrder] = useState(initialView.rowOrder || []);
  const [options, setOptions] = useState(initialView.options || {}), [hasSelection,setHasSelection]=useState(false),[editState,setEditState]=useState({available:false,on:false,descriptions:false}),[selectedColumn,setSelectedColumn]=useState(null),[layouts,setLayouts]=useState(initialView.layouts||{}), [gridCommand, setGridCommand] = useState(null), [loadingAll, setLoadingAll] = useState(false),[resetGeneration,setResetGeneration]=useState(0),[pivotPanelOpen,setPivotPanelOpen]=useState(false);
  useEffect(()=>{if(!liveAppearance)return;setOptions(current=>liveResultAppearance(current,liveAppearance.patch));onAppearanceApplied?.(liveAppearance.sequence)},[liveAppearance?.sequence]);
  useEffect(() => { if (!pivotPanelOpen) return; const closeOnEscape = event => { if (event.key !== 'Escape' || document.querySelector('.result-hover-popover-anchor, .modal-backdrop')) return; event.preventDefault(); event.stopPropagation(); setPivotPanelOpen(false); document.querySelector('.results-toolbar button[aria-label="Pivot options"]')?.focus(); }; document.addEventListener('keydown', closeOnEscape, true); return () => document.removeEventListener('keydown', closeOnEscape, true); }, [pivotPanelOpen]);
  const openTools=(section='Overview')=>{if(section==='Commands'){window.dispatchEvent(new Event('fbsdb.result.openCommands'));return;}window.dispatchEvent(new CustomEvent('fbsdb.result.openPopover',{detail:{id:section}}));};
  const selectionSummaryCallback=useRef(onSelectionSummary);selectionSummaryCallback.current=onSelectionSummary;
  const [copySelection,setCopySelection]=useState(null);
  const columnSourceRef=useRef(onColumnSource);columnSourceRef.current=onColumnSource;
  const handleSelectionChange=useCallback((hasSelectedCells,columnIndex,summary)=>{setHasSelection(hasSelectedCells);columnSourceRef.current?.(hasSelectedCells?columnIndex:null,false);setCopySelection(summary);setSelectedColumn(hasSelectedCells?columnIndex:null);selectionSummaryCallback.current?.(summary)},[]);
  const command = action => { if(action.type==='cancelExport')onCancelExport?.();else if(action.type==='goTo'){ const index=action.kind==='column'?-1:visibleRows.findIndex(item=>item.index+1===Number(action.target)); if(index>=0)setPage(Math.floor(index/pageSize)); setGridCommand({...action,seq:Date.now()}); }else setGridCommand({...action,seq:Date.now()}); };
  const resetResultView=()=>{setOptions(structuredClone(result?.defaultOptions||{}));setSortColumn(-1);setSortDirection("asc");setRowOrder([]);setPage(0);setRequestedPage(null);setLayouts({});onClearFilter?.();setResetGeneration(value=>value+1)};
  const handledResetGeneration=useRef(0);
  useEffect(()=>{if(resetGeneration>handledResetGeneration.current){handledResetGeneration.current=resetGeneration;command({type:"resetView"})}},[resetGeneration]);
  const budgetNotified = useRef('');
  useEffect(()=>{
    if(!loadingAll||fetching)return;
    if(result?.hasMore&&!pageError){
      const verdict=budget?evaluateBudget({rows:result.rows.length,bytes:estimateResultBytes(result.rows,result.columns?.length)},budget):{exceeded:null,stop:false,message:''};
      if(verdict.exceeded&&budgetNotified.current!==`${result.resultId}:${verdict.exceeded}`){budgetNotified.current=`${result.resultId}:${verdict.exceeded}`;notifyFeedback({kind:'warning',title:'Result budget',message:verdict.message,scope:result.executedTabId||null})}
      if(verdict.stop){setLoadingAll(false);return}
      onFetchMore?.();
    }else setLoadingAll(false);
  },[loadingAll,fetching,result?.rows?.length,result?.hasMore,pageError]);
  const [previewCell, setPreviewCell] = useState(null);
  useEffect(()=>{const loaded=event=>{const {lobId,value}=event.detail||{};if(lobId)setPreviewCell(cell=>cell?.value?.kind==='lob'&&cell.value.lobId===lobId?{...cell,value}:cell)};window.addEventListener('fbsdb.result.lobLoaded',loaded);return()=>window.removeEventListener('fbsdb.result.lobLoaded',loaded)},[]);
  const aliasTemplate=useMemo(()=>queryTemplateFingerprint(result?.executedSql),[result?.executedSql]);
  const [columnAliases,setColumnAliases]=useState(()=>loadTemplateAliases(globalThis.localStorage,aliasTemplate));
  useEffect(()=>setColumnAliases(loadTemplateAliases(globalThis.localStorage,aliasTemplate)),[aliasTemplate]);
  const changeColumnAlias=useCallback((key,label)=>setColumnAliases(saveTemplateAlias(globalThis.localStorage,aliasTemplate,key,label)),[aliasTemplate]);
  const previousViewKey = useRef({ resultId: result?.resultId, filter, pageSize });
  const viewCallback = useRef(onViewStateChange); viewCallback.current = onViewStateChange;
  useEffect(() => { viewCallback.current?.({ page, sortColumn, sortDirection, rowOrder, options, layouts }); }, [page, sortColumn, sortDirection, rowOrder, options, layouts]);
  useEffect(() => {
    const previous = previousViewKey.current;
    if (previous.resultId !== result?.resultId || previous.filter !== filter || previous.pageSize !== pageSize) { setPage(0); setRequestedPage(null); }
    previousViewKey.current = { resultId: result?.resultId, filter, pageSize };
  }, [result?.resultId, filter, pageSize]);
  useEffect(() => {
    if (!result?.columns?.length || executing || fetching || pageError) return;
    const target = requestedPage ?? 0;
    if (result.hasMore && result.rows.length < (target + 1) * pageSize) { onFetchMore?.(); return; }
    if (requestedPage !== null) { setPage(requestedPage); setRequestedPage(null); }
  }, [result, requestedPage, pageSize, executing, fetching, pageError, onFetchMore]);
  const previousSortResult = useRef(result?.resultId);
  useEffect(() => { if (previousSortResult.current !== result?.resultId) { setSortColumn(-1); setSortDirection("asc"); setRowOrder([]); setOptions({}); } previousSortResult.current = result?.resultId; }, [result?.resultId]);
  const materialized=useMemo(()=>{try{return deriveResultData(result?.rows||[],result?.columns||[],options.derivedColumns||[])}catch(error){return {rows:result?.rows||[],columns:result?.columns||[],error:error.message}}},[result?.rows,result?.columns,options.derivedColumns]);
  const rows=materialized.rows, columns=materialized.columns;
  const viewMode = resultViewMode(options);
  useEffect(() => { setHasSelection(false); setSelectedColumn(null); }, [viewMode]);
  const columnLayout = layouts[viewMode] || {};
  const handleLayoutChange = useCallback(layout => setLayouts(current => ({ ...current, [viewMode]: layout })), [viewMode]);
  const display = useMemo(() => {
    try { return buildResultDisplay(rows, columns, options, filter, sortColumn, sortDirection, rowOrder); }
    catch (error) { return { mode: viewMode, columns: [], rawRows: [], rows: [], options, sortColumn: -1, sortDirection: 'asc', error: error.message }; }
  }, [rows, columns, options, filter, sortColumn, sortDirection, rowOrder, viewMode]);
  const visibleRows = display.rows, viewColumns = display.columns, viewOptions = display.options;
  const changeViewOptions = next => { setOptions(current => updateResultViewOptions(current, next, viewMode)); setPage(0); };
  const setViewSort = (column, direction) => {
    if (viewMode === 'source') { setSortColumn(column); setSortDirection(direction); }
    else setOptions(current => ({ ...current, [`${viewMode}View`]: { ...(current[`${viewMode}View`] || {}), sortColumn: column, sortDirection: direction } }));
  };
  const reorderRow = (source, target, after) => {
    const order = applyResultFeatures(getVisibleResultRows(rows, columns, "", sortColumn, sortDirection, rowOrder,options),columns,{...options,filters:[],markedOnly:false,duplicatesOnly:false}).map(item=>item.index);
    setRowOrder(moveResultRow(order, source, target, after)); setSortColumn(-1); setOptions(current=>({...current,sorts:[]}));
  };
  const toggleSort = (columnIndex, request = {}) => {
    const next=nextColumnSort({sortColumn:display.sortColumn,sortDirection:display.sortDirection,sorts:viewOptions.sorts||[]},columnIndex,request);
    changeViewOptions({...viewOptions,sorts:next.sorts});setViewSort(next.sortColumn,next.sortDirection);
    if(viewMode==='source'&&!request.clear)setRowOrder([]);setPage(0);
  };

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize)), safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(() => visibleRows.slice(safePage * pageSize, (safePage + 1) * pageSize), [visibleRows, safePage, pageSize]);
  const firstVisible = visibleRows.length ? safePage * pageSize + 1 : 0, lastVisible = Math.min((safePage + 1) * pageSize, visibleRows.length);
  const exportView = { columns: viewColumns, rows: visibleRows.map(item => item.row), visibleColumns: displayedColumnIndices(viewColumns, columnLayout, viewOptions), settings: viewOptions.exportSettings || {} };
  const toolbar=<ResultToolbar initialDefaults={result?.defaultOptions||{}} pivotPanelOpen={pivotPanelOpen} onTogglePivotPanel={()=>setPivotPanelOpen(open=>!open)} viewKind={viewMode} columns={viewColumns} sourceColumns={columns} loadedRows={display.rawRows} columnLayout={columnLayout} sortColumn={display.sortColumn} selectedColumn={selectedColumn} memoryItems={memoryItems} onReleaseResult={onReleaseResult} onCommand={command} onClearSort={()=>{setViewSort(-1,'asc');if(viewMode==='source')setRowOrder([])}} onOptionsChange={changeViewOptions} onLayoutChange={layout=>command({type:'layoutApply',layout})} onExport={(format,indices,overrideOptions)=>onExportColumns?.(format,indices,overrideOptions,exportView)} onExportInsert={viewMode==='source'?onExportInsert:undefined} onGenerateSql={onGenerateSql} onMetadata={onMetadata} onLookup={onLookup} onFetchMore={onFetchMore} onLoadAll={()=>setLoadingAll(true)} onStopLoad={()=>setLoadingAll(false)} loadingAll={loadingAll} onStreamExport={viewMode==='source'?onStreamExport:undefined} streamState={streamState} onServerFilter={viewMode==='source'?onServerFilter:undefined} hasData={Boolean(result?.columns?.length&&!result?.released&&!executing&&!outcome)} hasExecution={Boolean(result?.executedSql)} hasSelection={hasSelection} editAvailable={editState.available} editing={editState.on} descriptionsOpen={editState.descriptions} onToggleEdit={()=>command({type:'toggleEdit'})} onToggleDescriptions={()=>command({type:'toggleDescriptions'})} selectionSummary={copySelection} pageCount={pageCount} hasMore={result?.hasMore} busy={executing||fetching} options={viewOptions} onAction={action=>{
    if(action==='find')command({type:'find'});else if(action==='copy')command({type:'copyTsv'});else if(action==='inspect')command({type:'inspect'});else if(action==='details')command({type:'details'});else if(action==='execution')command({type:'execution'});else if(action==='marks')command({type:'marks'});else if(action==='pin')onPin?.();else if(action==='explain')onExplain?.();else if(action==='clear')resetResultView();
  }}/>;
  let body;
  if (executing) body=<ResultRunning startedAt={startedAt} cancelling={cancelling} onCancel={onCancel}/>;
  else if (outcome) body=<ResultFailure outcome={outcome} onEdit={outcome.kind==='cancelled'?undefined:onEdit} onAction={action=>action==='connection'?onConnect?.():onFindObject?.()}/>;
  else if (!result) body=<ResultIdle guidance={idleGuidance({connected,executing,hasSql:Boolean(editorSql?.trim()),runShortcut})} onAction={action=>action==='connect'?onConnect?.():action==='run'?onRun?.():onEdit?.()}/>;
  else if (result.released) body=<ResultNotice title="Result data released" detail="Run the SELECT again to load records."/>;
  else if (!result.columns?.length) body=<ResultNotice kind="success" title="Statement completed" metric={result.rowsAffected>=0&&result.rowsAffected!=null?`${result.rowsAffected} rows affected`:undefined} detail={`${result.transactionPending?'Pending transaction · commit or rollback when ready. ':''}${result.elapsedMs??0} ms`}/>;
  else if (!rows.length&&!result.hasMore) body=<ResultNotice kind="empty" {...noRowsGuidance()} onEdit={onEdit} metric={`0 rows · ${result.elapsedMs??0} ms`}/>;
  else if (!visibleRows.length&&(filter.trim()||viewOptions.filters?.length||viewOptions.markedOnly||viewOptions.duplicatesOnly)&&!materialized.error&&!display.error) body=<ResultNotice kind="empty" title="No rows match this view" detail={`${rows.length} loaded rows. Local filters hide all rows.`} onClear={()=>{changeViewOptions({...viewOptions,filters:[],markedOnly:false,duplicatesOnly:false});onClearFilter?.()}}/>;
  else body=<>{(materialized.error||display.error)&&<Feedback title="Result view">{materialized.error||display.error}</Feedback>}<div className="result-presentation-layout"><ResultsPresentation textFilter={filter} language={language} pivotPanelOpen={pivotPanelOpen} onClosePivotPanel={()=>setPivotPanelOpen(false)} pivotPanel={<PivotOptionsPanel columns={columns} options={viewOptions} onChange={changeViewOptions} onClose={()=>setPivotPanelOpen(false)}/>} viewKind={viewMode} sourceRowCount={rows.length} onSourceDefinition={onSourceDefinition} sourceDefinition={sourceDefinition} onCloseSourceDefinition={onCloseSourceDefinition} executionDetails={result} onUpdateDraft={onUpdateDraft} rows={pageRows} allRows={visibleRows} pageSize={pageSize} onRowPage={setPage} onSmartObject={onSmartObject} linkedColumn={viewMode==='source'?linkedColumn:null} onColumnSource={viewMode==='source'?onColumnSource:undefined} columnAliases={columnAliases} onColumnAlias={viewMode==='source'&&aliasTemplate?changeColumnAlias:undefined} onChildren={onChildren} columns={viewColumns} sortColumn={display.sortColumn} sortDirection={display.sortDirection} onSort={toggleSort} onReorder={viewMode==='source'?reorderRow:undefined} options={{...viewOptions,cursorUnavailable:result.cursorUnavailable,truncated:result.truncated}} onOptionsChange={changeViewOptions} onSelectionChange={handleSelectionChange} onEditState={setEditState} onLayoutChange={handleLayoutChange} onTools={openTools} command={gridCommand} onSql={onSql} onRelated={onRelated} onInspect={setPreviewCell} />{pivotPanelOpen&&viewOptions.transpose&&<TransposePivotInspector columns={columns} options={viewOptions} onChange={changeViewOptions} onClose={()=>setPivotPanelOpen(false)}/>}</div><div className="result-footer"><div><span className="success-state"><Check size={12} /> {firstVisible}–{lastVisible} {t('displayed',language)}</span><span className="foot-separator">·</span><span>{rows.length} {t(result.hasMore ? 'loaded · more available' : result.cursorUnavailable ? 'retained rows' : 'loaded rows',language)}{filter.trim() || viewOptions.filters?.length || viewOptions.markedOnly || viewOptions.duplicatesOnly ? ` · ${visibleRows.length} ${t('match',language)}` : ""}</span></div><div className="result-page-controls">{result.executedAt && <span className="result-context" title={result.executedSql}>{result.executedProfile} · {new Date(result.executedAt).toLocaleTimeString(region||undefined)} · {result.editorSnapshot !== editorSql ? (language==='tr'?'SQL çalıştırmadan sonra değişti':'SQL changed since execution') : (language==='tr'?'Son çalıştırma':'Last execution')}</span>}<span role="status">{fetching ? t("Loading page…",language) : pageError || `${t('Database',language)} ${result.elapsedMs} ms`}</span>{result.clientTiming?.totalMs!=null&&<span className="result-client-timing" title={language==='tr'?'Sorgu isteğinden son çizime kadar geçen süre':'From query request until the result finished rendering'}>{t('End-to-end',language)} {Math.round(result.clientTiming.totalMs)} ms</span>}{pageError && result.hasMore && <button className="button-secondary" onClick={onFetchMore}>{t('Retry',language)}</button>}{(pageCount > 1 || result.hasMore) && <><button className="pager-button" aria-label={t('Previous result page',language)} title={t('Previous page',language)} disabled={safePage === 0 || fetching} onClick={() => setPage(safePage - 1)}><ChevronRight size={12} className="flip" /></button><span className="result-page-number">{safePage + 1} / {pageCount}{result.hasMore ? "+" : ""}</span><button className="pager-button" aria-label={t('Next result page',language)} title={t('Next page',language)} disabled={fetching || (safePage >= pageCount - 1 && !result.hasMore)} onClick={() => { const next = safePage + 1; if (next < pageCount) setPage(next); else { setRequestedPage(next); onFetchMore?.(); } }}><ChevronRight size={12} /></button></>}</div></div></>;
  return <>{toolbar}<HeldDraftsNotice currentKey={draftStoreKey(getNativeTabId(),result?.columns||[])}/>{fetching&&<ResultRunning compact fetching startedAt={startedAt} cancelling={cancelling} onCancel={onCancel}/ >}{pageError&&<Feedback title="Rows could not be loaded">{pageError}</Feedback>}{Boolean(result?.columns?.length)&&<ResultScope columns={viewColumns} options={viewOptions} filter={filter} sortColumn={display.sortColumn} sortDirection={display.sortDirection} serverFilter={result.serverFilter} hasMore={result.hasMore} busy={executing||fetching} onOptionsChange={changeViewOptions} onClearSearch={onClearFilter} onClearSort={()=>setViewSort(-1,'asc')} onClearServerFilter={onClearServerFilter}/>}<div className="result-view-content">{body}</div><ResultRenderMeasurement result={result} onMeasured={onResultRendered}/>{previewCell&&<Suspense fallback={<div role="status">Loading…</div>}><ResultValueDialog cell={previewCell} onClose={()=>setPreviewCell(null)}/></Suspense>}</>;
}
function getBindNames(sql) {
  return getOracleBindNames(sql);
}

export function App() {
  const [monaco, setMonaco] = useState(null);
  const [pendingDdl,setPendingDdl]=useState(null);
  const [showGettingStarted,setShowGettingStarted]=useState(()=>{try{return !localStorage.getItem('fbsdb.onboardingSeen')||resolveSetting(loadSettings(localStorage),'ui.startupWorkspaceHub').value}catch{return true}});
  const [settings,setSettings]=useState(()=>loadSettings(localStorage)),[settingsError,setSettingsError]=useFeedbackState('',{title:'Settings',scope:null});
  const settingsRef=useRef(settings);settingsRef.current=settings;
  useEffect(()=>{try{saveSettings(localStorage,settings);setSettingsError('')}catch{setSettingsError('Settings could not be saved on this device.')}},[settings]);
  const [showOpenWorkspace,setShowOpenWorkspace]=useState(false),[showWorksets,setShowWorksets]=useState(false),[showWorkspaceManager,setShowWorkspaceManager]=useState(false),[workspaceSearchScope,setWorkspaceSearchScope]=useState(null),[workspaceReplaceScope,setWorkspaceReplaceScope]=useState(null);
  const [workspaceDevMode,setWorkspaceDevMode]=useState(null),[workspaceDev,setWorkspaceDev]=useState({});
  const workspaceDevRequestsRef=useRef(new Map());
  const [connectionDiagnostics,setConnectionDiagnostics]=useState(null),[showSessionInspector,setShowSessionInspector]=useState(false),[showRunConsole,setShowRunConsole]=useState(false),[showPortability,setShowPortability]=useState(false),[relatedFileCreate,setRelatedFileCreate]=useState(null),[showLocalHistory,setShowLocalHistory]=useState(false),[compareSources,setCompareSources]=useState(null),[quickEval,setQuickEval]=useState(null),[subqueryTrial,setSubqueryTrial]=useState(null),[lookupPicker,setLookupPicker]=useState(null),[draftGuard,setDraftGuard]=useState(null),[dateFormatDesigner,setDateFormatDesigner]=useState(null),[regexWorkbench,setRegexWorkbench]=useState(null),[uncertainCommit,setUncertainCommit]=useState(null),[bindStoreVersion,setBindStoreVersion]=useState(0);
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
  const [recovery,setRecovery]=useState(()=>{try{return parseDraftSnapshot(localStorage.getItem('fbsdb.sqlDrafts'))}catch{return null}});
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
    () => [{ id: "tab-1", name: isNativeHost ? "Query 1" : "monthly-invoices.sql", path: null, content: isNativeHost ? "" : initialSql,savedContent:isNativeHost?"":initialSql, dirty: false }]);
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
  const [showMiniTools, setShowMiniTools] = useState(false);
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
  const [clipboardHistoryOpen,setClipboardHistoryOpen]=useState(false),[clipboardEnabled,setClipboardEnabled]=useState(false),[clipboardEntries,setClipboardEntries]=useState([]);
  const [editorMacrosOpen,setEditorMacrosOpen]=useState(false),[macroRecording,setMacroRecording]=useState(null),[editorMacros,setEditorMacros]=useState([]),macroRunRef=useRef(null);
  useEffect(()=>{
    if(!clipboardEnabled)return;
    const copied=event=>{
      if(!event.target?.closest?.('.editor-sql-surface'))return;
      const editor=editorRef.current,model=editor?.getModel(),selections=editor?.getSelections();
      if(!model||!selections?.length||selections.some(selection=>selection.isEmpty()))return;
      const parts=selections.map(selection=>model.getValueInRange(selection));
      setClipboardEntries(history=>rememberClipboard(history,parts));
    };
    document.addEventListener('copy',copied);return()=>document.removeEventListener('copy',copied);
  },[clipboardEnabled]);
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
    const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection();
    if(!model||activeTabReadonly)return;
    if(!selection||selection.isEmpty()){notifyFeedback({kind:'warning',title:'Extract CTE',message:'Select the subquery to extract.',scope:documents.activeId});return}
    const text=model.getValue(),start=model.getOffsetAt(selection.getStartPosition()),end=model.getOffsetAt(selection.getEndPosition()),statement=getSqlStatements(text).find(item=>item.start<=start&&end<=item.end);
    if(!statement){notifyFeedback({kind:'warning',title:'Extract CTE',message:'The selection must be inside one statement.',scope:documents.activeId});return}
    const raw=text.slice(statement.start,statement.end),result=extractCteSnippet(raw,start-statement.start,end-statement.start);
    if(result.error){notifyFeedback({kind:'warning',title:'Extract CTE',message:result.error,scope:documents.activeId});return}
    const from=model.getPositionAt(statement.start),to=model.getPositionAt(statement.end);
    editor.setSelection(new monacoRef.current.Selection(from.lineNumber,from.column,to.lineNumber,to.column));editor.focus();
    editor.getContribution('snippetController2').insert(result.snippet.replace(/\n/g,model.getEOL()),{adjustWhitespace:false,undoStopBefore:true,undoStopAfter:true});
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
  useEffect(()=>{
    const tab=documents.active,session=tabSessions[tab?.id]||{},profile=session.activeConnection?.id;
    if(!largePolicy.source||!isNativeHost||!tab?.path||tab.readOnly||!profile||['No connection','Disconnected'].includes(profile)||session.connectionLost||session.executing||session.connecting||session.inactive||session.scriptRun?.running)return;
    const timer=setTimeout(()=>{
      for(const prepared of sourceCompilationUnits(tab,workspace.projectRules).slice(0,32)){
        const identity=sourceIdentity(prepared.declaration);
        const key=JSON.stringify([tab.id,tab.path,profile,identity,completionSession.schemaOwner]);
        if(sourceBaselineAttempts.current.has(key))continue;
        sourceBaselineAttempts.current.add(key);
        const request=sendNativeCommand('source.review',{tabId:tab.id,sql:prepared.sql});
        sourceBaselineRequests.current.set(request,{tabId:tab.id,profile,key,identity});
      }
    },300);
    return()=>clearTimeout(timer);
  },[activeTabId,filePath,sql,tabSession.activeConnection?.id,tabSession.executing,tabSession.connecting,tabSession.inactive,tabSession.connectionLost,tabSession.scriptRun?.running,workspace.projectRules,completionSession.schemaOwner,largePolicy.source]);
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

  useEffect(() => {
    const unsubscribe = subscribeNativeMessages((message) => {
      const owner = message?.tabId || operations.owners.get(message?.requestId) || documents.activeId;
      const operation=operations.running.get(owner);
      if(typeof message.connected==='boolean')updateTabSession('connectionLost',!message.connected,owner);
      if((['sql.result','sql.timeout'].includes(message?.type)||message?.type==='host.error'&&operations.history.has(message.requestId))&&operation&&(operation.requestId!==message.requestId||operation.status!=='running'))return;
      replyOwnerRef.current = owner;
      try {
      if(typeof message?.autoCommit==='boolean')updateTabSession('autoCommit',message.autoCommit,owner);
      // Grid Apply and its undo change the session's transaction outside any query result; Commit and Rollback depend on this state.
      if(['sql.dmlApplied','sql.gridBatchRolledBack'].includes(message?.type)&&typeof message.transactionPending==='boolean')setTransactionPending(message.transactionPending,owner);
      if(message?.type==='transaction.state')settleStoredTransactions(owner,message.unconfirmed?'unconfirmed':message.state);
      if(message?.type==='connection.connected')settleStoredTransactions(owner,'reconnected');
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
        if(message.sql) { const profile=sessionsRef.current[owner]?.activeConnection;newSqlFileNow(); const id=documents.activeId; setTabs(current=>current.map(tab=>tab.id===id?{...tab,name:'Related.sql',content:message.sql,dirty:true,connectionProfileId:profile?.id}:tab));if(profile?.id&&!['Disconnected','No connection'].includes(profile.id))beginConnection({...profile,tabId:id}); } else setRunState(message.message||'No related records metadata available');
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
      } else if (message?.type === "ui.terminal") { notifyFeedback({kind:message.opened?"success":"warning",title:"External terminal",message:message.message,scope:documents.activeId});
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
  }, []);

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

  useEffect(() => {
    const handler = (event) => {
      if(event.altKey&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&event.key.toLowerCase()==='o'&&!document.querySelector('.modal-backdrop')&&isNativeHost&&workspace.root&&editorRef.current?.hasTextFocus()){event.preventDefault();setRelatedSources({root:workspace.root,document:documents.active});return;}
      if(event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&event.key.toLowerCase()==='o'&&!document.querySelector('.modal-backdrop')&&editorRef.current?.hasTextFocus()){event.preventDefault();switchPackageSource();return;}
      if(editorRef.current?.hasTextFocus()&&!document.querySelector('.modal-backdrop')){
        const shortcuts=resolveSetting(settingsRef.current,'editor.shortcuts').value;
        if(matchesShortcut(event,shortcuts.bookmark)){event.preventDefault();setShowBookmarks(true);return}
        if(matchesShortcut(event,shortcuts.nextBookmark)){event.preventDefault();navigateBookmark(1);return}
        if(matchesShortcut(event,shortcuts.previousBookmark)){event.preventDefault();navigateBookmark(-1);return}
      }
      if(editorRef.current?.hasTextFocus()&&!document.querySelector('.modal-backdrop')){
        const shortcuts=resolveSetting(settingsRef.current,'editor.shortcuts').value;
        if(matchesShortcut(event,shortcuts.callHierarchy)){event.preventDefault();openCallHierarchy();return}
        if(matchesShortcut(event,shortcuts.lastEdit)){event.preventDefault();navigateEdit('last');return}
        if(matchesShortcut(event,shortcuts.previousEdit)){event.preventDefault();navigateEdit(-1);return}
        if(matchesShortcut(event,shortcuts.nextEdit)){event.preventDefault();navigateEdit(1);return}
        if(matchesShortcut(event,shortcuts.lastExecution)){event.preventDefault();returnToExecution();return}
      }
      if(matchesShortcut(event,resolveSetting(settingsRef.current,'editor.shortcuts').value.outline)){event.preventDefault();if(!document.querySelector('.modal-backdrop'))setPaletteMode('outline');return;}
      if(event.altKey&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();navigateHistory(event.key==='ArrowLeft'?-1:1);return;}
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='p'){event.preventDefault();event.stopPropagation();if(!document.querySelector('.modal-backdrop')||paletteMode)setPaletteMode(event.shiftKey?'commands':'files');return;}
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === "z") { event.preventDefault(); setFocusMode(value=>!value); return; }
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.shiftKey && event.key.toLowerCase() === "m") { event.preventDefault();event.stopImmediatePropagation(); if(!document.querySelector('.modal-backdrop'))macroRunRef.current?.(); return; }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "f" && !editorRef.current?.hasTextFocus()) { event.preventDefault(); setShowSearch(true); setShowHistory(false); return; }
      if (event.key === "F8" && !document.querySelector(".modal-backdrop, .feedback-notification")) { const items = problemsRef.current.filter(problem => problem.tabId === documents.activeId); if (items.length) { event.preventDefault(); problemCursorRef.current = problemCursorRef.current < 0 ? event.shiftKey ? items.length - 1 : 0 : (problemCursorRef.current + (event.shiftKey ? -1 : 1) + items.length) % items.length; navigateProblem(items[problemCursorRef.current]); } return; }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "o") { event.preventDefault(); openSqlFile(); return; }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "n") { event.preventDefault(); if (!document.querySelector('.modal-backdrop')) newSqlFileFromLastConnection(); return; }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === "Tab") { event.preventDefault(); if (!document.querySelector('.modal-backdrop')) cycleSqlTab(event.shiftKey ? -1 : 1); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if(!editorIsReadonly())saveSqlFile(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") { event.preventDefault(); if (!editorIsReadonly()) setShowPicker(true); return; }
      if ((event.ctrlKey || event.metaKey) && event.code === "Space" && !event.defaultPrevented && editorRef.current?.hasTextFocus()) { manualSuggestionRef.current = true; event.preventDefault(); editorRef.current.trigger("keyboard", "editor.action.triggerSuggest", {}); }
    };
    window.addEventListener("keydown", handler,true); return () => window.removeEventListener("keydown", handler,true);
  }, [showPicker, showAppearance, showHistory, showSearch, showSnippets, fileDirty, sql, filePath, fileName, recentProfiles, workspace.root,workspace.projectRules]);

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

  useEffect(() => {
    const runStatementShortcut = (event) => {
      const editor=editorRef.current;if(!editor?.hasTextFocus())return;
      const shortcuts=resolveSetting(settingsRef.current,'editor.shortcuts').value;
      if(matchesShortcut(event,shortcuts.run)){event.preventDefault();event.stopImmediatePropagation();runQueryRef.current?.();return;}
      if(matchesShortcut(event,'Ctrl+Shift+F')||matchesShortcut(event,shortcuts.format)){event.preventDefault();event.stopImmediatePropagation();formatterRef.current?.();return;}
      for(const action of editorShortcutActions.filter(action=>action.command)){
        if(matchesShortcut(event,shortcuts[action.id])){
          event.preventDefault();event.stopImmediatePropagation();
          if(action.id==='suggest')manualSuggestionRef.current=true;
          if(!action.edits||!editorIsReadonly())editor.trigger('keyboard',action.command,{});
          return;
        }
      }
    };
    window.addEventListener("keydown", runStatementShortcut, true);
    return () => window.removeEventListener("keydown", runStatementShortcut, true);
  }, [settings.user['editor.shortcuts']]);

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
  useEffect(() => {
    if (!monaco || !completionClientRef.current) return;
    const client = completionClientRef.current;
    const broker = completionMetadataRef.current;
    client.configure({ settings: completionSettings, objects: completionObjects, currentSchema: completionSchema, version: completionSession.oracleVocabulary?.version || 19, liveWords: completionSession.oracleVocabulary?.words || [], snippets: allSqlSnippets, learning: completionSettings.learning ? suggestionLearningRef.current.snapshot(suggestionScope()) : [], recent: completionRecentRef.current.get(activeTabId) || [] });
    client.metadata(broker.objects(metadataOriginTabId), broker.systemObjects(metadataOriginTabId), broker.version(metadataOriginTabId));
    return installOracleLanguageProviders({
      monaco, editor: editorRef.current, client, broker, acceptanceCommand: completionAcceptanceRef.current, definitionModels: definitionModelsRef.current,
      snapshot: () => {
        const tab = documents.tabs.find(item => item.id === documents.activeId), originTabId = tab?.metadataOriginTabId || documents.activeId;
        const originSession = sessionsRef.current[originTabId] || {}, connection = originSession.activeConnection;
        return { semanticHighlighting:resolveSetting(settingsRef.current,'editor.semanticHighlighting').value,languageFeatures:largeFilePolicy(tab?.content,largeFileOverridesRef.current[tab?.id]), busy: !!(originSession.executing || originSession.scriptRun?.running || originSession.fetchingPage), sourceObject: tab?.definitionObject, tabId: documents.activeId, originTabId, connected: isNativeHost && !!connection && !["No connection", "Disconnected"].includes(connection.id), settings: completionSettings,
          manualSuggestion: () => { const manual = manualSuggestionRef.current; manualSuggestionRef.current = false; return manual; } };
      },
      onDefinition: openOracleDefinition,
      onBeforeNavigate:()=>rememberLocation(),
      onReveal: target => {
        if (metadataOriginTabId !== documents.activeId) activateTab(metadataOriginTabId);
        setSidebarOpen(true); setSchemaQuery("");
        const object = sessionsRef.current[metadataOriginTabId]?.schemaObjects?.find(item => item.owner === target.owner && item.name === target.name && item.type === target.type);
        if (object) { setActiveObject(oracleSchemaKey(object)); requestSchemaDetails(object); requestAnimationFrame(() => { const section = document.querySelector('.schema-section'); if (section) section.open = true; }); }
        else setCompletionError("This object is not in the current Object Explorer scope.");
      },
      onError: setCompletionError,
      onPlscope: setPlscopeReport,
      projectUsage: () => { const sources = usageSourcesRef.current?.(); return sources ? { activePath: sources.activePath, usage: loadProjectUsage(sources) } : null; },
    });
  }, [monaco, completionSettings, completionObjects, completionSchema, completionSession.oracleVocabulary, allSqlSnippets, activeTabId, metadataOriginTabId,largeFileOverrides,settings.user['editor.semanticHighlighting']]);

  useEffect(() => {
    if (!monaco) return;
    const owner = activeTabId;
    if(!largePolicy.diagnostics){updateTabSession('lintProblems',[],owner);const model=editorRef.current?.getModel();if(model)monaco.editor.setModelMarkers(model,'fbsdb-lint',[]);return;}
    let cancelled=false;
    const timer = setTimeout(async () => {
      const model = editorRef.current?.getModel(), client = completionClientRef.current;
      if (!model || !client) return;
      const text = model.getValue(), version = model.getVersionId();
      const result = await client.request("diagnostics", text, 0);
      if (cancelled || !result.diagnostics || model.isDisposed() || model.getVersionId() !== version || documents.activeId !== owner) return;
      const problems = result.diagnostics.map((item, index) => {
        const start = model.getPositionAt(item.start), end = model.getPositionAt(item.end);
        return { ...item, id: `${owner}:lint:${index}`, tabId: owner, fileName: documents.tabs.find(tab => tab.id === owner)?.name || "SQL", line: start.lineNumber, column: start.column, offset: item.start, editorSnapshot: text, startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column };
      });
      updateTabSession("lintProblems", problems, owner);
      monaco.editor.setModelMarkers(model, "fbsdb-lint", problems.map(problem => ({ ...problem, severity: problem.severity === "warning" ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error })));
    }, 250);
    return () => {cancelled=true;clearTimeout(timer)};
  }, [monaco, sql, activeTabId, completionSettings, completionObjects, completionSchema, completionSession.oracleVocabulary,largePolicy.diagnostics]);

  useEffect(() => {
    const model = editorRef.current?.getModel(); if (!monaco || !model) return;
    const items = [...(tabSession.compilationProblems || []), ...(tabSession.runtimeProblems || [])].filter(problem => problem.offset != null && problem.editorSnapshot === sql);
    monaco.editor.setModelMarkers(model, "fbsdb-runtime", items.map(problem => { const position = model.getPositionAt(problem.offset); return { message: problem.message, severity: problem.severity === "warning" ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error, startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: Math.min(position.column + 1, model.getLineMaxColumn(position.lineNumber)) }; }));
  }, [monaco, sql, activeTabId, tabSession.compilationProblems, tabSession.runtimeProblems]);

  function updateTokenColor(token, color) { setAllTokenColors((current) => ({ ...current, [theme]: { ...current[theme], [token]: color } })); }
  function editorIsReadonly() { return objectTabActive || !!documents.tabs.find(tab => tab.id === documents.activeId)?.readOnly; }
  async function navigateProblem(problem) {
    const tab = documents.tabs.find(tab => tab.id === problem.tabId);
    if (!tab) return;
    const text = problem.tabId === documents.activeId ? documents.text : tab.content;
    if(problem.source==='Oracle stack'&&problem.definition){
      const session=sessionsRef.current[problem.tabId]||{};
      if(session.connectionLost||problem.executedProfileId&&problem.executedProfileId!==session.activeConnection?.id||problem.executedConnectionGeneration!=null&&problem.executedConnectionGeneration!==(session.connectionGeneration??0)){
        notifyFeedback({kind:'warning',title:'Stack source',message:'The execution session changed. Return to its connection context before loading source.'});return;
      }
    }

    if (problem.offset != null && problem.editorSnapshot === text) {
      rememberLocation();
      if (problem.tabId !== documents.activeId) activateTab(problem.tabId);
      requestAnimationFrame(() => { const editor = editorRef.current, model = editor?.getModel(); if (!model || model.getValue() !== text) return; const position = model.getPositionAt(problem.offset); editor.setPosition(position); editor.revealPositionInCenter(position); editor.focus(); rememberLocation(problem.tabId,position); });
      return;
    }
    if (problem.definition) {
      let source = problem.definition;
      if (!source.text) {
        if(problem.source==='Oracle stack')completionMetadataRef.current.invalidate(problem.tabId,{...source});
        const epoch=completionMetadataRef.current.session(problem.tabId).epoch;
        const loaded = await completionMetadataRef.current.load(problem.tabId, { owner: source.owner, name: source.name, type: source.type.replace(/ BODY$/, ''), body: source.type.endsWith(' BODY') }, null, 'definition');
        if (!loaded||completionMetadataRef.current.session(problem.tabId).epoch!==epoch||closedTabsRef.current.has(problem.tabId)) return;
        source = { ...loaded, originTabId: problem.tabId, sourceVersionNotice:problem.source==='Oracle stack'?'Current server source retrieved after failure. The execution source version is unknown; this line may have changed.':null };
      }
      const offset = offsetAtOraclePosition(source.text, problem.oracleLine, problem.oracleColumn);
      const prefix = offset == null ? null : source.text.slice(0, offset);
      openOracleDefinition(source, prefix == null ? null : { lineNumber: prefix.split('\n').length, column: prefix.length - prefix.lastIndexOf('\n') });
      return;
    }
    if (problem.tabId !== documents.activeId) activateTab(problem.tabId);
    if (problem.source === 'Oracle') setResultTab('Output', problem.tabId);
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
    const owner=documents.active?.metadataOriginTabId||documents.activeId,context=operations.metadata.get(owner),original=documents.tabs.find(tab=>tab.id===owner);
    if(!context||!original){setRunState('No execution source is recorded for this document.');return;}
    setObjectTabActive(false);
    const offset=currentExecutionOffset(context,original);
    if(offset!=null){if(documents.activeId!==owner)activateTab(owner);requestAnimationFrame(()=>jumpToOffset(offset));return;}
    const id=`execution-snapshot:${owner}`,hasPosition=Number.isInteger(context.statementOffset),content=hasPosition?context.editorSnapshot:context.executedSql;
    if(typeof content!=='string'){setRunState('The execution source position was not recorded.');return;}
    rememberEditorPosition();documents.open({id,name:`Execution · ${context.fileName||original.name}`,content,readOnly:true,dirty:false,metadataOriginTabId:owner,sourceVersionNotice:'Recorded execution snapshot. Current editor source differs or its position is unavailable.'});setNativeTabId(owner);
    requestAnimationFrame(()=>jumpToOffset(hasPosition?context.statementOffset:0));
  }
  function jumpToOffset(offset) {const editor=editorRef.current;if(!editor?.getModel())return;rememberLocation();const position=editor.getModel().validatePosition(sourcePositionAt(documents.text,offset));editor.setPosition(position);editor.revealPositionInCenter(position);editor.focus();rememberLocation();}
  useEffect(()=>{
    const editor=editorRef.current;if(!monaco||!editor)return;
    let disposed = false;
    const show=async event=>{
      const model=editor.getModel();if(!model)return;
      const position=event.target?.position||editor.getPosition(),selection=editor.getSelection();
      if(position&&(!selection||selection.isEmpty()||!selection.containsPosition(position)))editor.setPosition(position);
      const range=editor.getSelection(),start=model.getOffsetAt(range.getStartPosition()),end=model.getOffsetAt(range.getEndPosition());
      const version = model.getVersionId();
      event.event?.preventDefault?.();event.event?.stopPropagation?.();
      const { editorContextObject } = await import('./editorContext.js');
      if (disposed || model.isDisposed() || editor.getModel() !== model || model.getVersionId() !== version) return;
      const object=editorContextObject(model.getValue(),start,end,model.getOffsetAt(position),completionObjects,completionSchema);
      const trigger=editor.getDomNode(),r=trigger.getBoundingClientRect(),x=event.event?.posx||r.left+30,y=event.event?.posy||r.top+30;
      event.event?.preventDefault?.();event.event?.stopPropagation?.();
      if(object){openObjectContext({type:'contextmenu',preventDefault(){},stopPropagation(){},currentTarget:trigger,clientX:x,clientY:y},object);setEditorContext(null)}
      else setEditorContext({tabId:documents.activeId,model,version:model.getVersionId(),selection:range,trigger,x,y,bind:range.isEmpty()?bindAtOffset(model.getValue(),model.getOffsetAt(position)):null,bindType:range.isEmpty()?bindTypeFor(bindAtOffset(model.getValue(),model.getOffsetAt(position)),model.getValue()):null,selected:!range.isEmpty(),canUndo:model.canUndo(),canRedo:model.canRedo(),readOnly:editorIsReadonly()});
    };const listener=editor.onContextMenu(show),keyboard=editor.onKeyDown(event=>{const e=event.browserEvent;if(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey){e.preventDefault();e.stopPropagation();const position=editor.getPosition(),p=editor.getScrolledVisiblePosition(position),r=editor.getDomNode().getBoundingClientRect();show({target:{position},event:{posx:r.left+(p?.left||20),posy:r.top+(p?.top||20)+20}})}});return()=>{disposed=true;listener.dispose();keyboard.dispose();setEditorContext(null)};
  },[monaco,activeTabId,completionObjects,completionSchema]);
  // Saved bind types live in the file's bind form definition; unsaved documents have no file key, so types stay read-only there.
  function bindTypeFor(bind,text) {
    if(!bind||!filePath)return 'VARCHAR2';
    return loadBindDefinitions(localStorage,filePath,getOracleBindNames(text)).find(item=>item.name===bind.name)?.type||'VARCHAR2';
  }
  async function editorContextAction(action,context){
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
    if(action==='identifierCase'){openIdentifierCase();return}
    if(action==='localRename'){openLocalRename();return}
    if(action==='changeSignature'){openChangeSignature();return}
    if(action==='extractProcedure'){openExtractProcedure();return}
    if(action==='moveUp'||action==='moveDown'){moveStatement(action==='moveUp'?-1:1);return}
    if(action==='embeddedSql'){openEmbeddedSql();return}
    if(action==='clipboardHistory'){setClipboardHistoryOpen(true);return}
    if(action==='editorMacros'){setEditorMacrosOpen(true);return}
    if(action==='quickFix'){openQuickFix();return}
    if(action==='deleteReview'){reviewDeleteImpact();return}
    if(action==='explainExpression'){openExpressionExplain();return}
    if(action==='surround'){openSurroundMenu(context.x,context.y,context.trigger);return}
    if(action==='pasteAs'){openPasteAsMenu(context.x,context.y,context.trigger);return}
    if(action==='extractCte'){extractSelectionToCte();return}
    if(action==='docComment'){generateDocComment();return}
    if(action==='columnCursors'){await pasteColumnCursors();return}
    if(action==='selectAll'){editor.setSelection(context.model.getFullModelRange());return}
    if(action==='copy'||action==='cut'){await navigator.clipboard.writeText(context.model.getValueInRange(context.selection));if(action==='copy')return;check()}
    if(action==='cut'||action==='paste'){if(context.readOnly)return;const text=action==='paste'?await navigator.clipboard.readText():'';check();editor.pushUndoStop();editor.executeEdits('context-menu',[{range:context.selection,text}]);editor.pushUndoStop();return}
    if(action==='undo'||action==='redo'){editor.trigger('context-menu',action,{});return}
    const command=editor.getAction({comment:'editor.action.commentLine',find:'actions.find',replace:'editor.action.startFindReplaceAction'}[action]);
    if(!command?.isSupported())throw Error('This editor action is unavailable.');await command.run();
    if(action==='comment'&&macroRecording)setMacroRecording(steps=>steps&&recordMacroStep(steps,'comment'));
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
  async function objectContextAction(action,context) {
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
    if(item.kind==='file'){if(item.objectTab){const tab=objectTabs.find(t=>t.id===item.tabId);if(tab){setActiveObjectTabId(tab.id);setObjectTabActive(true);setActiveObject(tab.key);inspectOracleObject(tab.object,tab.originTabId,tab.view==='Related tables');}}else if(item.tabId){setObjectTabActive(false);activateTab(item.tabId);}else openWorkspaceFile(item);}
    else if(item.kind==='object')openExplorerObject(item,'Overview');
    else if(item.kind==='connection'){const profile=dbConnections.find(profile=>profile.id===item.profileId);if(profile)switchConnection(profile);}
    else if(item.kind==='history'){newSqlFileNow();requestAnimationFrame(()=>insertHistorySql(item.sql));}
    else if(item.kind==='outline'){setObjectTabActive(false);requestAnimationFrame(()=>jumpToOffset(item.start));}
    else if(item.kind==='setting'){setSettingsFocus({query:item.label,category:['privacy','accessibility'].includes(item.detail)?'preferences':item.detail});setShowAppearance(true);}
    else {item.run?.();if(item.detail)coachShortcut(`palette:${item.id}`,item.label,item.detail)}
  }
  useEffect(()=>{
    setDocumentOutline([]);if(!largePolicy.outline||!monaco||!completionClientRef.current)return;
    let cancelled=false;const source=sql,tabId=activeTabId;
    const timer=setTimeout(async()=>{const result=await completionClientRef.current?.request('outline',source,0);if(!cancelled&&tabId===documents.activeId&&documents.text===source)setDocumentOutline(result?.outline||[])},250);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[sql,activeTabId,monaco,completionSettings,completionObjects,completionSchema,completionSession.oracleVocabulary,allSqlSnippets,largePolicy.outline]);
  // Dropping a result cell inserts only a bind placeholder; the cell value is kept in memory for the next bind prompt and never written to the SQL or to disk.
  function attachBindDrop(editor) {
    const node = editor.getDomNode();
    if (!node || node.dataset.bindDrop) return;
    node.dataset.bindDrop = '1';
    node.addEventListener('dragover', event => { if ([...(event.dataTransfer?.types || [])].includes(cellDragType)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }, true);
    node.addEventListener('drop', event => {
      const raw = event.dataTransfer?.getData(cellDragType);
      if (!raw) return;
      event.preventDefault(); event.stopPropagation();
      const model = editor.getModel();
      if (!model || editorIsReadonly()) { notifyFeedback({ kind: 'warning', title: 'Bind placeholder', message: 'This editor is read-only.', scope: documents.activeId }); return; }
      const hit = editor.getTargetAtClientPoint(event.clientX, event.clientY), position = hit && [6, 7].includes(hit.type) && hit.position ? hit.position : editor.getPosition();
      const plan = planBindDrop(raw, getOracleBindNames(model.getValue()));
      if (!plan || !position) return;
      editor.executeEdits('result-bind-drop', [{ range: new monacoRef.current.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: plan.insertText, forceMoveMarkers: true }]);
      if (plan.prefill) bindPrefillRef.current[plan.prefill.name] = plan.prefill;
      notifyFeedback({ kind: 'success', title: 'Bind created', message: `${plan.insertText} (${plan.type}) was inserted. ${plan.prefill ? 'Its value is offered only in the next bind prompt and is not saved.' : 'No value was carried over.'}`, scope: documents.activeId });
      editor.focus();
    }, true);
  }
  function openOracleDefinition(source, selection) {
    if (!['PACKAGE', 'PACKAGE BODY', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'TYPE', 'TYPE BODY'].includes(source.type)) {
      setObjectDefinition({ ...source, originTabId: source.originTabId || documents.activeId });
      return;
    }
    rememberLocation();
    const originTabId = source.originTabId, id = `definition:${originTabId}:${source.owner}:${source.type}:${source.name}`;
    rememberEditorPosition();
    const tab = { id, name: `${source.owner}.${source.name}${source.type.endsWith(" BODY") ? ".body" : ""}.sql`, path: null, content: source.text, dirty: false, readOnly: true, metadataOriginTabId: originTabId, definitionObject: { owner: source.owner, name: source.name, type: source.type }, sourceVersionNotice:source.sourceVersionNotice };
    documents.open(tab);
    setNativeTabId(originTabId);
    requestAnimationFrame(() => { const position = { lineNumber: selection?.startLineNumber || selection?.lineNumber || 1, column: selection?.startColumn || selection?.column || 1 }; editorRef.current?.setPosition(position); editorRef.current?.revealPositionInCenter(position); editorRef.current?.focus(); rememberLocation(id,position); });
  }
  useEffect(()=>{
    if(recovery)return;
    const save=()=>persistLocal(localStorage, 'fbsdb.sqlDrafts',JSON.stringify(draftSnapshot(documents.tabs,documents.activeId)));
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
  function moveStatement(direction,record=true){
    const editor=editorRef.current,model=editor?.getModel(),position=editor?.getPosition();if(!model||!position||editorIsReadonly())return;
    const plan=planStatementMove(model.getValue(),model.getOffsetAt(position),direction);
    if(plan.error){notifyFeedback({kind:'warning',title:'Move statement',message:plan.error,scope:documents.activeId});return false}
    const from=model.getPositionAt(plan.edit.start),to=model.getPositionAt(plan.edit.end);
    editor.pushUndoStop();editor.executeEdits('move-statement',[{range:new monacoRef.current.Range(from.lineNumber,from.column,to.lineNumber,to.column),text:plan.edit.after}]);editor.pushUndoStop();editor.focus();
    if(record&&macroRecording)setMacroRecording(steps=>steps&&recordMacroStep(steps,direction<0?'moveUp':'moveDown'));
    return true;
  }
  async function runEditorMacro(macro){
    if(!macro?.steps?.length||editorIsReadonly())throw Error('Choose an editable editor and a saved macro.');
    const editor=editorRef.current,model=editor?.getModel(),tabId=documents.activeId;if(!model)throw Error('Open a SQL editor first.');
    for(const step of macro.steps){
      if(documents.activeId!==tabId||editor.getModel()!==model||model.isDisposed())throw Error('The editor changed during macro replay.');
      if(step==='comment')await editor.getAction('editor.action.commentLine').run();
      else if(step==='moveUp'||step==='moveDown'){if(!moveStatement(step==='moveUp'?-1:1,false))throw Error('A movement step is unavailable at the current caret.');}
      else throw Error('This macro contains an unsupported action.');
    }
    editor.focus();
  }
  macroRunRef.current=()=>{const macro=editorMacros[0];if(macro)runEditorMacro(macro).catch(error=>notifyFeedback({kind:'warning',title:'Editor macro',message:error.message,scope:documents.activeId}));else setEditorMacrosOpen(true)};
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
  async function pasteColumnCursors() {
    const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection(),tabId=documents.activeId,version=model?.getVersionId();
    if(!model||!selection||editorIsReadonly())return;
    try {
      const draft=columnCursorDraft(await navigator.clipboard.readText(),model.getEOL());
      if(draft.error)throw Error(draft.error);
      if(documents.activeId!==tabId||editor.getModel()!==model||model.isDisposed()||model.getVersionId()!==version)throw Error('The editor changed. Copy the columns and try again.');
      const start=model.getOffsetAt(selection.getStartPosition());
      editor.pushUndoStop();editor.executeEdits('column-cursors',[{range:selection,text:draft.text,forceMoveMarkers:true}]);editor.pushUndoStop();
      editor.setSelections(draft.spans.map(span=>{const a=model.getPositionAt(start+span.start),b=model.getPositionAt(start+span.end);return new monacoRef.current.Selection(a.lineNumber,a.column,b.lineNumber,b.column)}));
      editor.focus();
    } catch(error) {notifyFeedback({kind:'warning',title:'Column cursors',message:error.message||'Clipboard unavailable',scope:tabId})}
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
  function pasteClipboardEntry(entry,distributeLines){
    const editor=editorRef.current,model=editor?.getModel(),selections=editor?.getSelections();
    if(!model||!selections?.length||editorIsReadonly())throw Error('Choose an editable SQL editor.');
    const result=clipboardPasteTexts(entry,selections.length,distributeLines);if(result.error)throw Error(result.error);
    editor.pushUndoStop();editor.executeEdits('clipboard-history',selections.map((selection,index)=>({range:selection,text:result.texts[index],forceMoveMarkers:true})));editor.pushUndoStop();setClipboardHistoryOpen(false);editor.focus();
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
    if (!sqlResult?.columns?.length) return;
    const identifier = (value) => `"${String(value).replaceAll('"', '""')}"`;
    const literal = (value, type = "") => {
      if (value == null) return "NULL";
      const text = String(value), normalizedType = type.toUpperCase();
      if (/NUMBER|INTEGER|INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL/.test(normalizedType) && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return text;
      if (/TIMESTAMP/.test(normalizedType)) {
        const valueText = text.replace(/Z$/i, "+00:00");
        const match = valueText.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?([+-]\d{2}:\d{2})?$/);
        if (match) {
          const timestamp = `${match[1]} ${match[2]}${match[3] ?? ""}`;
          if (/WITH (LOCAL )?TIME ZONE/.test(normalizedType) && match[4]) return `TO_TIMESTAMP_TZ('${timestamp}${match[4]}', 'YYYY-MM-DD HH24:MI:SS${match[3] ? ".FF" : ""} TZH:TZM')`;
          return `TO_TIMESTAMP('${timestamp}', 'YYYY-MM-DD HH24:MI:SS${match[3] ? ".FF" : ""}')`;
        }
      }
      if (/^DATE$/.test(normalizedType)) {
        const match = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
        if (match) return `TO_DATE('${match[1]} ${match[2]}', 'YYYY-MM-DD HH24:MI:SS')`;
      }
      return `'${text.replaceAll("'", "''")}'`;
    };
    const columns = resultExportColumns();
    const rows = resultExportRows();
    const statements = [
      "-- Generated by fbsDB from fetched query results.",
      "-- Replace YOUR_TABLE with the destination table before running.",
      ...(sqlResult.truncated ? [`-- Result was truncated; this script contains the ${rows.length} fetched rows only.`] : []),
      "",
      ...rows.map((row) => `INSERT INTO YOUR_TABLE (${columns.map((column) => identifier(column.name)).join(", ")}) VALUES (${columns.map((column, index) => literal(row[index], column.type)).join(", ")});`),
      "",
    ];
    const url = URL.createObjectURL(new Blob([statements.join("\r\n")], { type: "text/sql;charset=utf-8" })), link = document.createElement("a");
    link.href = url; link.download = `${(fileName || "query").replace(/\.sql$/i, "")}-inserts.sql`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
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
    if(!event.dataTransfer?.types?.includes('application/x-fbsdb-schema'))return;
    event.preventDefault();event.stopPropagation();
    const editor=editorRef.current,model=editor?.getModel();
    if(!model||editorIsReadonly())return;
    let payload;try{payload=JSON.parse(event.dataTransfer.getData('application/x-fbsdb-schema'))}catch{return}
    if(payload.tabId!==metadataOriginTabId)return;
    const item=schemaObjects.find(object=>oracleSchemaKey(object)===payload.key),draft=dragSqlDraft(item,payload.column,model.getValue(),schemaObjects);
    if(!draft)return;
    const position=editor.getTargetAtClientPoint(event.clientX,event.clientY)?.position||editor.getPosition(),range=model.validateRange(editor.getSelection()?.containsPosition(position)?editor.getSelection():new monacoRef.current.Range(position.lineNumber,position.column,position.lineNumber,position.column));
    editor.pushUndoStop();editor.executeEdits('schema-drag',[{range,text:draft.text,forceMoveMarkers:true}]);editor.pushUndoStop();editor.focus();setFileDirty(true);
  }
  function handleEditorChange(value) { if (controlledEditorUpdateRef.current||editorIsReadonly()) return; documents.edit(value ?? ""); queueSchemaForSql(documents.text); }
  async function formatSql() {
    if (editorIsReadonly()) return;
    const editor = editorRef.current, model = editor?.getModel(), client = completionClientRef.current;
    if (!editor || !model || !client) return;
    const selection = editor.getSelection(), hasSelection = selection && !selection.isEmpty(), range = hasSelection ? selection : model.getFullModelRange();
    const source = model.getValueInRange(range), version = model.getVersionId(), owner = documents.activeId;
    const result = await client.request("format", source, 0, null, { style: sqlFormatterStyle(resolveSetting(settingsRef.current,'editor.sqlFormatter').value, codeStyle) });
    if (model.isDisposed() || model.getVersionId() !== version || documents.activeId !== owner || editor.getModel() !== model || typeof result?.formatted !== "string") return;
    const formatted = result.formatted;
    if (formatted === source) { setRunState("No formatting changes."); return; }
    editor.pushUndoStop(); editor.executeEdits("fbsdb.formatSql", [{ range, text: hasSelection ? formatted.replace(/\n$/, "") : formatted, forceMoveMarkers: true }]); editor.pushUndoStop();
    setFileDirty(true); setRunState("SQL / PL/SQL formatted."); editor.focus();
  }
  formatterRef.current = formatSql;

  function installRunGutter(editor, monacoInstance) {
    const decorations = editor.createDecorationsCollection(), summaryDecorations = editor.createDecorationsCollection();
    let statementsByLine = new Map();
    const refresh = () => {
      const model = editor.getModel();
      statementsByLine = new Map();
      if (!model || editorIsReadonly() || model.getValueLength()>=LARGE_FILE_THRESHOLD&&!largeFileOverridesRef.current[documents.activeId]?.source) { decorations.clear(); summaryDecorations.clear(); return; }
      for (const statement of getSqlStatements(model.getValue())) {
        const position = model.getPositionAt(statement.start);
        // A gutter click targets only the first statement starting on this line.
        const current = statementsByLine.get(position.lineNumber);
        if (!current) statementsByLine.set(position.lineNumber, { ...statement, position });
      }
      const summaryItems = [];
      for (const statement of getSqlStatements(model.getValue())) {
        const summary = executionSummaries.current.get(documents.activeId, statement.sql);
        if (!summary) continue;
        const end = model.getPositionAt(statement.end), column = model.getLineMaxColumn(end.lineNumber);
        summaryItems.push({ range: new monacoInstance.Range(end.lineNumber, column, end.lineNumber, column), options: { showIfCollapsed: true, stickiness: monacoInstance.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, after: { content: summaryLabel(summary), inlineClassName: summary.ok ? 'sql-exec-summary' : 'sql-exec-summary failed' }, hoverMessage: { value: summaryHover(summary) } } });
      }
      summaryDecorations.set(summaryItems);
      decorations.set([...statementsByLine.values()].map(({ position, sql }) => ({
        range: new monacoInstance.Range(position.lineNumber, 1, position.lineNumber, 1),
        options: { glyphMarginClassName: "sql-run-glyph", glyphMarginHoverMessage: { value: "Run SQL statement\n\n" + sql.slice(0, 160) } },
      })));
    };
    const subscriptions = [editor.onDidChangeModelContent(refresh), editor.onDidChangeModel(refresh), editor.onMouseDown((event) => {
      if (event.target.element?.closest?.('.sql-exec-summary') || event.target.detail?.injectedText?.options?.inlineClassName?.includes('sql-exec-summary')) { setResultTab('Results'); updateLayout(current => ({ ...current, resultsCollapsed: false })); return; }
      if (event.target.type !== monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || event.event.rightButton) return;
      const statement = statementsByLine.get(event.target.position?.lineNumber);
      if (!statement) return;
      editor.setPosition(statement.position); editor.focus();
      runQueryRef.current?.(statement.sql);
    })];
    refresh();
    window.addEventListener('fbsdb.refreshRunGutter',refresh);
    editor.onDidDispose(() => {window.removeEventListener('fbsdb.refreshRunGutter',refresh); subscriptions.forEach((subscription) => subscription.dispose()); decorations.clear(); summaryDecorations.clear(); });
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
    executeStatement(filtered.sql,filtered.parameters,false,{serverFilter:{...base,ruleCount:options.filters?.length||0}});
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
    sendNativeCommand('result.related',{column,value,rowValues});
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
  const managementContent={
    Name:<form className="result-settings-form" onSubmit={e=>{e.preventDefault();const key=renameResult||view.selectedResultKey||'latest';if(key==='latest')updateTabResult('latestResultName',newResultName.trim()||'Latest');else updateTabResult('resultSets',sets=>(sets||[]).map(item=>item.key===key?{...item,label:newResultName.trim()||'Result'}:item));setNewResultName('');setRenameResult(null)}}><h2>Rename result</h2><label>Name<input aria-label="Result name" maxLength={80} value={newResultName} placeholder={(view.selectedResultKey?view.resultSets?.find(item=>item.key===view.selectedResultKey)?.label:view.latestResultName)||'Result name'} onChange={e=>setNewResultName(e.target.value)}/></label><button disabled={!newResultName.trim()}>Rename result</button></form>,
    Source:definition?.tabId===activeTabId?<div className="result-settings-definition"><h2>{definition.name?`${definition.schema||'Current schema'}.${definition.table}.${definition.name}`:'Source definition'}</h2><dl>{Object.entries(definition).filter(([key])=>key!=='constraints'&&key!=='tabId').map(([key,value])=><div key={key}><dt>{({schema:'Schema',table:'Table',name:'Column',type:'Data type',size:'Length',precision:'Precision',scale:'Scale',nullable:'Nullable',defaultValue:'Default value',message:'Status'})[key]||key}</dt><dd>{typeof value==='boolean'?value?'Yes':'No':String(value??'—')}</dd></div>)}</dl><h3>Constraints</h3>{(definition.constraints||[]).map((constraint,i)=><div className="result-rule-row" key={i}><strong>{constraint.name}</strong><span>{({P:'Primary key',R:'Foreign key',U:'Unique',C:'Check'})[constraint.type]||constraint.type}{constraint.status?' · '+constraint.status:''}</span>{constraint.condition&&<code>{constraint.condition}</code>}</div>)}</div>:<p>Select a source column and use Source definition.</p>,
    Lookup:keyLookup?.tabId===activeTabId?(keyLookup.links?<div className="result-settings-links"><h2>Related child tables</h2>{keyLookup.links.map((link,i)=><button key={i} onClick={()=>{sendNativeCommand('result.openSql',{sql:link.sql,tabId:keyLookup.tabId});setKeyLookup(null)}}>{link.label}</button>)}</div>:<form className="result-settings-form" onSubmit={e=>{e.preventDefault();sendNativeCommand('result.lookupSql',{schema:keyLookup.schema,table:keyLookup.table,columns:keyLookup.columns,values:keyValues,tabId:keyLookup.tabId});setKeyLookup(null)}}><h2>Primary key · {keyLookup.table}</h2>{keyLookup.columns.map(column=><label key={column.name}>{column.name}<input required aria-label={`Key ${column.name}`} value={keyValues[column.name]||''} onChange={e=>setKeyValues(current=>({...current,[column.name]:e.target.value}))}/></label>)}<button type="submit">Open lookup SQL</button></form>):null
  };
  const sessionConnected = !tabSession.connectionLost && !["No connection", "Disconnected"].includes(activeConnection.id);
  const visibleOrigin=objectTabActive&&objectTab?objectTab.originTabId:metadataOriginTabId;
  const visibleConnection=objectTabActive&&objectTab?documentConnection({id:objectTab.originTabId},tabSessions,dbConnections):editorConnection;
  const summarySession=tabSessions[visibleOrigin]||tabSession;
  const summaryConnectionSnapshot=summarySession.activeConnection||activeConnection;
  const summaryConnected=!summarySession.connectionLost&&!["No connection","Disconnected"].includes(summaryConnectionSnapshot.id);
  const summaryConnection=dbConnections.find(profile=>profile.id===(summarySession.connecting?summarySession.connectingProfileId:summaryConnectionSnapshot.id))||summaryConnectionSnapshot;
  const dockPanels = {
    editors: <div className="dock-content open-editors-content"><OpenEditors tabs={tabs.map(tab=>({...tab,dirty:tab.id===activeTabId?fileDirty:tab.dirty,profileName:dbConnections.find(profile=>profile.id===(tabSessions[tab.id]?.activeConnection?.id||tab.connectionProfileId))?.name,connectionProfileId:tabSessions[tab.id]?.activeConnection?.id||tab.connectionProfileId}))} activeId={activeTabId} onActivate={activateTab} onClose={closeTab}/></div>,
    files: <div className="dock-content file-section-content"><div className="explorer-tabs" role="group" aria-label="Explorer view"><button aria-pressed={filePanelView==='files'} onClick={()=>setFilePanelView('files')}>Files</button><button aria-pressed={filePanelView==='structure'} onClick={()=>setFilePanelView('structure')}>Structure</button><button aria-pressed={filePanelView==='server'} title="Database definitions, read-only" onClick={()=>setFilePanelView('server')}>Server</button></div>{filePanelView==='server'?<ServerSourceTree objects={schemaObjects} defaultOwner={schemaOwner}connected={Boolean(visibleConnection)&&schemaObjects.length>0} onOpen={openExplorerDefinition}/>:filePanelView==='structure'?<FileStructurePanel key={activeTabId} name={fileName} items={documentOutline} onNavigate={offset=>{setObjectTabActive(false);requestAnimationFrame(()=>jumpToOffset(offset))}}/>:<WorkspaceExplorer expandedPaths={layout.expandedPaths} onExpandedChange={next => updateLayout(current => ({ ...current, expandedPaths: typeof next === "function" ? next(current.expandedPaths) : next }))} workspace={workspace} activePath={filePath} onOpen={openWorkspaceFile} onPromote={promotePreview} onOpenWorkspace={openWorkspace} onManage={()=>setShowWorkspaceManager(true)} onSearch={scope=>{setWorkspaceSearchScope(scope);setShowSearch(true)}} onReplace={scope=>openWorkspaceDevelopment('replace',scope)} onWorksets={()=>setShowWorksets(true)} onProjectRules={()=>setShowProjectRules(true)} profiles={dbConnections} gitFiles={workspaceDev.git?.files}/>}</div>,
    connections: <div className="dock-content connections-section-content" tabIndex={0} onContextMenu={e=>{if(!e.target.closest("input,select,button,summary,.connection-tree"))setConnectionMenu(connectionContext(e,"background"))}} onKeyDown={e=>{if(e.target===e.currentTarget)connectionContextKey(e,event=>setConnectionMenu(connectionContext(event,"background")))}}>
            <div className="section-heading"><div><button title="Refresh TNS aliases" onClick={() => sendNativeCommand("connection.list")}><RefreshCw size={13} /></button><button title="Manage connections" aria-label="Manage connections" onClick={()=>setProfileEditor(true)}><Settings2 size={13}/></button><button title="New connection" onClick={() => { setShowPicker(false); setProfileEditor({method:"basic"}); }}><Plus size={15} /></button></div></div>
            <div className="explorer-search"><Search size={13} /><input aria-label="Filter connections" placeholder="Search" value={explorerQuery} onChange={(event) => setExplorerQuery(event.target.value)} />{explorerQuery.length > 0 ? <button type="button" className="explorer-search-clear" title="Clear" aria-label="Clear connection filter" onMouseDown={event => event.preventDefault()} onClick={event => { setExplorerQuery(''); event.currentTarget.closest('.explorer-search').querySelector('input')?.focus(); }}><X size={12}/></button> : <Filter size={12} />}</div>
            <div className="explorer-tabs"><button className={explorerTab === "Recent" ? "active" : ""} onClick={() => setExplorerTab("Recent")}><Clock3 size={12} /> Recent</button><button className={explorerTab === "Favorites" ? "active" : ""} onClick={() => setExplorerTab("Favorites")}><Star size={12} /> Favorites</button><button className={explorerTab === "All" ? "active" : ""} onClick={() => setExplorerTab("All")}><ListFilter size={12} /> All</button></div>
            {connectionGroupNames.length > 0 && <label className="group-filter"><span>GROUP</span><select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option>All groups</option>{connectionGroupNames.map((group) => <option key={group}>{group}</option>)}</select></label>}
            {filteredConnections.length||connectionOrg.folders.length ? <ConnectionTree renameRequest={connectionRename} onRenameHandled={()=>setConnectionRename(null)} contextId={connectionMenu?.item?.id} onContext={(event,kind,item)=>setConnectionMenu(connectionContext(event,kind,item))} items={filteredConnections} organization={connectionOrg} selected={activeConnection} favorites={favorites} onSelect={switchConnection} onManage={profile=>setProfileEditor(profile)} onToggleFavorite={id=>setFavorites(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])}/> : <div className="panel-empty-actions connections-empty"><button type="button" className="panel-empty-link" onClick={()=>dbConnections.length?(setExplorerQuery(""),setExplorerTab("All"),setGroupFilter("All groups")):setProfileEditor({method:"basic"})}>{dbConnections.length?"Clear filters":"New connection"}</button></div>}</div>,
    objects: <div className="dock-content objects-section-content">
            <div className="schema-scope"><Database size={13} className="schema-connection-icon"/><span className="schema-scope-name">{schemaOwner || activeConnection.name || activeConnection.id}</span><span title={connecting || schemaLoading ? "Loading" : ["No connection", "Disconnected"].includes(activeConnection.id) ? "Disconnected" : "Connected"} aria-label={connecting || schemaLoading ? "Loading" : ["No connection", "Disconnected"].includes(activeConnection.id) ? "Disconnected" : "Connected"} className={schemaLoading || connecting ? "live-dot" : ["No connection", "Disconnected"].includes(activeConnection.id) ? "offline-dot" : "online-dot"} />{connecting ? "Connecting…" : schemaLoading ? "Loading…" : (schemaQuery || schemaOwnerFilter !== "All" || objectScope !== "All") ? `${visibleSchemaObjects.length} / ${schemaObjects.length} objects` : schemaObjects.length ? `${schemaObjects.length} objects` : ""}<button type="button" className="schema-refresh" title={schemaLoading ? "Cancel metadata loading" : "Refresh Oracle objects"} aria-label={schemaLoading ? "Cancel metadata loading" : "Refresh Oracle objects"} onClick={() => schemaLoading && schemaRequestRef.current ? sendNativeCommand('schema.cancel',{requestId:schemaRequestRef.current}) : refreshSchema()}>{schemaLoading?<X size={12}/>:<RefreshCw size={12}/>}</button></div>
            {definitionError&&<Feedback title="Definition unavailable">{definitionError}</Feedback>}
            <div className="explorer-search schema-search schema-combined-search"><Search size={13}/><input aria-label="Search Oracle objects" placeholder="Search objects…" value={schemaQuery} onChange={event=>{setSchemaQuery(event.target.value);setDefinitionError('')}}/>{schemaQuery&&<button type="button" aria-label="Clear Object Explorer search" onClick={()=>setSchemaQuery('')}><X size={12}/></button>}<select aria-label="Object Explorer schema" value={schemaOwnerFilter} onChange={event=>setSchemaOwnerFilter(event.target.value)}><option value="All">All schemas</option>{[...new Set(schemaObjects.map(item=>item.owner).filter(Boolean))].sort().map(owner=><option key={owner} value={owner}>{owner}</option>)}</select></div>
            {sessionConnected&&(schemaError||!schemaLoading&&!visibleSchemaObjects.length)&&(()=>{const state=actionableState({connected:sessionConnected,error:schemaError,hasItems:Boolean(visibleSchemaObjects.length),filtered:Boolean(schemaQuery||schemaOwnerFilter!=='All'||objectScope!=='All')});return <ActionableState {...state} onAction={()=>state.command==='connect'?setShowPicker(true):state.command==='retry'?refreshSchema(): (setSchemaQuery(''),setSchemaOwnerFilter('All'),setObjectScope('All'))}/>})()}
            {sessionConnected&&<LoadingSkeleton loading={schemaLoading} hasItems={visibleSchemaObjects.length>0} label="Loading Oracle objects…"/>}
            {schemaStale && <Feedback kind={schemaLoading?"progress":"warning"} title="Cached metadata">Refresh failed or is still running; showing previously loaded metadata.</Feedback>}
            <div className="object-scope-switch"><button className={objectScope === "All" ? "active" : ""} onClick={() => setObjectScope("All")}>All</button><button className={objectScope === "Recent" ? "active" : ""} onClick={() => setObjectScope("Recent")}><Clock3 size={11}/> Recent</button></div>
            {(schemaLoading||visibleSchemaObjects.length>0)&&<OracleObjectTree items={visibleSchemaObjects} activeKey={activeObject} currentSchema={schemaOwner} query={schemaQuery} searchKinds={schemaSearchKinds} onToggle={item=>openExplorerObject(item)} onContext={openObjectContext} contextKey={objectMenu?oracleSchemaKey(objectMenu.item):null} onInsert={insertEditorText} onDragStart={startSchemaDrag} emptyLabel={schemaLoading ? "Loading Oracle objects…" : schemaObjects.length ? "No Oracle objects match this search or filter." : isNativeHost ? ["No connection", "Disconnected"].includes(activeConnection.id) ? "Connect to load Oracle objects" : "No accessible Oracle objects found for this user." : "Oracle objects appear after connecting"} />}
          </div>,
  };
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
  const toolbarDefs={
    open:{label:'Open SQL file',shortcut:'Ctrl+Shift+O',title:'Open file (Ctrl+Shift+O)',aria:'Open file (Ctrl+Shift+O)',icon:<FolderOpen size={16}/>,onClick:openSqlFile},
    save:{label:'Save SQL file',shortcut:'Ctrl+S',title:'Save SQL file (Ctrl+S)',aria:'Save SQL file',icon:<Save size={15}/>,disabled:activeTabReadonly,onClick:()=>saveSqlFile()},
    new:{label:'New SQL file',shortcut:'Ctrl+N',title:'New SQL file (Ctrl+N)',aria:'New SQL file',icon:<Plus size={15}/>,onClick:()=>{setObjectTabActive(false);setActiveObject('');newSqlFile()}},
    undo:{label:'Undo',shortcut:'Ctrl+Z',title:'Undo (Ctrl+Z)',aria:'Undo',icon:<Undo2 size={15}/>,disabled:activeTabReadonly,keepFocus:true,onClick:()=>editorCommand('undo')},
    redo:{label:'Redo',shortcut:'Ctrl+Y',title:'Redo (Ctrl+Y)',aria:'Redo',icon:<Redo2 size={15}/>,disabled:activeTabReadonly,keepFocus:true,onClick:()=>editorCommand('redo')},
    format:{label:'Format SQL',shortcut:'Ctrl+Shift+F',title:'Format SQL (Ctrl+Shift+F)',aria:'Format SQL',icon:<AlignLeft size={15}/>,className:'format-sql-button',disabled:activeTabReadonly,keepFocus:true,onClick:formatSql},
    find:{label:'Find',shortcut:shortcutsSetting.find,title:`Find (${shortcutsSetting.find||'Ctrl+F'})`,aria:'Find in editor',icon:<Search size={15}/>,keepFocus:true,onClick:()=>editorCommand('actions.find')},
    comment:{label:'Toggle comment',shortcut:shortcutsSetting.commentLine,title:`Toggle comment (${shortcutsSetting.commentLine||'Ctrl+/'})`,aria:'Toggle comment',icon:<Code2 size={15}/>,disabled:activeTabReadonly,keepFocus:true,onClick:()=>editorCommand('editor.action.commentLine')},
    explain:{label:'Explain plan',title:'Explain plan for the statement at the cursor',aria:'Explain plan',icon:<Workflow size={15}/>,disabled:busy||connecting,onClick:explainQuery},
    commit:{label:'Commit',title:commitButtonTitle,aria:'Commit',className:'transaction-button commit',icon:<Check size={13}/>,disabled:activeTabReadonly||!transactionPending||busy,onClick:()=>finishTransaction('commit')},
    rollback:{label:'Rollback',title:rollbackButtonTitle,aria:'Rollback',className:'transaction-button rollback',icon:<X size={13}/>,disabled:activeTabReadonly||!transactionPending||busy,onClick:()=>finishTransaction('rollback')},
    autoCommit:{label:`Auto commit ${tabSession.autoCommit?'(on)':'(off)'}`,title:transactionPending?'Commit or roll back pending changes before changing auto commit':`Auto commit ${tabSession.autoCommit?'on':'off'}`,aria:'Auto commit',className:`transaction-button auto-commit${tabSession.autoCommit?' enabled':''}`,pressed:Boolean(tabSession.autoCommit),icon:<RefreshCw size={13}/>,disabled:!isNativeHost||activeTabReadonly||transactionPending||busy||connecting||tabSession.autoCommitPending,onClick:()=>{updateTabSession('autoCommitPending',true,activeTabId);updateTabSession('autoCommitRequestId',sendNativeCommand('transaction.autoCommit',{tabId:activeTabId,enabled:!tabSession.autoCommit}),activeTabId)}},
    rows:{label:'Rows per result page'},
  };
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
  return <ToolbarPrefsContext.Provider value={toolbarPrefs}><ExecutionTargetContext.Provider value={executionTarget}><main className="desktop-shell" data-maximized={maximizedPanel||undefined} data-language={language} data-region={region} data-results-collapsed={bottomCollapsed} data-focus={focusMode} data-density={workbenchDensity} data-reduce-motion={reduceMotion} data-theme={theme} style={{ "--accent": themeConfig.accent, "--syntax-keyword":tokenColors.keyword,"--syntax-string":tokenColors.string,"--syntax-comment":tokenColors.comment,"--syntax-number":tokenColors.number, "--ui-font-family": uiFontStacks[uiFontFamily], "--sidebar-width": `${layout.widths.left}px`, "--results-height": `${resultsHeight}%` }}>
    <GlobalTooltip /><TreeNameOverlay /><KeyTips enabled={resolveSetting(settings,'ui.keyTips').value}/>
    {showOpenWorkspace&&<WorkspaceOpenPopup workspace={workspace} onClose={()=>setShowOpenWorkspace(false)}/>}
    {showWorksets&&workspace.root&&<WorkspaceWorksets root={workspace.root} getSnapshot={worksetSnapshot} onOpened={openWorkset} onClose={()=>setShowWorksets(false)}/>}
    {showWorkspaceManager&&<Suspense fallback={<div role="status">Loading…</div>}><WorkspaceManager workspace={workspace} onClose={()=>setShowWorkspaceManager(false)}/></Suspense>}
    {workspaceDevMode&&<Suspense fallback={<div role="status">Loading…</div>}><WorkspaceDevelopmentDialog mode={workspaceDevMode} scope={workspaceReplaceScope} state={workspaceDev} files={workspace.files} onClose={()=>{setWorkspaceDevMode(null);workspaceDevRequestsRef.current.clear()}} onGitRefresh={refreshWorkspaceGit} onGitDiff={path=>workspaceDevelopmentCommand('workspace.gitDiff',{path})} onGitStage={paths=>workspaceDevelopmentCommand('workspace.gitStage',{paths})} onGitUnstage={paths=>workspaceDevelopmentCommand('workspace.gitUnstage',{paths})} onGitCommit={message=>workspaceDevelopmentCommand('workspace.gitCommit',{message})} onOpenFile={path=>{setWorkspaceDevMode(null);workspaceDevRequestsRef.current.clear();openWorkspaceFile({path})}} onPreview={previewWorkspaceReplace} onApply={applyWorkspaceReplace} onInvalidate={()=>setWorkspaceDev(current=>({...current,preview:null,applied:null}))}/></Suspense> }
    {monaco&&<InlineBindZone editor={editorRef.current} enabled={resolveSetting(settings,'editor.inlineBinds').value} store={inlineBindStoreRef.current??=new InlineBindStore()} refresh={bindStoreVersion} onPick={name=>setLookupPicker({name,state:null,requestId:null})} scopeKey={`${documents.activeId}|${visibleConnection?.id||''}`}/>}
    {lookupPicker&&<Suspense fallback={<div role="status">Loading…</div>}><BindLookupDialog name={lookupPicker.name} initialSql={loadBindLookups(localStorage)[lookupPicker.name]||''} state={lookupPicker.state} onClose={()=>setLookupPicker(null)} onSaveSql={sql=>saveBindLookup(localStorage,lookupPicker.name,sql)} onSearch={(plan,search)=>{const requestId=sendNativeCommand('sql.evaluate',{tabId:documents.activeId,sql:plan.sql,parameters:lookupParameters(plan,search),timeoutSeconds:30,rowLimit:lookupRowLimit});setLookupPicker(current=>({...current,requestId,state:{running:true}}))}} onPick={value=>{inlineBindStoreRef.current??=new InlineBindStore();inlineBindStoreRef.current.set(`${documents.activeId}|${visibleConnection?.id||''}`,lookupPicker.name,{value});setBindStoreVersion(count=>count+1);setLookupPicker(null)}}/></Suspense>}
    {subqueryTrial&&<Suspense fallback={<div role="status">Loading…</div>}><SubqueryTrialDialog plan={subqueryTrial.plan} state={subqueryTrial.state} onClose={()=>setSubqueryTrial(null)} onRun={values=>{const requestId=sendNativeCommand('sql.evaluate',{tabId:documents.activeId,sql:subqueryTrial.plan.sql,parameters:evaluationParameters(subqueryTrial.plan.binds,values),timeoutSeconds:30,rowLimit:trialRowLimit});setSubqueryTrial(current=>({...current,requestId,state:{running:true}}))}}/></Suspense>}
    {quickEval&&<Suspense fallback={<div role="status">Loading…</div>}><QuickEvalDialog plan={quickEval.plan} state={quickEval.state} onClose={()=>setQuickEval(null)} onEvaluate={values=>{const requestId=sendNativeCommand('sql.evaluate',{tabId:documents.activeId,sql:quickEval.plan.sql,parameters:evaluationParameters(quickEval.plan.binds,values),timeoutSeconds:30});setQuickEval(current=>({...current,requestId,state:{running:true}}))}}/></Suspense>}
    {compareSources&&<Suspense fallback={<div role="status">Loading…</div>}><CompareDialog initial={compareSources} editorText={editorRef.current?.getModel()?.getValue()??sql} theme={editorThemeName} onClose={()=>setCompareSources(null)}/></Suspense>}
    {showLocalHistory&&filePath&&<Suspense fallback={<div role="status">Loading…</div>}><LocalHistoryDialog path={filePath} current={sql} theme={editorThemeName} onClose={()=>setShowLocalHistory(false)} onRestore={text=>{const editor=editorRef.current,model=editor?.getModel();if(!model||activeTabReadonly)throw Error('The editor is read-only.');editor.pushUndoStop();editor.executeEdits('local-history',[{range:model.getFullModelRange(),text}]);editor.pushUndoStop();setShowLocalHistory(false);editor.focus()}}/></Suspense>}
    {relatedFileCreate&&<Suspense fallback={<div role="status">Loading…</div>}><RelatedFileCreateDialog {...relatedFileCreate} onClose={()=>setRelatedFileCreate(null)} onCreated={entry=>{setRelatedFileCreate(null);openWorkspaceFile({path:entry.path})}} onOpenExisting={proposal=>{const file=workspace.files.find(item=>(item.relativePath||'').replace(/\\/g,'/').toLowerCase()===proposal.path.toLowerCase());setRelatedFileCreate(null);if(file)openWorkspaceFile(file)}}/></Suspense>}
    {showPortability&&workspace.root&&<Suspense fallback={<div role="status">Loading…</div>}><PortabilityDialog root={workspace.root} rules={workspace.projectRules} profiles={dbConnections} onOpenFile={finding=>{setShowPortability(false);openWorkspaceSearchMatch({path:finding.file,lineNumber:finding.line})}} onClose={()=>setShowPortability(false)}/></Suspense>}
    {showRunConsole&&<Suspense fallback={<div role="status">Loading…</div>}><RunConsoleDialog entries={runConsoleStore.current.list(activeTabId)} retainValues={resolveSetting(settings,'privacy.consoleBindValues').value} onClose={()=>setShowRunConsole(false)} onClear={()=>{runConsoleStore.current.clear(activeTabId);setShowRunConsole(false)}} onLoad={entry=>{setShowRunConsole(false);setObjectTabActive(false);newSqlFileNow(entry.sql)}} onRerun={entry=>{setShowRunConsole(false);setObjectTabActive(false);runQuery(entry.sql)}}/></Suspense>}
    {showSessionInspector&&<Suspense fallback={<div role="status">Loading…</div>}><SessionInspectorDialog tabId={metadataOriginTabId} connection={activeConnection} epoch={completionMetadataRef.current.session(metadataOriginTabId).epoch} initialContext={tabSession.sessionContext} transactionPending={transactionPending} autoCommit={Boolean(tabSession.autoCommit)} executing={executing||fetchingPage} result={queryResult} rowsLoaded={queryResult?.rows?.length||0} generation={tabSession.connectionGeneration} onClose={()=>setShowSessionInspector(false)}/></Suspense>}
    {connectionDiagnostics&&<Suspense fallback={<div role="status">Loading…</div>}><ConnectionDiagnosticsDialog report={connectionDiagnostics} onClose={()=>setConnectionDiagnostics(null)}/></Suspense>}
    {scriptDialog&&!sourceCompile?.scriptRequestId&&<Suspense fallback={<div role="status">Loading…</div>}><SqlScriptDialog projectVariables={projectOptions(workspace.projectRules).variables} defaultContinueOnError={projectOptions(workspace.projectRules).run.continueOnError} key={scriptDialog.tabId} source={scriptDialog.source} run={tabSessions[scriptDialog.tabId]?.scriptRun} timeout={queryTimeout} autoCommit={Boolean(tabSessions[scriptDialog.tabId]?.autoCommit)} onTimeout={setQueryTimeout} onClose={()=>setScriptDialog(null)} onCancel={()=>sendNativeCommand('sql.cancel',{tabId:scriptDialog.tabId})} onReviewSource={()=>reviewPausedScript(scriptDialog.tabId)} onStart={startScript} disabled={!isNativeHost||!tabSessions[scriptDialog.tabId]?.activeConnection||['No connection','Disconnected'].includes(tabSessions[scriptDialog.tabId]?.activeConnection?.id)||tabSessions[scriptDialog.tabId]?.connecting||tabSessions[scriptDialog.tabId]?.executing||tabSessions[scriptDialog.tabId]?.fetchingPage}/></Suspense> }
    {recovery&&<Suspense fallback={<div role="status">Loading…</div>}><DraftRecoveryDialog snapshot={recovery} onDiscard={()=>{try{localStorage.removeItem('fbsdb.sqlDrafts')}catch{}setRecovery(null)}} onRestore={restoreDrafts}/></Suspense>}
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
        {id:'identifierCase',label:'Convert identifier case (snake_case, camelCase, UPPER_CASE)',disabled:activeTabReadonly,run:openIdentifierCase},
        {id:'localRename',label:'Rename local variable or parameter',disabled:activeTabReadonly,run:openLocalRename},
        {id:'changeSignature',label:'Change local procedure signature',disabled:activeTabReadonly,run:openChangeSignature},
        {id:'extractProcedure',label:'Extract selected PL/SQL assignments into procedure',disabled:activeTabReadonly,run:openExtractProcedure},
        {id:'moveUp',label:'Move SQL item or PL/SQL statement up',disabled:activeTabReadonly,run:()=>moveStatement(-1)},
        {id:'moveDown',label:'Move SQL item or PL/SQL statement down',disabled:activeTabReadonly,run:()=>moveStatement(1)},
        {id:'embeddedSql',label:'Edit static SQL inside EXECUTE IMMEDIATE',disabled:activeTabReadonly,run:openEmbeddedSql},
        {id:'clipboardHistory',label:'Clipboard history (session only)',disabled:activeTabReadonly,run:()=>setClipboardHistoryOpen(true)},
        {id:'editorMacros',label:'Record or replay editor macros',disabled:activeTabReadonly,run:()=>setEditorMacrosOpen(true)},
        {id:'quickFix',label:'Quick fixes for compiler diagnostic',detail:'Alt+Enter',disabled:activeTabReadonly,run:openQuickFix},
        {id:'deleteReview',label:'Review references before deleting local procedure or parameter',disabled:!isNativeHost||!workspace.root,run:reviewDeleteImpact},
        {id:'pasteAs',label:'Paste as IN list, JSON_TABLE draft or INSERT template',disabled:activeTabReadonly,run:()=>{const editor=editorRef.current,position=editor?.getPosition(),point=position&&editor.getScrolledVisiblePosition(position),rect=editor?.getDomNode()?.getBoundingClientRect();openPasteAsMenu((rect?.left||0)+(point?.left||0),(rect?.top||0)+(point?.top||0)+(point?.height||0),editor?.getDomNode())}},
        {id:'expandSelection',label:'Expand selection to enclosing SQL structure',detail:'Shift+Alt+Right',run:()=>{editorRef.current?.focus();editorRef.current?.trigger('palette','editor.action.smartSelect.expand',{})}},
        {id:'shrinkSelection',label:'Shrink selection',detail:'Shift+Alt+Left',run:()=>{editorRef.current?.focus();editorRef.current?.trigger('palette','editor.action.smartSelect.shrink',{})}},
        {id:'quickEval',label:'Evaluate the selected SQL expression…',detail:'Runs only on confirmation',disabled:!isNativeHost||!visibleConnection||visibleConnection.id==='Disconnected',run:()=>{const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection();const text=model&&selection&&!selection.isEmpty()?model.getValueInRange(selection):'';const plan=prepareEvaluation(text);if(plan.error){notifyFeedback({kind:'warning',title:'Evaluate expression',message:plan.error,scope:documents.activeId});return}setQuickEval({plan,state:null,requestId:null})}},
        {id:'subqueryTrial',label:'Try the selected subquery…',detail:'Runs only on confirmation',disabled:!isNativeHost||!visibleConnection||visibleConnection.id==='Disconnected',run:()=>{const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection();const text=model&&selection&&!selection.isEmpty()?model.getValueInRange(selection):'';const plan=prepareSubqueryTrial(text);if(plan.error){notifyFeedback({kind:'warning',title:'Try subquery',message:plan.error,scope:documents.activeId});return}setSubqueryTrial({plan,state:null,requestId:null})}},
        {id:'regexWorkbench',label:'Oracle regex workbench…',detail:'Try REGEXP_* patterns on sample text',run:()=>{const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection();const picked=model&&selection&&!selection.isEmpty()?model.getValueInRange(selection).trim().replace(/^'|'$/g,'').replaceAll("''","'"):'';setRegexWorkbench({initial:picked.length<=200?picked:''})}},
        {id:'dateFormatDesigner',label:'Date format designer…',detail:'Preview TO_CHAR / TO_DATE models',run:()=>{const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection();const picked=model&&selection&&!selection.isEmpty()?model.getValueInRange(selection).trim().replace(/^'|'$/g,''):'';setDateFormatDesigner({initial:/^[A-Za-z0-9\s\-\/,.:;"]{1,60}$/.test(picked)?picked:''})}},
        {id:'compareClipboard',label:'Compare the editor (or selection) with the clipboard',run:async()=>{const editor=editorRef.current,model=editor?.getModel(),selection=editor?.getSelection();const text=model&&selection&&!selection.isEmpty()?model.getValueInRange(selection):model?.getValue()??sql;let clip='';try{clip=await navigator.clipboard.readText()}catch{notifyFeedback({kind:'warning',title:'Compare',message:'The clipboard could not be read.',scope:documents.activeId});return}setCompareSources({left:{label:selection&&!selection.isEmpty()?'Selection':'Current editor',text},right:{label:'Clipboard',text:clip}})}},
        {id:'compareFiles',label:'Compare two files: drop them into the comparison window',run:()=>setCompareSources({left:null,right:null})},
        {id:'localHistory',label:'Local history: compare and restore earlier saved versions of this file',disabled:!isNativeHost||!filePath,run:()=>setShowLocalHistory(true)},
        {id:'relatedFile',label:'Create related file: test draft, migration draft or example call for this package',disabled:!isNativeHost||!workspace.root||activeTabReadonly,run:()=>{const result=relatedFileProposals(documents.active||{name:'',content:''},workspace.projectRules,workspace.files.map(file=>file.relativePath||''));setRelatedFileCreate(result)}},
        {id:'portability',label:'Workspace portability check: absolute paths, TNS and local tool dependencies',disabled:!isNativeHost||!workspace.root,run:()=>setShowPortability(true)},
        {id:'runConsole',label:'Run console: recent executions, output and errors of this tab',run:()=>setShowRunConsole(true)},
        {id:'newScratch',label:'New scratch file (experiment, not added to the project)',run:newScratchFile},
        {id:'sessionInspector',label:'Session inspector: schema, NLS, transaction and cursor of this tab',run:()=>setShowSessionInspector(true)},
        {id:'docComment',label:'Generate documentation comment for the routine at the cursor',disabled:activeTabReadonly,run:generateDocComment},
        {id:'extractCte',label:'Extract selected subquery into a CTE',disabled:activeTabReadonly,run:extractSelectionToCte},
        {id:'columnCursors',label:'Paste column names as multiple cursors',disabled:activeTabReadonly,run:pasteColumnCursors},
        {id:'smartEnter',label:'Complete statement (Smart Enter)',detail:resolveSetting(settings,'editor.shortcuts').value.smartEnter,disabled:activeTabReadonly,run:()=>smartEnterRef.current?.()},
        {id:'surround',label:'Surround selection with block, IF, loop or timing',disabled:activeTabReadonly,run:()=>{const editor=editorRef.current,position=editor?.getPosition(),point=position&&editor.getScrolledVisiblePosition(position),rect=editor?.getDomNode()?.getBoundingClientRect();openSurroundMenu((rect?.left||0)+(point?.left||0),(rect?.top||0)+(point?.top||0)+(point?.height||0),editor?.getDomNode())}},
        {id:'unfoldSource',label:'Show all source regions',run:()=>{editorRef.current?.trigger('toolbar','editor.unfoldAll',{});editorRef.current?.focus()}},
        ...[['sqlcl','Open SQLcl in the project directory'],['sqlplus','Open SQL*Plus in the project directory'],['shell','Open a terminal in the project directory']].map(([tool,label])=>({id:`terminal:${tool}`,label,detail:'Separate session',disabled:!isNativeHost||!workspace.root,run:()=>sendNativeCommand('ui.openTerminal',{tool,directory:workspace.root,userName:visibleConnection?.user||visibleConnection?.username||undefined,identifier:visibleConnection?.id||undefined,tnsSource:visibleConnection?.source||undefined})})),
        {id:'foldRegions',label:'Fold named code regions',run:()=>{editorRef.current?.trigger('toolbar','editor.foldAllMarkerRegions',{});editorRef.current?.focus()}},
        {id:'lastEdit',label:'Return to last edit',detail:resolveSetting(settings,'editor.shortcuts').value.lastEdit,run:()=>navigateEdit('last')},
        {id:'previousEdit',label:'Previous edit location',detail:resolveSetting(settings,'editor.shortcuts').value.previousEdit,run:()=>navigateEdit(-1)},
        {id:'nextEdit',label:'Next edit location',detail:resolveSetting(settings,'editor.shortcuts').value.nextEdit,run:()=>navigateEdit(1)},
        {id:'lastExecution',label:'Return to latest executed SQL',detail:resolveSetting(settings,'editor.shortcuts').value.lastExecution,run:returnToExecution},
        {id:'layoutLock',label:layout.locked?'Unlock panel layout':'Lock panel layout',run:()=>updateLayout(current=>({...current,locked:!current.locked}))},
        {id:'structure',label:'Show file structure panel',run:()=>{setFilePanelView('structure');showDockPanel('files')}},
        ...activeGridActions(),
        {id:'resetLayout',label:'Reset panel layout',detail:'Restores the default panel arrangement',run:resetPanelLayout},
        {id:'shortcutMap',label:'Keyboard shortcut map',detail:'?',run:()=>setShortcutMap({context:'general'})},
        {id:'outline',label:'Show file outline',run:()=>setPaletteMode('outline')},
        {id:'sideEditor',label:'Toggle side editor: edit a second document beside this one',run:toggleSideEditor},
        {id:'explainExpression',label:'Explain CASE or analytic function at caret',run:openExpressionExplain},
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
    {runConfigurations&&<RunConfigurationsDialog {...runConfigurations} profileId={tabSessions[runConfigurations.tabId]?.activeConnection?.id} autoCommit={!!tabSessions[runConfigurations.tabId]?.autoCommit} connected={isNativeHost&&!tabSessions[runConfigurations.tabId]?.connectionLost&&!!tabSessions[runConfigurations.tabId]?.activeConnection&&!['No connection','Disconnected'].includes(tabSessions[runConfigurations.tabId]?.activeConnection?.id)} busy={!!tabSessions[runConfigurations.tabId]?.executing||!!tabSessions[runConfigurations.tabId]?.fetchingPage||!!tabSessions[runConfigurations.tabId]?.connecting} status={tabSessions[runConfigurations.tabId]?.runState||'Ready'} output={tabResults[runConfigurations.tabId]?.outputMessage||''} onClose={()=>setRunConfigurations(null)} onRun={(sql,parameters,configuration)=>{if(documents.activeId!==runConfigurations.tabId){setRunState('Return to the call configuration tab before running.');return;}const labels=Object.fromEntries(configuration.parameters.map((parameter,index)=>['arg_'+index,parameter.name]));labels.run_result='Return value';const sensitive=new Set(configuration.parameters.flatMap((parameter,index)=>parameter.sensitive?['arg_'+index]:[]));executeStatement(sql,parameters,false,{executedParameters:parameters.filter(parameter=>!sensitive.has(parameter.name)),parameterLabels:labels,runConfiguration:{id:configuration.id,name:configuration.name,revision:configuration.revision}})}}/>}
    {sourceCompile&&<SourceCompileDialog {...sourceCompile} theme={editorThemeName} valid={activeTabId===sourceCompile.tabId&&sql===sourceCompile.document.content&&tabSession.activeConnection?.id===sourceCompile.profileId&&(!sourceCompile.scriptRequestId||(tabSession.connectionGeneration??0)===sourceCompile.generation)} transactionPending={!!tabSession.transactionPending} onClose={()=>{if(sourceCompile.scriptRequestId)sendNativeCommand('sql.cancel',{tabId:sourceCompile.tabId});setSourceCompile(null)}} confirmLabel={sourceCompile.scriptRequestId?'Compile this script source':'Compile reviewed source'} reviewContext={sourceCompile.scriptRequestId?`Script paused before statement ${sourceCompile.scriptIndex+1}. Earlier statements remain completed; Cancel stops the remaining script.`:null} onBaseline={snapshot=>{const current=documents.tabs.find(tab=>tab.id===sourceCompile.tabId);if(current?.content===sourceCompile.document.content)documents.patch(current.id,{sourceBaseline:sourceBaseline(snapshot),sourceBaselines:{...current.sourceBaselines,[JSON.stringify([snapshot.owner,snapshot.name,snapshot.type,snapshot.profileId,snapshot.context])]:sourceBaseline(snapshot)}})}} onCompile={review=>{if(documents.activeId!==sourceCompile.tabId||documents.text!==sourceCompile.document.content||sessionsRef.current[sourceCompile.tabId]?.activeConnection?.id!==sourceCompile.profileId)return;const request=sourceCompile;
      if(request.scriptRequestId){const session=sessionsRef.current[request.tabId]||{};if((session.connectionGeneration??0)!==request.generation)return;sendNativeCommand('script.sourceReviewed',{tabId:request.tabId,scriptRequestId:request.scriptRequestId,index:request.scriptIndex,reviewNonce:request.reviewNonce,reviewId:review.reviewId});setSourceCompile(null);return;}
      setSourceCompile(null);executeStatement(request.prepared.sql,[],false,{ddlConfirmed:true,sourceReviewId:review.reviewId,submittedSql:request.prepared.sql,executedSql:request.prepared.original,statementOffset:request.statementOffset})}}/>}
    {showProjectRules&&workspace.root&&<ProjectRulesDialog profiles={dbConnections} root={workspace.root} onClose={()=>setShowProjectRules(false)} onSaved={rules=>{setWorkspace(current=>({...current,projectRules:rules}));setShowProjectRules(false)}}/>}
    {statusMenu&&<EditorContextMenu context={statusMenu} onClose={()=>setStatusMenu(null)} onAction={id=>{settings&&applySettings(changeSetting(settings,'ui.statusIndicators',toggleStatusIndicator(enabledStatusIndicators,id)))}} actions={statusIndicators.filter(item=>!item.fixed).map(item=>({id:item.id,label:`${enabledStatusIndicators.includes(item.id)?'✓ ':'    '}${item.label}`}))}/>}
    {surroundMenu&&<EditorContextMenu context={surroundMenu} onClose={()=>setSurroundMenu(null)} onAction={applySurround} actions={surroundMenu.options.map(option=>({id:surroundMenu.paste?option.id:`surround:${option.id}`,label:option.label}))}/>}
    {codeCell&&<CodeCellDialog cell={codeCell} theme={editorThemeName} onClose={()=>setCodeCell(null)} onOpenSql={text=>{setCodeCell(null);setObjectTabActive(false);newSqlFileNow(text)}}/>}
    {identifierCase&&<IdentifierCaseDialog request={identifierCase} onApply={applyIdentifierCase} onClose={()=>{setIdentifierCase(null);editorRef.current?.focus()}}/>}
    {localRename&&<Suspense fallback={null}><LocalRenameDialog request={localRename} onApply={applyLocalRename} onClose={()=>{setLocalRename(null);editorRef.current?.focus()}}/></Suspense>}
    {changeSignature&&<Suspense fallback={null}><ChangeSignatureDialog request={changeSignature} onApply={applyChangeSignature} onClose={()=>{setChangeSignature(null);editorRef.current?.focus()}}/></Suspense>}
    {extractProcedure&&<Suspense fallback={null}><ExtractProcedureDialog request={extractProcedure} onApply={applyExtractProcedure} onClose={()=>{setExtractProcedure(null);editorRef.current?.focus()}}/></Suspense>}
    {embeddedSql&&<Suspense fallback={null}><EmbeddedSqlDialog request={embeddedSql} onApply={applyEmbeddedSql} onClose={()=>{setEmbeddedSql(null);editorRef.current?.focus()}}/></Suspense>}
    {clipboardHistoryOpen&&<Suspense fallback={null}><ClipboardHistoryDialog enabled={clipboardEnabled} onEnabled={enabled=>{setClipboardEnabled(enabled);if(!enabled)setClipboardEntries([])}} entries={clipboardEntries} onClear={()=>setClipboardEntries([])} onPaste={pasteClipboardEntry} onClose={()=>{setClipboardHistoryOpen(false);editorRef.current?.focus()}}/></Suspense>}
    {editorMacrosOpen&&<Suspense fallback={null}><EditorMacrosDialog recording={macroRecording} macros={editorMacros} onStart={()=>{setMacroRecording([]);setEditorMacrosOpen(false);editorRef.current?.focus()}} onSave={name=>{const result=createEditorMacro(name,macroRecording);if(result.error)throw Error(result.error);setEditorMacros(items=>[result.macro,...items].slice(0,9));setMacroRecording(null)}} onCancel={()=>setMacroRecording(null)} onRun={macro=>{setEditorMacrosOpen(false);return runEditorMacro(macro)}} onDelete={id=>setEditorMacros(items=>items.filter(item=>item.id!==id))} onClose={()=>{setEditorMacrosOpen(false);editorRef.current?.focus()}}/></Suspense>}
    {quickFix&&<Suspense fallback={null}><QuickFixDialog request={quickFix} onApply={applyQuickFix} onClose={()=>{setQuickFix(null);editorRef.current?.focus()}}/></Suspense>}
    {expressionExplanation&&<Suspense fallback={<div role="status">Loading…</div>}><ExpressionExplainDialog explanation={expressionExplanation} onClose={()=>setExpressionExplanation(null)}/></Suspense>}
    {dependencyGraph&&<Suspense fallback={<div role="status">Loading…</div>}><DependencyGraphDialog {...dependencyGraph} documents={tabs} onOpen={openCallHierarchyPlace} onClose={()=>setDependencyGraph(null)}/></Suspense>}
    {structuralSearch&&<Suspense fallback={<div role="status">Loading…</div>}><StructuralSearchDialog {...structuralSearch} documents={tabs} onOpen={openCallHierarchyPlace} onClose={()=>setStructuralSearch(null)}/></Suspense>}
    {callHierarchy&&<Suspense fallback={<div role="status">Loading…</div>}><CallHierarchyDialog {...callHierarchy} documents={tabs} onOpen={openCallHierarchyPlace} onClose={()=>setCallHierarchy(null)}/></Suspense>}
    {relatedSources&&<RelatedSourcesDialog rules={workspace.projectRules} root={relatedSources.root} document={relatedSources.document} documents={tabs} onClose={()=>setRelatedSources(null)} onOpen={file=>{if(pathKey(workspace.root)!==pathKey(relatedSources.root))return;setRelatedSources(null);openWorkspaceFile(file)}}/>}
    <input ref={openFileInputRef} type="file" accept={(workspace.projectRules||defaultProjectRules).associations.map(item=>item.extension).join(',')+',text/plain'} hidden onChange={async (event) => { const file = event.target.files?.[0]; if (file) { const content = await file.text(); rememberEditorPosition(); const id = `file:${crypto.randomUUID()}`; documents.open({ id, name: file.name, path: null, content,savedContent:content, dirty: false, connectionProfileId: null }); setNativeTabId(id); } event.target.value = ""; }} />
    <FileMenu connectionControl={<ConnectionControl key={metadataOriginTabId} context={summarySession.sessionContext} contextError={summarySession.sessionContextError} executing={summarySession.executing} fetching={summarySession.fetchingPage} rendering={summarySession.rendering} cancelling={summarySession.cancelling} stage={summarySession.sqlStage} startedAt={summarySession.operationStartedAt} transactionPending={summarySession.transactionPending} readOnlyAnalysis={summarySession.analysisReadOnly} exporting={Boolean(tabResults[metadataOriginTabId]?.streamState?.busy)} inactive={Boolean(summarySession.inactive)&&!summarySession.connectionLost} profile={summaryConnection} connected={summaryConnected} connecting={summarySession.connecting} connectingProfile={summarySession.connectingProfile} disabled={activeTabReadonly} open={showPicker} onOpen={() => setShowPicker(true)}/>} onManageWorkspaces={()=>setShowWorkspaceManager(true)} workspace={workspace} onNew={newSqlFile} onOpen={openSqlFile} onSave={() => {if(!activeTabReadonly)saveSqlFile()}} onOpenWorkspace={openWorkspace} language={language}>
      <RunMenu actions={[{label:'Run statement',shortcut:resolveSetting(settings,'editor.shortcuts').value.run,disabled:activeTabReadonly||executing||fetchingPage,run:runQuery},{label:'Preview / run script',disabled:activeTabReadonly,run:openScriptPreview},{id:'navigation',separator:true},{label:'File outline',shortcut:resolveSetting(settings,'editor.shortcuts').value.outline,run:()=>setPaletteMode('outline')},{label:'Navigate back',shortcut:'Alt+Left',run:()=>navigateHistory(-1)},{label:'Navigate forward',shortcut:'Alt+Right',run:()=>navigateHistory(1)}]}/>
      <ViewMenu onApplyLayout={applySavedLayout} resultOptions={currentResultOptions} canPreviewResult={!!queryResult?.columns?.length} onResultAppearance={previewResultAppearance} settings={settings} layout={layout} language={language} onSetting={(id, value) => applySettings(changeSetting(settings, id, value))} onLayout={updateLayout} onPanel={showDockPanel} focusMode={focusMode} onFocusMode={setFocusMode} onResults={name => { setFocusMode(false); updateLayout(current => ({ ...current, resultsCollapsed: false })); setResultTab(name); }} onReset={resetPanelLayout} onSettings={() => setShowAppearance(true)} onCloseDetails={() => { setObjectDefinition(null); window.dispatchEvent(new Event('fbsdb.closeDetails')); }}/>
    </FileMenu>
    <div className="workbench"><aside className="activity-rail"><button className={`rail-button explorer-rail-toggle${sidebarOpen && !focusMode ? " selected" : ""}`} title={sidebarOpen && !focusMode ? "Hide explorer" : "Show explorer"} aria-label={sidebarOpen && !focusMode ? "Hide explorer" : "Show explorer"} aria-pressed={sidebarOpen && !focusMode} onClick={() => {if(focusMode){setFocusMode(false);setSidebarOpen(true)}else setSidebarOpen(open=>!open)}}><Database size={18} /></button><button className="rail-button" title="Search workbench (Ctrl+P)" aria-label="Search workbench" onClick={() => setPaletteMode("files")}><Search size={18} /></button><button className="rail-button" title="History" aria-label="History" onClick={() => { setShowHistory(true); setShowSearch(false); }}><History size={18} /></button><button className="rail-button" title="SQL snippets" aria-label="SQL snippets" onClick={() => { setSnippetFilter(""); setShowSnippets(true); }}><Braces size={18} /></button><button className="rail-button" title="SQL mini tools" aria-label="SQL mini tools" onClick={() => setShowMiniTools(true)}><Workflow size={18}/></button><div className="rail-spacer" /><button className={`rail-button${focusMode?" selected":""}`} title="Editor focus mode (Ctrl+Alt+Z)" aria-label="Editor focus mode" aria-pressed={focusMode} onClick={()=>setFocusMode(value=>!value)}><Code2 size={18}/></button><button className="rail-button" title="Settings" aria-label="Settings" onClick={() => setShowAppearance(true)}><Settings2 size={18} /></button></aside>
      <LayoutLockContext.Provider value={!!layout.locked}><DockWorkbench layout={layout} onChange={updateLayout} panels={dockPanels} hidden={focusMode||!!maximizedPanel}>
      <div className="editor-results-stack"><section className="editor-workspace" data-env={visibleConnection.environment} data-inspector={Boolean(objectInspectorView)}><div className="commandbar" ref={commandBarRef} onDoubleClick={event=>{if(!event.target.closest('button,input,select,label'))togglePanelMaximized('editor')}}><div className="command-left">{runButton}{toolbarLayout.inline.map((item,index,list)=><Fragment key={item.id}>{(index===0||list[index-1].group!==item.group)&&<span className="toolbar-separator" />}{renderToolbarItem(item)}</Fragment>)}</div><div className="command-end"><EditorToolbarOverflow theme={theme} items={toolbarLayout.overflow.map(item=>({...toolbarDefs[item.id],id:item.id,kind:item.kind}))} pageSize={maxRows} onPageSize={setMaxRows}/><button className="icon-button panel-maximize" aria-label={maximizedPanel==='editor'?'Restore editor panel':'Maximize editor panel'} aria-pressed={maximizedPanel==='editor'} title="Temporarily maximize editor (Escape restores)" onClick={()=>togglePanelMaximized('editor')}>{maximizedPanel==='editor'?'↙':'↗'}</button></div></div><EditorTabs onPromoteScratch={promoteScratch} onPromote={id=>setPreviewTabId(current=>current===id?null:current)} packageGroups={packageGroups} tabs={[...tabs.map(tab=>({...tab,preview:tab.id===previewTabId,isScratch:Boolean(tab.scratch&&!tab.path),connection:documentConnection(tab,tabSessions,dbConnections),sourceEdited:editedSinceExecution(tab,operations.metadata.get(tab.id)),queryFailed:['error','timeout'].includes(tabSessions[tab.id]?.queryOutcome?.kind),latestStatus:tabSessions[tab.id]?.cancelling?'Cancelling':tabSessions[tab.id]?.executing?'Executing':tabSessions[tab.id]?.runState||'No execution yet',profileName:dbConnections.find(p=>p.id===(tabSessions[tab.id]?.activeConnection?.id||tab.connectionProfileId))?.name,connectionProfileId:tabSessions[tab.id]?.activeConnection?.id||tab.connectionProfileId})), ...objectTabs.map(tab => ({ id: tab.id, name: `${tab.object.owner}.${tab.object.name}`, kind: 'object', connection:documentConnection({id:tab.originTabId},tabSessions,dbConnections), connectionProfileId:tabSessions[tab.originTabId]?.activeConnection?.id }))]} activeId={objectTabActive ? objectTabId : activeTabId} onActivate={id => { const selected = objectTabs.find(tab => tab.id === id); if (selected) { setActiveObjectTabId(id); setObjectTabActive(true); setActiveObject(selected.key); inspectOracleObject(selected.object,selected.originTabId,selected.view==='Related tables'); } else { setObjectTabActive(false); setActiveObject(''); activateTab(id); } }} onClose={id => { if (objectTabs.some(tab => tab.id === id)) { setObjectTabs(current => current.filter(tab => tab.id !== id)); if (activeObjectTabId === id) { setObjectTabActive(false); setActiveObjectTabId(null); objectAnalysisRequestRef.current?.cancel(); setObjectAnalysis(null); } } else closeTab(id); }} onCloseMany={ids => { const objectIds = new Set(objectTabs.map(tab => tab.id)); if (ids.includes(activeObjectTabId)) { setObjectTabActive(false); setActiveObjectTabId(null); objectAnalysisRequestRef.current?.cancel(); setObjectAnalysis(null); } setObjectTabs(current => current.filter(tab => !ids.includes(tab.id))); closeTabs(ids.filter(id => !objectIds.has(id))); }} onNew={() => { setObjectTabActive(false); setActiveObject(''); newSqlFile(); }} newOptions={{label:newQueryMainLabel(dbConnections,activeConnection?.id),profiles:newQueryProfileItems(dbConnections,activeConnection?.id),templates:newQueryTemplates,onProfile:id=>{setActiveObject('');newSqlFileOnProfile(id)},onTemplate:id=>{setActiveObject('');newSqlFileFromTemplate(id)}}}>{!objectInspectorView && filePath && <button className={fileConnectionProfileId === activeConnection.id ? "icon-button file-connection-button bound" : "icon-button file-connection-button"} title="Bind current connection to this file" aria-label="Bind current connection to this file" disabled={!isNativeHost || !workspace.root || ["No connection", "Disconnected"].includes(activeConnection.id)} onClick={bindCurrentConnectionToFile}><Database size={14} /></button>}</EditorTabs><div className="breadcrumb"><EnvironmentBadge environment={visibleConnection.environment} profileName={visibleConnection.profileName}/><span>{workspace.name}</span>{filePath && <><ChevronRight size={12} /><span>{filePath.split(/[\\/]/).slice(-2, -1)[0]}</span></>}<ChevronRight size={12} /><b>{objectTabActive&&inspectorObject?`${inspectorObject.owner}.${inspectorObject.name}`:fileName}{!objectTabActive&&fileDirty ? " *" : ""}</b>{!objectInspectorView&&<EditorSymbolBreadcrumb source={activeSource.declaration} schema={completionSchema} onNavigate={jumpToOffset} editor={editorRef.current} tabId={activeTabId} outline={documentOutline}/>}{filePath && <span className="file-connection-chip" title="Saved connection for this file"><Database size={11} />{(dbConnections.find(item => item.id === fileConnectionProfileId)?.name || fileConnectionProfileId) ?? "No profile bound"}</span>}</div>{!objectInspectorView&&<OracleSourceHeader onApi={()=>setShowPackageApi(true)} onCall={isNativeHost?openRunConfigurations:undefined} onCompile={!activeTabReadonly&&isNativeHost?reviewSourceForCompilation:undefined} compileDisabled={executing||fetchingPage||connecting||!!tabSession.scriptRun?.running} source={activeSource} related={relatedPackage} document={activeEditorTab} onSwitch={switchPackageSource} onFind={isNativeHost&&workspace.root&&!activeTabReadonly&&!activeSource.warning?()=>setRelatedSources({root:workspace.root,document:documents.active}):undefined}/>}{!objectInspectorView&&activeEditorTab?.sourceVersionNotice&&<div className="result-source-provenance" role="status">{activeEditorTab.sourceVersionNotice}</div>}{largePolicy.large&&<div className="large-file-notice" role="status"><b>Large file mode</b><span>{sql.length.toLocaleString()} characters · lightweight rendering. Enable only the analysis needed for this document:</span>{[['completion','Completion & navigation'],['diagnostics','Diagnostics'],['outline','Outline & folding'],['source','Source identity & comparison']].map(([feature,label])=><label key={feature}><input type="checkbox" aria-label={`Large file ${label}`} checked={largePolicy[feature]} onChange={event=>{const enabled=event.target.checked;setLargeFileOverrides(current=>({...current,[activeTabId]:{...current[activeTabId],[feature]:enabled}}))}}/>{label}</label>)}</div>}<ExternalFileNotice key={activeTabId} change={tabs.find(tab=>tab.id===activeTabId)?.externalChange} dirty={fileDirty} onReload={()=>resolveExternalFile(true)} onKeep={()=>resolveExternalFile(false)} onRetry={pollOpenFiles}/><div className="editor-container"><div className={`editor-sql-surface${sideEditor?' has-side-editor':''}`} hidden={Boolean(objectInspectorView)} onDragOverCapture={event=>{if(event.dataTransfer?.types?.includes('application/x-fbsdb-schema')){event.preventDefault();event.dataTransfer.dropEffect='copy'}}} onDropCapture={dropSchemaInEditor}><Suspense fallback={<div className="editor-loading">Loading SQL editor…</div>}><Editor height="100%" defaultLanguage="sql" value={sql} onChange={handleEditorChange} theme={editorThemeName} onMount={(editor, monacoInstance) => { setMonaco(monacoInstance);attachBindDrop(editor);
    let trackedEditTab=documents.activeId;
    editor.onDidChangeModelContent(event=>{const id=documents.activeId;if(controlledEditorUpdateRef.current||event.isEolChange){trackedEditTab=id;return;}if(trackedEditTab!==id){trackedEditTab=id;return;}if(event.isFlush){if(trackedEditTab===id)editLocationsRef.current.forget(id);trackedEditTab=id;return;}trackedEditTab=id;if(!documents.active?.readOnly)editLocationsRef.current.record(id,event.changes,editor.getModel()?.getValueLength()||0)});
    editor.onDidChangeModelContent(event => { const accepted = lastSuggestionAcceptanceRef.current; if (event.isUndoing && accepted && accepted.tabId === documents.activeId && event.versionId === accepted.version + 1 && Date.now()-accepted.at < 10000 && completionSettingsRef.current.learning) { suggestionLearningRef.current.record(accepted.scope, accepted.context, accepted.key, -1); lastSuggestionAcceptanceRef.current = null; publishLearning(); } }); completionTabKeyRef.current = editor.createContextKey("fbsdb.acceptCompletionOnTab", completionSettings.acceptTab); completionAcceptanceRef.current = editor.addCommand(0, (_accessor, key, context) => { if (completionSettingsRef.current.learning) { const scope = suggestionScope(); suggestionLearningRef.current.record(scope, context || 'statement', key); lastSuggestionAcceptanceRef.current = { scope, context: context || 'statement', key, tabId: documents.activeId, version: editor.getModel().getVersionId(), at: Date.now() }; publishLearning(); } const tabId = documents.activeId; completionRecentRef.current.set(tabId, [key, ...(completionRecentRef.current.get(tabId) || []).filter(item => item !== key)].slice(0, 100)); completionClientRef.current?.remember(key); }); editor.addCommand(monacoInstance.KeyCode.Tab, () => { editor.trigger("keyboard", "hideSuggestWidget", {}); editor.trigger("keyboard", "editor.action.inlineSuggest.hide", {}); editor.trigger("keyboard", "tab", {}); }, "(suggestWidgetVisible || inlineSuggestionVisible) && editorTextFocus && !fbsdb.acceptCompletionOnTab"); editor.addAction({ id: "fbsdb.runStatement", label: "Run SQL statement", run: () => runQueryRef.current?.() }); editor.addAction({ id: "fbsdb.deleteLine", label: "Delete line", precondition: "editorTextFocus && !editorReadonly", run: () => editor.trigger("keyboard", "editor.action.deleteLines", {}) }); editor.addAction({ id: "fbsdb.formatSql", label: "Format SQL", run: () => formatterRef.current?.() }); editor.addAction({ id: 'fbsdb.smartEnter', label: 'Complete statement (Smart Enter)', precondition: 'editorTextFocus && !editorReadonly', run: () => smartEnterRef.current?.() }); editor.addAction({ id: 'fbsdb.quickFix', label: 'Quick fixes', keybindings: [monacoInstance.KeyMod.Alt | monacoInstance.KeyCode.Enter], precondition: 'editorTextFocus && !editorReadonly', run: () => quickFixRef.current?.() }); editor.addAction({ id: 'fbsdb.replayMacro', label: 'Replay latest editor macro', keybindings: [monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Alt | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.KeyM], precondition: 'editorTextFocus && !editorReadonly', run: () => macroRunRef.current?.() }); installRunGutter(editor, monacoInstance); insertPairProvidersRef.current?.dispose(); insertPairProvidersRef.current = installInsertPairProviders(monacoInstance); structuralSelectionRef.current?.dispose(); structuralSelectionRef.current = installStructuralSelection(monacoInstance); postfixProviderRef.current?.dispose(); postfixProviderRef.current = installPostfixCompletion(monacoInstance); editorRef.current = editor; lastEditorPositionRef.current = editor.getPosition(); editor.onDidChangeCursorPosition(({ position }) => { lastEditorPositionRef.current = position;editorPositionsRef.current.set(documents.activeId,position);projectionCursorRef.current?.(position);setCursorLine(position.lineNumber); }); editor.focus(); recordStartupMilestone("editor-ready"); editorPresentable(monacoInstance).then(() => { recordStartupMilestone("editor-presentable"); announceUiReady(); }); }} options={{ fontFamily: `"${resolveSetting(settings,"editor.fontFamily").value}", Consolas, monospace`, fontSize: codeStyle.fontSize, readOnly: activeTabReadonly, lineHeight: Math.max(codeStyle.fontSize + 2, resolveSetting(settings,"editor.lineHeight").value), minimap: { enabled: resolveSetting(settings,"editor.minimap").value, showRegionSectionHeaders: true, showMarkSectionHeaders: true }, padding: { top: 18, bottom: 18 }, lineNumbers: resolveSetting(settings,"editor.lineNumbers").value ? "on" : "off", renderLineHighlight: resolveSetting(settings,"editor.lineHighlight").value ? "line" : "none", renderWhitespace: resolveSetting(settings,"editor.whitespace").value ? "all" : "none", scrollBeyondLastLine: false, smoothScrolling: !reduceMotion, automaticLayout: true, contextmenu:false, wordWrap: resolveSetting(settings,"editor.wordWrap").value ? "on" : "off", glyphMargin: true, folding: resolveSetting(settings,"editor.folding").value, guides: { indentation: resolveSetting(settings,"editor.indentGuides").value, highlightActiveIndentation: resolveSetting(settings,"editor.indentGuides").value }, suggest: { showWords: false, showSnippets: completionSettings.snippets, preview: false }, inlineSuggest: { enabled: completionSettings.inline, mode: "prefix", showToolbar: "never", minShowDelay: completionSettings.delay, suppressSuggestions: false }, 'semanticHighlighting.enabled':resolveSetting(settings,'editor.semanticHighlighting').value&&!largePolicy.large,quickSuggestions: false, suggestOnTriggerCharacters: autoCompletion, acceptSuggestionOnEnter: completionSettings.acceptEnter ? "on" : "off", tabCompletion: completionSettings.acceptTab ? "on" : "off", parameterHints: { enabled: completionSettings.signatureHelp }, tabSize: codeStyle.tabSize, insertSpaces: codeStyle.insertSpaces, cursorBlinking: reduceMotion?"solid":resolveSetting(settings,"editor.cursorBlinking").value, cursorStyle: resolveSetting(settings,"editor.cursorStyle").value, cursorSmoothCaretAnimation: reduceMotion?"off":"on", bracketPairColorization: { enabled: resolveSetting(settings,"editor.bracketColors").value }, stickyScroll:{enabled:resolveSetting(settings,'editor.stickyHeaders').value,maxLineCount:4,defaultModel:'outlineModel'},codeLens: resolveSetting(settings,'editor.codeLenses').value&&!largePolicy.large, overviewRulerLanes: resolveSetting(settings,'editor.overviewRuler').value?3:0,overviewRulerBorder:false, fixedOverflowWidgets: true,...lightweightEditorOptions(largePolicy), find: { addExtraSpaceOnTop: false } }} /></Suspense>{sideEditor&&<SideEditorPane tabs={tabs} tabId={sideEditor.tabId} onTab={id=>setSideEditor({tabId:id})} onChange={(id,value)=>documents.editTab(id,value)} onClose={()=>setSideEditor(null)} theme={editorThemeName} options={sideEditorOptions}/>}</div>{objectInspectorView}{!objectInspectorView && objectDefinition && objectDefinition.originTabId === metadataOriginTabId && <Suspense fallback={<div role="status">Loading…</div>}><OracleDefinitionView hidden={focusMode} source={objectDefinition} onClose={() => setObjectDefinition(null)}/></Suspense>}</div><div className="editor-status" onContextMenu={event=>{if(event.target.closest('input,select,textarea'))return;event.preventDefault();setStatusMenu({tabId:activeTabId,x:event.clientX,y:event.clientY,trigger:event.currentTarget,model:null,version:0,selection:null})}}><EditorSessionStatus sourceEdited={editedSinceExecution(activeEditorTab||{},operations.metadata.get(activeTabId))} executionTarget={tabSession.executionTarget} inactive={Boolean(tabSession.inactive)} editor={editorRef.current} tabId={activeTabId} connection={activeConnection} connected={sessionConnected} connecting={connecting} executing={executing} cancelling={cancelling} fetching={fetchingPage} startedAt={tabSession.operationStartedAt} stage={tabSession.sqlStage} readOnlyAnalysis={tabSession.analysisReadOnly} transactionPending={transactionPending} exporting={Boolean(view.streamState?.busy)} /><span>SQL</span><button type="button" className="status-overview" aria-label="Next local change" disabled={!overview.ranges.length} onClick={overview.next} title="Overview ruler: diagnostics, find matches, and local changes (left lane). Click the ruler to scroll to a location.">{overview.label}</button>{enabledStatusIndicators.map(id=>{const item=statusIndicatorContent(id,buildStatusContext());if(!item)return null;const inner=<>{item.icon==='code'&&<Code2 size={12} />}{item.text}</>;return item.action?<button type="button" key={id} className="status-indicator" data-indicator={id} title={item.title} onClick={()=>statusIndicatorAction(item.action)}>{inner}</button>:<span key={id} className="status-indicator" data-indicator={id} title={item.title}>{inner}</span>})}<button type="button" className="status-intellisense saved-state editor-save-button" title={activeTabReadonly ? "Read only" : "Save SQL file (Ctrl+S)"} aria-label={activeTabReadonly ? "Read only" : "Save SQL file (Ctrl+S)"} disabled={activeTabReadonly} onClick={() => saveSqlFile()}>{activeTabReadonly ? <><LockKeyhole size={12} /> Read only</> : fileDirty ? <><Save size={12} /> Unsaved</> : <><Save size={12} /> Saved</>}</button></div></section>
      <ResizeHandle locked={layout.locked} axis="y" value={resultsHeight} onChange={value=>{setFocusMode(false);setResultsHeight(value)}} min={15} max={70} label="Resize results" panelSelector=".result-panel" />
      <section className="result-panel" data-collapsed={bottomCollapsed}>
        <div className="result-header" onDoubleClick={event=>{if(!event.target.closest('button,input,select'))togglePanelMaximized('results')}}><button className="icon-button panel-maximize" aria-label={maximizedPanel==='results'?'Restore results panel':'Maximize results panel'} aria-pressed={maximizedPanel==='results'} title="Temporarily maximize results (Escape restores)" onClick={()=>togglePanelMaximized('results')}>{maximizedPanel==='results'?'↙':'↗'}</button><div className="result-tabs">
          <button className={resultTab === "Results" ? "active" : ""} onClick={() => { updateLayout(current => ({ ...current, resultsCollapsed: false })); setFocusMode(false); setResultTab("Results"); }}><Table2 size={14} /> Results{queryResult && <span className="result-tab-count">{queryResult.returnedRows ?? queryResult.rowsAffected ?? ""}</span>}</button>
          <button className={resultTab === "Output" ? "active" : ""} onClick={() => { updateLayout(current => ({ ...current, resultsCollapsed: false })); setFocusMode(false); setResultTab("Output"); }}><Terminal size={14} /> Output</button>
          <button className={resultTab === "Problems" ? "active" : ""} onClick={() => { updateLayout(current => ({ ...current, resultsCollapsed: false })); setFocusMode(false); setResultTab("Problems"); }} title="SQL and PL/SQL problems (F8 / Shift+F8)"><CircleHelp size={14} /> Problems{activeProblems.length > 0 && <span className="result-tab-count">{activeProblems.length}</span>}</button>
          <button className={resultTab === "Explain" ? "active" : ""} onClick={() => { updateLayout(current => ({ ...current, resultsCollapsed: false })); setFocusMode(false); setResultTab("Explain"); }} title="View the last execution plan"><Activity size={14} /> Explain plan</button>
        </div><button className="icon-button result-panel-collapse" aria-label={bottomCollapsed ? "Restore bottom panel" : "Minimize bottom panel"} title={bottomCollapsed ? "Restore bottom panel" : "Minimize bottom panel"} onClick={() => { setFocusMode(false); updateLayout(current => ({ ...current, resultsCollapsed: !bottomCollapsed })); }}><ChevronDown size={14} style={{ transform: bottomCollapsed ? "rotate(180deg)" : undefined }}/></button></div>
        {resultTab === "Results" && <div className="result-set-tabs">
          <input aria-label="Search result sets" placeholder="Search results" value={resultSetSearch} onChange={event => setResultSetSearch(event.target.value)} />
          <button title="Double-click to rename latest result" onDoubleClick={() => { setRenameResult("latest"); setNewResultName(view.latestResultName || "Latest"); }} className={!view.selectedResultKey ? "active" : ""} onClick={() => updateTabResult("selectedResultKey", null)}>{view.latestResultName || "Latest"}</button>
          {(view.resultSets || []).filter(item => item.pinned && (item.label + " " + (item.result.executedSql || "")).toLowerCase().includes(resultSetSearch.toLowerCase())).map(item => <div key={item.key} className={view.selectedResultKey === item.key ? "active" : ""}>
            <button title={item.result.executedSql + " · Double-click to rename"} onDoubleClick={() => { setRenameResult(item.key); setNewResultName(item.label); }} onClick={() => updateTabResult("selectedResultKey", item.key)}>{item.pinned ? "◆ " : ""}{item.label}</button>
            <button aria-label="Close result set" onClick={() => { if (item.result.resultId && item.result.resultId !== view.queryResult?.resultId && !(view.resultSets || []).some(other => other.key !== item.key && other.result.resultId === item.result.resultId)) sendNativeCommand("sql.closeResult", { resultId: item.result.resultId }); updateTabResult("resultSets", sets => sets.filter(value => value.key !== item.key)); if (view.selectedResultKey === item.key) updateTabResult("selectedResultKey", null); }}>×</button>
          </div>)}
        </div>}
        {['Results','Output'].includes(resultTab)&&<StackTraceLinks items={tabSession.runtimeProblems} onNavigate={navigateProblem}/>}
        {['Results','Output'].includes(resultTab)&&<ResultSourceProvenance result={resultTab==='Output'?view.outputProvenance:queryResult} document={activeEditorTab||{}} connection={editorConnection} context={tabSession.sessionContext}/>}
        {resultTab === "Problems" ? <ProblemsPanel onReturnToEditor={()=>editorRef.current?.focus()} items={allProblems} activeTabId={activeTabId} onNavigate={navigateProblem} /> : resultTab === "Explain" ? <Suspense fallback={<div role="status">Loading…</div>}><ExplainPlanView result={explainResult} loading={executing && executionKind === "explain"} error={explainMessage} mode={view.planPresentation || "diagram"} onModeChange={mode => updateTabResult("planPresentation", mode, activeTabId)} /></Suspense> : resultTab === "Results"
          ? <SqlResultsView onFindObject={()=>setPaletteMode('files')} onRun={()=>runQueryRef.current?.()} runShortcut={resolveSetting(settings,'editor.shortcuts').value.run}
              liveAppearance={resultTab==='Results'&&resultLiveAppearance?.key===currentAppearanceKey?resultLiveAppearance:null} onAppearanceApplied={sequence=>setResultLiveAppearance(current=>current?.sequence===sequence?null:current)}
              budget={{maxRows:resolveSetting(settings,'results.budgetRows').value,maxMemoryMb:resolveSetting(settings,'results.budgetMemoryMb').value,action:resolveSetting(settings,'results.budgetAction').value}}
              onSelectionSummary={summary=>updateTabResult('selectionSummary',summary,activeTabId)} onExportInsert={exportResultsInsertSql} onSmartObject={showSmartObject} linkedColumn={linkedProjectionColumn} onColumnSource={showProjectionSource}
              sourceDefinition={definition?.tabId === activeTabId ? definition : null}
              onCloseSourceDefinition={() => { const owner = documents.activeId, requestId = sourceDefinitionRequestRef.current.get(owner); if (requestId) operations.owners.delete(requestId); sourceDefinitionRequestRef.current.delete(owner); setDefinition(null); }}
              memoryItems={[{ key: "latest", label: view.latestResultName || "Latest", result: view.queryResult }, ...(view.resultSets || []).filter(item => item.pinned)].filter(item => item.result).map(item => ({ ...item, memoryKB: Math.round(estimateResultMemory(item.result) / 1024) }))}
              onReleaseResult={releaseResult} onPin={pinCurrentResult} onExplain={explainQuery}
              key={`${activeTabId}:${resultTab}:${view.selectedResultKey || "latest"}:${sqlResult?.viewIdentity||sqlResult?.resultId||"empty"}`}
              initialView={(resultTab === "Results" && view.selectedResultKey ? view.resultSets?.find(item => item.key === view.selectedResultKey)?.view : view[resultTab === "Explain" ? "planView" : "queryView"]) || {}}
              onViewStateChange={state => { if (resultTab === "Results" && view.selectedResultKey) updateTabResult("resultSets", sets => (sets || []).map(item => item.key === view.selectedResultKey ? { ...item, view: state } : item), activeTabId); else updateTabResult(resultTab === "Explain" ? "planView" : "queryView", state, activeTabId); }}
              onMetadata={metadata => { const url = URL.createObjectURL(new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" })), link = document.createElement("a"); link.href = url; link.download = "result-metadata.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }}
              onGenerateSql={sql => sendNativeCommand("result.openSql", { sql })}
              onSourceDefinition={column => { const owner = documents.activeId; setDefinition(null); const requestId = sendNativeCommand("result.columnDefinition", { column, tabId: owner }); if (requestId) { sourceDefinitionRequestRef.current.set(owner, requestId); operations.owners.set(requestId, owner); } }}
              onUpdateDraft={(columns, rows) => sendNativeCommand("result.updateDraft", { columns, rows })}
              connected={sessionConnected} onConnect={()=>setShowPicker(true)} onEdit={()=>editorRef.current?.focus()} onClearServerFilter={()=>{const base=queryResult?.serverFilter;if(base&&!executing&&!fetchingPage&&!view.streamState?.busy)executeStatement(base.sql,base.parameters);}} onServerFilter={applyServerFilters} onExportColumns={exportChosenColumns} onLookup={requestPrimaryKey}
              onClearFilter={() => setResultFilter("")} onChildren={openChildRecords} onSql={insertEditorText} onRelated={openRelatedRecords}
              onStreamExport={streamResultToFile} streamState={view.streamState} onCancelExport={() => sendNativeCommand("result.cancelExport",{tabId:activeTabId})}
              result={sqlResult} onResultRendered={resultRenderMeasured} region={region} language={language} editorSql={sql} runState={runState} executing={executing && (resultTab === "Explain" ? executionKind === "explain" : executionKind !== "explain")}
              startedAt={tabSession.operationStartedAt} outcome={!view.selectedResultKey?tabSession.queryOutcome:null} onCancel={()=>cancelQuery(activeTabId,tabSession.scriptRun?.running||fetchingPage?undefined:tabSession.queryRequestId)}
              cancelling={cancelling} filter={resultTab === "Explain" ? "" : resultFilter} pageSize={maxRows}
              onFetchMore={resultTab === "Explain" ? undefined : fetchMoreResults}
              fetching={resultTab === "Results" && fetchingPage && pageRequestRef.current?.owner === activeTabId}
              pageError={resultTab === "Results" ? pageError : ""}
            />
          : /ORA-\d+/i.test(panelMessage||'') ? <ActionableState className="output-empty" title={/ORA-0*1031\b/i.test(panelMessage)?'Oracle access denied':/ORA-0*942\b/i.test(panelMessage)?'Oracle object missing or inaccessible':'Oracle execution error'} detail={panelMessage} action={/ORA-0*1031\b/i.test(panelMessage)?'Choose another profile':'Return to SQL'} onAction={()=>/ORA-0*1031\b/i.test(panelMessage)?setShowPicker(true):editorRef.current?.focus()}/>: <div className="output-empty"><div className="output-icon"><BookOpen size={18}/></div><b>{panelMessage?'DBMS_OUTPUT':'No output messages'}</b><span>{panelMessage||'DBMS_OUTPUT and execution notices appear here.'}</span></div>}
      </section>
    </div>
      </DockWorkbench></LayoutLockContext.Provider>
    </div>
    <footer className="app-status"><div className="footer-workspace"><Folder size={12}/><span title={workspace.root||'Open a workspace'}>{workspace.name}</span></div><button type="button" className="footer-target" aria-label={`Connection ${visibleConnection.profileName||'none'}${visibleConnection.environment&&visibleConnection.environment!=='UNKNOWN'?`, ${visibleConnection.environment}`:''}. Choose another connection`} onClick={()=>setShowPicker(true)}><EnvironmentBadge compact environment={visibleConnection.environment} profileName={visibleConnection.profileName}/><span>{visibleConnection.profileName||'No connection'}</span></button><FooterDrafts tabId={activeTabId} onShow={()=>setResultTab('Results')}/><div className="footer-context"><button type="button" aria-label="Getting started" onClick={()=>setShowGettingStarted(true)}><CircleHelp size={11}/><span>Getting started</span></button><WorkbenchStatus session={{...summarySession,exporting:!!tabResults[visibleOrigin]?.streamState?.busy}} connection={visibleConnection} selection={visibleOrigin===activeTabId&&resultTab==='Results'?view.selectionSummary:null} error={visibleOrigin===activeTabId?view.pageError:''}/></div><div className="footer-transaction" title={`${visibleConnection.profileName} · ${transactionStatus(summarySession)}`}><LockKeyhole size={12}/><span>{transactionStatus(summarySession)}</span></div></footer>
    {showPicker && <ConnectionPicker items={dbConnections.map(item => ({ ...item, recent: recentProfiles.includes(item.id) }))} current={activeConnection} onClose={() => setShowPicker(false)} onConnect={switchConnection} favorites={favorites} setFavorites={setFavorites} groups={connectionGroupNames} onManage={()=>{setShowPicker(false);setProfileEditor(true)}} managementError={managementError}
      onNew={() => { setShowPicker(false); setProfileEditor({}); }}
      onEdit={(profile) => { setShowPicker(false); setProfileEditor(profile); }}
      onDuplicate={(profile) => { setShowPicker(false); setProfileEditor({ ...profile, id: undefined, name: `${profile.name || profile.id} copy`, hasSavedCredentials: false }); }}
      onDelete={(profile) => { setManagementError(""); if (isNativeHost) sendNativeCommand("connection.delete", { profileId: profile.id }); else setDbConnections(current => current.filter(p => p.id !== profile.id)); }}
      onDisconnect={disconnectActiveConnection}
      onReconnect={profile => switchConnection(profile, true)}
      onTest={profile => { setShowPicker(false); setConnectionError(""); setAuthProfile({ ...profile, testOnly: true, tabId: documents.activeId }); setConnecting(false); }} />}
    {showMiniTools && <Suspense fallback={<div role="status">Loading…</div>}><MiniToolsDialog key={`${workspace.root}:${activeTabId}`} root={workspace.root} tabId={activeTabId} sourceResult={queryResult} result={view.queryResult} profiles={dbConnections} profile={activeConnection} connected={isNativeHost && sessionConnected && !connecting && !activeTabReadonly} busy={executing || fetchingPage || connecting || Boolean(view.streamState?.busy) || Boolean(tabSession.scriptRun?.running)} status={tabSession.runState} outcome={tabSession.queryOutcome} onConnect={switchConnection} onRun={(statement, parameters) => {
      assertMiniToolSelect(statement);
      if (!isNativeHost || !sessionConnected || connecting || executing || fetchingPage || view.streamState?.busy || tabSession.scriptRun?.running || activeTabReadonly) throw new Error('Connect an idle SQL tab before running a mini tool.');
      return executeStatement(statement, parameters, true);
    }} onCancelRun={cancelQuery} onFetchMore={fetchMoreResults} onClose={() => setShowMiniTools(false)}/></Suspense>}
    {showSnippets && <ModalBackdrop onClose={() => setShowSnippets(false)} onMouseDown={(event) => event.target === event.currentTarget && setShowSnippets(false)}><section className="appearance-modal snippet-browser-modal" role="dialog" aria-modal="true" aria-labelledby="snippet-browser-title"><header className="appearance-header"><div><div className="eyebrow">SQL TOOLKIT</div><h2 id="snippet-browser-title">SQL snippets</h2><p>Search, preview, and insert SQL templates, or create your own.</p></div><div className="snippet-header-actions"><button className="button-secondary" onClick={() => { setSnippetFormOpen(true); setSnippetError(""); }}><Plus size={13} /> New custom</button><button className="icon-button" onClick={() => setShowSnippets(false)} aria-label="Close SQL snippets"><X size={17} /></button></div></header><label className="workspace-search-input snippet-search-input"><Search size={15} /><input autoFocus value={snippetFilter} onChange={(event) => setSnippetFilter(event.target.value)} placeholder="Search snippets or triggers…" aria-label="Search SQL snippets" /></label><div className="snippet-browser-body"><div className="snippet-list" role="listbox" aria-label="Available SQL snippets">{filteredSnippets.length ? filteredSnippets.map((snippet) => <button key={snippet.trigger} className={`snippet-option ${selectedSnippet?.trigger === snippet.trigger ? "selected" : ""}`} role="option" aria-selected={selectedSnippet?.trigger === snippet.trigger} onClick={() => { setSelectedSnippetTrigger(snippet.trigger); setSnippetFormOpen(false); }}><span className="snippet-trigger">{snippet.trigger}</span><span className="snippet-option-copy"><b>{snippet.label}</b><small>{snippet.detail}</small></span><ChevronRight size={14} /></button>) : <div className="query-history-empty"><Search size={20} /><b>No matching snippets</b><span>Try a SQL keyword or trigger such as `cte`.</span></div>}</div>{snippetFormOpen ? <div className="snippet-preview snippet-form-panel"><div className="snippet-preview-heading"><div><span className="appearance-section-title">CUSTOM TEMPLATE</span><b>Create a SQL snippet</b></div><Braces size={15} /></div><label>Trigger<input autoFocus maxLength={24} value={snippetDraft.trigger} onChange={(event) => { setSnippetDraft((draft) => ({ ...draft, trigger: event.target.value })); setSnippetError(""); }} placeholder="e.g. myquery" /></label><label>Name<input maxLength={48} value={snippetDraft.label} onChange={(event) => setSnippetDraft((draft) => ({ ...draft, label: event.target.value }))} placeholder="e.g. Active invoices" /></label><label>Description<input maxLength={100} value={snippetDraft.detail} onChange={(event) => setSnippetDraft((draft) => ({ ...draft, detail: event.target.value }))} placeholder="Shown in IntelliSense" /></label><label>SQL template<textarea spellCheck="false" value={snippetDraft.text} onChange={(event) => setSnippetDraft((draft) => ({ ...draft, text: event.target.value }))} placeholder="Use ${1:placeholder} for editable Tab stops" /></label>{snippetError && <Feedback title="Snippet could not be saved">{snippetError}</Feedback>}</div> : selectedSnippet && <div className="snippet-preview"><div className="snippet-preview-heading"><div><span className="appearance-section-title">{customSqlSnippets.some((snippet) => snippet.trigger === selectedSnippet.trigger) ? "CUSTOM SNIPPET" : "BUILT-IN PREVIEW"}</span><b>{selectedSnippet.label}</b></div><div className="snippet-preview-tools">{customSqlSnippets.some((snippet) => snippet.trigger === selectedSnippet.trigger) && <button className="snippet-delete-button" aria-label={"Delete " + selectedSnippet.label} title="Delete custom snippet" onClick={() => deleteCustomSqlSnippet(selectedSnippet.trigger)}><Trash2 size={13} /></button>}<code>{selectedSnippet.trigger}</code></div></div><p>{selectedSnippet.detail}</p><pre>{selectedSnippet.text.replace(/\$\{\d+:([^}]+)\}/g, "$1")}</pre><div className="snippet-placeholder-note"><Zap size={13} /> Tab moves between editable placeholders.</div></div>}</div><footer className="appearance-footer"><span>{sqlSnippets.length} built-in · {customSqlSnippets.length} custom · Ctrl+Space opens trigger suggestions</span>{snippetFormOpen ? <div className="snippet-footer-actions"><button className="button-secondary" onClick={() => { setSnippetFormOpen(false); setSnippetError(""); }}>Cancel</button><button className="button-primary" onClick={saveCustomSqlSnippet}><Check size={13} /> Save snippet</button></div> : <button className="button-primary" disabled={!selectedSnippet} onClick={() => insertSqlSnippet(selectedSnippet)}><Braces size={14} /> Insert snippet</button>}</footer></section></ModalBackdrop>}
    {showSearch && <ModalBackdrop onClose={() => setShowSearch(false)} onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSearch(false); }}><section className="appearance-modal workspace-search-modal" role="dialog" aria-modal="true" aria-labelledby="workspace-search-title"><header className="appearance-header"><div><div className="eyebrow">WORKSPACE SEARCH</div><h2 id="workspace-search-title">{deleteReview?'Review references before delete':'Find in SQL files'}</h2><p>{workspaceSearchScope?`Search SQL files in ${workspaceSearchScope}`:'Case-insensitive search across SQL files in the open workspace.'}</p></div><button className="icon-button" aria-label="Close workspace search" onClick={() => setShowSearch(false)}><X size={17} /></button></header>{deleteReview&&<div className="workspace-delete-review" role="status"><b>{deleteReview.kind} {deleteReview.name}</b><span>{deleteReview.localReferences} resolved current-document reference{deleteReview.localReferences===1?'':'s'}{deleteReview.localComplete?'':` · local analysis incomplete: ${deleteReview.localReason||'limit reached'}`}. Workspace results are bounded text candidates, not verified semantic references. Dynamic SQL, server-side callers and unsaved changes in other editors are unresolved. This review does not delete code or prove deletion is safe.</span></div>}<label className="workspace-search-input"><Search size={15} /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search text in .sql files…" aria-label="Search SQL workspace" /></label><div className="workspace-search-summary">{!isNativeHost ? "Open the desktop app to search workspace files." : !workspace.root ? "Open a workspace to search its SQL files." : searchQuery.trim().length < 2 ? "Enter at least 2 characters to search." : searching ? "Searching workspace…" : `${searchMatches.length} match${searchMatches.length === 1 ? "" : "es"}${searchTruncated ? " · search limits reached; some files may be omitted" : ""}`}</div><div className="workspace-search-results">{searchMatches.map((match, index) => <button className="workspace-search-result" key={`${match.path}:${match.lineNumber}:${index}`} onClick={() => openWorkspaceSearchMatch(match)}><span><b>{match.relativePath}</b><small>Line {match.lineNumber}</small></span><code>{match.lineText}</code></button>)}{isNativeHost && workspace.root && searchQuery.trim().length >= 2 && !searching && !searchMatches.length && <div className="query-history-empty"><Search size={20} /><b>{searchTruncated ? "No matches in scanned files" : "No matches found"}</b><span>{searchTruncated ? "Some files were skipped because the workspace is large." : "Try a different term or shorter fragment."}</span><button className="button-secondary" onClick={()=>setSearchQuery("")}>Clear search</button></div>}{!isNativeHost && <div className="query-history-empty"><Search size={20} /><b>Workspace search is available in the desktop app</b><span>It searches SQL files in the open workspace.</span></div>}</div><footer className="appearance-footer"><span>{searchMatches.length ? "Select a match to open its file at that line." : "Search runs locally against workspace SQL files."}</span><button className="button-secondary" onClick={() => { setShowSearch(false); setSearchQuery(""); setSearchMatches([]); }}>Close</button></footer></section></ModalBackdrop>}
    {showGettingStarted && <GettingStartedDialog workspace={workspace} startup={resolveSetting(settings,'ui.startupWorkspaceHub').value} onStartup={value=>applySettings(changeSetting(settings,'ui.startupWorkspaceHub',value))} onClose={()=>{persistLocal(localStorage,'fbsdb.onboardingSeen','true');setShowGettingStarted(false)}}/>}
    {showHistory && <QueryHistoryDialog historyLimit={historyLimit} historyFilter={historyFilter} setHistoryFilter={setHistoryFilter} queryHistory={queryHistory} filteredQueryHistory={filteredQueryHistory} setQueryHistory={setQueryHistory} insertHistorySql={insertHistorySql} setShowHistory={setShowHistory}/>}
    {showTnsSources && <TnsSources aliases={tnsAliases} onClose={() => setShowTnsSources(false)} />}
    {editorContext&&<EditorContextMenu context={editorContext} onClose={()=>setEditorContext(null)} onAction={editorContextAction} actions={[...bindMenuActions(editorContext.bind,editorContext.bindType,{readOnly:editorContext.readOnly||!filePath}),{id:'run',label:editorContext.selected?'Run selection':'Run statement',disabled:executing||fetchingPage||activeTabReadonly},{id:'explain',label:'Explain plan',disabled:executing||fetchingPage},{id:'explainExpression',label:'Explain CASE or analytic function…'},{id:'format',label:editorContext.selected?'Format selection':'Format SQL',disabled:editorContext.readOnly},{id:'edit',separator:true},{id:'undo',label:'Undo',disabled:editorContext.readOnly||!editorContext.canUndo},{id:'redo',label:'Redo',disabled:editorContext.readOnly||!editorContext.canRedo},{id:'cut',label:'Cut',disabled:editorContext.readOnly||!editorContext.selected},{id:'copy',label:'Copy',disabled:!editorContext.selected},{id:'paste',label:'Paste',disabled:editorContext.readOnly},{id:'selectAll',label:'Select all'},{id:'comment',label:'Toggle comment',disabled:editorContext.readOnly},{id:'identifierCase',label:'Convert identifier case…',disabled:editorContext.readOnly||!editorContext.selected},{id:'localRename',label:'Rename local variable or parameter…',disabled:editorContext.readOnly},{id:'changeSignature',label:'Change local procedure signature…',disabled:editorContext.readOnly},{id:'extractProcedure',label:'Extract selected PL/SQL assignments…',disabled:editorContext.readOnly||!editorContext.selected},{id:'moveUp',label:'Move SQL item or PL/SQL statement up',disabled:editorContext.readOnly},{id:'moveDown',label:'Move SQL item or PL/SQL statement down',disabled:editorContext.readOnly},{id:'embeddedSql',label:'Edit SQL inside EXECUTE IMMEDIATE…',disabled:editorContext.readOnly},{id:'clipboardHistory',label:'Clipboard history…',disabled:editorContext.readOnly},{id:'editorMacros',label:'Record or replay editor macros…',disabled:editorContext.readOnly},{id:'quickFix',label:'Quick fixes…',disabled:editorContext.readOnly},{id:'deleteReview',label:'Review references before delete…',disabled:!isNativeHost||!workspace.root},{id:'surround',label:'Surround with…',disabled:editorContext.readOnly||!editorContext.selected},{id:'extractCte',label:'Extract query into CTE',disabled:editorContext.readOnly||!editorContext.selected},{id:'docComment',label:'Generate documentation comment',disabled:editorContext.readOnly},{id:'columnCursors',label:'Paste column names as cursors',disabled:editorContext.readOnly},{id:'pasteAs',label:'Paste as…',disabled:editorContext.readOnly},{id:'find',label:'Find'},{id:'replace',label:'Replace',disabled:editorContext.readOnly}]}/>}
    {objectMenu&&<OracleObjectMenu context={objectMenu} favorite={objectFavorites.includes(oracleSchemaKey(objectMenu.item))} onAction={objectContextAction} onClose={()=>setObjectMenu(null)}/>}
    {connectionMenu&&<ConnectionContextMenu context={connectionMenu} organization={connectionOrg} favorites={favorites} activeProfileId={activeConnection.id} usedProfileIds={Object.values(tabSessions).map(session=>session.activeConnection?.id).filter(Boolean)} connectionDisabled={activeTabReadonly||connecting||executing||cancelling} onClose={()=>setConnectionMenu(null)} onAction={connectionContextAction} onPreviewOrganization={previewConnectionOrganization}/>}
    {profileEditor && <ConnectionLibrary onNewSql={profile=>{setProfileEditor(null);newSqlFileNow();if(isNativeHost)beginConnection({...profile,tabId:documents.activeId})}} favorites={favorites} onToggleFavorite={id=>setFavorites(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])} activeProfileId={activeConnection.id} onDisconnect={()=>{setProfileEditor(null);disconnectActiveConnection()}} connectionDisabled={activeTabReadonly||connecting||executing||cancelling} managementError={managementError} profiles={dbConnections} aliases={tnsAliases} organization={connectionOrg} initialContext={profileEditor.libraryContext} initialAction={profileEditor.libraryAction} initialProfile={profileEditor===true||profileEditor.libraryContext?null:profileEditor} usedProfileIds={Object.values(tabSessions).map(s=>s.activeConnection?.id).filter(Boolean)} onClose={()=>setProfileEditor(null)} onConnect={(profile,force=false)=>{setProfileEditor(null);switchConnection(profile,force)}}
      onOrganizationChange={payload=>{const next=changeConnectionOrganization(connectionOrg,payload,dbConnections);setConnectionOrg(next);setDbConnections(current=>organizedProfiles(current,next).map(p=>({...p,group:p.groups[0]||''})))}}
      onSaved={(id,connect,credentials)=>{if(connect){const profile=dbConnectionsRef.current.find(p=>p.id===id);if(profile){setProfileEditor(null);switchConnection({...profile,...(credentials?.password?{credentials}:{})},true)}}}}
      onPreviewSave={(profile,connect)=>{const organization={...connectionOrg,assignments:{...connectionOrg.assignments,[profile.id]:{folderId:profile.folderId||null,groupIds:profile.groupIds||[]}}};setConnectionOrg(organization);const item={...profile,title:profile.name,color:profile.env==='PROD'?'rose':profile.env==='DEV'?'mint':'neutral'};setDbConnections(current=>organizedProfiles([...current.filter(p=>p.id!==profile.id),item],organization));if(connect){setProfileEditor(null);switchConnection(item)}}}
      onDelete={profile=>{setManagementError('');if(isNativeHost)sendNativeCommand('connection.delete',{profileId:profile.id});else{setDbConnections(current=>current.filter(p=>p.id!==profile.id));setConnectionOrg(current=>({...current,assignments:Object.fromEntries(Object.entries(current.assignments).filter(([id])=>id!==profile.id))}))}}}/>}

    {renameResult&&<ModalBackdrop onClose={()=>{setRenameResult(null);setNewResultName('')}}><section className="appearance-modal result-rename-dialog" role="dialog" aria-modal="true" aria-label="Rename result">{managementContent.Name}<footer className="appearance-footer"><button type="button" className="button-secondary" onClick={()=>{setRenameResult(null);setNewResultName('')}}>Cancel</button></footer></section></ModalBackdrop>}
    {keyLookup?.tabId===activeTabId&&<ModalBackdrop onClose={()=>setKeyLookup(null)}><section className="appearance-modal result-lookup-dialog" role="dialog" aria-modal="true" aria-label="Primary key lookup">{managementContent.Lookup}<footer className="appearance-footer"><button type="button" className="button-secondary" onClick={()=>setKeyLookup(null)}>Close</button></footer></section></ModalBackdrop>}
    {Object.entries(tabResults).filter(([,state])=>state.streamState?.busy).map(([tabId,state])=><Feedback key={tabId} id={`export:${tabId}`} scope={tabId} kind="progress" title="Exporting results" actions={[{label:'Cancel export',onClick:()=>sendNativeCommand('result.cancelExport',{tabId})}]}>{state.streamState.message}</Feedback>)}
    {resolveSetting(settings,'ui.connectionNotifications').value&&Object.entries(tabSessions).filter(([,session])=>session.connecting&&session.connectingProfile).map(([tabId,session])=><Feedback key={tabId} scope={tabId} kind="progress" title="Connecting">{`Connecting to ${session.connectingProfile}…`}</Feedback>)}
    {plscopeReport && <ModalBackdrop onClose={() => setPlscopeReport(null)}><section className="appearance-modal plscope-dialog" role="dialog" aria-modal="true" aria-label="PL/Scope references"><header className="appearance-header"><div><h2>PL/Scope references</h2><p>{plscopeReport.target.owner}.{plscopeReport.target.name} · {plscopeReport.settings || 'Collection settings unavailable'}</p></div><button className="icon-button" aria-label="Close PL/Scope references" onClick={() => setPlscopeReport(null)}><X size={17} /></button></header><div className="plscope-reference-list">{plscopeReport.references.length ? plscopeReport.references.map((reference, index) => <button key={index} onClick={async () => { const source = await completionMetadataRef.current.load(plscopeReport.originTabId, { owner: reference.owner, name: reference.objectName, type: reference.objectType.replace(/ BODY$/, ''), body: reference.objectType.endsWith(' BODY') }, null, 'definition'); if (!source) return; setPlscopeReport(null); openOracleDefinition({ ...source, originTabId: plscopeReport.originTabId }, { lineNumber: reference.line, column: reference.column }); }}><b>{reference.owner}.{reference.objectName}</b><span>{reference.name} · {reference.usage}</span><code>{reference.line}:{reference.column}</code></button>) : <div className="output-empty"><b>No collected references</b><span>No PL/Scope identifiers are available for this object. Collection and compilation settings are managed explicitly.</span></div>}</div><footer className="appearance-footer"><span>{plscopeReport.references.length} reference(s){plscopeReport.truncated ? ' · first 2,000 shown' : ''}</span><button className="button-secondary" onClick={() => setPlscopeReport(null)}>Close</button></footer></section></ModalBackdrop>}
    {authProfile && <ConnectionAuthDialog key={`${authProfile.tabId}:${authProfile.id}`} profile={authProfile} connecting={tabSessions[authProfile.tabId]?.connecting || false} error={tabSessions[authProfile.tabId]?.connectionError || ""} onClose={() => setAuthProfile(null)} onConnect={submitConnectionCredentials} />}
    {pendingBindSql && <Suspense fallback={<div role="status">Loading…</div>}><BindParameterDialog prefill={bindPrefillRef.current} onPrefillUsed={() => { bindPrefillRef.current = {}; }} onSaveDefinitions={definitions=>{if(isNativeHost&&workspace.root&&filePath)sendNativeCommand('workspace.binds.save',{path:filePath,definitions:definitions.map(item=>({name:item.name,type:item.type,label:item.label||'',description:item.description||'',required:Boolean(item.required),defaultValue:item.defaultValue||null}))})}} projectVariables={projectOptions(workspace.projectRules).variables} file={filePath} sql={pendingBindSql} onCancel={() => setPendingBindSql(null)} onExecute={(values) => executeStatement(pendingBindSql, values)} /></Suspense>}
    {uncertainCommit && <ModalBackdrop onClose={() => setUncertainCommit(null)}><section className="appearance-modal transaction-guard" role="alertdialog" aria-modal="true" aria-label="Commit not confirmed"><header className="appearance-header"><div><div className="eyebrow">COMMIT NOT CONFIRMED</div><h2>The connection failed while committing</h2><p>Oracle may or may not have saved your changes; this window cannot tell. Nothing was retried and nothing is assumed.</p><p>Reconnect, then use Check what Oracle stored on the grid, or re-run the query that shows the affected rows, before applying anything again.</p>{uncertainCommit.message && <p><small>{uncertainCommit.message}</small></p>}</div></header><footer className="appearance-footer"><button className="button-secondary" onClick={() => setUncertainCommit(null)}>Close</button><button className="button-primary" onClick={() => { setUncertainCommit(null); setShowPicker(true); }}>Reconnect…</button></footer></section></ModalBackdrop>}
    {regexWorkbench && <Suspense fallback={<div role="status">Loading…</div>}><RegexWorkbenchDialog initialPattern={regexWorkbench.initial} onClose={() => setRegexWorkbench(null)} onInsert={call => { const editor = editorRef.current, selection = editor?.getSelection(); if (editor && selection) editor.executeEdits('regex-workbench', [{ range: selection, text: call, forceMoveMarkers: true }]); setRegexWorkbench(null); editor?.focus(); }}/></Suspense>}
    {dateFormatDesigner && <Suspense fallback={<div role="status">Loading…</div>}><DateFormatDialog initialFormat={dateFormatDesigner.initial} onClose={() => setDateFormatDesigner(null)} onInsert={format => { const editor = editorRef.current, selection = editor?.getSelection(); if (editor && selection) editor.executeEdits('date-format-designer', [{ range: selection, text: `'${format.replaceAll("'", "''")}'`, forceMoveMarkers: true }]); setDateFormatDesigner(null); editor?.focus(); }}/></Suspense>}
    <LiveAnnouncer/>
    {shortcutMap && <ShortcutMapDialog shortcuts={resolveSetting(settings,'editor.shortcuts').value} context={shortcutMap.context} onClose={()=>setShortcutMap(null)}/>}
    {draftGuard && <ModalBackdrop onClose={() => setDraftGuard(null)}><section className="appearance-modal transaction-guard" role="alertdialog" aria-modal="true" aria-label="Unapplied grid edits"><header className="appearance-header"><div><div className="eyebrow">UNAPPLIED GRID EDITS</div><h2>{draftGuard.reason === 'close' ? `Close ${draftGuard.name}?` : draftGuard.reason === 'disconnect' ? 'Disconnect?' : `Switch to ${draftGuard.name}?`}</h2><p>{draftGuard.count} local edit{draftGuard.count === 1 ? '' : 's'} have not been sent to Oracle. They exist only in this window and cannot be moved to another connection.</p>{draftGuard.transaction && <p>This session also has uncommitted work. That is separate: this choice neither commits nor rolls it back, and you decide about it next.</p>}</div></header><footer className="appearance-footer"><button className="button-primary" onClick={() => setDraftGuard(null)}>Keep editing</button><button className="transaction-button rollback" onClick={() => { const guard = draftGuard; clearTabDrafts(guard.tabId); window.dispatchEvent(new CustomEvent('fbsdb.draftsCleared', { detail: { tabId: guard.tabId } })); setDraftGuard(null); guard.run(); }}>Discard the edits and continue</button></footer></section></ModalBackdrop>}
    {pendingSwitch && <ModalBackdrop onClose={() => { setPendingSwitch(null); setRunState("Connection switch cancelled."); }}><section className="appearance-modal transaction-guard" role="alertdialog" aria-modal="true" aria-label="Uncommitted changes"><header className="appearance-header"><div><div className="eyebrow">UNCOMMITTED CHANGES</div><h2>{pendingSwitch.disconnect ? "Disconnecting" : "Switching connection"}</h2><p>Commit or roll back the pending transaction before {pendingSwitch.disconnect ? "disconnecting" : `connecting to ${pendingSwitch.name || pendingSwitch.id}`}.</p></div></header><footer className="appearance-footer"><button className="button-secondary" onClick={() => { setPendingSwitch(null); setRunState("Connection switch cancelled."); }}>Cancel</button><div><button className="transaction-button rollback" onClick={() => finishTransaction("rollback")}><X size={13} /> Rollback & {pendingSwitch.disconnect ? "disconnect" : "switch"}</button><button className="button-primary" onClick={() => finishTransaction("commit")}><Check size={13} /> Commit & {pendingSwitch.disconnect ? "disconnect" : "switch"}</button></div></footer></section></ModalBackdrop>}
    {pendingDdl && <FeedbackDialog kind="warning" title="Run DDL statement?" onClose={()=>setPendingDdl(null)} actions={<><button onClick={()=>setPendingDdl(null)}>Cancel</button><button className="danger" onClick={()=>{const request=pendingDdl;setPendingDdl(null);if(documents.activeId!==request.owner||sessionsRef.current[request.owner]?.activeConnection?.id!==request.profileId){setRunState('The execution tab or connection changed. Review the statement and run it again.',request.owner);return;}executeStatement(request.statement,request.parameters,request.miniTool,{ddlConfirmed:true});}}>Run DDL</button></>}><p>Oracle DDL commits automatically and cannot be undone with Rollback. Pending changes must be committed or rolled back first.</p><p>Profile: {pendingDdl.profileId}</p><pre>{pendingDdl.statement}</pre></FeedbackDialog>}
    {showPackageApi&&<PackageApiDialog document={activeEditorTab} rules={workspace.projectRules} onNavigate={offset=>{setShowPackageApi(false);jumpToOffset(offset)}} onClose={()=>setShowPackageApi(false)}/>}
    {showBookmarks&&<SourceBookmarksDialog items={bookmarks.items} error={bookmarks.error} canAdd={!bookmarks.full&&!objectTabActive&&!!activeEditorTab&&!!editorRef.current?.getModel()} position={editorRef.current?.getPosition()} file={fileName} onAdd={bookmarks.add} onOpen={openBookmark} onRemove={bookmarks.remove} onClose={()=>setShowBookmarks(false)}/>}
    {batchClose&&<BatchCloseDialog items={batchClose.items} cleanCount={batchClose.cleanCount} error={batchClose.error} onClose={()=>setBatchClose(null)} onApply={batchClose.run}/>}
    {pendingTabClose && <ModalBackdrop onClose={() => {batchDiscardRef.current.clear();setPendingTabClose(null)}}><section className="appearance-modal transaction-guard" role="dialog" aria-modal="true" aria-label="Close SQL session"><header className="appearance-header"><div><div className="eyebrow">SQL TAB SESSION</div><h2>{pendingTabClose.pending ? "Uncommitted changes" : "Could not close tab"}</h2><p>{pendingTabClose.message || "Resolve this tab’s transaction before closing it."}</p></div></header><footer className="appearance-footer"><button className="button-secondary" onClick={() => {batchDiscardRef.current.clear();setPendingTabClose(null)}}>Cancel</button><div>{pendingTabClose.pending ? ["rollback", "commit"].map(action => <button key={action} disabled={pendingTabClose.resolving} className={action === "commit" ? "button-primary" : "transaction-button rollback"} onClick={() => { const pending = { ...pendingTabClose, resolving: true }; pendingTabCloseRef.current = pending; setPendingTabClose(pending); sendNativeCommand(`transaction.${action}`, { tabId: pending.tabId }); }}>{action === "commit" ? "Commit" : "Rollback"} & close</button>) : <button className="button-primary" onClick={pendingTabClose.retry}>Retry</button>}</div></footer></section></ModalBackdrop>}
    {pendingFileAction && <ModalBackdrop onClose={() => {batchDiscardRef.current.clear();setPendingFileAction(null)}}><section className="appearance-modal transaction-guard" role="alertdialog" aria-modal="true" aria-label="Unsaved SQL"><header className="appearance-header"><div><div className="eyebrow">UNSAVED SQL</div><h2>Save changes to {fileName}?</h2><p>Your edits will be lost if you continue without saving.</p></div></header><footer className="appearance-footer"><button className="button-secondary" onClick={() => {batchDiscardRef.current.clear();setPendingFileAction(null)}}>Cancel</button><div><button className="transaction-button rollback" onClick={() => { const run = pendingFileAction.run; setPendingFileAction(null); run(); }}>Discard changes</button><button className="button-primary" onClick={() => saveSqlFile(() => { setPendingFileAction(null); pendingFileAction.run(); })}><Check size={13} /> Save</button></div></footer></section></ModalBackdrop>}
    {showAppearance && <Suspense fallback={<div role="status">Loading…</div>}><AppearanceSettings initialSearch={settingsFocus?.query||''} initialCategory={settingsFocus?.category||'general'} aliases={tnsAliases} profiles={dbConnections} originTabId={metadataOriginTabId} activeProfileId={completionSession.activeConnection?.id} metadataEpoch={completionMetadataRef.current.session(metadataOriginTabId).epoch} settings={settings} onSettingsChange={applySettings} settingsError={settingsError} workspaceRoot={workspace.root} theme={theme} onThemeChange={setTheme} tokenColors={tokenColors} onTokenColorChange={updateTokenColor} completionSettings={completionSettings} onCompletionSettingsChange={setCompletionSettings} completionError={completionError} queryTimeout={queryTimeout} onQueryTimeoutChange={setQueryTimeout} oracleVocabulary={completionSession.oracleVocabulary} completionMetadataStatus={completionSession.completionMetadataStatus || (completionSession.activeConnection && !["No connection", "Disconnected"].includes(completionSession.activeConnection.id) ? "Oracle metadata is loaded on demand." : "Offline Oracle vocabulary; connect to load object metadata.")} codeStyle={codeStyle} onCodeStyleChange={setCodeStyle} systemLocale={systemLocale} onClose={() => {setShowAppearance(false);setSettingsFocus(null)}} /></Suspense>}
  </main></ExecutionTargetContext.Provider></ToolbarPrefsContext.Provider>;
}

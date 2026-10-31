import { recordStartupMilestone } from './startupPerformance.js';
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
import { FileMenu } from './FileMenu';
import { ViewMenu } from './ViewMenu';
import { DockWorkbench } from './DockWorkbench';
import { defaultDockLayout, normalizeDockLayout } from './dockLayout';
import { remapWorkspacePath, pathKey } from './workspaceTree';
import { assertMiniToolSelect } from './miniTools';
import { draftSnapshot, parseDraftSnapshot } from './draftRecovery';
import { EditorSymbolBreadcrumb } from './EditorSymbolBreadcrumb';
import { IdeCommandPalette } from './IdeCommandPalette';
import { actionableState } from './workbenchUx';
import { ActionableState } from './ActionableState';
import { EditorToolbarOverflow } from './EditorToolbarOverflow';
import { ResultScope } from './ResultScope.jsx';
import { nextColumnSort } from './resultColumnActions';
import { themePresets, applyDocumentTheme, monacoThemeColors, monacoTokenRules, resolveTokenColors } from './themeModel';
import { EditorNavigationHistory } from './editorNavigation';
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
import {detectedRegion,effectiveLanguage,effectiveRegion,translate as t} from './localeProfile';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
const AppearanceSettings = lazy(() => import("./AppearanceSettings.jsx").then(module => ({ default: module.AppearanceSettings })));
const MiniToolsDialog = lazy(() => import("./MiniToolsDialog.jsx").then(module => ({ default: module.MiniToolsDialog })));
const ExplainPlanView = lazy(() => import("./ExplainPlanView.jsx").then(module => ({ default: module.ExplainPlanView })));
const OracleObjectInspector = lazy(() => import("./OracleObjectInspector.jsx").then(module => ({ default: module.OracleObjectInspector })));
const OracleDefinitionView = lazy(() => import("./OracleDefinitionView.jsx").then(module => ({ default: module.OracleDefinitionView })));
const OracleObjectDialog = lazy(() => import("./OracleObjectDialog.jsx").then(module => ({ default: module.OracleObjectDialog })));
const BindParameterDialog = lazy(() => import("./BindParameterDialog.jsx").then(module => ({ default: module.BindParameterDialog })));
const SqlScriptDialog = lazy(() => import("./SqlScriptDialog.jsx").then(module => ({ default: module.SqlScriptDialog })));
const DraftRecoveryDialog = lazy(() => import("./DraftRecoveryDialog.jsx").then(module => ({ default: module.DraftRecoveryDialog })));
const ConnectionDiagnosticsDialog = lazy(() => import("./ConnectionDiagnosticsDialog.jsx").then(module => ({ default: module.ConnectionDiagnosticsDialog })));
const WorkspaceDevelopmentDialog = lazy(() => import("./WorkspaceDevelopmentDialog.jsx").then(module => ({ default: module.WorkspaceDevelopmentDialog })));
const WorkspaceManager = lazy(() => import("./WorkspaceManager.jsx").then(module => ({ default: module.WorkspaceManager })));
const ResultValueDialog = lazy(() => import("./ResultDialogs.jsx").then(module => ({ default: module.ResultValueDialog })));
const Editor = lazy(() => import("@monaco-editor/react"));
import { announceUiReady, isNativeHost, sendNativeCommand, subscribeNativeMessages, setNativeTabId } from "./nativeBridge";
import { TnsSources, useDialogFocus } from "./ConnectionManager";
import { compilationProblemItems, offsetAtOraclePosition } from "./plsqlDiagnostics";
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
  Shapes, ShieldCheck, Star, Table2, Terminal, Timer, Trash2, Undo2, Workflow, X, Zap,
} from "lucide-react";

const EMPTY_SCHEMA_OBJECTS = [];
const mockConnections = [
  { id: "FINANCE_DEV", title: "Finance · Development", host: "ora-dev-02.acme.net", port: "1521", service: "fin_dev", env: "DEV", color: "mint", group: "Development", favorite: true, recent: true, source: "C:\\oracle\\network\\admin\\tnsnames.ora" },
  { id: "FINANCE_TEST", title: "Finance · QA", host: "ora-qa-01.acme.net", port: "1521", service: "fin_qa", env: "TEST", color: "blue", group: "Testing", favorite: true, recent: true, source: "C:\\oracle\\network\\admin\\tnsnames.ora" },
  { id: "FINANCE_PROD", title: "Finance · Production", host: "ora-prd-scan.acme.net", port: "1521", service: "fin_prod", env: "PROD", color: "rose", group: "Production", favorite: false, recent: false, source: "C:\\oracle\\network\\admin\\tnsnames.ora" },
];

const initialSql = `-- Monthly invoice review\n\nSELECT\n    i.invoice_id,\n    i.invoice_date,\n    c.customer_name,\n    i.total_amount,\n    i.status\nFROM finance.invoices i\nINNER JOIN finance.customers c\n    ON c.customer_id = i.customer_id\nWHERE i.invoice_date >= :from_date\n  AND i.invoice_date <  :to_date\n  AND i.status = :status\nORDER BY i.invoice_date DESC;`;

const sqlSnippets = [
  { trigger: "sel", label: "SELECT query", detail: "SELECT columns with a FROM and WHERE clause", text: "SELECT ${1:column_list}\nFROM ${2:table_name}\nWHERE ${3:condition};" },
  { trigger: "seltop", label: "SELECT · first rows", detail: "Oracle FETCH FIRST row limit", text: "SELECT *\nFROM ${1:table_name}\nFETCH FIRST ${2:100} ROWS ONLY;" },
  { trigger: "ins", label: "INSERT row", detail: "Parameterized INSERT statement", text: "INSERT INTO ${1:table_name} (${2:column})\nVALUES (:${3:value});" },
  { trigger: "upd", label: "UPDATE row", detail: "Parameterized UPDATE with a WHERE clause", text: "UPDATE ${1:table_name}\nSET ${2:column} = :${3:value}\nWHERE ${4:id_column} = :${5:id};" },
  { trigger: "del", label: "DELETE row", detail: "Parameterized DELETE with a WHERE clause", text: "DELETE FROM ${1:table_name}\nWHERE ${2:id_column} = :${3:id};" },
  { trigger: "cte", label: "Common table expression", detail: "WITH query and outer SELECT", text: "WITH ${1:query_name} AS (\n    SELECT ${2:column}\n    FROM ${3:table_name}\n)\nSELECT *\nFROM ${1:query_name};" },
  { trigger: "with", label: "WITH query", detail: "Common table expression with an outer SELECT", text: "WITH ${1:query_name} AS (\n    SELECT ${2:column}\n    FROM ${3:table_name}\n)\nSELECT *\nFROM ${1:query_name};" },
  { trigger: "wim", label: "WITH · multiple tables", detail: "Two table CTEs joined in an outer SELECT", text: "WITH ${1:first_cte} AS (\n    SELECT ${2:column_list}\n    FROM ${3:first_table}\n),\n${4:second_cte} AS (\n    SELECT ${5:column_list}\n    FROM ${6:second_table}\n)\nSELECT ${7:column_list}\nFROM ${1:first_cte} a\nINNER JOIN ${4:second_cte} b\n    ON ${8:a.key_column = b.key_column};" },
  { trigger: "daterange", label: "Date range predicate", detail: "Half-open Oracle date range with bind variables", text: "${1:date_column} >= :${2:from_date}\nAND ${1:date_column} < :${3:to_date}" },
  { trigger: "plblock", label: "PL/SQL block", detail: "Anonymous PL/SQL declaration, body and exception handler", text: "DECLARE\n    ${1:variable_name} ${2:NUMBER};\nBEGIN\n    ${3:NULL;}\nEXCEPTION\n    WHEN OTHERS THEN\n        RAISE;\nEND;\n/" },
  { trigger: "plif", label: "PL/SQL IF", detail: "Conditional PL/SQL block", text: "IF ${1:condition} THEN\n    ${2:NULL;}\nEND IF;" },
  { trigger: "plfor", label: "PL/SQL FOR loop", detail: "Numeric PL/SQL FOR loop", text: "FOR ${1:i} IN ${2:1} .. ${3:10} LOOP\n    ${4:NULL;}\nEND LOOP;" },
  { trigger: "plcase", label: "CASE expression", detail: "SQL or PL/SQL searched CASE expression", text: "CASE\n    WHEN ${1:condition} THEN ${2:value}\n    ELSE ${3:fallback}\nEND" },
];

function loadCustomSqlSnippets() {
  try {
    const saved = JSON.parse(localStorage.getItem("fbsdb.customSqlSnippets") || "[]");
    if (!Array.isArray(saved)) return [];
    const builtInTriggers = new Set(sqlSnippets.map((snippet) => snippet.trigger));
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
function ResizeHandle({ axis, value, onChange, min, max, label, panelSelector }) {
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
  return <div className={`panel-resizer ${axis === "x" ? "resize-sidebar" : "resize-results"}`} role="separator" tabIndex={0} aria-label={label} aria-orientation={axis === "x" ? "vertical" : "horizontal"} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      const panel = event.currentTarget.parentElement.querySelector(panelSelector), shell = event.currentTarget.closest(".desktop-shell");
      const property = axis === "x" ? "--sidebar-width" : "--results-height";
      const current = axis === "x" ? panel.getBoundingClientRect().width : value;
      drag.current = { shell, property, original: shell.style.getPropertyValue(property), origin: axis === "x" ? event.clientX : event.clientY, value: current, next: current, scale: axis === "x" ? 1 : event.currentTarget.parentElement.getBoundingClientRect().height / 100 };
      shell.setAttribute("data-resizing", axis);
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={update} onPointerUp={event => { update(event); finish(true); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => finish(false)} onLostPointerCapture={() => finish(false)}
    onKeyDown={event => {
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

function OracleObjectRow({ item, activeKey, onToggle, onContext, contextKey, query = "", searchMatch = "" }) {
  const key = oracleSchemaKey(item), isSelected = activeKey === key;
  return <div className="oracle-object-node" key={key}>
    <div className="oracle-object-line">
    <button className={`oracle-object-row ${isSelected ? "active" : ""}`} data-object-key={key} data-context-selected={contextKey===key||undefined} onContextMenu={event=>onContext?.(event,item)} onKeyDown={event=>{if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){event.preventDefault();onContext?.(event,item)}}} title="Double-click to open object details" onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggle(item); }}>
      <OracleObjectIcon type={item.type} size={14} /><span className="oracle-object-name">{item.name}</span>{searchMatch && <small className="oracle-search-match">{searchMatch}</small>}{item.type === "SYNONYM" && <small className="oracle-object-target">→ {item.targetOwner || "PUBLIC"}.{item.targetName}{item.dbLink ? `@${item.dbLink}` : ""}</small>}
    </button>
    </div>
  </div>;
}

function OracleObjectCategory({ owner, type, label, items, currentSchema, query, activeKey, onToggle, onContext, contextKey, searchKinds }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (query) setOpen(true); }, [query]);
  return <details className="oracle-category-node" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><ChevronRight size={12} className="schema-chevron" /><OracleObjectIcon type={type} /><span>{label}</span><span className="object-count">{items.length}</span></summary>
    {open && (items.length ? <VirtualOracleObjects items={items} renderItem={item => <OracleObjectRow key={oracleSchemaKey(item)} item={item} activeKey={activeKey} onToggle={onToggle} onContext={onContext} contextKey={contextKey} query={query} searchMatch={searchKinds.get(oracleSchemaKey(item))}/>} /> : <div className="oracle-empty-category">No {label.toLowerCase()} visible</div>)}
  </details>;
}

function OracleSchemaNode({ owner, categories, objectCount, currentSchema, query, activeKey, onToggle, onContext, contextKey, searchKinds }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (query) setOpen(true); }, [query]);
  const kinds = oracleObjectKinds.filter(([type]) => !query || categories.has(type));
  return <details className="oracle-schema-node" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><ChevronRight size={13} className="schema-chevron" /><Database size={14} className="oracle-schema-icon" /><span>{owner}</span><span className="object-count">{objectCount}</span></summary>
    {open && kinds.map(([type, label]) => {
      const items = (categories.get(type) || []).slice().sort((a, b) => a.name.localeCompare(b.name));
      return <OracleObjectCategory key={`${owner}-${type}`} owner={owner} type={type} label={label} items={items} currentSchema={currentSchema} query={query} activeKey={activeKey} onToggle={onToggle} onContext={onContext} contextKey={contextKey} searchKinds={searchKinds}/>;
    })}
  </details>;
}

function OracleObjectTree({ items, activeKey, onToggle, onContext, contextKey, emptyLabel, currentSchema, query, searchKinds = new Map() }) {
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
    return <OracleSchemaNode key={owner} owner={owner} categories={categories} objectCount={objectCount} currentSchema={currentSchema} query={query} activeKey={activeKey} onToggle={onToggle} onContext={onContext} contextKey={contextKey} searchKinds={searchKinds}/>;
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

function SqlResultsView({ result, editorSql, runState, executing, cancelling, outcome,startedAt,onCancel, filter = "", pageSize = 1000, region,language='en',onFetchMore, fetching = false, pageError = "", initialView = {}, onViewStateChange, onResultRendered,onSql, onRelated, onStreamExport, streamState, onCancelExport, onServerFilter, onClearServerFilter, onConnect, connected, onEdit, onExportColumns, onLookup, onClearFilter, onChildren, onSourceDefinition,sourceDefinition,onCloseSourceDefinition, onUpdateDraft,onGenerateSql,onMetadata,onPin,onExplain,memoryItems=[],onReleaseResult,onExportInsert }) {
  const [page, setPage] = useState(initialView.page || 0), [requestedPage, setRequestedPage] = useState(null);
  const [sortColumn, setSortColumn] = useState(initialView.sortColumn ?? -1);
  const [sortDirection, setSortDirection] = useState(initialView.sortDirection || "asc");
  const [rowOrder, setRowOrder] = useState(initialView.rowOrder || []);
  const [options, setOptions] = useState(initialView.options || {}), [hasSelection,setHasSelection]=useState(false),[selectedColumn,setSelectedColumn]=useState(null),[layouts,setLayouts]=useState(initialView.layouts||{}), [gridCommand, setGridCommand] = useState(null), [loadingAll, setLoadingAll] = useState(false),[resetGeneration,setResetGeneration]=useState(0),[pivotPanelOpen,setPivotPanelOpen]=useState(false);
  useEffect(() => { if (!pivotPanelOpen) return; const closeOnEscape = event => { if (event.key !== 'Escape' || document.querySelector('.result-hover-popover-anchor, .modal-backdrop')) return; event.preventDefault(); event.stopPropagation(); setPivotPanelOpen(false); document.querySelector('.results-toolbar button[aria-label="Pivot options"]')?.focus(); }; document.addEventListener('keydown', closeOnEscape, true); return () => document.removeEventListener('keydown', closeOnEscape, true); }, [pivotPanelOpen]);
  const openTools=(section='Overview')=>{if(section==='Commands'){window.dispatchEvent(new Event('fbsdb.result.openCommands'));return;}window.dispatchEvent(new CustomEvent('fbsdb.result.openPopover',{detail:{id:section}}));};
  const handleSelectionChange=useCallback((hasSelectedCells,columnIndex)=>{setHasSelection(hasSelectedCells);setSelectedColumn(hasSelectedCells?columnIndex:null)},[]);
  const command = action => { if(action.type==='cancelExport')onCancelExport?.();else if(action.type==='goTo'){ const index=action.kind==='column'?-1:visibleRows.findIndex(item=>item.index+1===Number(action.target)); if(index>=0)setPage(Math.floor(index/pageSize)); setGridCommand({...action,seq:Date.now()}); }else setGridCommand({...action,seq:Date.now()}); };
  const resetResultView=()=>{setOptions(structuredClone(result?.defaultOptions||{}));setSortColumn(-1);setSortDirection("asc");setRowOrder([]);setPage(0);setRequestedPage(null);setLayouts({});onClearFilter?.();setResetGeneration(value=>value+1)};
  const handledResetGeneration=useRef(0);
  useEffect(()=>{if(resetGeneration>handledResetGeneration.current){handledResetGeneration.current=resetGeneration;command({type:"resetView"})}},[resetGeneration]);
  useEffect(()=>{if(loadingAll&&!fetching){if(result?.hasMore&&!pageError)onFetchMore?.();else setLoadingAll(false)}},[loadingAll,fetching,result?.rows?.length,result?.hasMore,pageError]);
  const [previewCell, setPreviewCell] = useState(null);
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
  const toolbar=<ResultToolbar initialDefaults={result?.defaultOptions||{}} pivotPanelOpen={pivotPanelOpen} onTogglePivotPanel={()=>setPivotPanelOpen(open=>!open)} viewKind={viewMode} columns={viewColumns} sourceColumns={columns} loadedRows={display.rawRows} columnLayout={columnLayout} sortColumn={display.sortColumn} selectedColumn={selectedColumn} memoryItems={memoryItems} onReleaseResult={onReleaseResult} onCommand={command} onClearSort={()=>{setViewSort(-1,'asc');if(viewMode==='source')setRowOrder([])}} onOptionsChange={changeViewOptions} onLayoutChange={layout=>command({type:'layoutApply',layout})} onExport={(format,indices,overrideOptions)=>onExportColumns?.(format,indices,overrideOptions,exportView)} onExportInsert={viewMode==='source'?onExportInsert:undefined} onGenerateSql={onGenerateSql} onMetadata={onMetadata} onLookup={onLookup} onFetchMore={onFetchMore} onLoadAll={()=>setLoadingAll(true)} onStopLoad={()=>setLoadingAll(false)} loadingAll={loadingAll} onStreamExport={viewMode==='source'?onStreamExport:undefined} streamState={streamState} onServerFilter={viewMode==='source'?onServerFilter:undefined} hasData={Boolean(result?.columns?.length&&!result?.released&&!executing&&!outcome)} hasExecution={Boolean(result?.executedSql)} hasSelection={hasSelection} hasMore={result?.hasMore} busy={executing||fetching} options={viewOptions} onAction={action=>{
    if(action==='find')command({type:'find'});else if(action==='copy')command({type:'copyTsv'});else if(action==='inspect')command({type:'inspect'});else if(action==='details')command({type:'details'});else if(action==='execution')command({type:'execution'});else if(action==='marks')command({type:'marks'});else if(action==='pin')onPin?.();else if(action==='explain')onExplain?.();else if(action==='clear')resetResultView();
  }}/>;
  let body;
  if (executing) body=<ResultRunning startedAt={startedAt} cancelling={cancelling} onCancel={onCancel}/>;
  else if (outcome) body=<ResultFailure outcome={outcome} onEdit={outcome.kind==='cancelled'?undefined:onEdit}/>;
  else if (!result) body=<ResultIdle/>;
  else if (result.released) body=<ResultNotice title="Result data released" detail="Run the SELECT again to load records."/>;
  else if (!result.columns?.length) body=<ResultNotice kind="success" title="Statement completed" metric={result.rowsAffected>=0&&result.rowsAffected!=null?`${result.rowsAffected} rows affected`:undefined} detail={`${result.transactionPending?'Pending transaction · commit or rollback when ready. ':''}${result.elapsedMs??0} ms`}/>;
  else if (!rows.length&&!result.hasMore) body=<ResultNotice kind="empty" title="No rows returned" detail="The query completed successfully." metric={`0 rows · ${result.elapsedMs??0} ms`}/>;
  else if (!visibleRows.length&&(filter.trim()||viewOptions.filters?.length||viewOptions.markedOnly||viewOptions.duplicatesOnly)&&!materialized.error&&!display.error) body=<ResultNotice kind="empty" title="No rows match this view" detail={`${rows.length} loaded rows. Local filters hide all rows.`} onClear={()=>{changeViewOptions({...viewOptions,filters:[],markedOnly:false,duplicatesOnly:false});onClearFilter?.()}}/>;
  else body=<>{(materialized.error||display.error)&&<Feedback title="Result view">{materialized.error||display.error}</Feedback>}<div className="result-presentation-layout"><ResultsPresentation language={language} pivotPanelOpen={pivotPanelOpen} onClosePivotPanel={()=>setPivotPanelOpen(false)} pivotPanel={<PivotOptionsPanel columns={columns} options={viewOptions} onChange={changeViewOptions} onClose={()=>setPivotPanelOpen(false)}/>} viewKind={viewMode} sourceRowCount={rows.length} onSourceDefinition={onSourceDefinition} sourceDefinition={sourceDefinition} onCloseSourceDefinition={onCloseSourceDefinition} executionDetails={result} onUpdateDraft={onUpdateDraft} rows={pageRows} allRows={visibleRows} onChildren={onChildren} columns={viewColumns} sortColumn={display.sortColumn} sortDirection={display.sortDirection} onSort={toggleSort} onReorder={viewMode==='source'?reorderRow:undefined} options={{...viewOptions,cursorUnavailable:result.cursorUnavailable,truncated:result.truncated}} onOptionsChange={changeViewOptions} onSelectionChange={handleSelectionChange} onLayoutChange={handleLayoutChange} onTools={openTools} command={gridCommand} onSql={onSql} onRelated={onRelated} onInspect={setPreviewCell} />{pivotPanelOpen&&viewOptions.transpose&&<TransposePivotInspector columns={columns} options={viewOptions} onChange={changeViewOptions} onClose={()=>setPivotPanelOpen(false)}/>}</div><div className="result-footer"><div><span className="success-state"><Check size={12} /> {firstVisible}–{lastVisible} {t('displayed',language)}</span><span className="foot-separator">·</span><span>{rows.length} {t(result.hasMore ? 'loaded · more available' : result.cursorUnavailable ? 'retained rows' : 'loaded rows',language)}{filter.trim() || viewOptions.filters?.length || viewOptions.markedOnly || viewOptions.duplicatesOnly ? ` · ${visibleRows.length} ${t('match',language)}` : ""}</span></div><div className="result-page-controls">{result.executedAt && <span className="result-context" title={result.executedSql}>{result.executedProfile} · {new Date(result.executedAt).toLocaleTimeString(region||undefined)} · {result.editorSnapshot !== editorSql ? (language==='tr'?'SQL çalıştırmadan sonra değişti':'SQL changed since execution') : (language==='tr'?'Son çalıştırma':'Last execution')}</span>}<span role="status">{fetching ? t("Loading page…",language) : pageError || `${t('Database',language)} ${result.elapsedMs} ms`}</span>{result.clientTiming?.totalMs!=null&&<span className="result-client-timing" title={language==='tr'?'Sorgu isteğinden son çizime kadar geçen süre':'From query request until the result finished rendering'}>{t('End-to-end',language)} {Math.round(result.clientTiming.totalMs)} ms</span>}{pageError && result.hasMore && <button className="button-secondary" onClick={onFetchMore}>{t('Retry',language)}</button>}{(pageCount > 1 || result.hasMore) && <><button className="pager-button" aria-label={t('Previous result page',language)} title={t('Previous page',language)} disabled={safePage === 0 || fetching} onClick={() => setPage(safePage - 1)}><ChevronRight size={12} className="flip" /></button><span className="result-page-number">{safePage + 1} / {pageCount}{result.hasMore ? "+" : ""}</span><button className="pager-button" aria-label={t('Next result page',language)} title={t('Next page',language)} disabled={fetching || (safePage >= pageCount - 1 && !result.hasMore)} onClick={() => { const next = safePage + 1; if (next < pageCount) setPage(next); else { setRequestedPage(next); onFetchMore?.(); } }}><ChevronRight size={12} /></button></>}</div></div></>;
  return <>{toolbar}{fetching&&<ResultRunning compact fetching startedAt={startedAt} cancelling={cancelling} onCancel={onCancel}/ >}{pageError&&<Feedback title="Rows could not be loaded">{pageError}</Feedback>}{Boolean(result?.columns?.length)&&<ResultScope columns={viewColumns} options={viewOptions} filter={filter} sortColumn={display.sortColumn} sortDirection={display.sortDirection} serverFilter={result.serverFilter} hasMore={result.hasMore} busy={executing||fetching} onOptionsChange={changeViewOptions} onClearSearch={onClearFilter} onClearSort={()=>setViewSort(-1,'asc')} onClearServerFilter={onClearServerFilter}/>}<div className="result-view-content">{body}</div><ResultRenderMeasurement result={result} onMeasured={onResultRendered}/>{previewCell&&<Suspense fallback={<div role="status">Loading…</div>}><ResultValueDialog cell={previewCell} onClose={()=>setPreviewCell(null)}/></Suspense>}</>;
}
function getBindNames(sql) {
  return getOracleBindNames(sql);
}

export function App() {
  const [monaco, setMonaco] = useState(null);
  const [settings,setSettings]=useState(()=>loadSettings(localStorage)),[settingsError,setSettingsError]=useFeedbackState('',{title:'Settings',scope:null});
  const settingsRef=useRef(settings);settingsRef.current=settings;
  useEffect(()=>{try{saveSettings(localStorage,settings);setSettingsError('')}catch{setSettingsError('Settings could not be saved on this device.')}},[settings]);
  const [showOpenWorkspace,setShowOpenWorkspace]=useState(false),[showWorksets,setShowWorksets]=useState(false),[showWorkspaceManager,setShowWorkspaceManager]=useState(false),[workspaceSearchScope,setWorkspaceSearchScope]=useState(null),[workspaceReplaceScope,setWorkspaceReplaceScope]=useState(null);
  const [workspaceDevMode,setWorkspaceDevMode]=useState(null),[workspaceDev,setWorkspaceDev]=useState({});
  const workspaceDevRequestsRef=useRef(new Map());
  const [connectionDiagnostics,setConnectionDiagnostics]=useState(null);
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
  useEffect(()=>{try{localStorage.setItem('fbsdb.queryTimeout',String(queryTimeout))}catch{}},[queryTimeout]);
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

  const [paletteMode,setPaletteMode]=useState(null),[documentOutline,setDocumentOutline]=useState([]);
  const navigationHistoryRef=useRef(new EditorNavigationHistory()),navigatingRef=useRef(false);
  const [focusMode, setFocusMode] = useState(false);
  useEffect(() => { const open = () => setShowTnsSources(true); window.addEventListener("fbsdb.openTnsSources", open); return () => window.removeEventListener("fbsdb.openTnsSources", open); }, []);
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
        .slice(0,resolveSetting(settings,'privacy.historyLimit').value).map((entry) => entry.status === "Running" ? { ...entry, status: "Interrupted", detail: "App closed before completion" } : entry);
    } catch { return []; }
  });
  const [searchQuery, setSearchQuery] = useState(""), [historyFilter, setHistoryFilter] = useState(""), [searchMatches, setSearchMatches] = useState([]), [searching, setSearching] = useState(false), [searchTruncated, setSearchTruncated] = useState(false);
  const [favorites, setFavorites] = useState(() => { try { return JSON.parse(localStorage.getItem("fbsdb.favorites") || (isNativeHost ? "[]" : "null")) ?? mockConnections.filter((item) => item.favorite).map((item) => item.id); } catch { return isNativeHost ? [] : mockConnections.filter((item) => item.favorite).map((item) => item.id); } });
  const [recentProfiles, setRecentProfiles] = useState(() => { try { return JSON.parse(localStorage.getItem("fbsdb.recent") || "[]"); } catch { return []; } });
  const [connectionOrg,setConnectionOrg]=useState(()=>{if(isNativeHost)return emptyConnectionOrganization();try{return connectionOrganization(mockConnections,JSON.parse(localStorage.getItem("fbsdb.connectionOrganization")||"null"))}catch{return connectionOrganization(mockConnections)}});
  const [explorerQuery, setExplorerQuery] = useState(""), [explorerTab, setExplorerTab] = useState("All"), [groupFilter, setGroupFilter] = useState("All groups"), [schemaQuery, setSchemaQuery] = useState(""), [schemaOwnerFilter, setSchemaOwnerFilter] = useState("All"), [objectScope, setObjectScope] = useState("All"), [objectFavorites, setObjectFavorites] = useState(() => { try { return JSON.parse(localStorage.getItem("fbsdb.objectFavorites") || "[]"); } catch { return []; } }), [recentObjects, setRecentObjects] = useState(() => { try { return JSON.parse(localStorage.getItem("fbsdb.recentObjects") || "[]"); } catch { return []; } }), [activeObject, setActiveObject] = useState("");
  const [resultSearchOpen, setResultSearchOpen] = useState(false);

  function setMaxRows(value){updateTabSession("pageSizePreference",value);}
  const { documents, tabs, activeTabId, sql, fileName, filePath, fileDirty, fileConnectionProfileId } = useDocumentSessions(
    () => [{ id: "tab-1", name: isNativeHost ? "Untitled.sql" : "monthly-invoices.sql", path: null, content: isNativeHost ? "" : initialSql, dirty: false }]);
  const setTabs = documents.setTabs;
  const setFileDirty = dirty => documents.patch(documents.activeId, { dirty });
  useEffect(() => { setActiveObject(''); setObjectTabActive(false); if(schemaRequestRef.current){sendNativeCommand('schema.cancel',{requestId:schemaRequestRef.current});schemaRequestRef.current=null;} }, [activeTabId]);
  const [pendingFileAction, setPendingFileAction] = useState(null);
  const [pendingTabClose, setPendingTabClose] = useState(null);
  const [editorContext,setEditorContext]=useState(null);
  const [batchClose,setBatchClose]=useState(null);const batchDiscardRef=useRef(new Set());
  const pendingTabCloseRef = useRef(null); pendingTabCloseRef.current = pendingTabClose;
  const tabCloseActionsRef = useRef(new Map());
  const [pendingBindSql, setPendingBindSql] = useState(null), [copiedResults, setCopiedResults] = useState(false);
  const [tabSessions, setTabSessions] = useState({});
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
  const [workspace, setWorkspace] = useState({ root: null, name: "Open workspace", files: [], entries: [], recent: [] });
  const [completionSettings, setCompletionSettings] = useState(()=>resolveSetting(settings,'editor.completion').value);
  const learningEpochRef = useRef(0), suggestionLearningRef = useRef(null), lastSuggestionAcceptanceRef = useRef(null);
  if (!suggestionLearningRef.current) suggestionLearningRef.current = new SuggestionLearning(localStorage);
  const suggestionWorkspaceRef = useRef(workspace.root); suggestionWorkspaceRef.current = workspace.root;
  const suggestionScope = () => learningScope(suggestionWorkspaceRef.current, activeConnectionRef.current?.id);
  const publishLearning = () => completionClientRef.current?.worker.postMessage({ type: 'learning', entries: completionSettingsRef.current.learning ? suggestionLearningRef.current.snapshot(suggestionScope()) : [] });
  function learnSqlUsage(source) {
    if (!completionSettingsRef.current.learning || !completionClientRef.current) return;
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
  const activeEditorTab = tabs.find(tab => tab.id === activeTabId);
  const activeTabReadonly = !!activeEditorTab?.readOnly;
  const metadataOriginTabId = activeEditorTab?.metadataOriginTabId || activeTabId;
  const completionSession = tabSessions[metadataOriginTabId] || {};
  useEffect(()=>{setObjectMenu(null)},[activeTabId,metadataOriginTabId,completionSession.activeConnection?.id,completionSession.connecting,completionMetadataRef.current.session(metadataOriginTabId).epoch]);
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
  useEffect(()=>{const limit=resolveSetting(settings,'privacy.historyLimit').value;setQueryHistory(current=>current.length>limit?current.slice(0,limit):current)},[settings.user['privacy.historyLimit']]);
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
    setSettings(next);setTheme(resolveSetting(next,'ui.theme').value);setQueryTimeout(resolveSetting(next,'editor.queryTimeout').value);setCompletionSettings(resolveSetting(next,'editor.completion').value);
    setCodeStyle(Object.fromEntries(['fontSize','tabSize','insertSpaces'].map(field=>[field,resolveSetting(next,'editor.'+field).value])));
    const colors=resolveSetting(next,'ui.tokenColors').value;setAllTokenColors(resolveTokenColors(colors));
  }
  const tokenColors = allTokenColors[theme] || defaultTokenColors[theme], themeConfig = themePresets[theme];
  const allSqlSnippets = useMemo(() => [...sqlSnippets, ...customSqlSnippets], [customSqlSnippets]);
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
    if (!isNativeHost || !schemaReadyRef.current || (sessionsRef.current[documents.activeId]?.executing||sessionsRef.current[documents.activeId]?.scriptRun?.running)) return;
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

  useEffect(() => {
    const unsubscribe = subscribeNativeMessages((message) => {
      const owner = message?.tabId || operations.owners.get(message?.requestId) || documents.activeId;
      const operation=operations.running.get(owner);
      if((['sql.result','sql.timeout'].includes(message?.type)||message?.type==='host.error'&&operations.history.has(message.requestId))&&operation&&(operation.requestId!==message.requestId||operation.status!=='running'))return;
      replyOwnerRef.current = owner;
      try {
      if(typeof message?.autoCommit==='boolean')updateTabSession('autoCommit',message.autoCommit,owner);
      if(message?.type==='transaction.autoCommit'){updateTabSession('autoCommitPending',false,owner);return;}
      if(['workspace.git','workspace.gitDiff','workspace.replacePreview','workspace.replaceApply'].includes(message?.type)) {
        if(workspaceDevRequestsRef.current.get(message.type)!==message.requestId)return;
        workspaceDevRequestsRef.current.delete(message.type);
        setWorkspaceDev(current=>({...current,busy:false,error:message.error||'',...(message.state?{git:message.state}:{}),...(message.diff?{diff:message.diff}:{}),...(message.preview?{preview:message.preview,applied:null}:{}),...(message.result?{applied:message.result,preview:null}:{} )}));
        if(message.type==='workspace.replaceApply'&&message.result){
          const changed=new Map(message.result.applied.map(file=>[file.path.toLowerCase(),file.content])),versions=new Map(message.result.applied.map(file=>[file.path.toLowerCase(),file.diskVersion]));
          setTabs(current=>current.map(tab=>{const dirty=tab.dirty,content=tab.path?changed.get(tab.path.toLowerCase()):undefined;return !dirty&&content!==undefined?{...tab,content,diskVersion:versions.get(tab.path.toLowerCase())??tab.diskVersion,externalChange:null}:tab}));
          refreshWorkspaceGit();
        }
        return;
      }
      if(message?.type==='ui.theme'){if(message.error)setSettingsError(message.error);return;}
      if(message?.type==='connection.managed'&&message.diagnostics)setConnectionDiagnostics(message.diagnostics);
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
        if(message.type==='script.completed'){notifyFeedback({id:`script:${owner}`,kind:message.failed?'error':message.cancelled?'warning':'success',title:message.cancelled?'Script cancelled':'Script completed',message:`${message.completed||0} completed · ${message.failed||0} failed`+(run.steps.filter(s=>s?.error).map(s=>'\n'+s.error).join('')),scope:owner});Object.assign(run,message,{running:false});setExecuting(false,owner);setCancelling(false,owner);setTransactionPending(Boolean(message.transactionPending),owner);}
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
        else if ((message.type === "schema.table" || message.type === "schema.object") && message.item) setSchemaObjects(items => (items || []).map(item => oracleSchemaKey(item) === oracleSchemaKey(message.item) ? message.item : item));
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
        documents.open({ id, name: message.fileName ?? "query.sql", path, content: message.content ?? "", dirty: false, connectionProfileId: message.profileId ?? null, diskVersion: message.diskVersion ?? null });
        setNativeTabId(id); sendNativeCommand("file.activate", { path, tabId: id });
        const searchPosition = pendingSearchPositionRef.current;
        if (searchPosition && path?.toLowerCase() === searchPosition.path.toLowerCase()) { pendingSearchPositionRef.current = null; requestAnimationFrame(() => { editorRef.current?.setPosition({ lineNumber: searchPosition.lineNumber, column: 1 }); editorRef.current?.revealLineInCenter(searchPosition.lineNumber); editorRef.current?.focus(); }); }
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
        setWorkspace({ root: message.root ?? null, name: message.name ?? "No workspace", files: message.files ?? [], entries: message.entries ?? [], recent: message.recent ?? [], catalog:message.catalog??[],error:message.error??null });
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
        setActiveConnection((current) => {
          if (["No connection", "Disconnected"].includes(current.id)) return { id: "No connection", title: profiles.length ? "No active session" : "No TNS aliases found", host: profiles.length ? "" : "Add a tnsnames.ora file", port: "", service: "", env: "—", color: "mint" };
          return profiles.find((profile) => profile.id === current.id) ?? current;
        });
      } else if (message?.type === "connection.managed") {
        if (message.requestId === authTestRequestRef.current) {
          authTestRequestRef.current = null; setConnecting(false);
          setConnectionError(message.success ? "Test successful. Active session unchanged." : message.message);
        } else if (message.operation === "connection.delete") {
          if (!message.success) setManagementError(message.message);
          else { setFavorites(current => current.filter(id => id !== message.profileId)); setRecentProfiles(current => current.filter(id => id !== message.profileId)); }
        }
      } else if (message?.type === "connection.connected") {
        completionMetadataRef.current.reset(owner);
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
        updateTabResult('streamState',{busy:message.type==='result.exportProgress',message:message.message||`${message.rowsWritten||0} rows written`},owner);
        const exporting=message.type==='result.exportProgress';
        notifyFeedback({id:`export:${owner}`,kind:exporting?'progress':message.cancelled?'info':message.success===false?'error':'success',title:exporting?'Exporting results':message.cancelled?'Export cancelled':message.success===false?'Export failed':'Export completed',message:message.message||`${message.rowsWritten||0} rows written`,scope:owner,actions:exporting?[{label:'Cancel export',onClick:()=>sendNativeCommand('result.cancelExport',{tabId:owner})}]:[]});
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
        finishHistoryEntry("Succeeded", message.rowsAffected == null ? `${message.returnedRows ?? 0} rows · ${message.elapsedMs ?? 0} ms` : `${message.rowsAffected} rows affected · ${message.elapsedMs ?? 0} ms`);
        if (/^\s*(?:CREATE|ALTER|DROP|RENAME|COMMENT|GRANT|REVOKE)\b/i.test(operations.metadata.get(owner)?.executedSql || "")) { completionMetadataRef.current.reset(owner); refreshSchema(owner); }
        if(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*ALTER\s+SESSION\b/i.test(operations.metadata.get(owner)?.executedSql||'')){sendNativeCommand('session.nls',{tabId:owner,epoch:completionMetadataRef.current.session(owner).epoch});sendNativeCommand('session.context',{tabId:owner,epoch:completionMetadataRef.current.session(owner).epoch});}
        const executionMeta=operations.metadata.get(owner)||{},responseAt=performance.now(),renderRequestId=`${message.requestId||Date.now()}:${message.resultId||'statement'}`;
        updateTabSession("rendering",Boolean(message.columns?.length),owner);updateTabSession("renderingRequestId",renderRequestId,owner);
        setSqlResult({ ...message, ...executionMeta,renderRequestId,clientTiming:executionMeta.requestStartedAtPerf?{startedAtPerf:executionMeta.requestStartedAtPerf,responseAtPerf:responseAt,renderMs:null,totalMs:null}:undefined,fetchMetrics:[{offset:0,rows:message.rows?.length||0,elapsedMs:message.elapsedMs,bytes:new TextEncoder().encode(JSON.stringify(message.rows||[])).length}] }, owner); const output = (message.output ?? []).join("\n"); setOutputMessage(output, owner); setTransactionPending(Boolean(message.transactionPending)); setExecuting(false); setCancelling(false); setRunState(message.rowsAffected == null ? `${message.returnedRows ?? 0} rows · ${message.elapsedMs ?? 0} ms` : `${message.rowsAffected} rows affected · ${message.elapsedMs ?? 0} ms`); setResultTab(output ? "Output" : "Results", owner);
      } else if (message?.type === "sql.compilation") {
        if(operation?.requestId===message.requestId){operation.status='complete';operations.cancellations.delete(owner);updateTabSession('queryOutcome',null,owner)}

        operations.owners.delete(message.requestId);
        if (closedTabsRef.current.has(owner)) return;
        const context = operations.metadata.get(owner) || {}, problems = compilationProblemItems(message.compilation, context, owner);
        updateTabSession("compilationProblems", problems, owner); updateTabSession("runtimeProblems", [], owner);
        setTransactionPending(!!message.transactionPending, owner); setExecuting(false, owner); setCancelling(false, owner);
        const errors = problems.filter(problem => problem.severity === "error").length;
        const summary = message.metadataError ? `Compilation completed; diagnostics unavailable: ${message.metadataError}` : errors ? `${errors} PL/SQL compilation error${errors === 1 ? "" : "s"}` : `PL/SQL compilation completed${problems.length ? ` with ${problems.length} warning(s)` : ""}`;
        setRunState(summary, owner); setOutputMessage([...(message.output || []), summary].join("\n"), owner); setResultTab(problems.length ? "Problems" : "Output", owner);
        notifyFeedback({id:`compilation:${message.requestId}`,kind:errors?"error":problems.length?"warning":"success",title:"PL/SQL compilation",message:summary,scope:owner,actions:problems.length?[{label:"View problems",onClick:()=>{activateTab(owner);setResultTab("Problems",owner)}}]:[]}); finishHistoryEntry(errors ? "Failed" : "Succeeded", summary);
        completionMetadataRef.current.reset(owner); refreshSchema(owner);
      } else if (message?.type === "sql.cancelled") {
        const fetching=sessionsRef.current[owner]?.fetchingPage;
        if(operation&&!fetching&&!sessionsRef.current[owner]?.scriptRun?.running&&(operation.status!=='running'||message.requestId&&![operation.requestId,operations.cancellations.get(owner)].includes(message.requestId)))return;
        setTransactionPending(Boolean(message.transactionPending));
        if (message.complete) { operations.cancellations.delete(owner);if(operation?.status==='running'){operations.owners.delete(operation.requestId);operation.status='complete';updateTabSession('queryOutcome',{kind:'cancelled',elapsedMs:Date.now()-operation.startedAt,requestId:operation.requestId},owner)}if(fetching){setFetchingPage(false,owner);setPageError('Row loading cancelled.',owner)}finishHistoryEntry("Cancelled", "Query cancelled"); setExecuting(false); setCancelling(false); setRunState("Query cancelled."); }
        else { setCancelling(true); setRunState("Waiting for Oracle to stop the query…"); }
      } else if (message?.type === "sql.timeout") {
        operations.owners.delete(message.requestId);
        if(operation)operation.status='complete';operations.cancellations.delete(owner);updateTabSession('queryOutcome',{kind:'timeout',message:message.message||'Query timed out.',elapsedMs:operation?Date.now()-operation.startedAt:undefined,requestId:message.requestId},owner);setResultTab('Results',owner);

        finishHistoryEntry("Failed", message.message || "Query timed out.");
        setTransactionPending(Boolean(message.transactionPending), owner); setExecuting(false, owner); setCancelling(false, owner); setRunState(message.message || "Query timed out.", owner);
      } else if (message?.type === "sql.explainResult") {
        const owner = message.tabId || operations.owners.get(message.requestId) || operations.lastOwner || documents.activeId; operations.owners.delete(message.requestId);
        setExplainResult(message, owner); setExplainMessage("", owner); setExecuting(false); setCancelling(false); setRunState(`Execution plan · ${message.returnedRows ?? 0} steps · ${message.elapsedMs ?? 0} ms`);
      } else if (message?.type === "transaction.state") {
        if(!message.pending)updateTabSession("analysisReadOnly",false,owner); setTransactionPending(Boolean(message.pending)); setRunState(`Transaction ${message.state}`);
        if (!message.pending && pendingTabCloseRef.current?.tabId === owner && pendingTabCloseRef.current.resolving) { pendingTabCloseRef.current.retry(); setPendingTabClose(null); }
        if (!message.pending && pendingSwitchRef.current?.tabId === owner) { const profile = pendingSwitchRef.current; setPendingSwitch(null); if (profile.disconnect) sendNativeCommand("connection.disconnect", { tabId: owner }); else setTimeout(() => beginConnection(profile), 0); }
      } else if (message?.type === "schema.loading") { setSchemaLoading(true); setSchemaError(""); setSchemaStale((sessionsRef.current[owner]?.schemaObjects || []).length > 0); updateTabSession("schemaReady", false); schemaReadyRef.current = false;
      } else if (message?.type === "schema.loaded") {
        if (schemaRequestRef.current === message.requestId) schemaRequestRef.current = null; const objects = message.objects ?? []; schemaLookupRef.current = makeOracleRelationLookup(objects, message.schema ?? ""); setSchemaObjects(objects); setSchemaOwner(message.schema ?? ""); setSchemaLoading(false); setSchemaStale(false); setSchemaError(""); schemaReadyRef.current = true; updateTabSession("schemaReady", true); schemaRequestedRef.current.clear(); schemaLoadedRef.current.clear(); queueSchemaForSql(documents.text);
      } else if (message?.type === "schema.cancelled") {
        if (schemaRequestRef.current === message.requestId) schemaRequestRef.current = null; setSchemaLoading(false); setSchemaStale((sessionsRef.current[owner]?.schemaObjects || []).length > 0); setSchemaError('Metadata loading cancelled.');
      } else if (message?.type === "schema.table" || message?.type === "schema.object") {
        const item = message.item; if (item?.name) { const key = oracleSchemaKey(item).toLowerCase(); schemaLoadedRef.current.add(key); schemaRequestedRef.current.delete(key); if (isOracleRelation(item)) schemaLookupRef.current.set(item.name.toLowerCase(), item); setSchemaObjects((current) => current.map((entry) => oracleSchemaKey(entry) === oracleSchemaKey(item) ? item : entry)); setObjectTabs(current => current.map(tab => tab.key === oracleSchemaKey(item) ? { ...tab, object: item } : tab)); requestAnimationFrame(() => { const position = editorRef.current?.getPosition(); const line = position && editorRef.current?.getModel()?.getLineContent(position.lineNumber); if (line) editorRef.current?.render(); }); }
      } else if (message?.type === "schema.error") { setSchemaLoading(false); setSchemaError(message.message ?? "Oracle metadata could not be loaded."); schemaReadyRef.current = true; if (message.tableName || message.name) { const failed = [...schemaObjects].find(item => item.name.toLowerCase() === (message.tableName || message.name).toLowerCase() && (!message.owner || item.owner === message.owner)); if (failed) schemaRequestedRef.current.delete(oracleSchemaKey(failed).toLowerCase()); }
      } else if (message?.type === "host.error") {
        const failedQuery=operation?.requestId===message.requestId&&operation.status==='running';
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
          updateTabSession('queryOutcome',{kind:'error',message:error,elapsedMs:Date.now()-operation.startedAt,requestId:message.requestId},owner);setResultTab('Results',owner);setOutputMessage(error,owner);
          updateTabSession('runtimeProblems',[{id:`${owner}:runtime`,tabId:owner,severity:'error',source:'Oracle',message:error,fileName:documents.tabs.find(tab=>tab.id===owner)?.name||'SQL'}],owner);
        }
        else if ((!failedConnection && !authProfileRef.current && /ORA-\d+/i.test(error)) || message.explain) { if (message.explain) setExplainMessage(error, owner); else setOutputMessage(error, owner); setResultTab(message.explain ? "Explain" : "Output", owner); updateTabSession("runtimeProblems", [{ id: `${owner}:runtime`, tabId: owner, severity: "error", source: "Oracle", message: error, fileName: documents.tabs.find(tab => tab.id === owner)?.name || "SQL" }], owner); }
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
      if(matchesShortcut(event,resolveSetting(settingsRef.current,'editor.shortcuts').value.outline)){event.preventDefault();if(!document.querySelector('.modal-backdrop'))setPaletteMode('outline');return;}
      if(event.altKey&&!event.ctrlKey&&!event.metaKey&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();navigateHistory(event.key==='ArrowLeft'?-1:1);return;}
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='p'){event.preventDefault();event.stopPropagation();if(!document.querySelector('.modal-backdrop')||paletteMode)setPaletteMode(event.shiftKey?'commands':'files');return;}
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === "z") { event.preventDefault(); setFocusMode(value=>!value); return; }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "f" && !editorRef.current?.hasTextFocus()) { event.preventDefault(); setShowSearch(true); setShowHistory(false); return; }
      if (event.key === "F8" && !document.querySelector(".modal-backdrop, .feedback-notification")) { const items = problemsRef.current.filter(problem => problem.tabId === documents.activeId); if (items.length) { event.preventDefault(); problemCursorRef.current = problemCursorRef.current < 0 ? event.shiftKey ? items.length - 1 : 0 : (problemCursorRef.current + (event.shiftKey ? -1 : 1) + items.length) % items.length; navigateProblem(items[problemCursorRef.current]); } return; }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "o") { event.preventDefault(); openSqlFile(); return; }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "n") { event.preventDefault(); if (!document.querySelector('.modal-backdrop')) newSqlFileFromLastConnection(); return; }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === "Tab") { event.preventDefault(); if (!document.querySelector('.modal-backdrop')) cycleSqlTab(event.shiftKey ? -1 : 1); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveSqlFile(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") { event.preventDefault(); if (!editorIsReadonly()) setShowPicker(true); return; }
      if ((event.ctrlKey || event.metaKey) && event.code === "Space" && !event.defaultPrevented && editorRef.current?.hasTextFocus()) { manualSuggestionRef.current = true; event.preventDefault(); editorRef.current.trigger("keyboard", "editor.action.triggerSuggest", {}); }
    };
    window.addEventListener("keydown", handler,true); return () => window.removeEventListener("keydown", handler,true);
  }, [showPicker, showAppearance, showHistory, showSearch, showSnippets, fileDirty, sql, filePath, fileName, recentProfiles]);

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

  useEffect(() => { localStorage.setItem("fbsdb.theme", theme); localStorage.setItem("fbsdb.tokenColors", JSON.stringify(allTokenColors)); }, [theme, allTokenColors]);
  useEffect(() => {
    const reset = () => { learningEpochRef.current++; suggestionLearningRef.current.clear(); lastSuggestionAcceptanceRef.current = null; publishLearning(); };
    window.addEventListener('fbsdb.resetSuggestionLearning', reset);
    return () => window.removeEventListener('fbsdb.resetSuggestionLearning', reset);
  }, [completionSettings.learning, activeTabId, workspace.root]);
  useEffect(() => { localStorage.setItem("fbsdb.completion", JSON.stringify(completionSettings)); localStorage.setItem("fbsdb.autoCompletion", String(autoCompletion)); localStorage.setItem("fbsdb.codeStyle", JSON.stringify(codeStyle)); }, [completionSettings, autoCompletion, codeStyle]);
  useEffect(() => { completionTabKeyRef.current?.set(completionSettings.acceptTab); }, [completionSettings.acceptTab]);
  useEffect(() => { localStorage.setItem("fbsdb.favorites", JSON.stringify(favorites)); localStorage.setItem("fbsdb.recent", JSON.stringify(recentProfiles)); }, [favorites, recentProfiles]);
  useEffect(()=>{if(!isNativeHost)localStorage.setItem("fbsdb.connectionOrganization",JSON.stringify(connectionOrg))},[connectionOrg]);
  useEffect(() => { localStorage.setItem("fbsdb.maxRows", String(maxRows)); }, [maxRows]);
  useEffect(() => { localStorage.setItem("fbsdb.queryHistory", JSON.stringify(queryHistory.slice(0,historyLimit))); }, [queryHistory,historyLimit]);
  useEffect(() => { localStorage.setItem("fbsdb.customSqlSnippets", JSON.stringify(customSqlSnippets)); }, [customSqlSnippets]);


  useEffect(() => {
    if (!monaco) return;
    const name = `fbsdb-${theme}-${Date.now()}`;
    monaco.editor.defineTheme(name, { base: theme === "light" ? "vs" : "vs-dark", inherit: true,
      rules: monacoTokenRules(theme, tokenColors), colors: monacoThemeColors(theme) });
    setEditorThemeName(name);
  }, [monaco, theme, themeConfig, tokenColors]);

  useEffect(() => {
    if (!monaco) return;
    const client = new OracleCompletionClient(new Worker(new URL('./oracleCompletionWorker.js', import.meta.url), { type: 'module' }), setCompletionError);
    completionClientRef.current = client;
    return () => { client.dispose(); completionClientRef.current = null; for (const source of definitionModelsRef.current.values()) source.model.dispose(); definitionModelsRef.current.clear(); };
  }, [monaco]);

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
        return { busy: !!(originSession.executing || originSession.scriptRun?.running || originSession.fetchingPage), sourceObject: tab?.definitionObject, tabId: documents.activeId, originTabId, connected: isNativeHost && !!connection && !["No connection", "Disconnected"].includes(connection.id), settings: completionSettings,
          manualSuggestion: () => { const manual = manualSuggestionRef.current; manualSuggestionRef.current = false; return manual; } };
      },
      onDefinition: openOracleDefinition,
      onReveal: target => {
        if (metadataOriginTabId !== documents.activeId) activateTab(metadataOriginTabId);
        setSidebarOpen(true); setSchemaQuery("");
        const object = sessionsRef.current[metadataOriginTabId]?.schemaObjects?.find(item => item.owner === target.owner && item.name === target.name && item.type === target.type);
        if (object) { setActiveObject(oracleSchemaKey(object)); requestSchemaDetails(object); requestAnimationFrame(() => { const section = document.querySelector('.schema-section'); if (section) section.open = true; }); }
        else setCompletionError("This object is not in the current Object Explorer scope.");
      },
      onError: setCompletionError,
      onPlscope: setPlscopeReport,
    });
  }, [monaco, completionSettings, completionObjects, completionSchema, completionSession.oracleVocabulary, allSqlSnippets, activeTabId, metadataOriginTabId]);

  useEffect(() => {
    if (!monaco) return;
    const owner = activeTabId;
    const timer = setTimeout(async () => {
      const model = editorRef.current?.getModel(), client = completionClientRef.current;
      if (!model || !client) return;
      const text = model.getValue(), version = model.getVersionId();
      const result = await client.request("diagnostics", text, 0);
      if (!result.diagnostics || model.isDisposed() || model.getVersionId() !== version || documents.activeId !== owner) return;
      const problems = result.diagnostics.map((item, index) => {
        const start = model.getPositionAt(item.start), end = model.getPositionAt(item.end);
        return { ...item, id: `${owner}:lint:${index}`, tabId: owner, fileName: documents.tabs.find(tab => tab.id === owner)?.name || "SQL", line: start.lineNumber, column: start.column, offset: item.start, editorSnapshot: text, startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column };
      });
      updateTabSession("lintProblems", problems, owner);
      monaco.editor.setModelMarkers(model, "fbsdb-lint", problems.map(problem => ({ ...problem, severity: problem.severity === "warning" ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error })));
    }, 250);
    return () => clearTimeout(timer);
  }, [monaco, sql, activeTabId, completionSettings, completionObjects, completionSchema, completionSession.oracleVocabulary]);

  useEffect(() => {
    const model = editorRef.current?.getModel(); if (!monaco || !model) return;
    const items = [...(tabSession.compilationProblems || []), ...(tabSession.runtimeProblems || [])].filter(problem => problem.offset != null && problem.editorSnapshot === sql);
    monaco.editor.setModelMarkers(model, "fbsdb-runtime", items.map(problem => { const position = model.getPositionAt(problem.offset); return { message: problem.message, severity: problem.severity === "warning" ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error, startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: Math.min(position.column + 1, model.getLineMaxColumn(position.lineNumber)) }; }));
  }, [monaco, sql, activeTabId, tabSession.compilationProblems, tabSession.runtimeProblems]);

  function updateTokenColor(token, color) { setAllTokenColors((current) => ({ ...current, [theme]: { ...current[theme], [token]: color } })); }
  function editorIsReadonly() { return !!documents.tabs.find(tab => tab.id === documents.activeId)?.readOnly; }
  async function navigateProblem(problem) {
    const tab = documents.tabs.find(tab => tab.id === problem.tabId);
    if (!tab) return;
    const text = problem.tabId === documents.activeId ? documents.text : tab.content;
    if (problem.offset != null && problem.editorSnapshot === text) {
      rememberLocation();
      if (problem.tabId !== documents.activeId) activateTab(problem.tabId);
      requestAnimationFrame(() => { const editor = editorRef.current, model = editor?.getModel(); if (!model || model.getValue() !== text) return; const position = model.getPositionAt(problem.offset); editor.setPosition(position); editor.revealPositionInCenter(position); editor.focus(); rememberLocation(problem.tabId,position); });
      return;
    }
    if (problem.definition) {
      let source = problem.definition;
      if (!source.text) {
        const loaded = await completionMetadataRef.current.load(problem.tabId, { owner: source.owner, name: source.name, type: source.type.replace(/ BODY$/, ''), body: source.type.endsWith(' BODY') }, null, 'definition');
        if (!loaded) return; source = { ...loaded, originTabId: problem.tabId };
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
  function jumpToOffset(offset) {const editor=editorRef.current;if(!editor?.getModel())return;rememberLocation();const position=editor.getModel().getPositionAt(offset);editor.setPosition(position);editor.revealPositionInCenter(position);editor.focus();rememberLocation();}
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
      else setEditorContext({tabId:documents.activeId,model,version:model.getVersionId(),selection:range,trigger,x,y,selected:!range.isEmpty(),canUndo:model.canUndo(),canRedo:model.canRedo(),readOnly:editorIsReadonly()});
    };const listener=editor.onContextMenu(show),keyboard=editor.onKeyDown(event=>{const e=event.browserEvent;if(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey){e.preventDefault();e.stopPropagation();const position=editor.getPosition(),p=editor.getScrolledVisiblePosition(position),r=editor.getDomNode().getBoundingClientRect();show({target:{position},event:{posx:r.left+(p?.left||20),posy:r.top+(p?.top||20)+20}})}});return()=>{disposed=true;listener.dispose();keyboard.dispose();setEditorContext(null)};
  },[monaco,activeTabId,completionObjects,completionSchema]);
  async function editorContextAction(action,context){
    const editor=editorRef.current,valid=()=>documents.activeId===context.tabId&&editor.getModel()===context.model&&!context.model.isDisposed()&&context.model.getVersionId()===context.version;
    const check=()=>{if(!valid())throw Error('The editor changed. Open the menu again.')};check();editor.setSelection(context.selection);editor.focus();
    if(action==='run'){runQuery();return}if(action==='explain'){explainQuery();return}if(action==='format'){await formatSql();return}
    if(action==='selectAll'){editor.setSelection(context.model.getFullModelRange());return}
    if(action==='copy'||action==='cut'){await navigator.clipboard.writeText(context.model.getValueInRange(context.selection));if(action==='copy')return;check()}
    if(action==='cut'||action==='paste'){if(context.readOnly)return;const text=action==='paste'?await navigator.clipboard.readText():'';check();editor.pushUndoStop();editor.executeEdits('context-menu',[{range:context.selection,text}]);editor.pushUndoStop();return}
    if(action==='undo'||action==='redo'){editor.trigger('context-menu',action,{});return}
    const command=editor.getAction({comment:'editor.action.commentLine',find:'actions.find',replace:'editor.action.startFindReplaceAction'}[action]);
    if(!command?.isSupported())throw Error('This editor action is unavailable.');await command.run();
  }
  function openObjectContext(event,item) {
    event.preventDefault();event.stopPropagation();
    const trigger=event.currentTarget,rect=trigger.getBoundingClientRect(),originTabId=metadataOriginTabId;
    const profileId=sessionsRef.current[originTabId]?.activeConnection?.id;
    if(!profileId||['No connection','Disconnected'].includes(profileId))return;
    setObjectMenu({cancellation:completionCancellation(),item:{...item,owner:item.owner||schemaOwner},trigger,x:event.type==='contextmenu'?event.clientX||rect.left:rect.left,y:event.type==='contextmenu'?event.clientY||rect.bottom:rect.bottom,editorTabId:documents.activeId,originTabId,profileId,epoch:completionMetadataRef.current.session(originTabId).epoch});
  }
  function openExplorerObject(item,view='Overview',originTabId=metadataOriginTabId) {
    setDefinitionError('');
    const key=oracleSchemaKey(item),existing=objectTabs.find(tab=>tab.key===key&&tab.originTabId===originTabId),id=existing?.id||`oracle-object:${originTabId}:${key}`;
    setActiveObject(key);setObjectTabs(current=>existing?current.map(tab=>tab.id===id?{...tab,object:item,view}:tab):[...current,{id,key,object:item,originTabId,view}]);
    setActiveObjectTabId(id);setObjectTabActive(true);
    requestAnimationFrame(()=>document.querySelector('.oracle-object-inspector [aria-selected="true"]')?.focus());
    setRecentObjects(keys=>{const next=[key,...keys.filter(value=>value!==key)].slice(0,30);localStorage.setItem('fbsdb.recentObjects',JSON.stringify(next));return next});
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
    if(action==='favorite'){const key=oracleSchemaKey(item);setObjectFavorites(keys=>{const next=keys.includes(key)?keys.filter(k=>k!==key):[...keys,key];localStorage.setItem('fbsdb.objectFavorites',JSON.stringify(next));return next});return}
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
  function choosePaletteItem(item) {
    if(item.kind==='file'){if(item.objectTab){const tab=objectTabs.find(t=>t.id===item.tabId);if(tab){setActiveObjectTabId(tab.id);setObjectTabActive(true);setActiveObject(tab.key);inspectOracleObject(tab.object,tab.originTabId,tab.view==='Related tables');}}else if(item.tabId){setObjectTabActive(false);activateTab(item.tabId);}else openWorkspaceFile(item);}
    else if(item.kind==='object')openExplorerObject(item,'Overview');
    else if(item.kind==='connection'){const profile=dbConnections.find(profile=>profile.id===item.profileId);if(profile)switchConnection(profile);}
    else if(item.kind==='history'){newSqlFileNow();requestAnimationFrame(()=>insertHistorySql(item.sql));}
    else if(item.kind==='outline')jumpToOffset(item.start);
    else item.run?.();
  }
  useEffect(()=>{
    setDocumentOutline([]);if(!monaco||!completionClientRef.current)return;
    let cancelled=false;const source=sql,tabId=activeTabId;
    const timer=setTimeout(async()=>{const result=await completionClientRef.current?.request('outline',source,0);if(!cancelled&&tabId===documents.activeId&&documents.text===source)setDocumentOutline(result?.outline||[])},250);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[sql,activeTabId,monaco,completionSettings,completionObjects,completionSchema,completionSession.oracleVocabulary,allSqlSnippets]);
  function openOracleDefinition(source, selection) {
    if (!['PACKAGE', 'PACKAGE BODY', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'TYPE', 'TYPE BODY'].includes(source.type)) {
      setObjectDefinition({ ...source, originTabId: source.originTabId || documents.activeId });
      return;
    }
    rememberLocation();
    const originTabId = source.originTabId, id = `definition:${originTabId}:${source.owner}:${source.type}:${source.name}`;
    rememberEditorPosition();
    const tab = { id, name: `${source.owner}.${source.name}${source.type.endsWith(" BODY") ? ".body" : ""}.sql`, path: null, content: source.text, dirty: false, readOnly: true, metadataOriginTabId: originTabId, definitionObject: { owner: source.owner, name: source.name, type: source.type } };
    documents.open(tab);
    setNativeTabId(originTabId);
    requestAnimationFrame(() => { const position = { lineNumber: selection?.startLineNumber || selection?.lineNumber || 1, column: selection?.startColumn || selection?.column || 1 }; editorRef.current?.setPosition(position); editorRef.current?.revealPositionInCenter(position); editorRef.current?.focus(); rememberLocation(id,position); });
  }
  useEffect(()=>{
    if(recovery)return;
    const save=()=>{try{localStorage.setItem('fbsdb.sqlDrafts',JSON.stringify(draftSnapshot(documents.tabs,documents.activeId)))}catch{}};
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
  function openWorkspaceFile(file) { const cached = documents.tabs.find((tab) => pathKey(tab.path) === pathKey(file.path)); if (cached && !file.newTab) { activateTab(cached.id); return; } rememberEditorPosition(); if (isNativeHost) sendNativeCommand("file.openPath", { path: file.path, forceNew:!!file.newTab }); else openSqlFileNow(); }
  function activateTab(id, remember = true) { if (remember) { rememberLocation(); rememberEditorPosition(); } const tab = documents.tabs.find((item) => item.id === id); if (!tab) return; const restorePosition=editorPositionsRef.current.get(id); setNativeTabId(tab.metadataOriginTabId || id); documents.activate(id); schemaLookupRef.current = makeOracleRelationLookup(sessionsRef.current[id]?.schemaObjects || [], sessionsRef.current[id]?.schemaOwner); schemaReadyRef.current = Boolean(sessionsRef.current[id]?.schemaReady); schemaLoadedRef.current.clear(); schemaRequestedRef.current.clear(); if (isNativeHost && !tab.readOnly) sendNativeCommand("file.activate", { path: tab.path, tabId: id }); queueSchemaForSql(tab.content);
    if(isNativeHost&&tab.restoreConnectionOnActivate){
      setTabs(current=>current.map(item=>item.id===id?{...item,restoreConnectionOnActivate:false}:item));
      const profile=dbConnectionsRef.current.find(item=>item.id.toLowerCase()===tab.connectionProfileId?.toLowerCase());
      if(profile)beginConnection({...profile,tabId:id});
    }
    requestAnimationFrame(() => {const position=restorePosition;if(position){editorRef.current?.setPosition(position);editorRef.current?.revealPositionInCenterIfOutsideViewport(position)}editorRef.current?.focus();rememberLocation(id)}); }
  function cycleSqlTab(direction) { const items = documents.tabs; if (items.length < 2) return; const index = items.findIndex(item => item.id === documents.activeId); activateTab(items[(index + direction + items.length) % items.length].id); }
  function newSqlFileNow() {
    const id = `new-${crypto.randomUUID()}`;
    rememberEditorPosition();
    documents.open({ id, name: "Untitled.sql", path: null, content: "", dirty: false, connectionProfileId: null });
    setNativeTabId(id);
    if (isNativeHost) sendNativeCommand("file.new", { tabId: id });
    schemaReadyRef.current = false; schemaLookupRef.current = new Map(); schemaLoadedRef.current.clear(); schemaRequestedRef.current.clear();
    requestAnimationFrame(() => editorRef.current?.focus());
  }
  function newSqlFileFromLastConnection() { const current = activeConnectionRef.current; const profile = dbConnectionsRef.current.find(item => item.id === (current && !['No connection', 'Disconnected'].includes(current.id) ? current.id : null)); newSqlFileNow(); if (profile) { if (isNativeHost) beginConnection({ ...profile, tabId: documents.activeId }); else { setActiveConnection(profile); setTabs(tabs => tabs.map(tab => tab.id === documents.activeId ? { ...tab, connectionProfileId: profile.id } : tab)); } } }
  function closeTab(id, onClosed = null) {
    const tab = documents.tabs.find(item => item.id === id); if (!tab) return;
    const complete = () => {
      setObjectDefinition(current => current?.originTabId === id ? null : current);
      documentSavesRef.current.forget(id);
      batchDiscardRef.current.delete(id);closedTabsRef.current.add(id); operations.pages.delete(id); completionMetadataRef.current.forget(id); completionRecentRef.current.delete(id);
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
    const retry = () => { const request = sendNativeCommand("tab.close", { tabId: id }); tabCloseActionsRef.current.set(request, { complete, retry }); };
    const close = () => isNativeHost && !tab.readOnly ? retry() : complete();
    if (tab.dirty && !tab.readOnly && !batchDiscardRef.current.has(id)) { if (id !== documents.activeId) activateTab(id); setPendingFileAction({ run: close }); }
    else close();
  }
  function closeTabs(ids) {
    const selected=[...new Set(ids)],dirty=selected.filter(id=>documents.tabs.find(tab=>tab.id===id)?.dirty);
    const run=discard=>{setBatchClose(null);if(discard)batchDiscardRef.current=new Set(selected);const queue=[...selected];const next=()=>{const id=queue.shift();if(id)closeTab(id,()=>setTimeout(next,0));else batchDiscardRef.current.clear()};next()};
    if(dirty.length>1)setBatchClose({count:dirty.length,run});else run(false);
  }
  function newSqlFile() { newSqlFileFromLastConnection(); }
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
  function connectInBackground(item, credentials = {}) {
    const tabId = item.tabId || documents.activeId;
    if ([...pendingConnectionsRef.current.values()].some(profile => profile.tabId === tabId)) return;
    updateTabSession("sessionContext",null,tabId);updateTabSession("operationStartedAt",Date.now(),tabId);setConnecting(true, tabId); setConnectionError("", tabId); updateTabSession("connectingProfile", item.name || item.id, tabId); updateTabSession("connectingProfileId",item.id,tabId);
    const requestId = sendNativeCommand("connection.connect", { profileId: item.id, ...credentials, tabId });
    pendingConnectionsRef.current.set(requestId, { ...item, user: credentials.user || item.user || item.savedUser, credentials: undefined, tabId });
  }
  function beginConnection(item) {
    const tabId = item.tabId || documents.activeId; item = { ...item, tabId };
    if (item.credentials || item.hasSavedCredentials) { setAuthProfile(null); connectInBackground(item, item.credentials || {}); }
    else { setAuthProfile(item); setConnectionError("", tabId); setConnecting(false, tabId); }
  }
  function switchConnection(item, force = false) { if (editorIsReadonly()) return; if (item.available === false) { setManagementError("TNS source unavailable. Edit this connection or refresh sources."); return; } setShowPicker(false); if (!force && item.id.toLowerCase() === activeConnection.id.toLowerCase()) return; if (isNativeHost && transactionPending) { setPendingSwitch({ ...item, tabId: documents.activeId }); return; } if (isNativeHost) { beginConnection(item); return; } setActiveConnection(item); setRunState(`Connected to ${item.id}`); }
  function disconnectActiveConnection() { setShowPicker(false); if (transactionPending) setPendingSwitch({ id: "disconnect", disconnect: true, tabId: documents.activeId }); else if (isNativeHost) sendNativeCommand("connection.disconnect", { tabId: documents.activeId }); else setActiveConnection({ id: "Disconnected", title: "No active session", env: "—" }); }
  function previewConnectionOrganization(payload){const next=changeConnectionOrganization(connectionOrg,payload,dbConnections);setConnectionOrg(next);setDbConnections(current=>organizedProfiles(current,next).map(p=>({...p,group:p.groups[0]||''})))}
  function connectionContextAction(action,context){
    const item=context.item,folderId=context.kind==='folder'?item.id:context.kind==='profile'?item.folderId:null;
    if(action==='newSql'){newSqlFileNow();if(isNativeHost)beginConnection({...item,tabId:documents.activeId});return;}
    if(action==='connect'||action==='reconnect')switchConnection(item,action==='reconnect');
    else if(action==='disconnect')disconnectActiveConnection();
    else if(action==='edit')setProfileEditor(item);
    else if(action==='duplicate')setProfileEditor({...item,id:undefined,name:(item.name||item.id)+' copy',hasSavedCredentials:false,credentials:undefined});
    else if(action==='favorite')setFavorites(current=>current.includes(item.id)?current.filter(id=>id!==item.id):[...current,item.id]);
    else if(action==='delete')setProfileEditor({...item,libraryAction:'delete'});
    else if(action==='newConnection')setProfileEditor({method:'basic',folderId:folderId||null,groupIds:[]});
    else if(action==='newFolder'||action==='newGroup'||action==='manageFolder'||action==='renameFolder')setProfileEditor({libraryContext:{folderId:folderId||null,action}});
    else if(action==='manage')setProfileEditor(true);
    else if(action==='refresh')sendNativeCommand('connection.list');
  }

  function submitConnectionCredentials(credentials) {
    if (!authProfile) return;
    if (authProfile.testOnly) { setConnecting(true, authProfile.tabId); authTestRequestRef.current = sendNativeCommand("connection.test", { profileId: authProfile.id, ...credentials, tabId: authProfile.tabId }); return; }
    const profile = authProfile; setAuthProfile(null); connectInBackground(profile, credentials);
  }
  function finishTransaction(action) { if (isNativeHost) sendNativeCommand(`transaction.${action}`, { tabId: pendingSwitch?.tabId || documents.activeId }); else setRunState(action === "commit" ? "Transaction committed" : "Transaction rolled back"); }
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
  function handleEditorChange(value) { if (editorIsReadonly()) return; documents.edit(value ?? ""); queueSchemaForSql(documents.text); }
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
    const decorations = editor.createDecorationsCollection();
    let statementsByLine = new Map();
    const refresh = () => {
      const model = editor.getModel();
      statementsByLine = new Map();
      if (!model || editorIsReadonly()) { decorations.clear(); return; }
      for (const statement of getSqlStatements(model.getValue())) {
        const position = model.getPositionAt(statement.start);
        // A gutter click targets only the first statement starting on this line.
        const current = statementsByLine.get(position.lineNumber);
        if (!current) statementsByLine.set(position.lineNumber, { ...statement, position });
      }
      decorations.set([...statementsByLine.values()].map(({ position, sql }) => ({
        range: new monacoInstance.Range(position.lineNumber, 1, position.lineNumber, 1),
        options: { glyphMarginClassName: "sql-run-glyph", glyphMarginHoverMessage: { value: "Run SQL statement\n\n" + sql.slice(0, 160) } },
      })));
    };
    const subscriptions = [editor.onDidChangeModelContent(refresh), editor.onDidChangeModel(refresh), editor.onMouseDown((event) => {
      if (event.target.type !== monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || event.event.rightButton) return;
      const statement = statementsByLine.get(event.target.position?.lineNumber);
      if (!statement) return;
      editor.setPosition(statement.position); editor.focus();
      runQueryRef.current?.(statement.sql);
    })];
    refresh();
    editor.onDidDispose(() => { subscriptions.forEach((subscription) => subscription.dispose()); decorations.clear(); });
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
  function openScriptPreview() { const tabId=documents.activeId,run=operations.scripts.get(tabId);setScriptDialog({tabId,source:run?.running?run.source:documents.text}); }

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
  function openWorkspaceSearchMatch(match) { const cached = tabs.find((tab) => tab.path?.toLowerCase() === match.path.toLowerCase()); if (cached) { activateTab(cached.id); setShowSearch(false); requestAnimationFrame(() => { editorRef.current?.setPosition({ lineNumber: match.lineNumber, column: 1 }); editorRef.current?.revealLineInCenter(match.lineNumber); editorRef.current?.focus(); }); return; } rememberEditorPosition(); pendingSearchPositionRef.current = { path: match.path, lineNumber: match.lineNumber }; setShowSearch(false); sendNativeCommand("file.openPath", { path: match.path }); }


  const { runQuery, explainQuery, executeStatement, fetchMoreResults, cancelQuery, startScript } = useQueryExecution({
    documents, results, operations, native: isNativeHost, send: sendNativeCommand,
    readSession: owner => sessionsRef.current[owner] || (owner === documents.activeId ? { activeConnection: activeConnectionRef.current } : {}),
    settings: { pageSize: pageSizes.next, scriptPageSize: maxRows, timeout: queryTimeout, workspaceRoot: workspace.root },
    editor: { current: editorRef.current, lastPosition: lastEditorPositionRef.current, flash: flashExecutionTarget },
    session: { update: updateTabSession, status: setRunState },
    ui: { pendingBind: pendingBindSql, bind: setPendingBindSql, showConnections: () => setShowPicker(true), scriptDialog },
    history: {
      learn: learnSqlUsage,
      start(owner, statement, profile) {
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
  const sessionConnected = !["No connection", "Disconnected"].includes(activeConnection.id);
  const summarySession=tabSessions[metadataOriginTabId]||tabSession;
  const summaryConnectionSnapshot=summarySession.activeConnection||activeConnection;
  const summaryConnected=!["No connection","Disconnected"].includes(summaryConnectionSnapshot.id);
  const summaryConnection=dbConnections.find(profile=>profile.id===(summarySession.connecting?summarySession.connectingProfileId:summaryConnectionSnapshot.id))||summaryConnectionSnapshot;
  const dockPanels = {
    editors: <div className="dock-content open-editors-content"><OpenEditors tabs={tabs.map(tab => tab.id === activeTabId ? { ...tab, dirty: fileDirty } : tab)} activeId={activeTabId} onActivate={activateTab} onClose={closeTab}/></div>,
    files: <div className="dock-content file-section-content"><WorkspaceExplorer expandedPaths={layout.expandedPaths} onExpandedChange={next => updateLayout(current => ({ ...current, expandedPaths: typeof next === "function" ? next(current.expandedPaths) : next }))} workspace={workspace} activePath={filePath} onOpen={openWorkspaceFile} onOpenWorkspace={openWorkspace} onManage={()=>setShowWorkspaceManager(true)} onSearch={scope=>{setWorkspaceSearchScope(scope);setShowSearch(true)}} onReplace={scope=>openWorkspaceDevelopment('replace',scope)} onWorksets={()=>setShowWorksets(true)} gitFiles={workspaceDev.git?.files}/></div>,
    connections: <div className="dock-content connections-section-content" tabIndex={0} onContextMenu={e=>{if(!e.target.closest("input,select,button,summary,.connection-tree"))setConnectionMenu(connectionContext(e,"background"))}} onKeyDown={e=>{if(e.target===e.currentTarget)connectionContextKey(e,event=>setConnectionMenu(connectionContext(event,"background")))}}>
            <div className="section-heading"><div><button title="Refresh TNS aliases" onClick={() => sendNativeCommand("connection.list")}><RefreshCw size={13} /></button><button title="Manage connections" aria-label="Manage connections" onClick={()=>setProfileEditor(true)}><Settings2 size={13}/></button><button title="New connection" onClick={() => { setShowPicker(false); setProfileEditor({method:"basic"}); }}><Plus size={15} /></button></div></div>
            <div className="explorer-search"><Search size={13} /><input aria-label="Filter connections" placeholder="Search" value={explorerQuery} onChange={(event) => setExplorerQuery(event.target.value)} />{explorerQuery.length > 0 ? <button type="button" className="explorer-search-clear" title="Clear" aria-label="Clear connection filter" onMouseDown={event => event.preventDefault()} onClick={event => { setExplorerQuery(''); event.currentTarget.closest('.explorer-search').querySelector('input')?.focus(); }}><X size={12}/></button> : <Filter size={12} />}</div>
            <div className="explorer-tabs"><button className={explorerTab === "Recent" ? "active" : ""} onClick={() => setExplorerTab("Recent")}><Clock3 size={12} /> Recent</button><button className={explorerTab === "Favorites" ? "active" : ""} onClick={() => setExplorerTab("Favorites")}><Star size={12} /> Favorites</button><button className={explorerTab === "All" ? "active" : ""} onClick={() => setExplorerTab("All")}><ListFilter size={12} /> All</button></div>
            {connectionGroupNames.length > 0 && <label className="group-filter"><span>GROUP</span><select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option>All groups</option>{connectionGroupNames.map((group) => <option key={group}>{group}</option>)}</select></label>}
            {filteredConnections.length||connectionOrg.folders.length ? <ConnectionTree contextId={connectionMenu?.item?.id} onContext={(event,kind,item)=>setConnectionMenu(connectionContext(event,kind,item))} items={filteredConnections} organization={connectionOrg} selected={activeConnection} favorites={favorites} onSelect={switchConnection} onManage={profile=>setProfileEditor(profile)} onToggleFavorite={id=>setFavorites(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])}/> : <div className="panel-empty-actions connections-empty"><button type="button" className="panel-empty-link" onClick={()=>dbConnections.length?(setExplorerQuery(""),setExplorerTab("All"),setGroupFilter("All groups")):setProfileEditor({method:"basic"})}>{dbConnections.length?"Clear filters":"New connection"}</button></div>}</div>,
    objects: <div className="dock-content objects-section-content">
            <div className="schema-scope"><Database size={13} className="schema-connection-icon"/><span className="schema-scope-name">{schemaOwner || activeConnection.name || activeConnection.id}</span><span title={connecting || schemaLoading ? "Loading" : ["No connection", "Disconnected"].includes(activeConnection.id) ? "Disconnected" : "Connected"} aria-label={connecting || schemaLoading ? "Loading" : ["No connection", "Disconnected"].includes(activeConnection.id) ? "Disconnected" : "Connected"} className={schemaLoading || connecting ? "live-dot" : ["No connection", "Disconnected"].includes(activeConnection.id) ? "offline-dot" : "online-dot"} />{connecting ? "Connecting…" : schemaLoading ? "Loading…" : (schemaQuery || schemaOwnerFilter !== "All" || objectScope !== "All") ? `${visibleSchemaObjects.length} / ${schemaObjects.length} objects` : schemaObjects.length ? `${schemaObjects.length} objects` : ""}<button type="button" className="schema-refresh" title={schemaLoading ? "Cancel metadata loading" : "Refresh Oracle objects"} aria-label={schemaLoading ? "Cancel metadata loading" : "Refresh Oracle objects"} onClick={() => schemaLoading && schemaRequestRef.current ? sendNativeCommand('schema.cancel',{requestId:schemaRequestRef.current}) : refreshSchema()}>{schemaLoading?<X size={12}/>:<RefreshCw size={12}/>}</button></div>
            {definitionError&&<Feedback title="Definition unavailable">{definitionError}</Feedback>}
            <div className="explorer-search schema-search schema-combined-search"><Search size={13}/><input aria-label="Search Oracle objects" placeholder="Search objects…" value={schemaQuery} onChange={event=>{setSchemaQuery(event.target.value);setDefinitionError('')}}/>{schemaQuery&&<button type="button" aria-label="Clear Object Explorer search" onClick={()=>setSchemaQuery('')}><X size={12}/></button>}<select aria-label="Object Explorer schema" value={schemaOwnerFilter} onChange={event=>setSchemaOwnerFilter(event.target.value)}><option value="All">All schemas</option>{[...new Set(schemaObjects.map(item=>item.owner).filter(Boolean))].sort().map(owner=><option key={owner} value={owner}>{owner}</option>)}</select></div>
            {sessionConnected&&(schemaError||!schemaLoading&&!visibleSchemaObjects.length)&&(()=>{const state=actionableState({connected:sessionConnected,error:schemaError,hasItems:Boolean(visibleSchemaObjects.length),filtered:Boolean(schemaQuery||schemaOwnerFilter!=='All'||objectScope!=='All')});return <ActionableState {...state} onAction={()=>state.command==='connect'?setShowPicker(true):state.command==='retry'?refreshSchema(): (setSchemaQuery(''),setSchemaOwnerFilter('All'),setObjectScope('All'))}/>})()}
            {schemaStale && <Feedback kind={schemaLoading?"progress":"warning"} title="Cached metadata">Refresh failed or is still running; showing previously loaded metadata.</Feedback>}
            <div className="object-scope-switch"><button className={objectScope === "All" ? "active" : ""} onClick={() => setObjectScope("All")}>All</button><button className={objectScope === "Recent" ? "active" : ""} onClick={() => setObjectScope("Recent")}><Clock3 size={11}/> Recent</button></div>
            {(schemaLoading||visibleSchemaObjects.length>0)&&<OracleObjectTree items={visibleSchemaObjects} activeKey={activeObject} currentSchema={schemaOwner} query={schemaQuery} searchKinds={schemaSearchKinds} onToggle={item=>openExplorerObject(item)} onContext={openObjectContext} contextKey={objectMenu?oracleSchemaKey(objectMenu.item):null} onInsert={insertEditorText} emptyLabel={schemaLoading ? "Loading Oracle objects…" : schemaObjects.length ? "No Oracle objects match this search or filter." : isNativeHost ? ["No connection", "Disconnected"].includes(activeConnection.id) ? "Connect to load Oracle objects" : "No accessible Oracle objects found for this user." : "Oracle objects appear after connecting"} />}
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
  const bottomCollapsed = layout.resultsCollapsed || focusMode;
  return <main className="desktop-shell" data-language={language} data-region={region} data-results-collapsed={bottomCollapsed} data-focus={focusMode} data-density={workbenchDensity} data-reduce-motion={reduceMotion} data-theme={theme} style={{ "--accent": themeConfig.accent, "--syntax-keyword":tokenColors.keyword,"--syntax-string":tokenColors.string,"--syntax-comment":tokenColors.comment,"--syntax-number":tokenColors.number, "--ui-font-family": uiFontStacks[uiFontFamily], "--sidebar-width": `${layout.widths.left}px`, "--results-height": `${resultsHeight}%` }}>
    <GlobalTooltip />
    {showOpenWorkspace&&<WorkspaceOpenPopup workspace={workspace} onClose={()=>setShowOpenWorkspace(false)}/>}
    {showWorksets&&workspace.root&&<WorkspaceWorksets root={workspace.root} getSnapshot={worksetSnapshot} onOpened={openWorkset} onClose={()=>setShowWorksets(false)}/>}
    {showWorkspaceManager&&<Suspense fallback={<div role="status">Loading…</div>}><WorkspaceManager workspace={workspace} onClose={()=>setShowWorkspaceManager(false)}/></Suspense>}
    {workspaceDevMode&&<Suspense fallback={<div role="status">Loading…</div>}><WorkspaceDevelopmentDialog mode={workspaceDevMode} scope={workspaceReplaceScope} state={workspaceDev} files={workspace.files} onClose={()=>{setWorkspaceDevMode(null);workspaceDevRequestsRef.current.clear()}} onGitRefresh={refreshWorkspaceGit} onGitDiff={path=>workspaceDevelopmentCommand('workspace.gitDiff',{path})} onPreview={previewWorkspaceReplace} onApply={applyWorkspaceReplace} onInvalidate={()=>setWorkspaceDev(current=>({...current,preview:null,applied:null}))}/></Suspense> }
    {connectionDiagnostics&&<Suspense fallback={<div role="status">Loading…</div>}><ConnectionDiagnosticsDialog report={connectionDiagnostics} onClose={()=>setConnectionDiagnostics(null)}/></Suspense>}
    {scriptDialog&&<Suspense fallback={<div role="status">Loading…</div>}><SqlScriptDialog key={scriptDialog.tabId} source={scriptDialog.source} run={tabSessions[scriptDialog.tabId]?.scriptRun} timeout={queryTimeout} autoCommit={Boolean(tabSessions[scriptDialog.tabId]?.autoCommit)} onTimeout={setQueryTimeout} onClose={()=>setScriptDialog(null)} onCancel={()=>sendNativeCommand('sql.cancel',{tabId:scriptDialog.tabId})} onStart={startScript} disabled={!isNativeHost||!tabSessions[scriptDialog.tabId]?.activeConnection||['No connection','Disconnected'].includes(tabSessions[scriptDialog.tabId]?.activeConnection?.id)||tabSessions[scriptDialog.tabId]?.connecting||tabSessions[scriptDialog.tabId]?.executing||tabSessions[scriptDialog.tabId]?.fetchingPage}/></Suspense> }
    {recovery&&<Suspense fallback={<div role="status">Loading…</div>}><DraftRecoveryDialog snapshot={recovery} onDiscard={()=>{try{localStorage.removeItem('fbsdb.sqlDrafts')}catch{}setRecovery(null)}} onRestore={restoreDrafts}/></Suspense>}
    {paletteMode&&<IdeCommandPalette mode={paletteMode} onClose={()=>setPaletteMode(null)} onChoose={choosePaletteItem}
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
        {id:'commit',label:'Commit transaction',disabled:!transactionPending||executing,run:()=>finishTransaction('commit')},
        {id:'rollback',label:'Rollback transaction',disabled:!transactionPending||executing,run:()=>finishTransaction('rollback')},
        {id:'settings',label:'Open settings',run:()=>setShowAppearance(true)},
        {id:'outline',label:'Show file outline',run:()=>setPaletteMode('outline')},
        {id:'density',label:'Toggle compact / comfortable workbench density',run:()=>setWorkbenchDensity(value=>value==='compact'?'comfortable':'compact')},
        {id:'focus',label:'Toggle editor focus mode',detail:'Ctrl+Alt+Z',run:()=>setFocusMode(value=>!value)},
        {id:'problems',label:'Show Problems',run:()=>setResultTab('Problems')},
        {id:'worksets',label:'Manage workspace worksets',disabled:!isNativeHost||!workspace.root,run:()=>setShowWorksets(true)},
        {id:'git',label:'Inspect workspace SQL Git changes',disabled:!isNativeHost||!workspace.root,run:()=>openWorkspaceDevelopment('git')},
        {id:'replace',label:'Preview replace in workspace SQL files',disabled:!isNativeHost||!workspace.root,run:()=>openWorkspaceDevelopment('replace')},
        {id:'search',label:'Search workspace',detail:'Ctrl+Shift+F',run:()=>setShowSearch(true)},
      ]}/>}
    <input ref={openFileInputRef} type="file" accept=".sql,text/plain" hidden onChange={async (event) => { const file = event.target.files?.[0]; if (file) { const content = await file.text(); rememberEditorPosition(); const id = `file:${crypto.randomUUID()}`; documents.open({ id, name: file.name, path: null, content, dirty: false, connectionProfileId: null }); setNativeTabId(id); } event.target.value = ""; }} />
    <FileMenu connectionControl={<ConnectionControl key={metadataOriginTabId} context={summarySession.sessionContext} contextError={summarySession.sessionContextError} executing={summarySession.executing} fetching={summarySession.fetchingPage} rendering={summarySession.rendering} cancelling={summarySession.cancelling} stage={summarySession.sqlStage} startedAt={summarySession.operationStartedAt} transactionPending={summarySession.transactionPending} readOnlyAnalysis={summarySession.analysisReadOnly} exporting={Boolean(tabResults[metadataOriginTabId]?.streamState?.busy)} inactive={Boolean(summarySession.inactive)} profile={summaryConnection} connected={summaryConnected} connecting={summarySession.connecting} connectingProfile={summarySession.connectingProfile} disabled={activeTabReadonly} open={showPicker} onOpen={() => setShowPicker(true)}/>} onManageWorkspaces={()=>setShowWorkspaceManager(true)} workspace={workspace} onNew={newSqlFile} onOpen={openSqlFile} onSave={() => saveSqlFile()} onOpenWorkspace={openWorkspace} language={language}>
      <RunMenu actions={[{label:'Run statement',shortcut:resolveSetting(settings,'editor.shortcuts').value.run,disabled:executing||fetchingPage,run:runQuery},{label:'Preview / run script',run:openScriptPreview},{id:'navigation',separator:true},{label:'File outline',shortcut:resolveSetting(settings,'editor.shortcuts').value.outline,run:()=>setPaletteMode('outline')},{label:'Navigate back',shortcut:'Alt+Left',run:()=>navigateHistory(-1)},{label:'Navigate forward',shortcut:'Alt+Right',run:()=>navigateHistory(1)}]}/>
      <ViewMenu settings={settings} layout={layout} language={language} onSetting={(id, value) => applySettings(changeSetting(settings, id, value))} onLayout={updateLayout} onPanel={showDockPanel} focusMode={focusMode} onFocusMode={setFocusMode} onResults={name => { setFocusMode(false); updateLayout(current => ({ ...current, resultsCollapsed: false })); setResultTab(name); }} onReset={resetPanelLayout} onSettings={() => setShowAppearance(true)} onCloseDetails={() => { setObjectDefinition(null); window.dispatchEvent(new Event('fbsdb.closeDetails')); }}/>
    </FileMenu>
    <div className="workbench"><aside className="activity-rail"><button className={`rail-button explorer-rail-toggle${sidebarOpen && !focusMode ? " selected" : ""}`} title={sidebarOpen && !focusMode ? "Hide explorer" : "Show explorer"} aria-label={sidebarOpen && !focusMode ? "Hide explorer" : "Show explorer"} aria-pressed={sidebarOpen && !focusMode} onClick={() => {if(focusMode){setFocusMode(false);setSidebarOpen(true)}else setSidebarOpen(open=>!open)}}><Database size={18} /></button><button className="rail-button" title="Search workbench (Ctrl+P)" aria-label="Search workbench" onClick={() => setPaletteMode("files")}><Search size={18} /></button><button className="rail-button" title="History" aria-label="History" onClick={() => { setShowHistory(true); setShowSearch(false); }}><History size={18} /></button><button className="rail-button" title="SQL snippets" aria-label="SQL snippets" onClick={() => { setSnippetFilter(""); setShowSnippets(true); }}><Braces size={18} /></button><button className="rail-button" title="SQL mini tools" aria-label="SQL mini tools" onClick={() => setShowMiniTools(true)}><Workflow size={18}/></button><div className="rail-spacer" /><button className={`rail-button${focusMode?" selected":""}`} title="Editor focus mode (Ctrl+Alt+Z)" aria-label="Editor focus mode" aria-pressed={focusMode} onClick={()=>setFocusMode(value=>!value)}><Code2 size={18}/></button><button className="rail-button" title="Settings" aria-label="Settings" onClick={() => setShowAppearance(true)}><Settings2 size={18} /></button></aside>
      <DockWorkbench layout={layout} onChange={updateLayout} panels={dockPanels} hidden={focusMode}>
      <div className="editor-results-stack"><section className="editor-workspace" data-inspector={Boolean(objectInspectorView)}><div className="commandbar"><div className="command-left"><button className="icon-button" title="Open file (Ctrl+Shift+O)" aria-label="Open file (Ctrl+Shift+O)" onClick={openSqlFile}><FolderOpen size={16} /></button><button className="icon-button" title="Undo (Ctrl+Z)" aria-label="Undo" onMouseDown={(event) => event.preventDefault()} onClick={() => { editorRef.current?.trigger("toolbar", "undo", {}); editorRef.current?.focus(); }}><Undo2 size={15} /></button><button className="icon-button format-sql-button" title="Format SQL (Ctrl+Shift+F)" aria-label="Format SQL" onMouseDown={(event) => event.preventDefault()} onClick={formatSql}><AlignLeft size={15} /></button><span className="toolbar-separator" /><label className="fetch-limit-picker" title="Rows per result page"><span>Rows</span><select aria-label="Rows per result page" value={maxRows} onChange={(event) => setMaxRows(Number(event.target.value))}>{[100, 500, 1000, 5000, 10000].map((limit) => <option key={limit} value={limit}>{limit.toLocaleString()}</option>)}</select></label><button className={`run-button${!executing && !fetchingPage && !cancelling ? " idle" : ""}`} aria-label={cancelling ? "Cancelling SQL statement" : (executing || fetchingPage) ? "Cancel current SQL statement" : "Run SQL statement"} disabled={cancelling || activeTabReadonly} title={cancelling ? "Waiting for Oracle to stop this statement" : (executing || fetchingPage) ? "Cancel current SQL statement" : `Run SQL statement (${resolveSetting(settings,"editor.shortcuts").value.run||"unassigned"})`} onMouseDown={(event) => event.preventDefault()} onClick={() => (executing || fetchingPage) ? cancelQuery() : runQuery()}>{cancelling ? <Activity size={14} className="spin" /> : <Play size={14} fill="currentColor" />} <span className="sr-only">{(executing || fetchingPage) && (cancelling ? "Cancelling…" : "Cancel")}</span></button><span className="toolbar-separator" /><button className="transaction-button commit" title="Commit" aria-label="Commit" onClick={() => finishTransaction("commit")} disabled={!transactionPending||executing||fetchingPage}><Check size={13} /></button><button className="transaction-button rollback" title="Rollback" aria-label="Rollback" onClick={() => finishTransaction("rollback")} disabled={!transactionPending||executing||fetchingPage}><X size={13} /></button><button type="button" className={`transaction-button auto-commit${tabSession.autoCommit?' enabled':''}`} aria-label="Auto commit" aria-pressed={Boolean(tabSession.autoCommit)} title={transactionPending?'Commit or roll back pending changes before changing auto commit':`Auto commit ${tabSession.autoCommit?'on':'off'}`} disabled={!isNativeHost||activeTabReadonly||transactionPending||executing||fetchingPage||connecting||tabSession.autoCommitPending} onClick={()=>{updateTabSession('autoCommitPending',true,activeTabId);updateTabSession('autoCommitRequestId',sendNativeCommand('transaction.autoCommit',{tabId:activeTabId,enabled:!tabSession.autoCommit}),activeTabId)}}><RefreshCw size={13}/></button></div><EditorToolbarOverflow theme={theme} onOpen={openSqlFile} onUndo={()=>{editorRef.current?.trigger("toolbar","undo",{});editorRef.current?.focus()}} onFormat={formatSql} pageSize={maxRows} onPageSize={setMaxRows} readOnly={activeTabReadonly}/></div><EditorTabs tabs={[...tabs.map(tab=>({...tab,queryFailed:['error','timeout'].includes(tabSessions[tab.id]?.queryOutcome?.kind),profileName:dbConnections.find(p=>p.id===(tabSessions[tab.id]?.activeConnection?.id||tab.connectionProfileId))?.name,connectionProfileId:tabSessions[tab.id]?.activeConnection?.id||tab.connectionProfileId})), ...objectTabs.map(tab => ({ id: tab.id, name: `${tab.object.owner}.${tab.object.name}`, kind: 'object', connectionProfileId:tabSessions[tab.originTabId]?.activeConnection?.id }))]} activeId={objectTabActive ? objectTabId : activeTabId} onActivate={id => { const selected = objectTabs.find(tab => tab.id === id); if (selected) { setActiveObjectTabId(id); setObjectTabActive(true); setActiveObject(selected.key); inspectOracleObject(selected.object,selected.originTabId,selected.view==='Related tables'); } else { setObjectTabActive(false); setActiveObject(''); activateTab(id); } }} onClose={id => { if (objectTabs.some(tab => tab.id === id)) { setObjectTabs(current => current.filter(tab => tab.id !== id)); if (activeObjectTabId === id) { setObjectTabActive(false); setActiveObjectTabId(null); objectAnalysisRequestRef.current?.cancel(); setObjectAnalysis(null); } } else closeTab(id); }} onCloseMany={ids => { const objectIds = new Set(objectTabs.map(tab => tab.id)); if (ids.includes(activeObjectTabId)) { setObjectTabActive(false); setActiveObjectTabId(null); objectAnalysisRequestRef.current?.cancel(); setObjectAnalysis(null); } setObjectTabs(current => current.filter(tab => !ids.includes(tab.id))); closeTabs(ids.filter(id => !objectIds.has(id))); }} onNew={() => { setObjectTabActive(false); setActiveObject(''); newSqlFile(); }}>{!objectInspectorView && filePath && <button className={fileConnectionProfileId === activeConnection.id ? "icon-button file-connection-button bound" : "icon-button file-connection-button"} title="Bind current connection to this file" aria-label="Bind current connection to this file" disabled={!isNativeHost || !workspace.root || ["No connection", "Disconnected"].includes(activeConnection.id)} onClick={bindCurrentConnectionToFile}><Database size={14} /></button>}</EditorTabs><div className="breadcrumb"><span>{workspace.name}</span>{filePath && <><ChevronRight size={12} /><span>{filePath.split(/[\\/]/).slice(-2, -1)[0]}</span></>}<ChevronRight size={12} /><b>{fileName}{fileDirty ? " *" : ""}</b><EditorSymbolBreadcrumb editor={editorRef.current} tabId={activeTabId} outline={documentOutline}/>{filePath && <span className="file-connection-chip" title="Saved connection for this file"><Database size={11} />{(dbConnections.find(item => item.id === fileConnectionProfileId)?.name || fileConnectionProfileId) ?? "No profile bound"}</span>}</div><ExternalFileNotice key={activeTabId} change={tabs.find(tab=>tab.id===activeTabId)?.externalChange} dirty={fileDirty} onReload={()=>resolveExternalFile(true)} onKeep={()=>resolveExternalFile(false)} onRetry={pollOpenFiles}/><div className="editor-container"><div className="editor-sql-surface" hidden={Boolean(objectInspectorView)}><Suspense fallback={<div className="editor-loading">Loading SQL editor…</div>}><Editor height="100%" defaultLanguage="sql" value={sql} onChange={handleEditorChange} theme={editorThemeName} onMount={(editor, monacoInstance) => { setMonaco(monacoInstance);
    editor.onDidChangeModelContent(event => { const accepted = lastSuggestionAcceptanceRef.current; if (event.isUndoing && accepted && accepted.tabId === documents.activeId && event.versionId === accepted.version + 1 && Date.now()-accepted.at < 10000 && completionSettingsRef.current.learning) { suggestionLearningRef.current.record(accepted.scope, accepted.context, accepted.key, -1); lastSuggestionAcceptanceRef.current = null; publishLearning(); } }); completionTabKeyRef.current = editor.createContextKey("fbsdb.acceptCompletionOnTab", completionSettings.acceptTab); completionAcceptanceRef.current = editor.addCommand(0, (_accessor, key, context) => { if (completionSettingsRef.current.learning) { const scope = suggestionScope(); suggestionLearningRef.current.record(scope, context || 'statement', key); lastSuggestionAcceptanceRef.current = { scope, context: context || 'statement', key, tabId: documents.activeId, version: editor.getModel().getVersionId(), at: Date.now() }; publishLearning(); } const tabId = documents.activeId; completionRecentRef.current.set(tabId, [key, ...(completionRecentRef.current.get(tabId) || []).filter(item => item !== key)].slice(0, 100)); completionClientRef.current?.remember(key); }); editor.addCommand(monacoInstance.KeyCode.Tab, () => { editor.trigger("keyboard", "hideSuggestWidget", {}); editor.trigger("keyboard", "editor.action.inlineSuggest.hide", {}); editor.trigger("keyboard", "tab", {}); }, "(suggestWidgetVisible || inlineSuggestionVisible) && editorTextFocus && !fbsdb.acceptCompletionOnTab"); editor.addAction({ id: "fbsdb.runStatement", label: "Run SQL statement", run: () => runQueryRef.current?.() }); editor.addAction({ id: "fbsdb.deleteLine", label: "Delete line", precondition: "editorTextFocus && !editorReadonly", run: () => editor.trigger("keyboard", "editor.action.deleteLines", {}) }); editor.addAction({ id: "fbsdb.formatSql", label: "Format SQL", run: () => formatterRef.current?.() }); installRunGutter(editor, monacoInstance); editorRef.current = editor; lastEditorPositionRef.current = editor.getPosition(); editor.onDidChangeCursorPosition(({ position }) => { lastEditorPositionRef.current = position;editorPositionsRef.current.set(documents.activeId,position); }); editor.focus(); recordStartupMilestone("editor-ready"); announceUiReady(); }} options={{ fontFamily: `"${resolveSetting(settings,"editor.fontFamily").value}", Consolas, monospace`, fontSize: codeStyle.fontSize, readOnly: activeTabReadonly, lineHeight: Math.max(codeStyle.fontSize + 2, resolveSetting(settings,"editor.lineHeight").value), minimap: { enabled: resolveSetting(settings,"editor.minimap").value }, padding: { top: 18, bottom: 18 }, lineNumbers: resolveSetting(settings,"editor.lineNumbers").value ? "on" : "off", renderLineHighlight: resolveSetting(settings,"editor.lineHighlight").value ? "line" : "none", renderWhitespace: resolveSetting(settings,"editor.whitespace").value ? "all" : "none", scrollBeyondLastLine: false, smoothScrolling: !reduceMotion, automaticLayout: true, contextmenu:false, wordWrap: resolveSetting(settings,"editor.wordWrap").value ? "on" : "off", glyphMargin: true, folding: resolveSetting(settings,"editor.folding").value, guides: { indentation: resolveSetting(settings,"editor.indentGuides").value, highlightActiveIndentation: resolveSetting(settings,"editor.indentGuides").value }, suggest: { showWords: false, showSnippets: completionSettings.snippets, preview: false }, inlineSuggest: { enabled: completionSettings.inline, mode: "prefix", showToolbar: "never", minShowDelay: completionSettings.delay, suppressSuggestions: false }, quickSuggestions: false, suggestOnTriggerCharacters: autoCompletion, acceptSuggestionOnEnter: completionSettings.acceptEnter ? "on" : "off", tabCompletion: completionSettings.acceptTab ? "on" : "off", parameterHints: { enabled: completionSettings.signatureHelp }, tabSize: codeStyle.tabSize, insertSpaces: codeStyle.insertSpaces, cursorBlinking: reduceMotion?"solid":resolveSetting(settings,"editor.cursorBlinking").value, cursorStyle: resolveSetting(settings,"editor.cursorStyle").value, cursorSmoothCaretAnimation: reduceMotion?"off":"on", bracketPairColorization: { enabled: resolveSetting(settings,"editor.bracketColors").value }, overviewRulerLanes: 0, fixedOverflowWidgets: true, find: { addExtraSpaceOnTop: false } }} /></Suspense></div>{objectInspectorView}{!objectInspectorView && objectDefinition && objectDefinition.originTabId === metadataOriginTabId && <Suspense fallback={<div role="status">Loading…</div>}><OracleDefinitionView hidden={focusMode} source={objectDefinition} onClose={() => setObjectDefinition(null)}/></Suspense>}</div><div className="editor-status"><EditorSessionStatus executionTarget={tabSession.executionTarget} inactive={Boolean(tabSession.inactive)} editor={editorRef.current} tabId={activeTabId} connection={activeConnection} connected={sessionConnected} connecting={connecting} executing={executing} cancelling={cancelling} fetching={fetchingPage} startedAt={tabSession.operationStartedAt} stage={tabSession.sqlStage} readOnlyAnalysis={tabSession.analysisReadOnly} transactionPending={transactionPending} exporting={Boolean(view.streamState?.busy)} /><span>SQL</span><span>Spaces: {codeStyle.tabSize}</span><span>UTF-8</span><span className="status-sql"><Code2 size={12} /> Oracle SQL</span><button type="button" className="status-intellisense saved-state editor-save-button" title={activeTabReadonly ? "Read only" : "Save SQL file (Ctrl+S)"} aria-label={activeTabReadonly ? "Read only" : "Save SQL file (Ctrl+S)"} disabled={activeTabReadonly} onClick={() => saveSqlFile()}>{activeTabReadonly ? <><LockKeyhole size={12} /> Read only</> : fileDirty ? <><Save size={12} /> Unsaved</> : <><Save size={12} /> Saved</>}</button></div></section>
      <ResizeHandle axis="y" value={resultsHeight} onChange={value=>{setFocusMode(false);setResultsHeight(value)}} min={15} max={70} label="Resize results" panelSelector=".result-panel" />
      <section className="result-panel" data-collapsed={bottomCollapsed}>
        <div className="result-header"><div className="result-tabs">
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
        {resultTab === "Problems" ? <ProblemsPanel onReturnToEditor={()=>editorRef.current?.focus()} items={allProblems} activeTabId={activeTabId} onNavigate={navigateProblem} /> : resultTab === "Explain" ? <Suspense fallback={<div role="status">Loading…</div>}><ExplainPlanView result={explainResult} loading={executing && executionKind === "explain"} error={explainMessage} mode={view.planPresentation || "diagram"} onModeChange={mode => updateTabResult("planPresentation", mode, activeTabId)} /></Suspense> : resultTab === "Results"
          ? <SqlResultsView
              onExportInsert={exportResultsInsertSql}
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
      </DockWorkbench>
    </div>
    <footer className="app-status"><div><Folder size={12}/><span title={workspace.root||'Open a workspace'}>{workspace.name}</span></div><div><span>Ctrl+P · Search workbench</span><span className="status-divider"/><span>Ctrl+Enter · Run SQL</span></div><div><LockKeyhole size={12}/><span>Manual commit</span></div></footer>
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
    {showSearch && <ModalBackdrop onClose={() => setShowSearch(false)} onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSearch(false); }}><section className="appearance-modal workspace-search-modal" role="dialog" aria-modal="true" aria-labelledby="workspace-search-title"><header className="appearance-header"><div><div className="eyebrow">WORKSPACE SEARCH</div><h2 id="workspace-search-title">Find in SQL files</h2><p>{workspaceSearchScope?`Search SQL files in ${workspaceSearchScope}`:'Case-insensitive search across SQL files in the open workspace.'}</p></div><button className="icon-button" aria-label="Close workspace search" onClick={() => setShowSearch(false)}><X size={17} /></button></header><label className="workspace-search-input"><Search size={15} /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search text in .sql files…" aria-label="Search SQL workspace" /></label><div className="workspace-search-summary">{!isNativeHost ? "Open the desktop app to search workspace files." : !workspace.root ? "Open a workspace to search its SQL files." : searchQuery.trim().length < 2 ? "Enter at least 2 characters to search." : searching ? "Searching workspace…" : `${searchMatches.length} match${searchMatches.length === 1 ? "" : "es"}${searchTruncated ? " · search limits reached; some files may be omitted" : ""}`}</div><div className="workspace-search-results">{searchMatches.map((match, index) => <button className="workspace-search-result" key={`${match.path}:${match.lineNumber}:${index}`} onClick={() => openWorkspaceSearchMatch(match)}><span><b>{match.relativePath}</b><small>Line {match.lineNumber}</small></span><code>{match.lineText}</code></button>)}{isNativeHost && workspace.root && searchQuery.trim().length >= 2 && !searching && !searchMatches.length && <div className="query-history-empty"><Search size={20} /><b>{searchTruncated ? "No matches in scanned files" : "No matches found"}</b><span>{searchTruncated ? "Some files were skipped because the workspace is large." : "Try a different term or shorter fragment."}</span><button className="button-secondary" onClick={()=>setSearchQuery("")}>Clear search</button></div>}{!isNativeHost && <div className="query-history-empty"><Search size={20} /><b>Workspace search is available in the desktop app</b><span>It searches SQL files in the open workspace.</span></div>}</div><footer className="appearance-footer"><span>{searchMatches.length ? "Select a match to open its file at that line." : "Search runs locally against workspace SQL files."}</span><button className="button-secondary" onClick={() => { setShowSearch(false); setSearchQuery(""); setSearchMatches([]); }}>Close</button></footer></section></ModalBackdrop>}
    {showHistory && <ModalBackdrop onClose={() => setShowHistory(false)} onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHistory(false); }}><section className="appearance-modal query-history-modal" role="dialog" aria-modal="true" aria-labelledby="query-history-title"><header className="appearance-header"><div><div className="eyebrow">QUERY HISTORY</div><h2 id="query-history-title">Recent executions</h2><p>SQL text only; bind values are never saved. The last 50 executions stay on this device.</p></div><button className="icon-button" aria-label="Close query history" onClick={() => setShowHistory(false)}><X size={17} /></button></header><label className="workspace-search-input history-search-input"><Search size={15} /><input autoFocus value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)} placeholder="Search SQL, profile, or status..." aria-label="Search query history" /></label><div className="query-history-list">{filteredQueryHistory.length ? filteredQueryHistory.map((entry) => <article className="query-history-item" key={entry.id}><div className="query-history-meta"><span className={`query-history-status ${entry.status.toLowerCase()}`} /><b>{entry.profile}</b><time>{new Date(entry.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><span className={`query-history-label ${entry.status.toLowerCase()}`}>{entry.status}</span></div><pre>{entry.sql}</pre><div className="query-history-actions"><span>{entry.detail}</span><button className="button-secondary" onClick={() => insertHistorySql(entry.sql)}><FileCode2 size={13} /> Insert into editor</button></div></article>) : queryHistory.length ? <div className="query-history-empty"><Search size={20} /><b>No matching executions</b><span>Try another SQL fragment, profile name, or status.</span><button className="button-secondary" onClick={()=>setHistoryFilter("")}>Clear history filter</button></div> : <div className="query-history-empty"><History size={20} /><b>No saved queries yet</b><span>Executed statements will appear here.</span></div>}</div><footer className="appearance-footer"><span>{historyFilter.trim() ? `${filteredQueryHistory.length} of ${queryHistory.length} executions match` : `${queryHistory.length} of 50 recent executions on this device`}</span><button className="button-secondary" disabled={!queryHistory.length} onClick={() => setQueryHistory([])}>Clear history</button></footer></section></ModalBackdrop>}
    {showTnsSources && <TnsSources aliases={tnsAliases} onClose={() => setShowTnsSources(false)} />}
    {editorContext&&<EditorContextMenu context={editorContext} onClose={()=>setEditorContext(null)} onAction={editorContextAction} actions={[{id:'run',label:editorContext.selected?'Run selection':'Run statement',disabled:executing||fetchingPage||activeTabReadonly},{id:'explain',label:'Explain plan',disabled:executing||fetchingPage},{id:'format',label:editorContext.selected?'Format selection':'Format SQL',disabled:editorContext.readOnly},{id:'edit',separator:true},{id:'undo',label:'Undo',disabled:editorContext.readOnly||!editorContext.canUndo},{id:'redo',label:'Redo',disabled:editorContext.readOnly||!editorContext.canRedo},{id:'cut',label:'Cut',disabled:editorContext.readOnly||!editorContext.selected},{id:'copy',label:'Copy',disabled:!editorContext.selected},{id:'paste',label:'Paste',disabled:editorContext.readOnly},{id:'selectAll',label:'Select all'},{id:'comment',label:'Toggle comment',disabled:editorContext.readOnly},{id:'find',label:'Find'},{id:'replace',label:'Replace',disabled:editorContext.readOnly}]}/>}
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
    {pendingBindSql && <Suspense fallback={<div role="status">Loading…</div>}><BindParameterDialog file={filePath} sql={pendingBindSql} onCancel={() => setPendingBindSql(null)} onExecute={(values) => executeStatement(pendingBindSql, values)} /></Suspense>}
    {pendingSwitch && <ModalBackdrop onClose={() => { setPendingSwitch(null); setRunState("Connection switch cancelled."); }}><section className="appearance-modal transaction-guard"><header className="appearance-header"><div><div className="eyebrow">UNCOMMITTED CHANGES</div><h2>{pendingSwitch.disconnect ? "Disconnecting" : "Switching connection"}</h2><p>Commit or roll back the pending transaction before {pendingSwitch.disconnect ? "disconnecting" : `connecting to ${pendingSwitch.name || pendingSwitch.id}`}.</p></div></header><footer className="appearance-footer"><button className="button-secondary" onClick={() => { setPendingSwitch(null); setRunState("Connection switch cancelled."); }}>Cancel</button><div><button className="transaction-button rollback" onClick={() => finishTransaction("rollback")}><X size={13} /> Rollback & {pendingSwitch.disconnect ? "disconnect" : "switch"}</button><button className="button-primary" onClick={() => finishTransaction("commit")}><Check size={13} /> Commit & {pendingSwitch.disconnect ? "disconnect" : "switch"}</button></div></footer></section></ModalBackdrop>}
    {batchClose&&<FeedbackDialog kind="warning" title={`Close ${batchClose.count} unsaved editors?`} onClose={()=>setBatchClose(null)} actions={<><button onClick={()=>setBatchClose(null)}>Cancel</button><button onClick={()=>batchClose.run(false)}>Review individually</button><button className="danger" onClick={()=>batchClose.run(true)}>Discard All</button></>}>Discard unsaved editor changes in these tabs? Pending database transactions still require Commit or Rollback.</FeedbackDialog>}
    {pendingTabClose && <ModalBackdrop onClose={() => {batchDiscardRef.current.clear();setPendingTabClose(null)}}><section className="appearance-modal transaction-guard" role="dialog" aria-modal="true" aria-label="Close SQL session"><header className="appearance-header"><div><div className="eyebrow">SQL TAB SESSION</div><h2>{pendingTabClose.pending ? "Uncommitted changes" : "Could not close tab"}</h2><p>{pendingTabClose.message || "Resolve this tab’s transaction before closing it."}</p></div></header><footer className="appearance-footer"><button className="button-secondary" onClick={() => {batchDiscardRef.current.clear();setPendingTabClose(null)}}>Cancel</button><div>{pendingTabClose.pending ? ["rollback", "commit"].map(action => <button key={action} disabled={pendingTabClose.resolving} className={action === "commit" ? "button-primary" : "transaction-button rollback"} onClick={() => { const pending = { ...pendingTabClose, resolving: true }; pendingTabCloseRef.current = pending; setPendingTabClose(pending); sendNativeCommand(`transaction.${action}`, { tabId: pending.tabId }); }}>{action === "commit" ? "Commit" : "Rollback"} & close</button>) : <button className="button-primary" onClick={pendingTabClose.retry}>Retry</button>}</div></footer></section></ModalBackdrop>}
    {pendingFileAction && <ModalBackdrop onClose={() => {batchDiscardRef.current.clear();setPendingFileAction(null)}}><section className="appearance-modal transaction-guard"><header className="appearance-header"><div><div className="eyebrow">UNSAVED SQL</div><h2>Save changes to {fileName}?</h2><p>Your edits will be lost if you continue without saving.</p></div></header><footer className="appearance-footer"><button className="button-secondary" onClick={() => {batchDiscardRef.current.clear();setPendingFileAction(null)}}>Cancel</button><div><button className="transaction-button rollback" onClick={() => { const run = pendingFileAction.run; setPendingFileAction(null); run(); }}>Discard changes</button><button className="button-primary" onClick={() => saveSqlFile(() => { setPendingFileAction(null); pendingFileAction.run(); })}><Check size={13} /> Save</button></div></footer></section></ModalBackdrop>}
    {showAppearance && <Suspense fallback={<div role="status">Loading…</div>}><AppearanceSettings aliases={tnsAliases} profiles={dbConnections} originTabId={metadataOriginTabId} activeProfileId={completionSession.activeConnection?.id} metadataEpoch={completionMetadataRef.current.session(metadataOriginTabId).epoch} settings={settings} onSettingsChange={applySettings} settingsError={settingsError} workspaceRoot={workspace.root} theme={theme} onThemeChange={setTheme} tokenColors={tokenColors} onTokenColorChange={updateTokenColor} completionSettings={completionSettings} onCompletionSettingsChange={setCompletionSettings} completionError={completionError} queryTimeout={queryTimeout} onQueryTimeoutChange={setQueryTimeout} oracleVocabulary={completionSession.oracleVocabulary} completionMetadataStatus={completionSession.completionMetadataStatus || (completionSession.activeConnection && !["No connection", "Disconnected"].includes(completionSession.activeConnection.id) ? "Oracle metadata is loaded on demand." : "Offline Oracle vocabulary; connect to load object metadata.")} codeStyle={codeStyle} onCodeStyleChange={setCodeStyle} systemLocale={systemLocale} onClose={() => setShowAppearance(false)} /></Suspense>}
  </main>;
}

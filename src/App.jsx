import { OracleDefinitionView } from './OracleDefinitionView';
import { SuggestionLearning, learningScope } from './suggestionLearning.js';
import { automaticCompletionAllowed } from './oracleCompletion.js';
import { SettingsFrame } from './SettingsFrame';
import { TnsSourcesSettings } from './TnsSourcesSettings';
import { NlsSettingsSection } from './NlsSettingsSection';
import { ResultDefaultsSettings } from './ResultDefaultsSettings';
import { loadSettings,saveSettings,newResultDefaults,saveResultDefaults,resolveSetting,changeSetting,settingDefinitions,resultPageSizes,importSettingsDocument } from './settingsModel';
import { EditorTabs } from './EditorTabs';
import { ConnectionControl } from './ConnectionControl';
import { ConnectionDiagnosticsDialog } from './ConnectionDiagnosticsDialog';
import { WorkspaceDevelopmentDialog } from './WorkspaceDevelopmentDialog';
import { WorkspaceExplorer, OpenEditors } from './WorkspaceExplorer';
import { FileMenu } from './FileMenu';
import { ViewMenu } from './ViewMenu';
import { DockWorkbench } from './DockWorkbench';
import { defaultDockLayout, normalizeDockLayout } from './dockLayout';
import { remapWorkspacePath, pathKey } from './workspaceTree';
import { OracleObjectDialog } from './OracleObjectDialog';
import { BindParameterDialog } from './BindParameterDialog';
import { SqlScriptDialog } from './SqlScriptDialog';
import { draftSnapshot, parseDraftSnapshot } from './draftRecovery';
import { DraftRecoveryDialog } from './DraftRecoveryDialog';
import { EditorSymbolBreadcrumb } from './EditorSymbolBreadcrumb';
import { IdeCommandPalette } from './IdeCommandPalette';
import { EditorNavigationHistory } from './editorNavigation';
import { EditorSessionStatus } from './EditorSessionStatus';
import { oracleVocabularyStatus } from './oracleVocabularyStatus';
import { ResultToolbar } from './ResultToolbar';
import { PivotOptionsPanel, TransposePivotInspector } from './PivotPopover';
import {deriveResultData,estimateResultMemory,csvText,exportMetadata} from './resultWorkbench';
import { ResultsPresentation } from "./ResultExtensions";
import { buildServerFilter } from "./resultAdvanced";
import { ResultValueDialog } from "./ResultDialogs";
import { applyResultFeatures, copyResultData } from "./resultFeatures";
import { getVisibleResultRows, moveResultRow } from "./resultRows";
import { buildResultDisplay, displayedColumnIndices, projectDisplayExport, resultViewMode, updateResultViewOptions } from "./resultPresentationData";
import { ResultsGrid } from "./ResultsGrid";
import { ExplainPlanView } from "./ExplainPlanView";
import { ModalBackdrop } from "./ModalBackdrop";
import { GlobalTooltip } from "./GlobalTooltip";
import {detectedRegion,effectiveLanguage,effectiveRegion,regionLabel,translate as t} from './localeProfile';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
const Editor = lazy(() => import("@monaco-editor/react"));
import { announceUiReady, isNativeHost, sendNativeCommand, subscribeNativeMessages, setNativeTabId } from "./nativeBridge";
import { ProfileEditor, TnsSources, useDialogFocus } from "./ConnectionManager";
import { compilationProblemItems, offsetAtOraclePosition } from "./plsqlDiagnostics";
import { ProblemsPanel } from "./ProblemsPanel";
import { getOracleBindNames } from "./oracleBinds";
import { OracleCompletionClient } from "./oracleCompletionClient";
import { OracleMetadataBroker, completionCancellation } from "./oracleMetadataBroker";
import { installOracleLanguageProviders } from "./oracleLanguageProviders";
import { loadCompletionSettings } from "./editorCompletionSettings.js";
import { EditorCompletionSettings } from "./EditorCompletionSettings.jsx";
import { getSqlStatements, getStatementAtCursor } from "./sqlStatements";
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

const themePresets = {
  default: { title: "Default · fbsDB Teal", surface: "#111722", editor: "#10151d", accent: "#39b7a5", keyword: "#c792ea", string: "#c3e88d", comment: "#738196", number: "#f78c6c", foreground: "#d8e1ee", line: "#283443", selection: "#22413e" },
  dark: { title: "Dark · Carbon", surface: "#0d1117", editor: "#0b0f14", accent: "#55d6ad", keyword: "#83b8ff", string: "#e3bd7a", comment: "#718096", number: "#f29b79", foreground: "#e6edf3", line: "#27323c", selection: "#203b36" },
  light: { title: "Light · Clear", surface: "#f1f4f8", editor: "#fbfcfe", accent: "#315fca", keyword: "#7444b8", string: "#287347", comment: "#7c8796", number: "#b45424", foreground: "#202b3b", line: "#d7e0eb", selection: "#dbe6fa" },
};
const defaultTokenColors = Object.fromEntries(Object.entries(themePresets).map(([key, value]) => [key, { keyword: value.keyword, string: value.string, comment: value.comment, number: value.number }]));
function matchesShortcut(event,shortcut){
  const parts=String(shortcut||'').split('+'),key=parts.at(-1)?.toLowerCase();if(!key)return false;
  const ctrl=parts.includes('Ctrl'),meta=parts.includes('Meta'),alt=parts.includes('Alt'),shift=parts.includes('Shift');
  if(ctrl&&!(event.ctrlKey||event.metaKey)||!ctrl&&Boolean(event.ctrlKey||event.metaKey))return false;
  if(meta&&!event.metaKey||alt!==Boolean(event.altKey)||shift!==Boolean(event.shiftKey))return false;
  const actual=event.key===' '?'space':event.key.toLowerCase();return actual===key;
}

function AppearanceSettings({ theme, onThemeChange, tokenColors, onTokenColorChange, completionSettings, onCompletionSettingsChange, completionError, completionMetadataStatus, completionVocabulary, settings, onSettingsChange, settingsError, workspaceRoot, profiles, aliases, originTabId, activeProfileId, metadataEpoch, queryTimeout, onQueryTimeoutChange, codeStyle, onCodeStyleChange, systemLocale, onClose }) {
  const dialogRef=useRef(null);useDialogFocus(dialogRef,onClose);
  const language=effectiveLanguage();
  const shortcuts=resolveSetting(settings,'editor.shortcuts').value;
  const tokenNames = { keyword: "Keywords", string: "Strings", comment: "Comments", number: "Numbers" };
  const previewColors = { "--preview-keyword": tokenColors.keyword, "--preview-string": tokenColors.string, "--preview-comment": tokenColors.comment, "--preview-number": tokenColors.number };
  return <ModalBackdrop onClose={onClose} onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="appearance-modal settings-workspace" role="dialog" aria-modal="true" aria-label={t('Settings',language)}>
    <header className="appearance-header"><div><div className="eyebrow">FBSDB</div><h2>{t('Settings',language)}</h2><p>{language==='tr'?'Kullanıcı ve çalışma alanı tercihleri, kapsamlı varsayılanlarla.':'User and workspace preferences, with scoped defaults.'}</p></div><button className="icon-button" onClick={onClose} aria-label={language==='tr'?'Kapat':'Close'}><X size={17} /></button></header>
    <SettingsFrame settings={settings} onChange={onSettingsChange} onImport={text=>onSettingsChange(importSettingsDocument(text,settings))} workspace={workspaceRoot} systemLocale={systemLocale}><TnsSourcesSettings data-settings-category="connections" data-settings-keywords="TNS sources aliases folders files" aliases={aliases}/>
      <section data-settings-category="general" data-settings-keywords="regional locale culture date time number sorting csv"><div className="appearance-section-title">Regional formats</div><div className="locale-profile-controls"><label>Regional formats<select value={resolveSetting(settings,'ui.region').value} onChange={event=>onSettingsChange(changeSetting(settings,'ui.region',event.target.value))}>{['system','en-US','tr-TR','de-DE','en-GB'].map(value=><option key={value} value={value}>{regionLabel(value)}</option>)}</select><small>Windows region: {systemLocale?.region||navigator.language}. New result defaults follow this region; explicit user and workspace preferences take precedence.</small></label></div></section>
      <section data-settings-category="general" data-settings-keywords="theme dark light accent"><div className="appearance-section-title">{t('Workbench theme',language).toUpperCase()}</div><div className="theme-choice-grid">{Object.entries(themePresets).map(([key, preset]) => <button key={key} className={`theme-choice ${theme === key ? "active" : ""}`} onClick={() => onThemeChange(key)}><span className="theme-swatch-row"><i style={{ background: preset.surface }} /><i style={{ background: preset.editor }} /><i style={{ background: preset.accent }} /></span><span className="theme-choice-name">{preset.title}</span>{theme === key && <Check size={14} />}</button>)}</div><label className="connection-notification-setting"><input type="checkbox" checked={resolveSetting(settings,'ui.connectionNotifications').value} onChange={event=>onSettingsChange(changeSetting(settings,'ui.connectionNotifications',event.target.checked))}/>{t('Connection progress notifications',language)}</label></section>
      <section className="syntax-settings" data-settings-category="editor" data-settings-keywords="syntax token colors"><div><div className="appearance-section-title">SQL TOKEN COLORS</div><p>Adjust code colors for the selected theme.</p></div><div className="token-color-list">{Object.entries(tokenNames).map(([token, name]) => <label key={token} className="token-color-row"><span>{name}</span><code>{tokenColors[token].toUpperCase()}</code><input aria-label={`${name} color`} type="color" value={tokenColors[token]} onChange={(event) => onTokenColorChange(token, event.target.value)} /></label>)}</div></section>
      <section className="syntax-preview-section" data-settings-category="editor" data-settings-keywords="syntax preview"><div className="appearance-section-title">LIVE PREVIEW</div><div className="syntax-preview" style={previewColors}><div><span className="tok-comment">-- monthly invoice review</span></div><div><span className="tok-keyword">SELECT</span> invoice_id <span className="tok-keyword">FROM</span> invoices</div><div><span className="tok-keyword">WHERE</span> status = <span className="tok-string">'OPEN'</span> <span className="tok-number">42</span></div><div className="preview-caret" /></div></section>
      <EditorCompletionSettings data-settings-category="editor" data-settings-keywords="completion suggestions popup ghost text Oracle snippets signature keywords PL/Scope" value={completionSettings} onChange={onCompletionSettingsChange} error={completionError} metadataStatus={completionMetadataStatus} vocabulary={completionVocabulary} /><section className="editor-shortcut-settings" data-settings-category="editor" data-settings-keywords="keyboard shortcuts run delete line format customize"><div className="appearance-section-title">{t('Keyboard shortcuts',language)}</div>{[['run','Run SQL statement',['Ctrl+Enter','Ctrl+Shift+Enter','Alt+Enter','Ctrl+R']],['deleteLine','Delete current line',['Ctrl+D','Alt+Backspace','Ctrl+Shift+D']],['format','Format SQL',['Ctrl+Shift+I','Ctrl+Alt+F','Alt+Shift+F']]].map(([action,label,choices])=><label key={action}>{t(label,language)}<select value={shortcuts[action]} onChange={event=>onSettingsChange(changeSetting(settings,'editor.shortcuts',{...shortcuts,[action]:event.target.value}))}>{choices.map(value=><option key={value}>{value}</option>)}</select></label>)}</section><label className="query-timeout-setting" data-settings-category="editor" data-settings-keywords="query timeout cancel">{t('Query timeout (seconds, 0 = unlimited)',language)}<input type="number" min="0" max="86400" value={queryTimeout} onChange={event=>onQueryTimeoutChange(Math.max(0,Math.min(86400,Number(event.target.value)||0)))}/><small>{t('Applies to new SQL executions.',language)}</small></label>
      <section className="editor-preferences" data-settings-category="editor" data-settings-keywords="font size indentation tabs spaces"><div className="appearance-section-title">EDITOR CODE STYLE</div><div className="preference-row"><label>Indentation<select value={`${codeStyle.insertSpaces ? "spaces" : "tabs"}:${codeStyle.tabSize}`} onChange={(event) => { const [mode, size] = event.target.value.split(":"); onCodeStyleChange({ ...codeStyle, insertSpaces: mode === "spaces", tabSize: Number(size) }); }}><option value="spaces:2">2 spaces</option><option value="spaces:4">4 spaces</option><option value="spaces:8">8 spaces</option><option value="tabs:4">Tabs</option></select></label><label>Font size<input type="number" min="10" max="24" value={codeStyle.fontSize} onChange={(event) => onCodeStyleChange({ ...codeStyle, fontSize: Math.max(10, Math.min(24, Number(event.target.value) || 13)) })} /></label></div></section>
      {settingsError&&<p role="alert" className="auth-error">{settingsError}</p>}<ResultDefaultsSettings data-settings-category="results,export,accessibility,privacy" settings={settings} onChange={onSettingsChange} workspace={workspaceRoot}/><NlsSettingsSection data-settings-category="nls" data-settings-keywords="NLS language territory date timestamp numeric timezone session profile" profiles={profiles} originTabId={originTabId} activeProfileId={activeProfileId} epoch={metadataEpoch}/>
    </SettingsFrame><footer className="appearance-footer"><span><Palette size={13} /> Theme preference is saved on this device.</span><button className="button-primary" onClick={onClose}>Done</button></footer>
  </section></ModalBackdrop>;
}

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

function EnvBadge({ env, color, small = false }) { return <span className={`env-badge ${color} ${small ? "small" : ""}`}><i />{env}</span>; }

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

function makeSelectAllSql(owner, table) {
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  return `SELECT *\nFROM ${owner ? `${quote(owner)}.` : ""}${quote(table)}\nFETCH FIRST 100 ROWS ONLY;`;
}

const oracleObjectKinds = [
  ["TABLE", "Tables"], ["VIEW", "Views"], ["MATERIALIZED VIEW", "Materialized Views"], ["SYNONYM", "Synonyms"],
  ["PACKAGE", "Packages"], ["PROCEDURE", "Procedures"], ["FUNCTION", "Functions"], ["TRIGGER", "Triggers"],
  ["SEQUENCE", "Sequences"], ["INDEX", "Indexes"], ["CONSTRAINT", "Constraints"], ["TYPE", "Types"], ["DATABASE LINK", "Database Links"],
];
const oracleObjectIcons = { TABLE: Table2, VIEW: Eye, "MATERIALIZED VIEW": Layers3, SYNONYM: Link2, PACKAGE: Package, PROCEDURE: Code2, FUNCTION: Braces, TRIGGER: Zap, SEQUENCE: ArrowUpDown, INDEX: Workflow, CONSTRAINT: KeyRound, TYPE: Shapes, "DATABASE LINK": Globe2 };
const oracleObjectClass = (type) => `object-${type.toLowerCase().replaceAll(" ", "-")}`;
const oracleSchemaKey = (item) => item.key || `${item.owner || ""}.${item.type || ""}.${item.name || ""}`;
const oracleObjectLabel = (type) => oracleObjectKinds.find(([kind]) => kind === type)?.[1] || type;
const isOracleRelation = (item) => ["TABLE", "VIEW", "MATERIALIZED VIEW", "SYNONYM"].includes(item?.type);
const makeOracleRelationLookup = (items, currentSchema) => new Map(items.filter(isOracleRelation).sort((a, b) => Number(a.owner === currentSchema) - Number(b.owner === currentSchema)).map((item) => [item.name.toLowerCase(), item]));
function OracleObjectIcon({ type, size = 13 }) { const Icon = oracleObjectIcons[type] || Database; return <Icon size={size} className={`oracle-object-icon ${oracleObjectClass(type)}`} aria-hidden="true" />; }

function OracleObjectRow({ item, activeKey, onToggle, onInsert, onDefinition, query = "", favorite = false, onToggleFavorite }) {
  const key = oracleSchemaKey(item), isOpen = activeKey === key;
  const canSelect = ["TABLE", "VIEW", "MATERIALIZED VIEW", "SYNONYM"].includes(item.type);
  return <div className="oracle-object-node" key={key}>
    <div className="oracle-object-line">
    <button className={`oracle-object-row ${isOpen ? "active" : ""}`} title={canSelect ? "Click to inspect · double-click to insert a SELECT query" : "Click to inspect Oracle object metadata"} onClick={() => onToggle(item)} onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); if (canSelect) onInsert(makeSelectAllSql(item.type === "SYNONYM" && item.owner === "PUBLIC" ? "" : item.owner, item.name)); }}>
      <OracleObjectIcon type={item.type} size={14} /><span className="oracle-object-name">{item.name}</span>{query && item.columns?.some(column => `${column.name} ${column.type} ${column.comment || ""}`.toLowerCase().includes(query.toLowerCase())) && <small className="oracle-search-match">Column match</small>}{item.type === "SYNONYM" && <small className="oracle-object-target">→ {item.targetOwner || "PUBLIC"}.{item.targetName}{item.dbLink ? `@${item.dbLink}` : ""}</small>}
    </button>
    </div>
    {isOpen && <div className="oracle-object-details">
      <button type="button" className="schema-definition-action" onClick={() => onDefinition(item)} aria-label={`Open ${item.owner}.${item.name} ${item.type === 'TABLE' ? 'DDL' : 'definition'}`}><FileCode2 size={12}/>{item.type === 'TABLE' ? 'Open DDL' : 'Open definition'}</button>
      {item.details?.map((detail, index) => ["Source", "Definition"].includes(detail.name) ? <details className="oracle-source-node" key={`${detail.name}-${index}`}><summary><Code2 size={12} />{detail.name}</summary><pre>{detail.value}</pre></details> : <div className="oracle-property-row" key={`${detail.name}-${index}`}><b>{detail.name}</b><span>{detail.value}</span></div>)}
      {item.columns?.map((column) => { const length = column.lengthUnit === "CHAR" && column.characterLength != null ? column.characterLength : column.length; const type = column.precision != null ? `${column.type}(${column.precision}${column.scale != null ? `,${column.scale}` : ""})` : length != null && ["CHAR", "NCHAR", "VARCHAR2", "NVARCHAR2", "RAW"].includes(column.type) ? `${column.type}(${length}${column.lengthUnit ? ` ${column.lengthUnit}` : ""})` : column.type; return <button key={column.name} className="schema-column oracle-column-node" title={[column.defaultValue && `Default: ${column.defaultValue}`, column.comment].filter(Boolean).join(" · ")} onClick={() => onInsert(column.name)}><span className={column.indexed ? "column-icon indexed" : "column-icon"}>{column.indexed ? "◆" : "·"}</span><span className="oracle-column-copy"><span>{column.name}</span><em>{type}{column.nullable ? " · NULL" : " · NOT NULL"}{column.defaultValue ? ` · DEFAULT ${column.defaultValue}` : ""}</em>{column.comment && <small className="oracle-column-comment">{column.comment}</small>}</span></button>; })}
      {!item.columns?.length && !item.details?.length && <div className="oracle-details-empty">No metadata available for this object.</div>}
    </div>}
  </div>;
}

function OracleObjectCategory({ owner, type, label, items, currentSchema, query, activeKey, onToggle, onInsert, onDefinition, favoriteKeys, onToggleFavorite }) {
  const initiallyOpen = owner === currentSchema && items.length > 0 && (["TABLE", "SYNONYM"].includes(type));
  const [open, setOpen] = useState(Boolean(query) || initiallyOpen);
  useEffect(() => { if (query) setOpen(true); }, [query]);
  return <details className="oracle-category-node" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><ChevronRight size={12} className="schema-chevron" /><OracleObjectIcon type={type} /><span>{label}</span><span className="object-count">{items.length}</span></summary>
    {open && (items.length ? items.map((item) => <OracleObjectRow key={oracleSchemaKey(item)} item={item} activeKey={activeKey} onToggle={onToggle} onInsert={onInsert} onDefinition={onDefinition} query={query} favorite={favoriteKeys.includes(oracleSchemaKey(item))} onToggleFavorite={onToggleFavorite}/>) : <div className="oracle-empty-category">No {label.toLowerCase()} visible</div>)}
  </details>;
}

function OracleSchemaNode({ owner, categories, objectCount, currentSchema, query, activeKey, onToggle, onInsert, onDefinition, favoriteKeys, onToggleFavorite }) {
  const initiallyOpen = owner === currentSchema;
  const [open, setOpen] = useState(Boolean(query) || initiallyOpen);
  useEffect(() => { if (query) setOpen(true); }, [query]);
  const kinds = oracleObjectKinds.filter(([type]) => !query || categories.has(type));
  return <details className="oracle-schema-node" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><ChevronRight size={13} className="schema-chevron" /><Database size={14} className="oracle-schema-icon" /><span>{owner}</span><span className="object-count">{objectCount}</span></summary>
    {open && kinds.map(([type, label]) => {
      const items = (categories.get(type) || []).slice().sort((a, b) => a.name.localeCompare(b.name));
      return <OracleObjectCategory key={`${owner}-${type}`} owner={owner} type={type} label={label} items={items} currentSchema={currentSchema} query={query} activeKey={activeKey} onToggle={onToggle} onInsert={onInsert} onDefinition={onDefinition} favoriteKeys={favoriteKeys} onToggleFavorite={onToggleFavorite}/>;
    })}
  </details>;
}

function OracleObjectTree({ items, activeKey, onToggle, onInsert, onDefinition, onAnalysis, emptyLabel, currentSchema, query, favoriteKeys, onToggleFavorite }) {
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
  return <div className="schema-tree oracle-object-tree" onKeyDown={event=>{if(event.key==='F12'){const object=items.find(item=>oracleSchemaKey(item)===activeKey);if(object){event.preventDefault();onDefinition?.(object)}}}}>{activeKey&&<button className="schema-definition-action" title="DDL, grants and dependencies" aria-label="Inspect selected Oracle object" onClick={()=>{const object=items.find(item=>oracleSchemaKey(item)===activeKey);if(object)onAnalysis?.(object)}}><ListFilter size={13}/></button>}{activeKey&&<button className="schema-definition-action" onClick={()=>{const object=items.find(item=>oracleSchemaKey(item)===activeKey);if(object)onDefinition?.(object)}} title="Open read-only definition (F12)" aria-label="Open selected object definition"><FileCode2 size={12}/>Definition</button>}{owners.map((owner) => {
    const categories = schemas.get(owner), objectCount = [...categories.values()].reduce((sum, list) => sum + list.length, 0);
    return <OracleSchemaNode key={owner} owner={owner} categories={categories} objectCount={objectCount} currentSchema={currentSchema} query={query} activeKey={activeKey} onToggle={onToggle} onInsert={onInsert} onDefinition={onDefinition} favoriteKeys={favoriteKeys} onToggleFavorite={onToggleFavorite}/>;
  })}</div>;
}

function ConnectionPicker({ items, current, onClose, onConnect, favorites, setFavorites, groups, onSetGroup, onNew, onEdit, onDuplicate, onDelete, onDisconnect, onReconnect, onTest, managementError }) {
  const dialogRef = useRef(null); useDialogFocus(dialogRef, onClose);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("All connections");
  const [selected, setSelected] = useState(current);
  const [groupChoice, setGroupChoice] = useState(current?.group === "" ? "__none__" : current?.group ?? "__auto__");
  const [newGroup, setNewGroup] = useState("");
  const searchRef = useRef(null);
  const filtered = useMemo(() => items.filter((item) => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const searchable = `${item.name || item.id} ${item.user || ""} ${item.alias || ""} ${item.title} ${item.host} ${item.port} ${item.service} ${item.env} ${item.group}`.toLowerCase();
    return words.every((word) => searchable.includes(word)) && (tab === "All connections" || (tab === "Favorites" && favorites.includes(item.id)) || (tab === "Recent" && item.recent));
  }), [items, query, tab, favorites]);
  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => { if (!filtered.some((item) => item.id === selected?.id)) setSelected(filtered[0] ?? null); }, [filtered, selected]);
  useEffect(() => { setGroupChoice(selected?.group === "" ? "__none__" : selected?.group ?? "__auto__"); setNewGroup(""); setConfirmDelete(false); }, [selected?.id, selected?.group]);
  const toggleFavorite = (id) => setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return <ModalBackdrop onClose={onClose} onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="connection-modal" role="dialog" aria-modal="true" aria-label="Change connection">
    <div className="modal-header"><div><div className="eyebrow">DATABASE SESSION</div><h2>Switch connection</h2><p>Choose a saved profile. Each SQL tab has its own Oracle session and transaction.</p></div><button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={17} /></button></div>
    <label className="picker-search"><Search size={17} /><input ref={searchRef} value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const index = filtered.findIndex((item) => item.id === selected?.id); const next = Math.max(0, Math.min(filtered.length - 1, index < 0 ? 0 : index + (event.key === "ArrowDown" ? 1 : -1))); setSelected(filtered[next] ?? null); } else if (event.key === "Enter" && selected) { event.preventDefault(); onConnect(selected); } }} placeholder="Search alias, host, service, environment…" /><kbd>ESC</kbd></label>
    <div className="picker-tabs">{["All connections", "Favorites", "Recent"].map((name) => <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{name}{name === "Favorites" && <span>{favorites.length}</span>}</button>)}<button className="manage-connections" onClick={onNew}><Plus size={14} /> New connection</button></div>
    <div className="picker-body">{filtered.length ? <VirtualConnectionRows items={filtered} selected={selected} onSelect={setSelected} onConnect={onConnect} favorites={favorites} onToggleFavorite={toggleFavorite} /> : <div className="picker-list"><div className="empty-state"><Search size={20} /><b>No connections found</b><span>{items.length ? "Try another alias, host, or service." : "Create a connection using an alias discovered from TNS_ADMIN."}</span></div></div>}
      <aside className="connection-detail">{selected ? <><div className="detail-title"><span className={`db-icon large ${selected.color}`}><Database size={20} /></span><div><strong>{selected.name || selected.id}</strong><span>{selected.user ? `${selected.user} · ` : ""}{selected.method === "basic" ? "Basic" : selected.method === "descriptor" ? "Custom descriptor" : selected.alias || selected.id}</span></div></div><EnvBadge env={selected.env} color={selected.color} />{selected.available === false && <div className="profile-notice error" role="alert">TNS source unavailable. Edit the alias source or refresh TNS sources in Settings.</div>}<div className="profile-management"><button className="button-secondary" onClick={() => onEdit(selected)} disabled={current.id === selected.id}>Edit</button><button className="button-secondary" onClick={() => onDuplicate(selected)}>Duplicate</button><button className="button-secondary" onClick={() => onTest(selected)} disabled={selected.available === false}>Test</button>{current.id === selected.id && <><button className="button-secondary" onClick={() => onReconnect(selected)}>Reconnect</button><button className="button-secondary" onClick={onDisconnect}>Disconnect</button></>}<button className="button-secondary" onClick={() => setConfirmDelete(true)} disabled={current.id === selected.id}>Delete</button></div>{current.id === selected.id && <small className="profile-hint">Disconnect before editing or deleting this profile.</small>}{confirmDelete && <div className="profile-notice error">Delete {selected.name || selected.id}?<button className="button-secondary" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="button-secondary" onClick={() => { onDelete(selected); setConfirmDelete(false); }}>Delete profile</button></div>}{managementError && <div className="profile-notice error" role="alert">{managementError}</div>}<div className="detail-fields"><div><span>HOST</span><b>{selected.host}</b></div><div><span>PORT</span><b>{selected.port}</b></div><div><span>{selected.targetType === "sid" ? "SID" : "SERVICE NAME"}</span><b>{selected.service || "See descriptor"}</b></div>{(!selected.method || selected.method === "tns") && <div><span>CONFIG SOURCE</span><b className="source-path">{selected.source}</b></div>}{selected.method === "descriptor" && <div><span>DESCRIPTOR</span><b className="source-path">{selected.descriptor}</b></div>}</div><label className="connection-group-control"><span>USER GROUP</span><select value={groupChoice} onChange={(event) => { const value = event.target.value; setGroupChoice(value); if (value !== "__new__") onSetGroup(selected.id, value === "__auto__" ? null : value === "__none__" ? "" : value); }}><option value="__auto__">Environment default</option><option value="__none__">No group</option>{groups.map((group) => <option key={group} value={group}>{group}</option>)}<option value="__new__">Create a group…</option></select></label>{groupChoice === "__new__" && <form className="new-group-form" onSubmit={(event) => { event.preventDefault(); const value = newGroup.trim(); if (value) { onSetGroup(selected.id, value); setGroupChoice(value); setNewGroup(""); } }}><input autoFocus maxLength={80} value={newGroup} onChange={(event) => setNewGroup(event.target.value)} placeholder="e.g. Analytics" aria-label="New connection group" /><button className="button-primary" disabled={!newGroup.trim()}>Add</button></form>}<div className="secure-note"><ShieldCheck size={15} /><span>Credentials are encrypted on this device.</span></div>{selected.duplicate && <div className="auth-error duplicate-warning">This alias exists in multiple TNS files. This profile uses the source shown above.</div>}</> : <div className="detail-empty">Select a connection to view its details.</div>}</aside>
    </div><footer className="modal-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate <kbd>↵</kbd> Connect</span><div><button className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary" disabled={!selected || selected.available === false || selected.id === current.id} onClick={() => selected && onConnect(selected)}><Zap size={14} /> Connect</button></div></footer>
  </section></ModalBackdrop>;
}

function ConnectionAuthDialog({ profile, connecting, error, onClose, onConnect }) {
  const dialogRef = useRef(null); useDialogFocus(dialogRef, () => !connecting && onClose());
  const [user, setUser] = useState(profile.user || profile.savedUser || "");
  const [useSavedPassword, setUseSavedPassword] = useState(Boolean(profile.hasSavedCredentials));
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(Boolean(profile.hasSavedCredentials));
  return <ModalBackdrop onClose={onClose}><form ref={dialogRef} role="dialog" aria-modal="true" aria-label={profile.testOnly ? "Test connection" : "Connect to Oracle"} className="connection-modal auth-modal" onSubmit={(event) => { event.preventDefault(); onConnect({ user, password, remember }); }}><header className="modal-header"><div><div className="eyebrow">ORACLE AUTHENTICATION</div><h2>{profile.testOnly ? "Test" : "Connect to"} {profile.name || profile.id}</h2><p>{connecting ? "Opening Oracle session…" : `${profile.host}:${profile.port}/${profile.service}`}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={17} /></button></header><div className="auth-fields"><label>Username<input autoFocus autoComplete="username" readOnly={Boolean(profile.user)} value={user} onChange={(event) => setUser(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" value={useSavedPassword ? "••••••••" : password} onFocus={(event) => { if (useSavedPassword) event.target.select(); }} onChange={(event) => { setUseSavedPassword(false); setPassword(event.target.value); }} /></label><label className="remember-credentials"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Securely remember on this Windows account</label>{error && <div className={error.startsWith("Test successful") ? "profile-notice" : "auth-error"} role="status">{error}</div>}</div><footer className="modal-footer"><span><LockKeyhole size={13} /> Protected with Windows user encryption</span><div><button type="button" className="button-secondary" onClick={onClose} disabled={connecting}>Cancel</button><button className="button-primary" disabled={connecting || !user || (!password && !profile.hasSavedCredentials)}><Zap size={14} /> {connecting ? "Working…" : profile.testOnly ? "Test connection" : "Connect"}</button></div></footer></form></ModalBackdrop>;
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

function SqlResultsView({ result, editorSql, runState, executing, cancelling, filter = "", pageSize = 1000, region,language='en',onFetchMore, fetching = false, pageError = "", initialView = {}, onViewStateChange, onResultRendered,onSql, onRelated, onStreamExport, streamState, onCancelExport, onServerFilter, onExportColumns, onLookup, onClearFilter, onChildren, onSourceDefinition,sourceDefinition,onCloseSourceDefinition, onUpdateDraft,onGenerateSql,onMetadata,onPin,onExplain,memoryItems=[],onReleaseResult,onExportInsert }) {
  const [page, setPage] = useState(initialView.page || 0), [requestedPage, setRequestedPage] = useState(null);
  const [sortColumn, setSortColumn] = useState(initialView.sortColumn ?? -1);
  const [sortDirection, setSortDirection] = useState(initialView.sortDirection || "asc");
  const [rowOrder, setRowOrder] = useState(initialView.rowOrder || []);
  const [options, setOptions] = useState(initialView.options || {}), [hasSelection,setHasSelection]=useState(false),[selectedColumn,setSelectedColumn]=useState(null),[layouts,setLayouts]=useState(initialView.layouts||{}), [gridCommand, setGridCommand] = useState(null), [loadingAll, setLoadingAll] = useState(false),[resetGeneration,setResetGeneration]=useState(0),[pivotPanelOpen,setPivotPanelOpen]=useState(false);
  useEffect(() => { if (!pivotPanelOpen) return; const closeOnEscape = event => { if (event.key !== 'Escape' || document.querySelector('.result-hover-popover-anchor, [role="dialog"]')) return; event.preventDefault(); event.stopPropagation(); setPivotPanelOpen(false); document.querySelector('.results-toolbar button[aria-label="Pivot options"]')?.focus(); }; document.addEventListener('keydown', closeOnEscape, true); return () => document.removeEventListener('keydown', closeOnEscape, true); }, [pivotPanelOpen]);
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
  const toggleSort = (columnIndex, additive = false) => {
    if(additive) {
      const sorts=viewOptions.sorts?.length?viewOptions.sorts:display.sortColumn>=0?[{column:display.sortColumn,direction:display.sortDirection}]:[];
      const existing=sorts.find(item=>item.column===columnIndex);
      changeViewOptions({ ...viewOptions, sorts:existing?sorts.map(item=>item.column===columnIndex?{...item,direction:item.direction==='asc'?'desc':'asc'}:item):[...sorts,{column:columnIndex,direction:'asc'}] });
      setViewSort(-1, 'asc'); if(viewMode==='source')setRowOrder([]); return;
    }
    changeViewOptions({ ...viewOptions, sorts: [] });
    if(viewMode==='source')setRowOrder([]);
    setViewSort(columnIndex, display.sortColumn === columnIndex && display.sortDirection === 'asc' ? 'desc' : 'asc');
    setPage(0);
  };
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize)), safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(() => visibleRows.slice(safePage * pageSize, (safePage + 1) * pageSize), [visibleRows, safePage, pageSize]);
  const firstVisible = visibleRows.length ? safePage * pageSize + 1 : 0, lastVisible = Math.min((safePage + 1) * pageSize, visibleRows.length);
  const exportView = { columns: viewColumns, rows: visibleRows.map(item => item.row), visibleColumns: displayedColumnIndices(viewColumns, columnLayout, viewOptions), settings: viewOptions.exportSettings || {} };
  const toolbar=<ResultToolbar initialDefaults={result?.defaultOptions||{}} pivotPanelOpen={pivotPanelOpen} onTogglePivotPanel={()=>setPivotPanelOpen(open=>!open)} viewKind={viewMode} columns={viewColumns} sourceColumns={columns} loadedRows={display.rawRows} columnLayout={columnLayout} sortColumn={display.sortColumn} selectedColumn={selectedColumn} memoryItems={memoryItems} onReleaseResult={onReleaseResult} onCommand={command} onClearSort={()=>{setViewSort(-1,'asc');if(viewMode==='source')setRowOrder([])}} onOptionsChange={changeViewOptions} onLayoutChange={layout=>command({type:'layoutApply',layout})} onExport={(format,indices,overrideOptions)=>onExportColumns?.(format,indices,overrideOptions,exportView)} onExportInsert={viewMode==='source'?onExportInsert:undefined} onGenerateSql={onGenerateSql} onMetadata={onMetadata} onLookup={onLookup} onFetchMore={onFetchMore} onLoadAll={()=>setLoadingAll(true)} onStopLoad={()=>setLoadingAll(false)} loadingAll={loadingAll} onStreamExport={viewMode==='source'?onStreamExport:undefined} streamState={streamState} onServerFilter={viewMode==='source'?onServerFilter:undefined} hasData={Boolean(result?.columns?.length&&!result?.released)} hasExecution={Boolean(result?.executedSql)} hasSelection={hasSelection} hasMore={result?.hasMore} busy={executing||fetching} options={viewOptions} onAction={action=>{
    if(action==='find')command({type:'find'});else if(action==='copy')command({type:'copyTsv'});else if(action==='inspect')command({type:'inspect'});else if(action==='details')command({type:'details'});else if(action==='execution')command({type:'execution'});else if(action==='marks')command({type:'marks'});else if(action==='pin')onPin?.();else if(action==='explain')onExplain?.();else if(action==='clear')resetResultView();
  }}/>;
  let body;
  if (executing) body=<div className="output-empty"><div className="output-icon"><Activity size={18} /></div><b>{t(cancelling ? "Cancelling query…" : "Running query…",language)}</b><span>{runState}</span></div>;
  else if (!result) body=<div className="output-empty"><div className="output-icon"><Database size={18} /></div><b>{t('No query results yet',language)}</b><span>{t('Run a statement against an Oracle connection.',language)}</span></div>;
  else if (result.released) body=<div className="output-empty"><b>{t('Result data released',language)}</b><span>{t('Run the SELECT again to load records.',language)}</span></div>;
  else if (!result.columns?.length) body=<div className="output-empty"><div className="output-icon"><Check size={18} /></div><b>{result.rowsAffected ?? 0} {t('rows affected',language)}</b><span>{result.transactionPending ? t("Pending transaction · commit or rollback when ready.",language) : t("Statement completed.",language)} · {result.elapsedMs} ms</span></div>;
  else body=<>{(materialized.error||display.error)&&<div className="result-warnings" role="alert">{materialized.error||display.error}</div>}{streamState?.busy&&<div className="result-stream-status" role="status">{streamState.message}<button onClick={onCancelExport}>{language==='tr'?'Dışa aktarmayı iptal et':'Cancel export'}</button></div>}<div className="result-presentation-layout"><ResultsPresentation language={language} pivotPanelOpen={pivotPanelOpen} onClosePivotPanel={()=>setPivotPanelOpen(false)} pivotPanel={<PivotOptionsPanel columns={columns} options={viewOptions} onChange={changeViewOptions} onClose={()=>setPivotPanelOpen(false)}/>} viewKind={viewMode} sourceRowCount={rows.length} onSourceDefinition={onSourceDefinition} sourceDefinition={sourceDefinition} onCloseSourceDefinition={onCloseSourceDefinition} executionDetails={result} onUpdateDraft={onUpdateDraft} rows={pageRows} allRows={visibleRows} onChildren={onChildren} columns={viewColumns} sortColumn={display.sortColumn} sortDirection={display.sortDirection} onSort={toggleSort} onReorder={viewMode==='source'?reorderRow:undefined} options={{...viewOptions,cursorUnavailable:result.cursorUnavailable,truncated:result.truncated}} onOptionsChange={changeViewOptions} onSelectionChange={handleSelectionChange} onLayoutChange={handleLayoutChange} onTools={openTools} command={gridCommand} onSql={onSql} onRelated={onRelated} onInspect={setPreviewCell} />{pivotPanelOpen&&viewOptions.transpose&&<TransposePivotInspector columns={columns} options={viewOptions} onChange={changeViewOptions} onClose={()=>setPivotPanelOpen(false)}/>}</div><div className="result-footer"><div><span className="success-state"><Check size={12} /> {firstVisible}–{lastVisible} {t('displayed',language)}</span><span className="foot-separator">·</span><span>{rows.length} {t(result.hasMore ? 'loaded · more available' : result.cursorUnavailable ? 'retained rows' : 'total rows',language)}{filter.trim() || viewOptions.filters?.length || viewOptions.markedOnly || viewOptions.duplicatesOnly ? ` · ${visibleRows.length} ${t('match',language)}` : ""}</span></div><div className="result-page-controls">{result.executedAt && <span className="result-context" title={result.executedSql}>{result.executedProfile} · {new Date(result.executedAt).toLocaleTimeString(region||undefined)} · {result.editorSnapshot !== editorSql ? (language==='tr'?'SQL çalıştırmadan sonra değişti':'SQL changed since execution') : (language==='tr'?'Son çalıştırma':'Last execution')}</span>}<span role="status">{fetching ? t("Loading page…",language) : pageError || `${t('Database',language)} ${result.elapsedMs} ms`}</span>{result.clientTiming?.totalMs!=null&&<span className="result-client-timing" title={language==='tr'?'Sorgu isteğinden son çizime kadar geçen süre':'From query request until the result finished rendering'}>{t('End-to-end',language)} {Math.round(result.clientTiming.totalMs)} ms</span>}{pageError && result.hasMore && <button className="button-secondary" onClick={onFetchMore}>{t('Retry',language)}</button>}{(pageCount > 1 || result.hasMore) && <><button className="pager-button" aria-label={t('Previous result page',language)} title={t('Previous page',language)} disabled={safePage === 0 || fetching} onClick={() => setPage(safePage - 1)}><ChevronRight size={12} className="flip" /></button><span className="result-page-number">{safePage + 1} / {pageCount}{result.hasMore ? "+" : ""}</span><button className="pager-button" aria-label={t('Next result page',language)} title={t('Next page',language)} disabled={fetching || (safePage >= pageCount - 1 && !result.hasMore)} onClick={() => { const next = safePage + 1; if (next < pageCount) setPage(next); else { setRequestedPage(next); onFetchMore?.(); } }}><ChevronRight size={12} /></button></>}</div></div></>;
  return <>{toolbar}<div className="result-view-content">{body}</div><ResultRenderMeasurement result={result} onMeasured={onResultRendered}/>{previewCell&&<ResultValueDialog cell={previewCell} onClose={()=>setPreviewCell(null)}/>}</>;
}
function getBindNames(sql) {
  return getOracleBindNames(sql);
}

export function App() {
  const [monaco, setMonaco] = useState(null);
  const [settings,setSettings]=useState(()=>loadSettings(localStorage)),[settingsError,setSettingsError]=useState('');
  const settingsRef=useRef(settings);settingsRef.current=settings;
  useEffect(()=>{try{saveSettings(localStorage,settings);setSettingsError('')}catch{setSettingsError('Settings could not be saved on this device.')}},[settings]);
  const [workspaceDevMode,setWorkspaceDevMode]=useState(null),[workspaceDev,setWorkspaceDev]=useState({});
  const workspaceDevRequestsRef=useRef(new Map());
  const [connectionDiagnostics,setConnectionDiagnostics]=useState(null);
  const [objectAnalysis,setObjectAnalysis]=useState(null);
  const objectAnalysisRequestRef=useRef(null);
  const [scriptDialog,setScriptDialog]=useState(null);
  const scriptRunsRef=useRef(new Map());
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
  const [profileEditor, setProfileEditor] = useState(null), [showTnsSources, setShowTnsSources] = useState(false), [managementError, setManagementError] = useState("");
  const authTestRequestRef = useRef(null);
  const pendingConnectionsRef = useRef(new Map());

  const [definition,setDefinition]=useState(null),[resultSetSearch,setResultSetSearch]=useState(''),[renameResult,setRenameResult]=useState(null),[newResultName,setNewResultName]=useState('');
  const [keyLookup,setKeyLookup]=useState(null),[keyValues,setKeyValues]=useState({});
  const [showPicker, setShowPicker] = useState(false), [authProfile, setAuthProfile] = useState(null);
  const [pendingSwitch, setPendingSwitch] = useState(null), [showAppearance, setShowAppearance] = useState(false), [showHistory, setShowHistory] = useState(false), [showSearch, setShowSearch] = useState(false), [showSnippets, setShowSnippets] = useState(false), [snippetFilter, setSnippetFilter] = useState(""), [selectedSnippetTrigger, setSelectedSnippetTrigger] = useState("sel"), [snippetFormOpen, setSnippetFormOpen] = useState(false), [snippetError, setSnippetError] = useState(""), [snippetDraft, setSnippetDraft] = useState({ trigger: "", label: "", detail: "", text: "SELECT ${1:column_name}\nFROM ${2:table_name};" }), [customSqlSnippets, setCustomSqlSnippets] = useState(loadCustomSqlSnippets);
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
  const [connectionGroups, setConnectionGroups] = useState(() => { try { return JSON.parse(localStorage.getItem("fbsdb.connectionGroups") || "{}"); } catch { return {}; } });
  const [explorerQuery, setExplorerQuery] = useState(""), [explorerTab, setExplorerTab] = useState("All"), [groupFilter, setGroupFilter] = useState("All groups"), [schemaQuery, setSchemaQuery] = useState(""), [schemaTypeFilter, setSchemaTypeFilter] = useState("All"), [schemaOwnerFilter, setSchemaOwnerFilter] = useState("All"), [objectScope, setObjectScope] = useState("All"), [objectFavorites, setObjectFavorites] = useState(() => { try { return JSON.parse(localStorage.getItem("fbsdb.objectFavorites") || "[]"); } catch { return []; } }), [recentObjects, setRecentObjects] = useState(() => { try { return JSON.parse(localStorage.getItem("fbsdb.recentObjects") || "[]"); } catch { return []; } }), [activeObject, setActiveObject] = useState("");
  const [resultSearchOpen, setResultSearchOpen] = useState(false);
  const [fileConnectionProfileId, setFileConnectionProfileId] = useState(null);
  function setMaxRows(value){updateTabSession("pageSizePreference",value);}
  const [tabs, setTabs] = useState(() => [{ id: "tab-1", name: isNativeHost ? "Untitled.sql" : "monthly-invoices.sql", path: null, content: isNativeHost ? "" : initialSql, dirty: false }]), [activeTabId, setActiveTabId] = useState("tab-1");
  const [sql, setSql] = useState(isNativeHost ? "" : initialSql), [fileName, setFileName] = useState(isNativeHost ? "Untitled.sql" : "monthly-invoices.sql"), [filePath, setFilePath] = useState(null), [fileDirty, setFileDirty] = useState(false), [pendingFileAction, setPendingFileAction] = useState(null);
  const [pendingTabClose, setPendingTabClose] = useState(null);
  const pendingTabCloseRef = useRef(null); pendingTabCloseRef.current = pendingTabClose;
  const tabCloseActionsRef = useRef(new Map());
  const [pendingBindSql, setPendingBindSql] = useState(null), [copiedResults, setCopiedResults] = useState(false);
  const [tabSessions, setTabSessions] = useState({});
  const replyOwnerRef = useRef(null);
  const tabSession = tabSessions[activeTabId] || {};
  setNativeTabId(activeTabId);
  function updateTabSession(key, value, owner = replyOwnerRef.current || activeTabIdRef.current) {
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
  const runState = tabSession.runState ?? "Ready";
  const allProblems = tabs.flatMap(tab => [...(tabSessions[tab.id]?.lintProblems || []), ...(tabSessions[tab.id]?.compilationProblems || []), ...(tabSessions[tab.id]?.runtimeProblems || [])]);
  const activeProblems = allProblems.filter(problem => problem.tabId === activeTabId);
  const problemsRef = useRef(allProblems), problemCursorRef = useRef(-1); problemsRef.current = allProblems;
  const setRunState = (value, owner) => updateTabSession("runState", value, owner);
  const schemaObjects = tabSession.schemaObjects ?? EMPTY_SCHEMA_OBJECTS;
  const setSchemaObjects = (value, owner) => updateTabSession("schemaObjects", value, owner);
  const schemaOwner = tabSession.schemaOwner ?? "";
  const setSchemaOwner = (value, owner) => updateTabSession("schemaOwner", value, owner);
  const schemaLoading = tabSession.schemaLoading ?? false;
  const setSchemaLoading = (value, owner) => updateTabSession("schemaLoading", value, owner);
  const schemaError = tabSession.schemaError ?? "";
  const setSchemaError = (value, owner) => updateTabSession("schemaError", value, owner);
  const tabsRef = useRef(tabs); tabsRef.current = tabs;
  const sessionsRef = useRef(tabSessions); sessionsRef.current = tabSessions;
  const activeFileSnapshotRef = useRef(null);
  activeFileSnapshotRef.current = { id: activeTabId, name: fileName, path: filePath, content: sql, dirty: fileDirty, connectionProfileId: fileConnectionProfileId };
  const [tabResults, setTabResults] = useState({});
  const tabResultsRef=useRef(tabResults);tabResultsRef.current=tabResults;
  const closedTabsRef = useRef(new Set());
  const resultOwnerRef = useRef(null), requestOwnersRef = useRef(new Map());
  const view = tabResults[activeTabId] || {};
  const queryResult = (view.selectedResultKey ? (view.resultSets || []).find(item=>item.key===view.selectedResultKey)?.result : view.queryResult) || null, explainResult = view.explainResult || null, explainMessage = view.explainMessage || "", outputMessage = view.outputMessage || "", resultTab = view.resultTab || "Results", resultFilter = view.resultFilter || "";
  function updateTabResult(key, value, owner = replyOwnerRef.current || activeTabIdRef.current) {
    if (closedTabsRef.current.has(owner)) return;
    setTabResults(current => { const previous = current[owner] || {}; return { ...current, [owner]: { ...previous, [key]: typeof value === "function" ? value(previous[key]) : value } }; });
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
  const setPageError = (value, owner) => updateTabResult("pageError", value, owner);
  const pageRequestsRef = useRef(new Map());
  const pageRequestRef = useMemo(() => ({
    get current() { return pageRequestsRef.current.get(replyOwnerRef.current || activeTabIdRef.current) || null; },
    set current(value) { const id = replyOwnerRef.current || activeTabIdRef.current; if (value) pageRequestsRef.current.set(id, value); else pageRequestsRef.current.delete(id); },
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
  const resultExecutionMeta = useRef(new Map());
  const sqlResult = resultTab === "Explain" ? explainResult : queryResult;
  const panelMessage = resultTab === "Explain" ? explainMessage : outputMessage;
  useEffect(()=>{
    const save=event=>{if(settingsRef.current.readOnly){setSettingsError('Settings belong to a newer app version.');return;}setSettings(current=>saveResultDefaults(current,event.detail||{}))};
    const reset=()=>{if(settingsRef.current.readOnly){setSettingsError('Settings belong to a newer app version.');return;}setSettings(current=>Object.keys(settingDefinitions).filter(id=>id.startsWith('results.')||id.startsWith('export.')).reduce((next,id)=>changeSetting(next,id,undefined),current))};
    window.addEventListener('fbsdb.results.saveDefaults',save);window.addEventListener('fbsdb.results.resetDefaults',reset);
    return()=>{window.removeEventListener('fbsdb.results.saveDefaults',save);window.removeEventListener('fbsdb.results.resetDefaults',reset)};
  },[]);
  function setSqlResult(value, owner) {
    if(value) {
      value={...value,viewIdentity:crypto.randomUUID()};
      const tabId = owner || replyOwnerRef.current || activeTabIdRef.current;
      const defaults=newResultDefaults(settingsRef.current,resultExecutionMeta.current.get(tabId)?.workspaceRoot??workspace.root,systemLocale);
      value={...value,defaultOptions:structuredClone(defaults)};
      setTabResults(current=>{const tab=current[tabId]||{};const sets=(tab.resultSets||[]).filter(item=>item.pinned);const script=scriptRunsRef.current.get(tabId);if(script?.running)sets.push({key:`script-${script.requestId}-${script.index}`,label:`Script ${script.index+1}`,pinned:true,result:value,view:{options:structuredClone(defaults)}});return {...current,[tabId]:{...tab,resultSets:sets,selectedResultKey:null,queryResult:value,queryView:{options:defaults},resultFilter:"",latestResultName:null}}});
    } else setQueryResult(value, owner);
    if (value === null) { setExplainResult(null, owner); setExplainMessage("", owner); pageRequestRef.current = null; setFetchingPage(false); setPageError(""); }
  }
  const resultRenderMeasured=useCallback(({requestId,renderMs,totalMs})=>setTabResults(current=>{
    let changed=false;const next={...current};
    for(const[tabId,tab]of Object.entries(current)){
      const update=result=>{if(result?.renderRequestId!==requestId||result.clientTiming?.totalMs!=null)return result;changed=true;return {...result,clientTiming:{...result.clientTiming,renderMs,totalMs}}};
      const queryResult=update(tab.queryResult),resultSets=(tab.resultSets||[]).map(item=>({...item,result:update(item.result)}));
      if(queryResult!==tab.queryResult||resultSets.some((item,index)=>item.result!==tab.resultSets?.[index]?.result))next[tabId]={...tab,queryResult,resultSets};
    }
    return changed?next:current;
  }),[]);
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
  const [completionError, setCompletionError] = useState("");
  const [definitionError, setDefinitionError] = useState("");
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
  const completionObjects = completionSession.schemaObjects || EMPTY_SCHEMA_OBJECTS;
  const completionSchema = completionSession.schemaOwner || "";
  const completionSettingsRef = useRef(completionSettings); completionSettingsRef.current = completionSettings;
  const autoCompletion = completionSettings.popup;
  const [codeStyle,setCodeStyle]=useState(()=>Object.fromEntries(['fontSize','tabSize','insertSpaces'].map(field=>[field,resolveSetting(settings,'editor.'+field).value])));
  const [theme,setTheme]=useState(()=>resolveSetting(settings,'ui.theme').value);
  const [allTokenColors,setAllTokenColors]=useState(()=>{const saved=resolveSetting(settings,'ui.tokenColors').value;return Object.fromEntries(Object.keys(defaultTokenColors).map(theme=>[theme,{...defaultTokenColors[theme],...saved[theme]}]))});
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
    const colors=resolveSetting(next,'ui.tokenColors').value;setAllTokenColors(Object.fromEntries(Object.keys(defaultTokenColors).map(theme=>[theme,{...defaultTokenColors[theme],...colors[theme]}])));
  }
  const tokenColors = allTokenColors[theme] || defaultTokenColors[theme], themeConfig = themePresets[theme];
  const allSqlSnippets = useMemo(() => [...sqlSnippets, ...customSqlSnippets], [customSqlSnippets]);
  const visibleSchemaObjects = useMemo(() => { const query = schemaQuery.trim().toLowerCase(); return schemaObjects.filter((item) => (objectScope !== "Favorites" || objectFavorites.includes(oracleSchemaKey(item))) && (objectScope !== "Recent" || recentObjects.includes(oracleSchemaKey(item))) && (schemaOwnerFilter === "All" || (item.owner || schemaOwner) === schemaOwnerFilter) && (schemaTypeFilter === "All" || item.type === schemaTypeFilter) && (!query || `${item.name} ${item.owner} ${item.type} ${oracleObjectLabel(item.type)} ${item.targetOwner || ""} ${item.targetName || ""} ${item.dbLink || ""} ${(item.columns || []).map(column => `${column.name} ${column.type} ${column.comment || ""}`).join(" ")}`.toLowerCase().includes(query))); }, [schemaObjects, schemaQuery, schemaTypeFilter, schemaOwnerFilter, schemaOwner, objectScope, objectFavorites, recentObjects]);
  const schemaLookup = useMemo(() => makeOracleRelationLookup(schemaObjects, schemaOwner), [schemaObjects, schemaOwner]);
  const schemaNameSet = useMemo(() => new Set(schemaLookup.keys()), [schemaLookup]);
  const connectionGroupNames = useMemo(() => [...new Set(dbConnections.map((item) => item.group).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [dbConnections]);
  const filteredConnections = useMemo(() => dbConnections.filter((item) => {
    const query = explorerQuery.toLowerCase().trim();
    const searchable = `${item.name || item.id} ${item.alias || ""} ${item.user || ""} ${item.env} ${item.host} ${item.service} ${item.title}`.toLowerCase();
    return searchable.includes(query) && (explorerTab === "Recent" ? recentProfiles.includes(item.id) : explorerTab === "Favorites" ? favorites.includes(item.id) : true) && (groupFilter === "All groups" || item.group === groupFilter);
  }), [dbConnections, explorerQuery, explorerTab, favorites, groupFilter, recentProfiles]);
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
  const dbConnectionsRef = useRef(dbConnections), activeConnectionRef = useRef(activeConnection), authProfileRef = useRef(authProfile), pendingSwitchRef = useRef(pendingSwitch), transactionPendingRef = useRef(transactionPending), schemaLookupRef = useRef(schemaLookup), schemaReadyRef = useRef(false), schemaRequestedRef = useRef(new Set()), schemaLoadedRef = useRef(new Set()), sqlRef = useRef(sql), monacoRef = useRef(monaco), saveContinuationRef = useRef(null), activeTabIdRef = useRef(activeTabId), pendingHistoryRef = useRef(new Map()), searchRequestRef = useRef(null), searchTimerRef = useRef(null), pendingSearchPositionRef = useRef(null);
  dbConnectionsRef.current = dbConnections; activeConnectionRef.current = activeConnection; authProfileRef.current = authProfile; pendingSwitchRef.current = pendingSwitch; transactionPendingRef.current = transactionPending; schemaLookupRef.current = schemaLookup; sqlRef.current = sql; monacoRef.current = monaco;

  function queueSchemaForSql(text) {
    if (schemaWarmupRef.current) { clearTimeout(schemaWarmupRef.current.timer); schemaWarmupRef.current.cancel(); }
    if (!isNativeHost || !schemaReadyRef.current || (sessionsRef.current[activeTabIdRef.current]?.executing||sessionsRef.current[activeTabIdRef.current]?.scriptRun?.running)) return;
    const owner = activeTabIdRef.current, cancellation = completionCancellation();
    const timer = setTimeout(async () => {
      const client = completionClientRef.current;
      if (!client || owner !== activeTabIdRef.current || text !== sqlRef.current || cancellation.token.isCancellationRequested) return;
      const model = editorRef.current?.getModel(), position = editorRef.current?.getPosition(), revision = client.revision;
      const analysis = await client.request('analyze', text, model && position ? model.getOffsetAt(position) : text.length, cancellation.token, { mode: 'complete' });
      if (revision !== client.revision || owner !== activeTabIdRef.current || cancellation.token.isCancellationRequested) return;
      await Promise.all((analysis.targets || []).map(target => completionMetadataRef.current.load(owner, target, cancellation.token)));
      if (revision === client.revision && owner === activeTabIdRef.current && !cancellation.token.isCancellationRequested) client.metadata(completionMetadataRef.current.objects(owner), completionMetadataRef.current.systemObjects(owner), completionMetadataRef.current.version(owner));
    }, 200);
    schemaWarmupRef.current = { ...cancellation, timer };
  }

  function finishHistoryEntry(status, detail) {
    const owner = replyOwnerRef.current || activeTabIdRef.current;
    const id = pendingHistoryRef.current.get(owner);
    if (!id) return;
    setQueryHistory((current) => current.map((entry) => entry.id === id ? { ...entry, status, detail } : entry));
    pendingHistoryRef.current.delete(owner);
  }

  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchRequestRef.current = null;
    const query = searchQuery.trim();
    if (!showSearch || !isNativeHost || query.length < 2) { setSearchMatches([]); setSearching(false); setSearchTruncated(false); return; }
    setSearching(true);
    searchTimerRef.current = setTimeout(() => { searchRequestRef.current = sendNativeCommand("workspace.search", { query }); }, 250);
    return () => clearTimeout(searchTimerRef.current);
  }, [showSearch, searchQuery, workspace.root]);

  useEffect(() => {
    const unsubscribe = subscribeNativeMessages((message) => {
      const owner = message?.tabId || requestOwnersRef.current.get(message?.requestId) || activeTabIdRef.current;
      replyOwnerRef.current = owner;
      try {
      if(['workspace.git','workspace.gitDiff','workspace.replacePreview','workspace.replaceApply'].includes(message?.type)) {
        if(workspaceDevRequestsRef.current.get(message.type)!==message.requestId)return;
        workspaceDevRequestsRef.current.delete(message.type);
        setWorkspaceDev(current=>({...current,busy:false,error:message.error||'',...(message.state?{git:message.state}:{}),...(message.diff?{diff:message.diff}:{}),...(message.preview?{preview:message.preview,applied:null}:{}),...(message.result?{applied:message.result,preview:null}:{} )}));
        if(message.type==='workspace.replaceApply'&&message.result){
          const changed=new Map(message.result.applied.map(file=>[file.path.toLowerCase(),file.content]));
          setTabs(current=>current.map(tab=>{const active=tab.id===activeTabIdRef.current,dirty=active?activeFileSnapshotRef.current?.dirty:tab.dirty,content=tab.path?changed.get(tab.path.toLowerCase()):undefined;return !dirty&&content!==undefined?{...tab,content}:tab}));
          const active=activeFileSnapshotRef.current,content=active?.path?changed.get(active.path.toLowerCase()):undefined;if(!active?.dirty&&content!==undefined){sqlRef.current=content;setSql(content)}
          refreshWorkspaceGit();
        }
        return;
      }
      if(message?.type==='connection.managed'&&message.diagnostics)setConnectionDiagnostics(message.diagnostics);
      if (completionMetadataRef.current?.handle(message)) return;
      if(message?.type==='sql.stage') {const run=scriptRunsRef.current.get(owner);if(requestOwnersRef.current.has(message.requestId)||run?.running&&run.requestId===message.requestId&&run.index===message.scriptIndex){updateTabSession('sqlStage',message.stage,owner);updateTabSession('operationStartedAt',Date.now(),owner)}return;}
      if(message?.type==='analysis.state') {updateTabSession('analysisReadOnly',Boolean(message.enabled),owner);setTransactionPending(Boolean(message.transactionPending),owner);setRunState(message.enabled?'Read-only consistent analysis active':'Read-only analysis ended',owner);return;}
      if(message?.type==='sql.runtimePlan') {setExecuting(false,owner);setCancelling(false,owner);if(message.error)setExplainMessage(message.error,owner);else{setExplainResult({...message,planKind:'runtime'},owner);setExplainMessage('',owner)}setResultTab('Explain',owner);return;}
      if(message?.type?.startsWith('script.')) {
        const previous=scriptRunsRef.current.get(owner)||{steps:[]};
        const run={...previous,steps:[...(previous.steps||[])]};
        if(message.type==='script.started'){run.started=true;run.running=true;run.requestId=message.requestId;run.steps=[];run.completed=0;run.failed=0;}
        if(message.type==='script.step'){
          run.steps[message.index]={...run.steps[message.index],...message};
          if(message.status==='Running'){
            run.index=message.index;updateTabSession('sqlStage','Executing script statement',owner);updateTabSession('operationStartedAt',Date.now(),owner);
            const context=resultExecutionMeta.current.get(owner)||{};
            resultExecutionMeta.current.set(owner,{...context,statementOffset:message.offset,executedSql:message.sql,executedAt:new Date().toISOString(),requestStartedAtPerf:performance.now(),executedParameters:(run.parameters||[]).filter(parameter=>getBindNames(message.sql).includes(parameter.name))});
            setExecuting(true,owner);setCancelling(false,owner);
          }
        }
        if(message.type==='script.completed'){Object.assign(run,message,{running:false});setExecuting(false,owner);setCancelling(false,owner);setTransactionPending(Boolean(message.transactionPending),owner);}
        scriptRunsRef.current.set(owner,run);updateTabSession('scriptRun',run,owner);return;
      }
      if(message?.type==='host.error'&&scriptRunsRef.current.get(owner)?.running){const run=scriptRunsRef.current.get(owner),index=run.index;run.steps[index]={...run.steps[index],error:message.message};if(!run.started){run.running=false;updateTabSession('scriptRun',{...run},owner)}}

      if (message?.type === "completion.vocabulary") {
        if (sessionsRef.current[owner]?.activeConnection?.id === message.profileId) updateTabSession("oracleVocabulary", { version: message.version, words: message.words || [], error: message.error }, owner);
        return;
      }
      if (message?.type?.startsWith("schema.") && owner !== activeTabIdRef.current) {
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
        const cached = tabsRef.current.find(tab => message.path && pathKey(tab.path) === pathKey(message.path));
        if (cached) { activateTab(cached.id); return; }
        syncActiveTab();
        const path = message.path ?? null, id = `file:${crypto.randomUUID()}`;
        sqlRef.current = message.content ?? ""; activeTabIdRef.current = id; setNativeTabId(id); setActiveTabId(id); setTabs((current) => { const existing = current.find((tab) => tab.id === id); const opened = { id, name: message.fileName ?? "query.sql", path, content: sqlRef.current, dirty: false, connectionProfileId: message.profileId ?? null }; return existing ? current.map((tab) => tab.id === id ? { ...tab, ...opened } : tab) : [...current, opened]; });
        setSql(sqlRef.current); setFileName(message.fileName ?? "query.sql"); setFilePath(path); setFileDirty(false); setFileConnectionProfileId(message.profileId ?? null); sendNativeCommand("file.activate", { path, tabId: id });
        const searchPosition = pendingSearchPositionRef.current;
        if (searchPosition && path?.toLowerCase() === searchPosition.path.toLowerCase()) { pendingSearchPositionRef.current = null; requestAnimationFrame(() => { editorRef.current?.setPosition({ lineNumber: searchPosition.lineNumber, column: 1 }); editorRef.current?.revealLineInCenter(searchPosition.lineNumber); editorRef.current?.focus(); }); }
        if (!message.profileId || message.profileId.toLowerCase() === (tabSessions[id]?.activeConnection?.id || "").toLowerCase()) queueSchemaForSql(sqlRef.current);
        if (message.profileId) { const profile = dbConnectionsRef.current.find((item) => item.id.toLowerCase() === message.profileId.toLowerCase()); if (profile && profile.id.toLowerCase() !== (tabSessions[id]?.activeConnection?.id || "").toLowerCase()) { setTimeout(() => beginConnection({ ...profile, tabId: id }), 0); } }
      } else if (message?.type === "file.saved") {
        const path = message.path ?? null;
        setTabs(current => current.map(tab => tab.id === owner ? { ...tab, path, name: message.fileName || tab.name, dirty: false, connectionProfileId: message.profileId ?? tab.connectionProfileId } : tab));
        if (owner === activeTabIdRef.current) { setFilePath(path); setFileName(message.fileName || "query.sql"); setFileDirty(false); setFileConnectionProfileId(message.profileId ?? null); }
        setRunState(`Saved ${message.fileName || "SQL file"}`);
        const continuation = saveContinuationRef.current; saveContinuationRef.current = null; continuation?.();
      } else if (message?.type === "file.connectionBound") { const profileId = message.profileId ?? null; setFileConnectionProfileId(profileId); setTabs((current) => current.map((tab) => tab.id === activeTabIdRef.current ? { ...tab, connectionProfileId: profileId } : tab)); setRunState(`${profileId} linked to ${fileName}`);
      } else if (message?.type === "file.saveCancelled") {
        saveContinuationRef.current = null;
      } else if (message?.type === "workspace.state") {
        setWorkspace({ root: message.root ?? null, name: message.name ?? "No workspace", files: message.files ?? [], entries: message.entries ?? [], recent: message.recent ?? [] });
      } else if (message?.type === "workspace.error") {
        setRunState(message.message || 'Workspace operation failed');
      } else if (message?.type === "workspace.changed") {
        if (message.source && message.destination) {
          const remap = path => remapWorkspacePath(path, message.source, message.destination);
          setTabs(current => current.map(tab => { const path = remap(tab.path); return path !== tab.path ? { ...tab, path, name: path.split(/[\\/]/).at(-1) } : tab; }));
          const path = remap(activeFileSnapshotRef.current.path);
          if (path !== activeFileSnapshotRef.current.path) { setFilePath(path); setFileName(path.split(/[\\/]/).at(-1)); }
        }
        if (message.entry && !message.entry.isDirectory) openWorkspaceFile(message.entry);
      } else if (message?.type === "workspace.searchResults") {
        if (message.requestId !== searchRequestRef.current) return;
        setSearchMatches(message.results ?? []); setSearchTruncated(Boolean(message.truncated)); setSearching(false);
      } else if (message?.type === "connection.profiles") {
        const profiles = (message.profiles ?? []).map((profile) => ({ ...profile, title: profile.name || profile.id, group: Object.hasOwn(connectionGroups, profile.id) ? connectionGroups[profile.id] : (profile.group || (profile.env === "PROD" ? "Production" : ["UAT", "TEST"].includes(profile.env) ? "Testing" : profile.env === "DEV" ? "Development" : "")), color: profile.env === "PROD" ? "rose" : profile.env === "UAT" ? "amber" : profile.env === "TEST" ? "blue" : profile.env === "DEV" ? "mint" : "neutral", recent: recentProfiles.includes(profile.id), favorite: favorites.includes(profile.id) }));
        dbConnectionsRef.current = profiles; setDbConnections(profiles); setTnsAliases(message.aliases ?? []);
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
        const profile = dbConnectionsRef.current.find((item) => item.id === message.profile?.id);
        if (profile) { if (owner === activeTabIdRef.current) { activeConnectionRef.current = profile; setFileConnectionProfileId(profile.id); } setActiveConnection(profile); setTabs(current => current.map(tab => tab.id === owner ? { ...tab, connectionProfileId: profile.id } : tab)); }
        if (authProfileRef.current?.tabId === owner) setAuthProfile(null); setConnecting(false); setConnectionError(""); setQueryResult(current => current ? { ...current, hasMore: false, cursorUnavailable:current.hasMore } : current); updateTabResult("resultSets",sets=>(sets||[]).map(item=>({...item,result:{...item.result,hasMore:false,cursorUnavailable:item.result.hasMore}}))); setSchemaObjects([]); updateTabSession("schemaReady", false); setTransactionPending(false);
        if (owner === activeTabIdRef.current) { schemaReadyRef.current = false; schemaLookupRef.current = new Map(); schemaRequestedRef.current.clear(); schemaLoadedRef.current.clear(); }
        setRunState(`Connected to ${message.profile?.id ?? "Oracle"}`);
        if (message.profile?.id) setRecentProfiles((current) => [message.profile.id, ...current.filter((id) => id !== message.profile.id)].slice(0, 20));
      } else if (message?.type === "connection.inactive" || message?.type === "connection.resumed") {
        updateTabSession("inactive", message.type === "connection.inactive", owner);
        if (message.type === "connection.inactive") {
          setQueryResult(current => current ? { ...current, hasMore: false, cursorUnavailable: current.hasMore } : current);
          updateTabResult("resultSets", sets => (sets || []).map(item => ({ ...item, result: { ...item.result, hasMore: false, cursorUnavailable: item.result.hasMore } })));
        }
      } else if (message?.type === "connection.disconnected") {
        updateTabSession("analysisReadOnly",false,owner);
        completionMetadataRef.current.reset(owner);
        updateTabSession("completionMetadataStatus", "Offline Oracle vocabulary; connect to load object metadata.", owner);
        updateTabSession("oracleVocabulary", null, owner);
        setQueryResult(current=>current?{...current,hasMore:false,cursorUnavailable:current.hasMore||current.cursorUnavailable}:current);
        updateTabResult('resultSets',sets=>(sets||[]).map(item=>({...item,result:{...item.result,hasMore:false,cursorUnavailable:item.result.hasMore||item.result.cursorUnavailable}})));
        if (owner === activeTabIdRef.current) activeConnectionRef.current = { id: "Disconnected" }; setSchemaOwner(""); setRunState("Disconnected"); setActiveConnection({ id: "Disconnected", title: "No active session", host: "", port: "", service: "", env: "—", color: "mint" }); if (owner === activeTabIdRef.current) schemaReadyRef.current = false; setSchemaObjects([]); updateTabSession("schemaReady", false); setTransactionPending(false);
      } else if (message?.type === "sql.page") {
        if (pageRequestRef.current?.id !== message.requestId) return;
        const owner = pageRequestRef.current.owner; pageRequestRef.current = null; setFetchingPage(false); setCancelling(false,owner); setPageError("", owner);
        setTabResults(current=>{const tab=current[owner]||{};const append=result=>result?.resultId===message.resultId&&result.rows.length===message.offset?{...result,rows:[...result.rows,...message.rows],returnedRows:result.rows.length+message.rows.length,hasMore:message.hasMore,fetchMetrics:[...(result.fetchMetrics||[]),{offset:message.offset,rows:message.rows.length,elapsedMs:message.elapsedMs,bytes:new TextEncoder().encode(JSON.stringify(message.rows)).length}]}:result;return {...current,[owner]:{...tab,queryResult:append(tab.queryResult),resultSets:(tab.resultSets||[]).map(item=>({...item,result:append(item.result)}))}}});
      } else if (message?.type === "sql.pageError") {
        if (pageRequestRef.current?.id !== message.requestId) return;
        const owner = pageRequestRef.current.owner, failedId = pageRequestRef.current.resultId; pageRequestRef.current = null; setFetchingPage(false); setCancelling(false,owner);
        setTabResults(current=>{const tab=current[owner]||{};const invalidate=result=>result?.resultId===failedId?{...result,hasMore:false,cursorUnavailable:true}:result;return {...current,[owner]:{...tab,queryResult:invalidate(tab.queryResult),resultSets:(tab.resultSets||[]).map(item=>({...item,result:invalidate(item.result)}))}}}); setPageError(message.message || "Page could not be loaded. Run the query again.", owner);
      } else if (message?.type === "result.exportProgress" || message?.type === "result.exportComplete") {
        updateTabResult('streamState',{busy:message.type==='result.exportProgress',message:message.message||`${message.rowsWritten||0} rows written`},owner);
        if(message.type==='result.exportComplete'&&message.consumed) {
          const invalidate=result=>result?.resultId===message.resultId?{...result,hasMore:false,cursorUnavailable:true}:result;
          setTabResults(current=>{const tab=current[owner]||{};return {...current,[owner]:{...tab,queryResult:invalidate(tab.queryResult),resultSets:(tab.resultSets||[]).map(item=>({...item,result:invalidate(item.result)}))}}});
        }
      } else if (message?.type === "result.columnDefinition") {
        if(sourceDefinitionRequestRef.current.get(owner)!==message.requestId){requestOwnersRef.current.delete(message.requestId);return;}
        sourceDefinitionRequestRef.current.delete(owner);
        requestOwnersRef.current.delete(message.requestId);
        setDefinition({...message.definition,tabId:owner,...(!message.definition?{message:"Source column not found"}:{})});
      } else if (message?.type === "result.primaryKey") {
        if(message.columns?.length){setKeyLookup({...message,tabId:owner});setKeyValues({})}else setRunState(message.message||'No primary key found.');
      } else if (message?.type === "result.children") {
        if(message.links?.length){setKeyLookup({links:message.links,tabId:owner});setKeyValues({})}else setRunState(message.message||'No child relationships found.');
      } else if (message?.type === "result.related") {
        if(message.sql) { const profile=sessionsRef.current[owner]?.activeConnection;newSqlFileNow(); const id=activeTabIdRef.current; sqlRef.current=message.sql; setSql(message.sql);setFileName('Related.sql');setFileDirty(true);setTabs(current=>current.map(tab=>tab.id===id?{...tab,name:'Related.sql',content:message.sql,dirty:true,connectionProfileId:profile?.id}:tab));if(profile?.id&&!['Disconnected','No connection'].includes(profile.id))beginConnection({...profile,tabId:id}); } else setRunState(message.message||'No related records metadata available');
      } else if (message?.type === "sql.result") {
        const owner = message.tabId || requestOwnersRef.current.get(message.requestId) || resultOwnerRef.current || activeTabIdRef.current; requestOwnersRef.current.delete(message.requestId);
        if (closedTabsRef.current.has(owner)) { if (message.resultId) sendNativeCommand("sql.closeResult", { resultId: message.resultId, tabId: owner }); setExecuting(false); setCancelling(false); setTransactionPending(Boolean(message.transactionPending)); finishHistoryEntry("Succeeded", "Statement completed in closed tab"); return; }
        finishHistoryEntry("Succeeded", message.rowsAffected == null ? `${message.returnedRows ?? 0} rows · ${message.elapsedMs ?? 0} ms` : `${message.rowsAffected} rows affected · ${message.elapsedMs ?? 0} ms`);
        if (/^\s*(?:CREATE|ALTER|DROP|RENAME|COMMENT|GRANT|REVOKE)\b/i.test(resultExecutionMeta.current.get(owner)?.executedSql || "")) { completionMetadataRef.current.reset(owner); sendNativeCommand("schema.refresh", { tabId: owner }); }
        if(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*ALTER\s+SESSION\b/i.test(resultExecutionMeta.current.get(owner)?.executedSql||''))sendNativeCommand('session.nls',{tabId:owner,epoch:completionMetadataRef.current.session(owner).epoch});
        const executionMeta=resultExecutionMeta.current.get(owner)||{},responseAt=performance.now(),renderRequestId=`${message.requestId||Date.now()}:${message.resultId||'statement'}`;
        setSqlResult({ ...message, ...executionMeta,renderRequestId,clientTiming:executionMeta.requestStartedAtPerf?{startedAtPerf:executionMeta.requestStartedAtPerf,responseAtPerf:responseAt,renderMs:null,totalMs:null}:undefined,fetchMetrics:[{offset:0,rows:message.rows?.length||0,elapsedMs:message.elapsedMs,bytes:new TextEncoder().encode(JSON.stringify(message.rows||[])).length}] }, owner); const output = (message.output ?? []).join("\n"); setOutputMessage(output, owner); setTransactionPending(Boolean(message.transactionPending)); setExecuting(false); setCancelling(false); setRunState(message.rowsAffected == null ? `${message.returnedRows ?? 0} rows · ${message.elapsedMs ?? 0} ms` : `${message.rowsAffected} rows affected · ${message.elapsedMs ?? 0} ms`); setResultTab(output ? "Output" : "Results", owner);
      } else if (message?.type === "sql.compilation") {
        requestOwnersRef.current.delete(message.requestId);
        if (closedTabsRef.current.has(owner)) return;
        const context = resultExecutionMeta.current.get(owner) || {}, problems = compilationProblemItems(message.compilation, context, owner);
        updateTabSession("compilationProblems", problems, owner); updateTabSession("runtimeProblems", [], owner);
        setTransactionPending(!!message.transactionPending, owner); setExecuting(false, owner); setCancelling(false, owner);
        const errors = problems.filter(problem => problem.severity === "error").length;
        const summary = message.metadataError ? `Compilation completed; diagnostics unavailable: ${message.metadataError}` : errors ? `${errors} PL/SQL compilation error${errors === 1 ? "" : "s"}` : `PL/SQL compilation completed${problems.length ? ` with ${problems.length} warning(s)` : ""}`;
        setRunState(summary, owner); setOutputMessage([...(message.output || []), summary].join("\n"), owner); setResultTab(problems.length ? "Problems" : "Output", owner);
        finishHistoryEntry(errors ? "Failed" : "Succeeded", summary);
        completionMetadataRef.current.reset(owner); sendNativeCommand("schema.refresh", { tabId: owner });
      } else if (message?.type === "sql.cancelled") {
        setTransactionPending(Boolean(message.transactionPending));
        if (message.complete) { finishHistoryEntry("Cancelled", "Query cancelled"); setExecuting(false); setCancelling(false); setRunState("Query cancelled."); }
        else { setCancelling(true); setRunState("Waiting for Oracle to stop the query…"); }
      } else if (message?.type === "sql.timeout") {
        finishHistoryEntry("Failed", message.message || "Query timed out.");
        setTransactionPending(Boolean(message.transactionPending), owner); setExecuting(false, owner); setCancelling(false, owner); setRunState(message.message || "Query timed out.", owner);
      } else if (message?.type === "sql.explainResult") {
        const owner = message.tabId || requestOwnersRef.current.get(message.requestId) || resultOwnerRef.current || activeTabIdRef.current; requestOwnersRef.current.delete(message.requestId);
        setExplainResult(message, owner); setExplainMessage("", owner); setExecuting(false); setCancelling(false); setRunState(`Execution plan · ${message.returnedRows ?? 0} steps · ${message.elapsedMs ?? 0} ms`);
      } else if (message?.type === "transaction.state") {
        if(!message.pending)updateTabSession("analysisReadOnly",false,owner); setTransactionPending(Boolean(message.pending)); setRunState(`Transaction ${message.state}`);
        if (!message.pending && pendingTabCloseRef.current?.tabId === owner && pendingTabCloseRef.current.resolving) { pendingTabCloseRef.current.retry(); setPendingTabClose(null); }
        if (!message.pending && pendingSwitchRef.current?.tabId === owner) { const profile = pendingSwitchRef.current; setPendingSwitch(null); if (profile.disconnect) sendNativeCommand("connection.disconnect", { tabId: owner }); else setTimeout(() => beginConnection(profile), 0); }
      } else if (message?.type === "schema.loading") { setSchemaLoading(true); setSchemaError(""); updateTabSession("schemaReady", false); schemaReadyRef.current = false;
      } else if (message?.type === "schema.loaded") {
        const objects = message.objects ?? []; schemaLookupRef.current = makeOracleRelationLookup(objects, message.schema ?? ""); setSchemaObjects(objects); setSchemaOwner(message.schema ?? ""); setSchemaLoading(false); setSchemaError(""); schemaReadyRef.current = true; updateTabSession("schemaReady", true); schemaRequestedRef.current.clear(); schemaLoadedRef.current.clear(); queueSchemaForSql(sqlRef.current);
      } else if (message?.type === "schema.table" || message?.type === "schema.object") {
        const item = message.item; if (item?.name) { const key = oracleSchemaKey(item).toLowerCase(); schemaLoadedRef.current.add(key); schemaRequestedRef.current.delete(key); if (isOracleRelation(item)) schemaLookupRef.current.set(item.name.toLowerCase(), item); setSchemaObjects((current) => current.map((entry) => oracleSchemaKey(entry) === oracleSchemaKey(item) ? item : entry)); requestAnimationFrame(() => { const position = editorRef.current?.getPosition(); const line = position && editorRef.current?.getModel()?.getLineContent(position.lineNumber); if (line) editorRef.current?.render(); }); }
      } else if (message?.type === "schema.error") { setSchemaLoading(false); setSchemaError(message.message ?? "Oracle metadata could not be loaded."); schemaReadyRef.current = true; if (message.tableName || message.name) { const failed = [...schemaObjects].find(item => item.name.toLowerCase() === (message.tableName || message.name).toLowerCase() && (!message.owner || item.owner === message.owner)); if (failed) schemaRequestedRef.current.delete(oracleSchemaKey(failed).toLowerCase()); }
      } else if (message?.type === "host.error") {
        finishHistoryEntry("Failed", "Execution failed");
        saveContinuationRef.current = null;
        const owner = message.tabId || requestOwnersRef.current.get(message.requestId) || resultOwnerRef.current || activeTabIdRef.current; requestOwnersRef.current.delete(message.requestId);
        const failedConnection = pendingConnectionsRef.current.get(message.requestId);
        if (failedConnection) { pendingConnectionsRef.current.delete(message.requestId); setConnecting(false, owner); setAuthProfile({ ...dbConnectionsRef.current.find(p => p.id === failedConnection.id), ...failedConnection, credentials: undefined }); setConnectionError(message.message || "Connection failed", owner); }
        const error = message.message ?? "Desktop operation failed"; setRunState(error); if (typeof message.transactionPending === "boolean") setTransactionPending(message.transactionPending);
        if (authProfileRef.current?.tabId === owner) { setConnectionError(error); setConnecting(false); }
        if (pendingTabCloseRef.current?.tabId === owner) setPendingTabClose(current => current ? { ...current, resolving: false, message: error } : current);
        setExecuting(false); setCancelling(false);
        if ((!failedConnection && !authProfileRef.current && /ORA-\d+/i.test(error)) || message.explain) { if (message.explain) setExplainMessage(error, owner); else setOutputMessage(error, owner); setResultTab(message.explain ? "Explain" : "Output", owner); updateTabSession("runtimeProblems", [{ id: `${owner}:runtime`, tabId: owner, severity: "error", source: "Oracle", message: error, fileName: tabsRef.current.find(tab => tab.id === owner)?.name || "SQL" }], owner); }
      }
      } finally { replyOwnerRef.current = null; }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const refreshCompletionMetadata = () => {
      const tab = tabsRef.current.find(item => item.id === activeTabIdRef.current), owner = tab?.metadataOriginTabId || activeTabIdRef.current;
      const connection = sessionsRef.current[owner]?.activeConnection;
      if (!isNativeHost || !connection || ["No connection", "Disconnected"].includes(connection.id)) return;
      completionMetadataRef.current.reset(owner);
      schemaLoadedRef.current.clear(); schemaRequestedRef.current.clear();
      sendNativeCommand("schema.refresh", { tabId: owner }); sendNativeCommand("completion.vocabulary", { tabId: owner });
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
      if(event.altKey&&!event.ctrlKey&&!event.metaKey&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();navigateHistory(event.key==='ArrowLeft'?-1:1);return;}
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='p'){event.preventDefault();event.stopPropagation();if(!document.querySelector('.modal-backdrop')||paletteMode)setPaletteMode(event.shiftKey?'commands':'files');return;}
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === "z") { event.preventDefault(); setFocusMode(value=>!value); return; }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f") { event.preventDefault(); setShowSearch(true); setShowHistory(false); return; }
      if (event.key === "F8" && !document.querySelector(".modal-backdrop")) { const items = problemsRef.current.filter(problem => problem.tabId === activeTabIdRef.current); if (items.length) { event.preventDefault(); problemCursorRef.current = problemCursorRef.current < 0 ? event.shiftKey ? items.length - 1 : 0 : (problemCursorRef.current + (event.shiftKey ? -1 : 1) + items.length) % items.length; navigateProblem(items[problemCursorRef.current]); } return; }
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
    const timer = setTimeout(() => {
      const editor = editorRef.current, model = editor?.getModel(), position = editor?.getPosition();
      if (!model || !position || !editor.hasTextFocus() || document.querySelector(".modal-backdrop")) return;
      const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      if (automaticCompletionAllowed(model.getValue(), model.getOffsetAt(position)) && (!before || /[\p{L}\p{N}_$#."\s]$/u.test(before))) editor.trigger("sql-context", "editor.action.triggerSuggest", {});
    }, completionSettings.delay);
    return () => clearTimeout(timer);
  }, [sql, autoCompletion, completionSettings.delay, schemaObjects]);

  useEffect(() => {
    const runStatementShortcut = (event) => {
      const editor=editorRef.current;if(!editor?.hasTextFocus())return;
      const shortcuts=resolveSetting(settingsRef.current,'editor.shortcuts').value;
      if(matchesShortcut(event,shortcuts.run)){event.preventDefault();event.stopImmediatePropagation();runQueryRef.current?.();return;}
      if(matchesShortcut(event,shortcuts.deleteLine)&&!editorIsReadonly()){event.preventDefault();event.stopImmediatePropagation();editor.trigger('keyboard','editor.action.deleteLines',{});return;}
      if(matchesShortcut(event,shortcuts.format)){event.preventDefault();event.stopImmediatePropagation();formatterRef.current?.();}
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
  useEffect(() => { localStorage.setItem("fbsdb.connectionGroups", JSON.stringify(connectionGroups)); }, [connectionGroups]);
  useEffect(() => { localStorage.setItem("fbsdb.maxRows", String(maxRows)); }, [maxRows]);
  useEffect(() => { localStorage.setItem("fbsdb.queryHistory", JSON.stringify(queryHistory.slice(0,historyLimit))); }, [queryHistory,historyLimit]);
  useEffect(() => { localStorage.setItem("fbsdb.customSqlSnippets", JSON.stringify(customSqlSnippets)); }, [customSqlSnippets]);

  function setConnectionGroup(profileId, group) {
    const value = group == null ? null : group.trim();
    setConnectionGroups((current) => { const next = { ...current }; if (value !== null) next[profileId] = value; else delete next[profileId]; return next; });
    setDbConnections((current) => current.map((item) => item.id === profileId ? { ...item, group: value ?? (item.env === "PROD" ? "Production" : ["UAT", "TEST"].includes(item.env) ? "Testing" : item.env === "DEV" ? "Development" : "") } : item));
    if (isNativeHost) sendNativeCommand("connection.setGroup", { profileId, group: value });
  }

  useEffect(() => {
    if (!monaco) return;
    const name = `fbsdb-${theme}-${Date.now()}`;
    monaco.editor.defineTheme(name, { base: theme === "light" ? "vs" : "vs-dark", inherit: true, rules: [
      { token: "comment", foreground: tokenColors.comment.slice(1), fontStyle: "italic" }, { token: "keyword", foreground: tokenColors.keyword.slice(1) }, { token: "operator", foreground: "8b9ab1" }, { token: "string", foreground: tokenColors.string.slice(1) }, { token: "number", foreground: tokenColors.number.slice(1) }, { token: "identifier", foreground: themeConfig.foreground.slice(1) },
    ], colors: { "editor.background": themeConfig.editor, "editor.foreground": themeConfig.foreground, "editorLineNumber.foreground": theme === "light" ? "#9aa6b6" : "#4b5869", "editorLineNumber.activeForeground": themeConfig.accent, "editorCursor.foreground": themeConfig.accent, "editor.lineHighlightBackground": theme === "light" ? "#eef2f8" : "#161e29", "editor.selectionBackground": themeConfig.selection, "editor.inactiveSelectionBackground": theme === "light" ? "#e8edf5" : "#202b3b", "editorIndentGuide.background1": themeConfig.line, "editorIndentGuide.activeBackground1": themeConfig.accent, "editorSuggestWidget.background": theme === "light" ? "#fff" : themeConfig.surface, "editorSuggestWidget.border": themeConfig.line, "editorSuggestWidget.selectedBackground": themeConfig.selection } });
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
        const tab = tabsRef.current.find(item => item.id === activeTabIdRef.current), originTabId = tab?.metadataOriginTabId || activeTabIdRef.current;
        const originSession = sessionsRef.current[originTabId] || {}, connection = originSession.activeConnection;
        return { busy: !!(originSession.executing || originSession.scriptRun?.running || originSession.fetchingPage), sourceObject: tab?.definitionObject, tabId: activeTabIdRef.current, originTabId, connected: isNativeHost && !!connection && !["No connection", "Disconnected"].includes(connection.id), settings: completionSettings,
          manualSuggestion: () => { const manual = manualSuggestionRef.current; manualSuggestionRef.current = false; return manual; } };
      },
      onDefinition: openOracleDefinition,
      onReveal: target => {
        if (metadataOriginTabId !== activeTabIdRef.current) activateTab(metadataOriginTabId);
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
      if (!result.diagnostics || model.isDisposed() || model.getVersionId() !== version || activeTabIdRef.current !== owner) return;
      const problems = result.diagnostics.map((item, index) => {
        const start = model.getPositionAt(item.start), end = model.getPositionAt(item.end);
        return { ...item, id: `${owner}:lint:${index}`, tabId: owner, fileName: tabsRef.current.find(tab => tab.id === owner)?.name || "SQL", line: start.lineNumber, column: start.column, offset: item.start, editorSnapshot: text, startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column };
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
  function editorIsReadonly() { return !!tabsRef.current.find(tab => tab.id === activeTabIdRef.current)?.readOnly; }
  async function navigateProblem(problem) {
    const tab = tabsRef.current.find(tab => tab.id === problem.tabId);
    if (!tab) return;
    const text = problem.tabId === activeTabIdRef.current ? sqlRef.current : tab.content;
    if (problem.offset != null && problem.editorSnapshot === text) {
      rememberLocation();
      if (problem.tabId !== activeTabIdRef.current) activateTab(problem.tabId);
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
    if (problem.tabId !== activeTabIdRef.current) activateTab(problem.tabId);
    if (problem.source === 'Oracle') setResultTab('Output', problem.tabId);
  }
  function rememberLocation(tabId=activeTabIdRef.current,position=editorRef.current?.getPosition()) { if(!navigatingRef.current&&position)navigationHistoryRef.current.push({tabId,...position}); }
  function navigateHistory(direction) {
    if(direction<0&&navigationHistoryRef.current.index===navigationHistoryRef.current.items.length-1)rememberLocation();
    const location=navigationHistoryRef.current.move(direction,item=>tabsRef.current.some(tab=>tab.id===item.tabId));if(!location)return;
    navigatingRef.current=true;
    if(location.tabId!==activeTabIdRef.current)activateTab(location.tabId);
    requestAnimationFrame(()=>{editorRef.current?.setPosition(location);editorRef.current?.revealPositionInCenter(location);editorRef.current?.focus();navigatingRef.current=false});
  }
  function jumpToOffset(offset) {const editor=editorRef.current;if(!editor?.getModel())return;rememberLocation();const position=editor.getModel().getPositionAt(offset);editor.setPosition(position);editor.revealPositionInCenter(position);editor.focus();rememberLocation();}
  async function inspectOracleObject(target) {
    objectAnalysisRequestRef.current?.cancel();const cancellation=completionCancellation();objectAnalysisRequestRef.current=cancellation;
    const originTabId=metadataOriginTabId,broker=completionMetadataRef.current,epoch=broker.session(originTabId).epoch;
    setObjectAnalysis({target,originTabId,loading:true});
    const data=await broker.load(originTabId,target,cancellation.token,'objectAnalysis');
    if(!cancellation.token.isCancellationRequested&&epoch===broker.session(originTabId).epoch)setObjectAnalysis({target,originTabId,data,loading:false});
  }
  async function openExplorerDefinition(target) {
    setDefinitionError('');
    const originTabId=metadataOriginTabId,broker=completionMetadataRef.current,epoch=broker.session(originTabId).epoch;
    const source=await broker.load(originTabId,target,undefined,'definition');
    if(source&&broker.session(originTabId).epoch===epoch&&!closedTabsRef.current.has(originTabId)&&activeTabIdRef.current===activeTabId)openOracleDefinition({...source,originTabId});
    else if(!source)setDefinitionError(broker.session(originTabId).lastError||'Oracle definition is unavailable for this object.');
  }
  function choosePaletteItem(item) {
    if(item.kind==='file'){if(item.tabId)activateTab(item.tabId);else openWorkspaceFile(item);}
    else if(item.kind==='object')openExplorerDefinition(item);
    else if(item.kind==='connection'){const profile=dbConnections.find(profile=>profile.id===item.profileId);if(profile)switchConnection(profile);}
    else if(item.kind==='outline')jumpToOffset(item.start);
    else item.run?.();
  }
  useEffect(()=>{
    setDocumentOutline([]);if(!monaco||!completionClientRef.current)return;
    let cancelled=false;const source=sql,tabId=activeTabId;
    const timer=setTimeout(async()=>{const result=await completionClientRef.current?.request('outline',source,0);if(!cancelled&&tabId===activeTabIdRef.current&&sqlRef.current===source)setDocumentOutline(result?.outline||[])},250);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[sql,activeTabId,monaco,completionSettings,completionObjects,completionSchema,completionSession.oracleVocabulary,allSqlSnippets]);
  function openOracleDefinition(source, selection) {
    if (!['PACKAGE', 'PACKAGE BODY', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'TYPE', 'TYPE BODY'].includes(source.type)) {
      setObjectDefinition({ ...source, originTabId: source.originTabId || activeTabIdRef.current });
      return;
    }
    rememberLocation();
    const originTabId = source.originTabId, id = `definition:${originTabId}:${source.owner}:${source.type}:${source.name}`;
    syncActiveTab();
    const tab = { id, name: `${source.owner}.${source.name}${source.type.endsWith(" BODY") ? ".body" : ""}.sql`, path: null, content: source.text, dirty: false, readOnly: true, metadataOriginTabId: originTabId, definitionObject: { owner: source.owner, name: source.name, type: source.type } };
    setTabs(current => current.some(item => item.id === id) ? current.map(item => item.id === id ? tab : item) : [...current, tab]);
    activeTabIdRef.current = id; sqlRef.current = source.text; setNativeTabId(originTabId); setActiveTabId(id); setSql(source.text); setFileName(tab.name); setFilePath(null); setFileDirty(false); setFileConnectionProfileId(null);
    requestAnimationFrame(() => { const position = { lineNumber: selection?.startLineNumber || selection?.lineNumber || 1, column: selection?.startColumn || selection?.column || 1 }; editorRef.current?.setPosition(position); editorRef.current?.revealPositionInCenter(position); editorRef.current?.focus(); rememberLocation(id,position); });
  }
  useEffect(()=>{
    if(recovery)return;
    const save=()=>{try{localStorage.setItem('fbsdb.sqlDrafts',JSON.stringify(draftSnapshot(tabsRef.current,activeTabIdRef.current,activeFileSnapshotRef.current)))}catch{}};
    const timer=setTimeout(save,700);window.addEventListener('pagehide',save);
    return()=>{clearTimeout(timer);window.removeEventListener('pagehide',save)};
  },[tabs,sql,fileDirty,filePath,fileConnectionProfileId,activeTabId,recovery]);
  function restoreDrafts(files,reconnect) {
    const restored=files.map(file=>({...file,id:`recovered-${crypto.randomUUID()}`})),selectedIndex=files.findIndex(file=>file.id===recovery.activeTabId),active=restored[Math.max(0,selectedIndex)];
    const live=tabsRef.current.filter(tab=>tab.dirty||tab.path||tab.content.trim());
    setTabs([...live,...restored]);activeTabIdRef.current=active.id;setNativeTabId(active.id);sqlRef.current=active.content;
    setActiveTabId(active.id);setSql(active.content);setFileName(active.name);setFilePath(active.path);setFileDirty(active.dirty);setFileConnectionProfileId(active.connectionProfileId);
    setRecovery(null);if(isNativeHost)sendNativeCommand('file.activate',{tabId:active.id,path:active.path});
    if(reconnect&&active.connectionProfileId){const profile=dbConnectionsRef.current.find(item=>item.id===active.connectionProfileId);if(profile)beginConnection({...profile,tabId:active.id});}
  }
  function syncActiveTab() { const snapshot = { ...activeFileSnapshotRef.current, content: sqlRef.current }; setTabs((current) => current.map((tab) => tab.id === snapshot.id ? { ...tab, ...snapshot } : tab)); }
  function openSqlFileNow() { if (isNativeHost) sendNativeCommand("file.open"); else openFileInputRef.current?.click(); }
  function openSqlFile() { syncActiveTab(); openSqlFileNow(); }
  function openWorkspace() { if (isNativeHost) sendNativeCommand("workspace.open"); }
  function openWorkspaceFile(file) { const cached = tabsRef.current.find((tab) => pathKey(tab.path) === pathKey(file.path)); if (cached) { activateTab(cached.id); return; } syncActiveTab(); if (isNativeHost) sendNativeCommand("file.openPath", { path: file.path }); else openSqlFileNow(); }
  function activateTab(id) { rememberLocation(); syncActiveTab(); const tab = tabsRef.current.find((item) => item.id === id); if (!tab) return; setNativeTabId(tab.metadataOriginTabId || id); activeTabIdRef.current = id; sqlRef.current = tab.content; setActiveTabId(id); setSql(tab.content); setFileName(tab.name); setFilePath(tab.path); setFileDirty(tab.dirty); setFileConnectionProfileId(tab.connectionProfileId ?? null); schemaLookupRef.current = makeOracleRelationLookup(sessionsRef.current[id]?.schemaObjects || [], sessionsRef.current[id]?.schemaOwner); schemaReadyRef.current = Boolean(sessionsRef.current[id]?.schemaReady); schemaLoadedRef.current.clear(); schemaRequestedRef.current.clear(); if (isNativeHost && !tab.readOnly) sendNativeCommand("file.activate", { path: tab.path, tabId: id }); queueSchemaForSql(tab.content); requestAnimationFrame(() => {editorRef.current?.focus();rememberLocation(id)}); }
  function cycleSqlTab(direction) { const items = tabsRef.current; if (items.length < 2) return; const index = items.findIndex(item => item.id === activeTabIdRef.current); activateTab(items[(index + direction + items.length) % items.length].id); }
  function newSqlFileNow() { const id = `new-${crypto.randomUUID()}`; syncActiveTab(); activeTabIdRef.current = id; setNativeTabId(id); if (isNativeHost) sendNativeCommand("file.new", { tabId: id }); setActiveTabId(id); schemaReadyRef.current = false; schemaLookupRef.current = new Map(); schemaLoadedRef.current.clear(); schemaRequestedRef.current.clear(); setTabs((current) => [...current, { id, name: "Untitled.sql", path: null, content: "", dirty: false, connectionProfileId: null }]); sqlRef.current = ""; setSql(""); setFileName("Untitled.sql"); setFilePath(null); setFileDirty(false); setFileConnectionProfileId(null); requestAnimationFrame(() => editorRef.current?.focus()); }
  function newSqlFileFromLastConnection() { const current = activeConnectionRef.current; const profile = dbConnectionsRef.current.find(item => item.id === (current && !['No connection', 'Disconnected'].includes(current.id) ? current.id : null)); newSqlFileNow(); if (profile) { if (isNativeHost) beginConnection({ ...profile, tabId: activeTabIdRef.current }); else { setActiveConnection(profile); setTabs(tabs => tabs.map(tab => tab.id === activeTabIdRef.current ? { ...tab, connectionProfileId: profile.id } : tab)); } } }
  function closeTab(id, onClosed = null) {
    const tab = tabsRef.current.find(item => item.id === id); if (!tab) return;
    const complete = () => {
      setObjectDefinition(current => current?.originTabId === id ? null : current);
      closedTabsRef.current.add(id); pageRequestsRef.current.delete(id); completionMetadataRef.current.forget(id); completionRecentRef.current.delete(id);
      setTabSessions(current => { const next = { ...current }; delete next[id]; return next; });
      setTabResults(current => { const next = { ...current }; delete next[id]; return next; });
      const currentTabs = tabsRef.current;
      const remaining = currentTabs.filter(item => item.id !== id);
      setTabs(current => current.filter(item => item.id !== id));
      if (id !== activeTabIdRef.current) { onClosed?.(); return; }
      if (remaining.length) { const next = remaining[Math.max(0, currentTabs.findIndex(item => item.id === id) - 1)]; activateTab(next.id); }
      else newSqlFileNow();
      onClosed?.();
    };
    const retry = () => { const request = sendNativeCommand("tab.close", { tabId: id }); tabCloseActionsRef.current.set(request, { complete, retry }); };
    const close = () => isNativeHost && !tab.readOnly ? retry() : complete();
    if (tab.dirty && !tab.readOnly) { if (id !== activeTabIdRef.current) activateTab(id); setPendingFileAction({ run: close }); }
    else close();
  }
  function closeTabs(ids) { const next = () => { const id = ids.shift(); if (id) closeTab(id, () => setTimeout(next, 0)); }; next(); }
  function newSqlFile() { newSqlFileFromLastConnection(); }
  function saveSqlFile(afterSave = null) {
    learnSqlUsage(sqlRef.current);
    if (tabsRef.current.find(tab => tab.id === activeTabIdRef.current)?.readOnly) return;
    if (isNativeHost) { saveContinuationRef.current = afterSave; sendNativeCommand("file.save", { path: filePath, fileName, content: sql }); return; }
    const url = URL.createObjectURL(new Blob([sql], { type: "text/sql;charset=utf-8" })), link = document.createElement("a"); link.href = url; link.download = fileName || "query.sql"; link.click(); URL.revokeObjectURL(url); setFileDirty(false); afterSave?.();
  }
  function connectInBackground(item, credentials = {}) {
    const tabId = item.tabId || activeTabIdRef.current;
    if ([...pendingConnectionsRef.current.values()].some(profile => profile.tabId === tabId)) return;
    setConnecting(true, tabId); setConnectionError("", tabId); updateTabSession("connectingProfile", item.name || item.id, tabId);
    const requestId = sendNativeCommand("connection.connect", { profileId: item.id, ...credentials, tabId });
    pendingConnectionsRef.current.set(requestId, { ...item, user: credentials.user || item.user || item.savedUser, credentials: undefined, tabId });
  }
  function beginConnection(item) {
    const tabId = item.tabId || activeTabIdRef.current; item = { ...item, tabId };
    if (item.credentials || item.hasSavedCredentials) { setAuthProfile(null); connectInBackground(item, item.credentials || {}); }
    else { setAuthProfile(item); setConnectionError("", tabId); setConnecting(false, tabId); }
  }
  function switchConnection(item, force = false) { if (editorIsReadonly()) return; if (item.available === false) { setManagementError("TNS source unavailable. Edit this connection or refresh sources."); return; } setShowPicker(false); if (!force && item.id.toLowerCase() === activeConnection.id.toLowerCase()) return; if (isNativeHost && transactionPending) { setPendingSwitch({ ...item, tabId: activeTabIdRef.current }); return; } if (isNativeHost) { beginConnection(item); return; } setActiveConnection(item); setRunState(`Connected to ${item.id}`); }
  function disconnectActiveConnection() { setShowPicker(false); if (transactionPending) setPendingSwitch({ id: "disconnect", disconnect: true, tabId: activeTabIdRef.current }); else if (isNativeHost) sendNativeCommand("connection.disconnect", { tabId: activeTabIdRef.current }); else setActiveConnection({ id: "Disconnected", title: "No active session", env: "—" }); }
  function submitConnectionCredentials(credentials) {
    if (!authProfile) return;
    if (authProfile.testOnly) { setConnecting(true, authProfile.tabId); authTestRequestRef.current = sendNativeCommand("connection.test", { profileId: authProfile.id, ...credentials, tabId: authProfile.tabId }); return; }
    const profile = authProfile; setAuthProfile(null); connectInBackground(profile, credentials);
  }
  function finishTransaction(action) { if (isNativeHost) sendNativeCommand(`transaction.${action}`, { tabId: pendingSwitch?.tabId || activeTabIdRef.current }); else setRunState(action === "commit" ? "Transaction committed" : "Transaction rolled back"); }
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
  function requestSchemaDetails(item) { const key = oracleSchemaKey(item).toLowerCase(); if (!isNativeHost || schemaLoadedRef.current.has(key) || schemaRequestedRef.current.has(key)) return; schemaRequestedRef.current.add(key); sendNativeCommand("schema.objectDetails", { owner: item.owner, name: item.name, objectType: item.type }); }
  function insertEditorText(text) { const editor = editorRef.current; if (!editor || editorIsReadonly()) return; editor.executeEdits("schema-explorer", [{ range: editor.getSelection(), text, forceMoveMarkers: true }]); editor.focus(); setFileDirty(true); }
  function handleEditorChange(value) { if (editorIsReadonly()) return; sqlRef.current = value ?? ""; setSql(sqlRef.current); setFileDirty(true); setTabs((current) => current.map((tab) => tab.id === activeTabIdRef.current ? { ...tab, content: sqlRef.current, dirty: true } : tab)); queueSchemaForSql(sqlRef.current); }
  async function formatSql() {
    if (editorIsReadonly()) return;
    const editor = editorRef.current, model = editor?.getModel(), client = completionClientRef.current;
    if (!editor || !model || !client) return;
    const selection = editor.getSelection(), hasSelection = selection && !selection.isEmpty(), range = hasSelection ? selection : model.getFullModelRange();
    const source = model.getValueInRange(range), version = model.getVersionId(), owner = activeTabIdRef.current;
    const result = await client.request("format", source, 0, null, { style: codeStyle });
    if (model.isDisposed() || model.getVersionId() !== version || activeTabIdRef.current !== owner || typeof result.formatted !== "string") return;
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
  function workspaceDevelopmentCommand(command,payload={}) {const id=sendNativeCommand(command,payload);workspaceDevRequestsRef.current.set(command,id);setWorkspaceDev(current=>({...current,busy:true,error:''}));}
  useEffect(()=>{if(workspace.root&&isNativeHost)refreshWorkspaceGit();else setWorkspaceDev({});},[workspace.root]);
  function refreshWorkspaceGit() {if(isNativeHost)workspaceDevelopmentCommand('workspace.git');}
  function openWorkspaceDevelopment(mode) {setWorkspaceDevMode(mode);if(mode==='git')refreshWorkspaceGit();}
  function unsavedWorkspacePaths() {return tabsRef.current.map(tab=>tab.id===activeTabIdRef.current?{...tab,...activeFileSnapshotRef.current}:tab).filter(tab=>tab.dirty&&tab.path).map(tab=>tab.path);}
  function previewWorkspaceReplace(search,replacement,caseSensitive){setWorkspaceDev(current=>({...current,preview:null,applied:null}));workspaceDevelopmentCommand('workspace.replacePreview',{search,replacement,caseSensitive,excluded:unsavedWorkspacePaths()});}
  function applyWorkspaceReplace(selected){if(!workspaceDev.preview)return;workspaceDevelopmentCommand('workspace.replaceApply',{previewId:workspaceDev.preview.id,selected,excluded:unsavedWorkspacePaths()});}
  function openScriptPreview() { const tabId=activeTabIdRef.current,run=scriptRunsRef.current.get(tabId);setScriptDialog({tabId,source:run?.running?run.source:sqlRef.current}); }
  function startScript(statements,parameters,continueOnError) {
    const owner=scriptDialog.tabId,session=sessionsRef.current[owner]||{},profile=session.activeConnection;
    if(!isNativeHost||tabResultsRef.current[owner]?.streamState?.busy||session.executing||session.scriptRun?.running||session.fetchingPage||session.connecting||!profile||['No connection','Disconnected'].includes(profile.id))return;
    const existing=tabResultsRef.current[owner]?.queryResult;
    if(existing)updateTabResult('resultSets',sets=>[...(sets||[]),{key:`before-script-${crypto.randomUUID()}`,label:'Before script',pinned:true,result:existing,view:tabResultsRef.current[owner]?.queryView||{}}],owner);
    const run={running:true,source:scriptDialog.source,steps:[],parameters};scriptRunsRef.current.set(owner,run);updateTabSession('scriptRun',run,owner);
    resultExecutionMeta.current.set(owner,{fileName:tabsRef.current.find(tab=>tab.id===owner)?.name,editorSnapshot:scriptDialog.source,executedProfile:profile.name||profile.id,executionPageSize:maxRows,workspaceRoot:workspace.root});
    run.requestId=sendNativeCommand('script.execute',{tabId:owner,continueOnError,timeoutSeconds:queryTimeout,pageSize:maxRows,statements:statements.map(statement=>({...statement,parameters:parameters.filter(parameter=>getBindNames(statement.sql).includes(parameter.name))}))});
  }
  function runQuery(statementOverride) {
    if (tabsRef.current.find(tab => tab.id === activeTabIdRef.current)?.readOnly) return;
    if (view.streamState?.busy) { setRunState("Finish or cancel the streaming export before executing SQL."); return; }
    if (executing || pendingBindSql || pageRequestRef.current) return;
    const editor = editorRef.current, model = editor?.getModel(), position = editor?.getPosition() ?? lastEditorPositionRef.current;
    if (!isNativeHost) { setRunState("Connect to an Oracle profile in the desktop app to execute SQL."); return; }
    if (!activeConnection || ["No connection", "Disconnected"].includes(activeConnection.id)) { setShowPicker(true); setRunState("Connect to an Oracle profile before running SQL."); return; }
    const selection = editor.getSelection(); let statement = typeof statementOverride === "string" ? statementOverride : selection && !selection.isEmpty() ? model.getValueInRange(selection) : "";
    if (!statement && model) {
      const text = model.getValue();
      statement = getStatementAtCursor(text, position ? model.getOffsetAt(position) : 0);
    }
    if (!statement?.trim()) { setRunState("Place the cursor in a SQL statement or select SQL to run."); return; }
    const binds = getBindNames(statement); if (binds.length) { setPendingBindSql(statement); return; } executeStatement(statement);
  }
  runQueryRef.current = runQuery;
  function explainQuery() {
    if (tabsRef.current.find(tab => tab.id === activeTabIdRef.current)?.readOnly) return;
    if (executing) { setResultTab("Explain"); return; }
    if (!isNativeHost) { setResultTab("Explain"); setExplainMessage("Connect to an Oracle profile in the desktop app to inspect an execution plan."); return; }
    if (!activeConnection || ["No connection", "Disconnected"].includes(activeConnection.id)) { setShowPicker(true); setRunState("Connect to an Oracle profile before explaining SQL."); return; }
    const editor = editorRef.current, model = editor?.getModel(), position = editor?.getPosition() ?? lastEditorPositionRef.current;
    const selection = editor?.getSelection(); let statement = selection && !selection.isEmpty() ? model.getValueInRange(selection) : "";
    if (!statement && model) { const text = model.getValue(); statement = getStatementAtCursor(text, position ? model.getOffsetAt(position) : 0); }
    if (!statement?.trim()) { setResultTab("Explain"); setExplainMessage("Place the cursor in a SQL statement or select SQL to explain."); return; }
    updateTabSession("sqlStage","Building execution plan");updateTabSession("operationStartedAt",Date.now()); resultOwnerRef.current = activeTabIdRef.current; setExecutionKind("explain"); setExecuting(true); setCancelling(false); setResultTab("Explain"); setExplainResult(null); setExplainMessage(""); setRunState("Building execution plan…"); requestOwnersRef.current.set(sendNativeCommand("sql.explain", { sql: statement }), activeTabIdRef.current);
  }
  function executeStatement(statement, parameters = []) { learnSqlUsage(statement); const executionPageSize=pageSizes.next;updateTabSession("sqlStage","Executing SQL");updateTabSession("operationStartedAt",Date.now()); statement=statement.replace(/^(\s*SELECT)(?=\*)/i,"$1 "); updateTabResult("selectedResultKey",null); const snapshot = sqlRef.current, currentModel = editorRef.current?.getModel(), currentSelection = editorRef.current?.getSelection(); const selectedOffset = currentModel && currentSelection && !currentSelection.isEmpty() ? currentModel.getOffsetAt(currentSelection.getStartPosition()) : null; const cursorOffset = currentModel && editorRef.current?.getPosition() ? currentModel.getOffsetAt(editorRef.current.getPosition()) : null; const matches = getSqlStatements(snapshot).filter(item => item.sql === statement.trim()); const selected = matches.find(item => cursorOffset != null && item.start <= cursorOffset && cursorOffset <= item.end) || (matches.length === 1 ? matches[0] : null); const statementOffset = selectedOffset != null && snapshot.slice(selectedOffset, selectedOffset + statement.length) === statement ? selectedOffset : selected?.start ?? null; updateTabSession("runtimeProblems", [], activeTabIdRef.current); resultExecutionMeta.current.set(activeTabIdRef.current, { statementOffset, fileName: tabsRef.current.find(tab => tab.id === activeTabIdRef.current)?.name, executedAt: new Date().toISOString(), requestStartedAtPerf: performance.now(), executedProfile: activeConnectionRef.current.name || activeConnectionRef.current.id, editorSnapshot: sqlRef.current, executedSql: statement, executedParameters:parameters,executionPageSize,workspaceRoot:workspace.root }); resultOwnerRef.current = activeTabIdRef.current; pageRequestRef.current = null; setFetchingPage(false); setPageError(""); setExecutionKind("query"); setResultTab("Results"); const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`; pendingHistoryRef.current.set(activeTabIdRef.current, id); setQueryHistory((current) => [{ id, sql: statement, profile: activeConnectionRef.current.id, startedAt: Date.now(), status: "Running", detail: "Executing…" }, ...current].slice(0,historyLimit)); setExecuting(true); setCancelling(false); setRunState("Executing Oracle statement…"); setPendingBindSql(null); requestOwnersRef.current.set(sendNativeCommand("sql.execute", { sql: statement, parameters, timeoutSeconds:queryTimeout, pageSize: executionPageSize, previousResultId: (view.resultSets||[]).some(item=>item.pinned&&item.result.resultId===view.queryResult?.resultId)?null:view.queryResult?.resultId||null }), activeTabIdRef.current); }
  function fetchMoreResults() {
    if (!isNativeHost || !queryResult?.hasMore || pageRequestRef.current || executing) return;
    updateTabSession("operationStartedAt",Date.now()); setFetchingPage(true); setPageError("");
    pageRequestRef.current = { owner: activeTabIdRef.current, resultId:queryResult.resultId, id: sendNativeCommand("sql.fetchNext", { resultId: queryResult.resultId, pageSize: maxRows }) };
  }
  function streamResultToFile(format="csv",overrideOptions) {
    updateTabSession('operationStartedAt',Date.now());
    if(!isNativeHost || !sqlResult?.columns?.length)return;
    updateTabResult('streamState',{busy:true,message:'Choose a CSV destination…'});
    sendNativeCommand('result.export',{format,csvOptions:resultExportData(overrideOptions).settings,resultId:sqlResult.resultId,columns:sqlResult.columns,rows:sqlResult.rows,hasMore:sqlResult.hasMore,fileName:(fileName||'query').replace(/\.sql$/i,'')+'-results.'+format});
  }
  function applyServerFilters(options) {
    if(view.streamState?.busy||executing||pageRequestRef.current)throw new Error('Wait for the active operation first.');
    const filtered=buildServerFilter(sqlResult?.executedSql,sqlResult?.columns||[],options,sqlResult?.executedParameters||[]);
    executeStatement(filtered.sql,filtered.parameters);
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
  function openWorkspaceSearchMatch(match) { const cached = tabs.find((tab) => tab.path?.toLowerCase() === match.path.toLowerCase()); if (cached) { activateTab(cached.id); setShowSearch(false); requestAnimationFrame(() => { editorRef.current?.setPosition({ lineNumber: match.lineNumber, column: 1 }); editorRef.current?.revealLineInCenter(match.lineNumber); editorRef.current?.focus(); }); return; } syncActiveTab(); pendingSearchPositionRef.current = { path: match.path, lineNumber: match.lineNumber }; setShowSearch(false); sendNativeCommand("file.openPath", { path: match.path }); }
  function cancelQuery() { if (!isNativeHost || cancelling) return; setCancelling(true); setRunState("Sending cancellation request…"); sendNativeCommand("sql.cancel"); }

  function pinCurrentResult(){if(!queryResult?.columns?.length)return;if(view.selectedResultKey){updateTabResult('resultSets',sets=>(sets||[]).filter(item=>item.key!==view.selectedResultKey));updateTabResult('selectedResultKey',null)}else{const key=`pin-${Date.now()}`;updateTabResult('resultSets',sets=>[...(sets||[]),{key,result:{...queryResult,hasMore:false},label:view.latestResultName||(queryResult.executedSql||'Pinned result').slice(0,45),view:view.queryView,pinned:true}]);updateTabResult('selectedResultKey',key)}}
  function releaseResult(result){const id=result.resultId;if(id)sendNativeCommand('sql.closeResult',{resultId:id});setTabResults(current=>{const tab=current[activeTabId]||{};const release=value=>value&&(value===result||id&&value.resultId===id)?{...value,rows:[],returnedRows:0,hasMore:false,released:true}:value;return {...current,[activeTabId]:{...tab,queryResult:release(tab.queryResult),resultSets:(tab.resultSets||[]).map(item=>({...item,result:release(item.result)}))}}})}
  const managementContent={
    Name:<form className="result-settings-form" onSubmit={e=>{e.preventDefault();const key=renameResult||view.selectedResultKey||'latest';if(key==='latest')updateTabResult('latestResultName',newResultName.trim()||'Latest');else updateTabResult('resultSets',sets=>(sets||[]).map(item=>item.key===key?{...item,label:newResultName.trim()||'Result'}:item));setNewResultName('');setRenameResult(null)}}><h2>Rename result</h2><label>Name<input aria-label="Result name" maxLength={80} value={newResultName} placeholder={(view.selectedResultKey?view.resultSets?.find(item=>item.key===view.selectedResultKey)?.label:view.latestResultName)||'Result name'} onChange={e=>setNewResultName(e.target.value)}/></label><button disabled={!newResultName.trim()}>Rename result</button></form>,
    Source:definition?.tabId===activeTabId?<div className="result-settings-definition"><h2>{definition.name?`${definition.schema||'Current schema'}.${definition.table}.${definition.name}`:'Source definition'}</h2><dl>{Object.entries(definition).filter(([key])=>key!=='constraints'&&key!=='tabId').map(([key,value])=><div key={key}><dt>{({schema:'Schema',table:'Table',name:'Column',type:'Data type',size:'Length',precision:'Precision',scale:'Scale',nullable:'Nullable',defaultValue:'Default value',message:'Status'})[key]||key}</dt><dd>{typeof value==='boolean'?value?'Yes':'No':String(value??'—')}</dd></div>)}</dl><h3>Constraints</h3>{(definition.constraints||[]).map((constraint,i)=><div className="result-rule-row" key={i}><strong>{constraint.name}</strong><span>{({P:'Primary key',R:'Foreign key',U:'Unique',C:'Check'})[constraint.type]||constraint.type}{constraint.status?' · '+constraint.status:''}</span>{constraint.condition&&<code>{constraint.condition}</code>}</div>)}</div>:<p>Select a source column and use Source definition.</p>,
    Lookup:keyLookup?.tabId===activeTabId?(keyLookup.links?<div className="result-settings-links"><h2>Related child tables</h2>{keyLookup.links.map((link,i)=><button key={i} onClick={()=>{sendNativeCommand('result.openSql',{sql:link.sql,tabId:keyLookup.tabId});setKeyLookup(null)}}>{link.label}</button>)}</div>:<form className="result-settings-form" onSubmit={e=>{e.preventDefault();sendNativeCommand('result.lookupSql',{schema:keyLookup.schema,table:keyLookup.table,columns:keyLookup.columns,values:keyValues,tabId:keyLookup.tabId});setKeyLookup(null)}}><h2>Primary key · {keyLookup.table}</h2>{keyLookup.columns.map(column=><label key={column.name}>{column.name}<input required aria-label={`Key ${column.name}`} value={keyValues[column.name]||''} onChange={e=>setKeyValues(current=>({...current,[column.name]:e.target.value}))}/></label>)}<button type="submit">Open lookup SQL</button></form>):null
  };
  const sessionConnected = !["No connection", "Disconnected"].includes(activeConnection.id);
  const dockPanels = {
    editors: <div className="dock-content open-editors-content"><OpenEditors tabs={tabs.map(tab => tab.id === activeTabId ? { ...tab, dirty: fileDirty } : tab)} activeId={activeTabId} onActivate={activateTab} onClose={closeTab}/></div>,
    files: <div className="dock-content file-section-content"><WorkspaceExplorer expandedPaths={layout.expandedPaths} onExpandedChange={next => updateLayout(current => ({ ...current, expandedPaths: typeof next === "function" ? next(current.expandedPaths) : next }))} workspace={workspace} activePath={filePath} onOpen={openWorkspaceFile} onOpenWorkspace={openWorkspace} gitFiles={workspaceDev.git?.files}/></div>,
    connections: <div className="dock-content connections-section-content">
            <div className="section-heading"><div><button title="Refresh TNS aliases" onClick={() => sendNativeCommand("connection.list")}><RefreshCw size={13} /></button><button title="New connection" onClick={() => { setShowPicker(false); setProfileEditor({}); }}><Plus size={15} /></button></div></div>
            <div className="explorer-search"><Search size={13} /><input aria-label="Filter connections" placeholder="Search" value={explorerQuery} onChange={(event) => setExplorerQuery(event.target.value)} />{explorerQuery.length > 0 ? <button type="button" className="explorer-search-clear" title="Clear" aria-label="Clear connection filter" onMouseDown={event => event.preventDefault()} onClick={event => { setExplorerQuery(''); event.currentTarget.closest('.explorer-search').querySelector('input')?.focus(); }}><X size={12}/></button> : <Filter size={12} />}</div>
            <div className="explorer-tabs"><button className={explorerTab === "Recent" ? "active" : ""} onClick={() => setExplorerTab("Recent")}><Clock3 size={12} /> Recent</button><button className={explorerTab === "Favorites" ? "active" : ""} onClick={() => setExplorerTab("Favorites")}><Star size={12} /> Favorites</button><button className={explorerTab === "All" ? "active" : ""} onClick={() => setExplorerTab("All")}><ListFilter size={12} /> All</button></div>
            {connectionGroupNames.length > 0 && <label className="group-filter"><span>GROUP</span><select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option>All groups</option>{connectionGroupNames.map((group) => <option key={group}>{group}</option>)}</select></label>}
            {filteredConnections.length ? <VirtualConnectionRows items={filteredConnections} selected={activeConnection} compact viewportHeight={Math.max(54, explorerSectionHeights.connections - (connectionGroupNames.length ? 147 : 124))} favorites={favorites} onSelect={switchConnection} onToggleFavorite={(id) => setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} /> : <div className="explorer-empty">{dbConnections.length ? "No matching connections" : "Use + to create a connection"}</div>}</div>,
    objects: <div className="dock-content objects-section-content">
            <div className="schema-scope"><Database size={13} className="schema-connection-icon"/><span className="schema-scope-name">{schemaOwner || activeConnection.name || activeConnection.id}</span><span title={connecting || schemaLoading ? "Loading" : ["No connection", "Disconnected"].includes(activeConnection.id) ? "Disconnected" : "Connected"} aria-label={connecting || schemaLoading ? "Loading" : ["No connection", "Disconnected"].includes(activeConnection.id) ? "Disconnected" : "Connected"} className={schemaLoading || connecting ? "live-dot" : ["No connection", "Disconnected"].includes(activeConnection.id) ? "offline-dot" : "online-dot"} />{connecting ? "Connecting…" : schemaLoading ? "Loading…" : (schemaQuery || schemaTypeFilter !== "All" || schemaOwnerFilter !== "All" || objectScope !== "All") ? `${visibleSchemaObjects.length} / ${schemaObjects.length} objects` : schemaObjects.length ? `${schemaObjects.length} objects` : ""}<button type="button" className="schema-refresh" title="Refresh Oracle objects" aria-label="Refresh Oracle objects" onClick={() => sendNativeCommand("schema.refresh")}><RefreshCw size={12}/></button></div>
            {definitionError&&<div role="alert" className="oracle-explorer-error explorer-dismissable-error"><span>{definitionError}</span><button type="button" aria-label="Dismiss definition error" title="Dismiss" onClick={()=>setDefinitionError('')}><X size={12}/></button></div>}
            <label className="explorer-search schema-search"><Search size={13} /><input placeholder="Search schemas, objects, columns…" value={schemaQuery} onChange={(event) => {setSchemaQuery(event.target.value);setDefinitionError('')}} />{schemaQuery ? <button type="button" title="Clear search" aria-label="Clear Object Explorer search" onClick={() => setSchemaQuery("")}><X size={12}/></button> : <Filter size={12} />}</label>
            <label className="schema-type-filter"><span>Schema</span><select value={schemaOwnerFilter} onChange={event => setSchemaOwnerFilter(event.target.value)}><option value="All">All schemas</option>{[...new Set(schemaObjects.map(item=>item.owner).filter(Boolean))].sort().map(owner=><option key={owner} value={owner}>{owner}</option>)}</select><span>Type</span><select value={schemaTypeFilter} onChange={event => setSchemaTypeFilter(event.target.value)}><option value="All">All types</option>{oracleObjectKinds.map(([type,label])=><option key={type} value={type}>{label}</option>)}</select>{(schemaTypeFilter !== "All" || schemaOwnerFilter !== "All") && <button type="button" title="Clear filters" aria-label="Clear Object Explorer filters" onClick={() => {setSchemaTypeFilter("All");setSchemaOwnerFilter("All")}}><X size={11}/></button>}</label>
            {schemaError && <div className="oracle-explorer-error" role="status">{schemaError}</div>}
            <div className="object-scope-switch"><button className={objectScope === "All" ? "active" : ""} onClick={() => setObjectScope("All")}>All</button><button className={objectScope === "Recent" ? "active" : ""} onClick={() => setObjectScope("Recent")}><Clock3 size={11}/> Recent</button></div>
            <OracleObjectTree onAnalysis={inspectOracleObject} onDefinition={openExplorerDefinition} items={visibleSchemaObjects} activeKey={activeObject} currentSchema={schemaOwner} query={schemaQuery} favoriteKeys={objectFavorites} onToggleFavorite={item => setObjectFavorites(keys => { const key = oracleSchemaKey(item), next = keys.includes(key) ? keys.filter(value => value !== key) : [...keys, key]; localStorage.setItem("fbsdb.objectFavorites", JSON.stringify(next)); return next; })} onToggle={(item) => { setDefinitionError('');const key = oracleSchemaKey(item); const next = activeObject === key ? "" : key; setActiveObject(next); if (next) { setRecentObjects(keys => { const nextKeys = [key, ...keys.filter(value => value !== key)].slice(0, 30); localStorage.setItem("fbsdb.recentObjects", JSON.stringify(nextKeys)); return nextKeys; }); requestSchemaDetails(item); } }} onInsert={insertEditorText} emptyLabel={schemaObjects.length ? "No Oracle objects match this search or filter." : isNativeHost ? ["No connection", "Disconnected"].includes(activeConnection.id) ? "Connect to load Oracle objects" : "No accessible Oracle objects found for this user." : "Oracle objects appear after connecting"} /></div>,
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
  return <main className="desktop-shell" data-language={language} data-region={region} data-results-collapsed={bottomCollapsed} data-focus={focusMode} data-density={workbenchDensity} data-reduce-motion={reduceMotion} data-theme={theme} style={{ "--accent": themeConfig.accent, "--sidebar-width": `${layout.widths.left}px`, "--results-height": `${resultsHeight}%` }}>
    <GlobalTooltip />
    {workspaceDevMode&&<WorkspaceDevelopmentDialog mode={workspaceDevMode} state={workspaceDev} files={workspace.files} onClose={()=>{setWorkspaceDevMode(null);workspaceDevRequestsRef.current.clear()}} onGitRefresh={refreshWorkspaceGit} onGitDiff={path=>workspaceDevelopmentCommand('workspace.gitDiff',{path})} onPreview={previewWorkspaceReplace} onApply={applyWorkspaceReplace} onInvalidate={()=>setWorkspaceDev(current=>({...current,preview:null,applied:null}))}/> }
    {connectionDiagnostics&&<ConnectionDiagnosticsDialog report={connectionDiagnostics} onClose={()=>setConnectionDiagnostics(null)}/>}
    {objectAnalysis&&<OracleObjectDialog state={objectAnalysis} onClose={()=>{objectAnalysisRequestRef.current?.cancel();setObjectAnalysis(null)}} onDefinition={data=>{openOracleDefinition({owner:data.owner,name:data.name,type:data.type,text:data.ddl,originTabId:objectAnalysis.originTabId});setObjectAnalysis(null)}} onNavigate={target=>inspectOracleObject(target)}/>}
    {scriptDialog&&<SqlScriptDialog key={scriptDialog.tabId} source={scriptDialog.source} run={tabSessions[scriptDialog.tabId]?.scriptRun} timeout={queryTimeout} onTimeout={setQueryTimeout} onClose={()=>setScriptDialog(null)} onCancel={()=>sendNativeCommand('sql.cancel',{tabId:scriptDialog.tabId})} onStart={startScript} disabled={!isNativeHost||!tabSessions[scriptDialog.tabId]?.activeConnection||['No connection','Disconnected'].includes(tabSessions[scriptDialog.tabId]?.activeConnection?.id)||tabSessions[scriptDialog.tabId]?.connecting||tabSessions[scriptDialog.tabId]?.executing||tabSessions[scriptDialog.tabId]?.fetchingPage}/> }
    {recovery&&<DraftRecoveryDialog snapshot={recovery} onDiscard={()=>{try{localStorage.removeItem('fbsdb.sqlDrafts')}catch{}setRecovery(null)}} onRestore={restoreDrafts}/>}
    {paletteMode&&<IdeCommandPalette mode={paletteMode} onClose={()=>setPaletteMode(null)} onChoose={choosePaletteItem}
      files={[...tabs.map(tab=>({...tab,tabId:tab.id})),...workspace.files.filter(file=>!tabs.some(tab=>tab.path?.toLowerCase()===file.path.toLowerCase()))]}
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
        {id:'git',label:'Inspect workspace SQL Git changes',disabled:!isNativeHost||!workspace.root,run:()=>openWorkspaceDevelopment('git')},
        {id:'replace',label:'Preview replace in workspace SQL files',disabled:!isNativeHost||!workspace.root,run:()=>openWorkspaceDevelopment('replace')},
        {id:'search',label:'Search workspace',detail:'Ctrl+Shift+F',run:()=>setShowSearch(true)},
      ]}/>}
    <input ref={openFileInputRef} type="file" accept=".sql,text/plain" hidden onChange={async (event) => { const file = event.target.files?.[0]; if (file) { const content = await file.text(); syncActiveTab(); const id = `file:${crypto.randomUUID()}`; setTabs(current => [...current, { id, name: file.name, path: null, content, dirty: false, connectionProfileId: null }]); activeTabIdRef.current = id; setNativeTabId(id); setActiveTabId(id); sqlRef.current = content; setSql(content); setFileName(file.name); setFilePath(null); setFileDirty(false); setFileConnectionProfileId(null); } event.target.value = ""; }} />
    <FileMenu workspace={workspace} onNew={newSqlFile} onOpen={openSqlFile} onSave={() => saveSqlFile()} onOpenWorkspace={openWorkspace} language={language}>
      <ViewMenu settings={settings} layout={layout} language={language} onSetting={(id, value) => applySettings(changeSetting(settings, id, value))} onLayout={updateLayout} onPanel={showDockPanel} focusMode={focusMode} onFocusMode={setFocusMode} onResults={name => { setFocusMode(false); updateLayout(current => ({ ...current, resultsCollapsed: false })); setResultTab(name); }} onReset={resetPanelLayout} onSettings={() => setShowAppearance(true)} onCloseDetails={() => { setObjectDefinition(null); window.dispatchEvent(new Event('fbsdb.closeDetails')); }}/>
    </FileMenu>
    <div className="workbench"><aside className="activity-rail"><button className={`rail-button explorer-rail-toggle${sidebarOpen && !focusMode ? " selected" : ""}`} title={sidebarOpen && !focusMode ? "Hide explorer" : "Show explorer"} aria-label={sidebarOpen && !focusMode ? "Hide explorer" : "Show explorer"} aria-pressed={sidebarOpen && !focusMode} onClick={() => {if(focusMode){setFocusMode(false);setSidebarOpen(true)}else setSidebarOpen(open=>!open)}}><Database size={18} /></button><button className="rail-button" title="Search" aria-label="Search" onClick={() => { setShowSearch(true); setShowHistory(false); }}><Search size={18} /></button><button className="rail-button" title="History" aria-label="History" onClick={() => { setShowHistory(true); setShowSearch(false); }}><History size={18} /></button><button className="rail-button" title="SQL snippets" aria-label="SQL snippets" onClick={() => { setSnippetFilter(""); setShowSnippets(true); }}><Braces size={18} /></button><div className="rail-spacer" /><button className={`rail-button${focusMode?" selected":""}`} title="Editor focus mode (Ctrl+Alt+Z)" aria-label="Editor focus mode" aria-pressed={focusMode} onClick={()=>setFocusMode(value=>!value)}><Code2 size={18}/></button><button className="rail-button" title="Settings" aria-label="Settings" onClick={() => setShowAppearance(true)}><Settings2 size={18} /></button></aside>
      <DockWorkbench layout={layout} onChange={updateLayout} panels={dockPanels} hidden={focusMode}>
      <div className="editor-results-stack"><section className="editor-workspace"><div className="commandbar"><div className="command-left"><button className="icon-button" title="Open file (Ctrl+Shift+O)" aria-label="Open file (Ctrl+Shift+O)" onClick={openSqlFile}><FolderOpen size={16} /></button><button className="icon-button" title="Undo (Ctrl+Z)" aria-label="Undo" onMouseDown={(event) => event.preventDefault()} onClick={() => { editorRef.current?.trigger("toolbar", "undo", {}); editorRef.current?.focus(); }}><Undo2 size={15} /></button><button className="icon-button format-sql-button" title="Format SQL (Ctrl+Shift+I)" aria-label="Format SQL" onMouseDown={(event) => event.preventDefault()} onClick={formatSql}><AlignLeft size={15} /></button><span className="toolbar-separator" /><label className="fetch-limit-picker" title="Rows per result page"><span>Rows</span><select aria-label="Rows per result page" value={maxRows} onChange={(event) => setMaxRows(Number(event.target.value))}>{[100, 500, 1000, 5000, 10000].map((limit) => <option key={limit} value={limit}>{limit.toLocaleString()}</option>)}</select></label><button className={`run-button${!executing && !fetchingPage && !cancelling ? " idle" : ""}`} aria-label={cancelling ? "Cancelling SQL statement" : (executing || fetchingPage) ? "Cancel current SQL statement" : "Run SQL statement"} disabled={cancelling || activeTabReadonly} title={cancelling ? "Waiting for Oracle to stop this statement" : (executing || fetchingPage) ? "Cancel current SQL statement" : "Run SQL statement (Ctrl+Enter)"} onMouseDown={(event) => event.preventDefault()} onClick={() => (executing || fetchingPage) ? cancelQuery() : runQuery()}>{cancelling ? <Activity size={14} className="spin" /> : <Play size={14} fill="currentColor" />} {(executing || fetchingPage) && (cancelling ? "Cancelling…" : "Cancel")}</button><span className="toolbar-separator" /><button className="transaction-button commit" title="Commit" aria-label="Commit" onClick={() => finishTransaction("commit")} disabled={!transactionPending||executing||fetchingPage}><Check size={13} /></button><button className="transaction-button rollback" title="Rollback" aria-label="Rollback" onClick={() => finishTransaction("rollback")} disabled={!transactionPending||executing||fetchingPage}><X size={13} /></button></div><div className="command-right"><ConnectionControl inactive={Boolean(tabSession.inactive)} profile={activeConnection} connected={sessionConnected} connecting={connecting} connectingProfile={tabSession.connectingProfile} disabled={activeTabReadonly} open={showPicker} onOpen={() => setShowPicker(true)}/></div></div><EditorTabs tabs={tabs} activeId={activeTabId} onActivate={activateTab} onClose={closeTab} onCloseMany={closeTabs} onNew={newSqlFile}>{filePath && <button className={fileConnectionProfileId === activeConnection.id ? "icon-button file-connection-button bound" : "icon-button file-connection-button"} title="Bind current connection to this file" aria-label="Bind current connection to this file" disabled={!isNativeHost || !workspace.root || ["No connection", "Disconnected"].includes(activeConnection.id)} onClick={bindCurrentConnectionToFile}><Database size={14} /></button>}</EditorTabs><div className="breadcrumb"><button className="icon-button" aria-label="Navigate back" title="Back (Alt+Left)" onClick={()=>navigateHistory(-1)}><ArrowDown size={12} style={{transform:'rotate(90deg)'}}/></button><button className="icon-button" aria-label="Navigate forward" title="Forward (Alt+Right)" onClick={()=>navigateHistory(1)}><ArrowDown size={12} style={{transform:'rotate(-90deg)'}}/></button><button className="icon-button" title="File outline" aria-label="File outline" onClick={()=>setPaletteMode('outline')}><ListFilter size={13}/></button><span>{workspace.name}</span>{filePath && <><ChevronRight size={12} /><span>{filePath.split(/[\\/]/).slice(-2, -1)[0]}</span></>}<ChevronRight size={12} /><b>{fileName}{fileDirty ? " *" : ""}</b><EditorSymbolBreadcrumb editor={editorRef.current} tabId={activeTabId} outline={documentOutline}/>{filePath && <span className="file-connection-chip" title="Saved connection for this file"><Database size={11} />{(dbConnections.find(item => item.id === fileConnectionProfileId)?.name || fileConnectionProfileId) ?? "No profile bound"}</span>}</div><div className="editor-container"><Suspense fallback={<div className="editor-loading">Loading SQL editor…</div>}><Editor height="100%" defaultLanguage="sql" value={sql} onChange={handleEditorChange} theme={editorThemeName} onMount={(editor, monacoInstance) => { setMonaco(monacoInstance); 
    editor.onDidChangeModelContent(event => { const accepted = lastSuggestionAcceptanceRef.current; if (event.isUndoing && accepted && accepted.tabId === activeTabIdRef.current && event.versionId === accepted.version + 1 && Date.now()-accepted.at < 10000 && completionSettingsRef.current.learning) { suggestionLearningRef.current.record(accepted.scope, accepted.context, accepted.key, -1); lastSuggestionAcceptanceRef.current = null; publishLearning(); } }); completionTabKeyRef.current = editor.createContextKey("fbsdb.acceptCompletionOnTab", completionSettings.acceptTab); completionAcceptanceRef.current = editor.addCommand(0, (_accessor, key, context) => { if (completionSettingsRef.current.learning) { const scope = suggestionScope(); suggestionLearningRef.current.record(scope, context || 'statement', key); lastSuggestionAcceptanceRef.current = { scope, context: context || 'statement', key, tabId: activeTabIdRef.current, version: editor.getModel().getVersionId(), at: Date.now() }; publishLearning(); } const tabId = activeTabIdRef.current; completionRecentRef.current.set(tabId, [key, ...(completionRecentRef.current.get(tabId) || []).filter(item => item !== key)].slice(0, 100)); completionClientRef.current?.remember(key); }); editor.addCommand(monacoInstance.KeyCode.Tab, () => { editor.trigger("keyboard", "hideSuggestWidget", {}); editor.trigger("keyboard", "editor.action.inlineSuggest.hide", {}); editor.trigger("keyboard", "tab", {}); }, "(suggestWidgetVisible || inlineSuggestionVisible) && editorTextFocus && !fbsdb.acceptCompletionOnTab"); editor.addAction({ id: "fbsdb.runStatement", label: "Run SQL statement", run: () => runQueryRef.current?.() }); editor.addAction({ id: "fbsdb.deleteLine", label: "Delete line", precondition: "editorTextFocus && !editorReadonly", run: () => editor.trigger("keyboard", "editor.action.deleteLines", {}) }); editor.addAction({ id: "fbsdb.formatSql", label: "Format SQL", run: () => formatterRef.current?.() }); installRunGutter(editor, monacoInstance); editorRef.current = editor; lastEditorPositionRef.current = editor.getPosition(); editor.onDidChangeCursorPosition(({ position }) => { lastEditorPositionRef.current = position; }); editor.focus(); announceUiReady(); }} options={{ fontFamily: `"${resolveSetting(settings,"editor.fontFamily").value}", Consolas, monospace`, fontSize: codeStyle.fontSize, readOnly: activeTabReadonly, lineHeight: Math.max(codeStyle.fontSize + 2, resolveSetting(settings,"editor.lineHeight").value), minimap: { enabled: resolveSetting(settings,"editor.minimap").value }, padding: { top: 18, bottom: 18 }, lineNumbers: resolveSetting(settings,"editor.lineNumbers").value ? "on" : "off", renderLineHighlight: resolveSetting(settings,"editor.lineHighlight").value ? "line" : "none", renderWhitespace: resolveSetting(settings,"editor.whitespace").value ? "all" : "none", scrollBeyondLastLine: false, smoothScrolling: !reduceMotion, automaticLayout: true, wordWrap: resolveSetting(settings,"editor.wordWrap").value ? "on" : "off", glyphMargin: true, folding: true, guides: { indentation: resolveSetting(settings,"editor.indentGuides").value, highlightActiveIndentation: resolveSetting(settings,"editor.indentGuides").value }, suggest: { showWords: false, showSnippets: completionSettings.snippets, preview: false }, inlineSuggest: { enabled: completionSettings.inline, mode: "prefix", showToolbar: "never", minShowDelay: completionSettings.delay, suppressSuggestions: false }, quickSuggestions: false, suggestOnTriggerCharacters: false, acceptSuggestionOnEnter: "on", tabCompletion: completionSettings.acceptTab ? "on" : "off", parameterHints: { enabled: completionSettings.signatureHelp }, tabSize: codeStyle.tabSize, insertSpaces: codeStyle.insertSpaces, cursorBlinking: reduceMotion?"blink":"smooth", cursorSmoothCaretAnimation: reduceMotion?"off":"on", bracketPairColorization: { enabled: true }, overviewRulerLanes: 0, fixedOverflowWidgets: true }} /></Suspense>{objectDefinition && objectDefinition.originTabId === metadataOriginTabId && <OracleDefinitionView hidden={focusMode} source={objectDefinition} onClose={() => setObjectDefinition(null)}/>}</div><div className="editor-status"><EditorSessionStatus inactive={Boolean(tabSession.inactive)} editor={editorRef.current} tabId={activeTabId} connection={activeConnection} connected={sessionConnected} connecting={connecting} executing={executing} cancelling={cancelling} fetching={fetchingPage} startedAt={tabSession.operationStartedAt} stage={tabSession.sqlStage} readOnlyAnalysis={tabSession.analysisReadOnly} transactionPending={transactionPending} exporting={Boolean(view.streamState?.busy)} /><span>SQL</span><span>Spaces: {codeStyle.tabSize}</span><span>UTF-8</span><span className="status-sql"><Code2 size={12} /> Oracle SQL</span><button type="button" className="status-intellisense saved-state editor-save-button" title={activeTabReadonly ? "Read only" : "Save SQL file (Ctrl+S)"} aria-label={activeTabReadonly ? "Read only" : "Save SQL file (Ctrl+S)"} disabled={activeTabReadonly} onClick={() => saveSqlFile()}>{activeTabReadonly ? <><LockKeyhole size={12} /> Read only</> : fileDirty ? <><Save size={12} /> Unsaved</> : <><Save size={12} /> Saved</>}</button></div></section>
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
        {resultTab === "Problems" ? <ProblemsPanel items={allProblems} activeTabId={activeTabId} onNavigate={navigateProblem} /> : resultTab === "Explain" ? <ExplainPlanView result={explainResult} loading={executing && executionKind === "explain"} error={explainMessage} mode={view.planPresentation || "diagram"} onModeChange={mode => updateTabResult("planPresentation", mode, activeTabId)} /> : resultTab === "Results"
          ? <SqlResultsView
              onExportInsert={exportResultsInsertSql}
              sourceDefinition={definition?.tabId === activeTabId ? definition : null}
              onCloseSourceDefinition={() => { const owner = activeTabIdRef.current, requestId = sourceDefinitionRequestRef.current.get(owner); if (requestId) requestOwnersRef.current.delete(requestId); sourceDefinitionRequestRef.current.delete(owner); setDefinition(null); }}
              memoryItems={[{ key: "latest", label: view.latestResultName || "Latest", result: view.queryResult }, ...(view.resultSets || []).filter(item => item.pinned)].filter(item => item.result).map(item => ({ ...item, memoryKB: Math.round(estimateResultMemory(item.result) / 1024) }))}
              onReleaseResult={releaseResult} onPin={pinCurrentResult} onExplain={explainQuery}
              key={`${activeTabId}:${resultTab}:${view.selectedResultKey || "latest"}:${sqlResult?.viewIdentity||sqlResult?.resultId||"empty"}`}
              initialView={(resultTab === "Results" && view.selectedResultKey ? view.resultSets?.find(item => item.key === view.selectedResultKey)?.view : view[resultTab === "Explain" ? "planView" : "queryView"]) || {}}
              onViewStateChange={state => { if (resultTab === "Results" && view.selectedResultKey) updateTabResult("resultSets", sets => (sets || []).map(item => item.key === view.selectedResultKey ? { ...item, view: state } : item), activeTabId); else updateTabResult(resultTab === "Explain" ? "planView" : "queryView", state, activeTabId); }}
              onMetadata={metadata => { const url = URL.createObjectURL(new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" })), link = document.createElement("a"); link.href = url; link.download = "result-metadata.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }}
              onGenerateSql={sql => sendNativeCommand("result.openSql", { sql })}
              onSourceDefinition={column => { const owner = activeTabIdRef.current; setDefinition(null); const requestId = sendNativeCommand("result.columnDefinition", { column, tabId: owner }); if (requestId) { sourceDefinitionRequestRef.current.set(owner, requestId); requestOwnersRef.current.set(requestId, owner); } }}
              onUpdateDraft={(columns, rows) => sendNativeCommand("result.updateDraft", { columns, rows })}
              onServerFilter={applyServerFilters} onExportColumns={exportChosenColumns} onLookup={requestPrimaryKey}
              onClearFilter={() => setResultFilter("")} onChildren={openChildRecords} onSql={insertEditorText} onRelated={openRelatedRecords}
              onStreamExport={streamResultToFile} streamState={view.streamState} onCancelExport={() => sendNativeCommand("result.cancelExport")}
              result={sqlResult} onResultRendered={resultRenderMeasured} region={region} language={language} editorSql={sql} runState={runState} executing={executing && (resultTab === "Explain" ? executionKind === "explain" : executionKind !== "explain")}
              cancelling={cancelling} filter={resultTab === "Explain" ? "" : resultFilter} pageSize={maxRows}
              onFetchMore={resultTab === "Explain" ? undefined : fetchMoreResults}
              fetching={resultTab === "Results" && fetchingPage && pageRequestRef.current?.owner === activeTabId}
              pageError={resultTab === "Results" ? pageError : ""}
            />
          : <div className="output-empty"><div className="output-icon"><BookOpen size={18} /></div><b>{panelMessage ? (/ORA-\d+/i.test(panelMessage) ? "Oracle execution error" : "DBMS_OUTPUT") : "No output messages"}</b><span>{panelMessage || "DBMS_OUTPUT and execution notices appear here."}</span></div>}
      </section>
    </div>
      </DockWorkbench>
    </div>
    <footer className="app-status"><div><span className={activeConnection.id !== "No connection" && activeConnection.id !== "Disconnected" ? "online-dot" : "offline-dot"} /> {isNativeHost ? (activeConnection.name || activeConnection.id) : "Oracle Database · preview"}</div><div><span><Timer size={12} /> {sqlResult ? `${t('Database',language)} ${sqlResult.elapsedMs} ms` : t("Ready",language)}</span>{sqlResult?.clientTiming?.totalMs!=null&&<><span className="status-divider" /><span>{t('End-to-end',language)} {Math.round(sqlResult.clientTiming.totalMs)} ms</span><span className="status-divider" /><span>JSON {sqlResult.fetchMetrics?.[0]?.bytes?.toLocaleString(region)} {t('bytes',language)}</span></>}<span className="status-divider" /><span><LockKeyhole size={12} /> {transactionPending ? (language==='tr'?'İşlem bekliyor':'Transaction pending') : (language==='tr'?'Elle commit':'Manual commit')}</span></div><div><CircleHelp size={14} /><span>Feedback</span></div></footer>
    {showPicker && <ConnectionPicker items={dbConnections.map(item => ({ ...item, recent: recentProfiles.includes(item.id) }))} current={activeConnection} onClose={() => setShowPicker(false)} onConnect={switchConnection} favorites={favorites} setFavorites={setFavorites} groups={connectionGroupNames} onSetGroup={setConnectionGroup} managementError={managementError}
      onNew={() => { setShowPicker(false); setProfileEditor({}); }}
      onEdit={(profile) => { setShowPicker(false); setProfileEditor(profile); }}
      onDuplicate={(profile) => { setShowPicker(false); setProfileEditor({ ...profile, id: undefined, name: `${profile.name || profile.id} copy`, hasSavedCredentials: false }); }}
      onDelete={(profile) => { setManagementError(""); if (isNativeHost) sendNativeCommand("connection.delete", { profileId: profile.id }); else setDbConnections(current => current.filter(p => p.id !== profile.id)); }}
      onDisconnect={disconnectActiveConnection}
      onReconnect={profile => switchConnection(profile, true)}
      onTest={profile => { setShowPicker(false); setConnectionError(""); setAuthProfile({ ...profile, testOnly: true, tabId: activeTabIdRef.current }); setConnecting(false); }} />}
    {showSnippets && <ModalBackdrop onClose={() => setShowSnippets(false)} onMouseDown={(event) => event.target === event.currentTarget && setShowSnippets(false)}><section className="appearance-modal snippet-browser-modal" role="dialog" aria-modal="true" aria-labelledby="snippet-browser-title"><header className="appearance-header"><div><div className="eyebrow">SQL TOOLKIT</div><h2 id="snippet-browser-title">SQL snippets</h2><p>Search, preview, and insert SQL templates, or create your own.</p></div><div className="snippet-header-actions"><button className="button-secondary" onClick={() => { setSnippetFormOpen(true); setSnippetError(""); }}><Plus size={13} /> New custom</button><button className="icon-button" onClick={() => setShowSnippets(false)} aria-label="Close SQL snippets"><X size={17} /></button></div></header><label className="workspace-search-input snippet-search-input"><Search size={15} /><input autoFocus value={snippetFilter} onChange={(event) => setSnippetFilter(event.target.value)} placeholder="Search snippets or triggers…" aria-label="Search SQL snippets" /></label><div className="snippet-browser-body"><div className="snippet-list" role="listbox" aria-label="Available SQL snippets">{filteredSnippets.length ? filteredSnippets.map((snippet) => <button key={snippet.trigger} className={`snippet-option ${selectedSnippet?.trigger === snippet.trigger ? "selected" : ""}`} role="option" aria-selected={selectedSnippet?.trigger === snippet.trigger} onClick={() => { setSelectedSnippetTrigger(snippet.trigger); setSnippetFormOpen(false); }}><span className="snippet-trigger">{snippet.trigger}</span><span className="snippet-option-copy"><b>{snippet.label}</b><small>{snippet.detail}</small></span><ChevronRight size={14} /></button>) : <div className="query-history-empty"><Search size={20} /><b>No matching snippets</b><span>Try a SQL keyword or trigger such as `cte`.</span></div>}</div>{snippetFormOpen ? <div className="snippet-preview snippet-form-panel"><div className="snippet-preview-heading"><div><span className="appearance-section-title">CUSTOM TEMPLATE</span><b>Create a SQL snippet</b></div><Braces size={15} /></div><label>Trigger<input autoFocus maxLength={24} value={snippetDraft.trigger} onChange={(event) => { setSnippetDraft((draft) => ({ ...draft, trigger: event.target.value })); setSnippetError(""); }} placeholder="e.g. myquery" /></label><label>Name<input maxLength={48} value={snippetDraft.label} onChange={(event) => setSnippetDraft((draft) => ({ ...draft, label: event.target.value }))} placeholder="e.g. Active invoices" /></label><label>Description<input maxLength={100} value={snippetDraft.detail} onChange={(event) => setSnippetDraft((draft) => ({ ...draft, detail: event.target.value }))} placeholder="Shown in IntelliSense" /></label><label>SQL template<textarea spellCheck="false" value={snippetDraft.text} onChange={(event) => setSnippetDraft((draft) => ({ ...draft, text: event.target.value }))} placeholder="Use ${1:placeholder} for editable Tab stops" /></label>{snippetError && <div className="snippet-form-error" role="alert">{snippetError}</div>}</div> : selectedSnippet && <div className="snippet-preview"><div className="snippet-preview-heading"><div><span className="appearance-section-title">{customSqlSnippets.some((snippet) => snippet.trigger === selectedSnippet.trigger) ? "CUSTOM SNIPPET" : "BUILT-IN PREVIEW"}</span><b>{selectedSnippet.label}</b></div><div className="snippet-preview-tools">{customSqlSnippets.some((snippet) => snippet.trigger === selectedSnippet.trigger) && <button className="snippet-delete-button" aria-label={"Delete " + selectedSnippet.label} title="Delete custom snippet" onClick={() => deleteCustomSqlSnippet(selectedSnippet.trigger)}><Trash2 size={13} /></button>}<code>{selectedSnippet.trigger}</code></div></div><p>{selectedSnippet.detail}</p><pre>{selectedSnippet.text.replace(/\$\{\d+:([^}]+)\}/g, "$1")}</pre><div className="snippet-placeholder-note"><Zap size={13} /> Tab moves between editable placeholders.</div></div>}</div><footer className="appearance-footer"><span>{sqlSnippets.length} built-in · {customSqlSnippets.length} custom · Ctrl+Space opens trigger suggestions</span>{snippetFormOpen ? <div className="snippet-footer-actions"><button className="button-secondary" onClick={() => { setSnippetFormOpen(false); setSnippetError(""); }}>Cancel</button><button className="button-primary" onClick={saveCustomSqlSnippet}><Check size={13} /> Save snippet</button></div> : <button className="button-primary" disabled={!selectedSnippet} onClick={() => insertSqlSnippet(selectedSnippet)}><Braces size={14} /> Insert snippet</button>}</footer></section></ModalBackdrop>}
    {showSearch && <ModalBackdrop onClose={() => setShowSearch(false)} onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSearch(false); }}><section className="appearance-modal workspace-search-modal" role="dialog" aria-modal="true" aria-labelledby="workspace-search-title"><header className="appearance-header"><div><div className="eyebrow">WORKSPACE SEARCH</div><h2 id="workspace-search-title">Find in SQL files</h2><p>Case-insensitive search across SQL files in the open workspace.</p></div><button className="icon-button" aria-label="Close workspace search" onClick={() => setShowSearch(false)}><X size={17} /></button></header><label className="workspace-search-input"><Search size={15} /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search text in .sql files…" aria-label="Search SQL workspace" /></label><div className="workspace-search-summary">{!isNativeHost ? "Open the desktop app to search workspace files." : !workspace.root ? "Open a workspace to search its SQL files." : searchQuery.trim().length < 2 ? "Enter at least 2 characters to search." : searching ? "Searching workspace…" : `${searchMatches.length} match${searchMatches.length === 1 ? "" : "es"}${searchTruncated ? " · search limits reached; some files may be omitted" : ""}`}</div><div className="workspace-search-results">{searchMatches.map((match, index) => <button className="workspace-search-result" key={`${match.path}:${match.lineNumber}:${index}`} onClick={() => openWorkspaceSearchMatch(match)}><span><b>{match.relativePath}</b><small>Line {match.lineNumber}</small></span><code>{match.lineText}</code></button>)}{isNativeHost && workspace.root && searchQuery.trim().length >= 2 && !searching && !searchMatches.length && <div className="query-history-empty"><Search size={20} /><b>{searchTruncated ? "No matches in scanned files" : "No matches found"}</b><span>{searchTruncated ? "Some files were skipped because the workspace is large." : "Try a different term or shorter fragment."}</span></div>}{!isNativeHost && <div className="query-history-empty"><Search size={20} /><b>Workspace search is available in the desktop app</b><span>It searches SQL files in the open workspace.</span></div>}</div><footer className="appearance-footer"><span>{searchMatches.length ? "Select a match to open its file at that line." : "Search runs locally against workspace SQL files."}</span><button className="button-secondary" onClick={() => { setShowSearch(false); setSearchQuery(""); setSearchMatches([]); }}>Close</button></footer></section></ModalBackdrop>}
    {showHistory && <ModalBackdrop onClose={() => setShowHistory(false)} onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHistory(false); }}><section className="appearance-modal query-history-modal" role="dialog" aria-modal="true" aria-labelledby="query-history-title"><header className="appearance-header"><div><div className="eyebrow">QUERY HISTORY</div><h2 id="query-history-title">Recent executions</h2><p>SQL text only; bind values are never saved. The last 50 executions stay on this device.</p></div><button className="icon-button" aria-label="Close query history" onClick={() => setShowHistory(false)}><X size={17} /></button></header><label className="workspace-search-input history-search-input"><Search size={15} /><input autoFocus value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)} placeholder="Search SQL, profile, or status..." aria-label="Search query history" /></label><div className="query-history-list">{filteredQueryHistory.length ? filteredQueryHistory.map((entry) => <article className="query-history-item" key={entry.id}><div className="query-history-meta"><span className={`query-history-status ${entry.status.toLowerCase()}`} /><b>{entry.profile}</b><time>{new Date(entry.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><span className={`query-history-label ${entry.status.toLowerCase()}`}>{entry.status}</span></div><pre>{entry.sql}</pre><div className="query-history-actions"><span>{entry.detail}</span><button className="button-secondary" onClick={() => insertHistorySql(entry.sql)}><FileCode2 size={13} /> Insert into editor</button></div></article>) : queryHistory.length ? <div className="query-history-empty"><Search size={20} /><b>No matching executions</b><span>Try another SQL fragment, profile name, or status.</span></div> : <div className="query-history-empty"><History size={20} /><b>No saved queries yet</b><span>Executed statements will appear here.</span></div>}</div><footer className="appearance-footer"><span>{historyFilter.trim() ? `${filteredQueryHistory.length} of ${queryHistory.length} executions match` : `${queryHistory.length} of 50 recent executions on this device`}</span><button className="button-secondary" disabled={!queryHistory.length} onClick={() => setQueryHistory([])}>Clear history</button></footer></section></ModalBackdrop>}
    {showTnsSources && <TnsSources aliases={tnsAliases} onClose={() => setShowTnsSources(false)} />}
    {profileEditor && <ProfileEditor profile={profileEditor} aliases={tnsAliases} onClose={() => setProfileEditor(null)} onSaved={(id, connect, credentials) => { setProfileEditor(null); if (connect) { const item = dbConnectionsRef.current.find(p => p.id === id); if (item) switchConnection({ ...item, ...(credentials?.password ? { credentials } : {}) }, true); } }} onPreviewSave={(profile, connect) => { const item = { ...profile, title: profile.name, color: profile.env === "PROD" ? "rose" : "mint" }; setDbConnections(current => [...current.filter(p => p.id !== item.id), item]); setProfileEditor(null); if (connect) setActiveConnection(item); }} />}
    {renameResult&&<ModalBackdrop onClose={()=>{setRenameResult(null);setNewResultName('')}}><section className="appearance-modal result-rename-dialog" role="dialog" aria-modal="true" aria-label="Rename result">{managementContent.Name}<footer className="appearance-footer"><button type="button" className="button-secondary" onClick={()=>{setRenameResult(null);setNewResultName('')}}>Cancel</button></footer></section></ModalBackdrop>}
    {keyLookup?.tabId===activeTabId&&<ModalBackdrop onClose={()=>setKeyLookup(null)}><section className="appearance-modal result-lookup-dialog" role="dialog" aria-modal="true" aria-label="Primary key lookup">{managementContent.Lookup}<footer className="appearance-footer"><button type="button" className="button-secondary" onClick={()=>setKeyLookup(null)}>Close</button></footer></section></ModalBackdrop>}
    {resolveSetting(settings,'ui.connectionNotifications').value&&<div className="connection-progress-stack" aria-live="polite">{Object.entries(tabSessions).filter(([, session]) => session.connecting && session.connectingProfile).map(([tabId, session]) => <div className="connection-progress" role="status" key={tabId}><RefreshCw size={16} className="connection-progress-spinner" /><div><strong>Connecting to {session.connectingProfile}…</strong><span>{tabs.find(tab => tab.id === tabId)?.name || "SQL session"}</span></div></div>)}</div>}
    {plscopeReport && <ModalBackdrop onClose={() => setPlscopeReport(null)}><section className="appearance-modal plscope-dialog" role="dialog" aria-modal="true" aria-label="PL/Scope references"><header className="appearance-header"><div><h2>PL/Scope references</h2><p>{plscopeReport.target.owner}.{plscopeReport.target.name} · {plscopeReport.settings || 'Collection settings unavailable'}</p></div><button className="icon-button" aria-label="Close PL/Scope references" onClick={() => setPlscopeReport(null)}><X size={17} /></button></header><div className="plscope-reference-list">{plscopeReport.references.length ? plscopeReport.references.map((reference, index) => <button key={index} onClick={async () => { const source = await completionMetadataRef.current.load(plscopeReport.originTabId, { owner: reference.owner, name: reference.objectName, type: reference.objectType.replace(/ BODY$/, ''), body: reference.objectType.endsWith(' BODY') }, null, 'definition'); if (!source) return; setPlscopeReport(null); openOracleDefinition({ ...source, originTabId: plscopeReport.originTabId }, { lineNumber: reference.line, column: reference.column }); }}><b>{reference.owner}.{reference.objectName}</b><span>{reference.name} · {reference.usage}</span><code>{reference.line}:{reference.column}</code></button>) : <div className="output-empty"><b>No collected references</b><span>No PL/Scope identifiers are available for this object. Collection and compilation settings are managed explicitly.</span></div>}</div><footer className="appearance-footer"><span>{plscopeReport.references.length} reference(s){plscopeReport.truncated ? ' · first 2,000 shown' : ''}</span><button className="button-secondary" onClick={() => setPlscopeReport(null)}>Close</button></footer></section></ModalBackdrop>}
    {authProfile && <ConnectionAuthDialog key={`${authProfile.tabId}:${authProfile.id}`} profile={authProfile} connecting={tabSessions[authProfile.tabId]?.connecting || false} error={tabSessions[authProfile.tabId]?.connectionError || ""} onClose={() => setAuthProfile(null)} onConnect={submitConnectionCredentials} />}
    {pendingBindSql && <BindParameterDialog file={filePath} sql={pendingBindSql} onCancel={() => setPendingBindSql(null)} onExecute={(values) => executeStatement(pendingBindSql, values)} />}
    {pendingSwitch && <ModalBackdrop onClose={() => { setPendingSwitch(null); setRunState("Connection switch cancelled."); }}><section className="appearance-modal transaction-guard"><header className="appearance-header"><div><div className="eyebrow">UNCOMMITTED CHANGES</div><h2>{pendingSwitch.disconnect ? "Disconnecting" : "Switching connection"}</h2><p>Commit or roll back the pending transaction before {pendingSwitch.disconnect ? "disconnecting" : `connecting to ${pendingSwitch.name || pendingSwitch.id}`}.</p></div></header><footer className="appearance-footer"><button className="button-secondary" onClick={() => { setPendingSwitch(null); setRunState("Connection switch cancelled."); }}>Cancel</button><div><button className="transaction-button rollback" onClick={() => finishTransaction("rollback")}><X size={13} /> Rollback & {pendingSwitch.disconnect ? "disconnect" : "switch"}</button><button className="button-primary" onClick={() => finishTransaction("commit")}><Check size={13} /> Commit & {pendingSwitch.disconnect ? "disconnect" : "switch"}</button></div></footer></section></ModalBackdrop>}
    {pendingTabClose && <ModalBackdrop onClose={() => setPendingTabClose(null)}><section className="appearance-modal transaction-guard" role="dialog" aria-modal="true" aria-label="Close SQL session"><header className="appearance-header"><div><div className="eyebrow">SQL TAB SESSION</div><h2>{pendingTabClose.pending ? "Uncommitted changes" : "Could not close tab"}</h2><p>{pendingTabClose.message || "Resolve this tab’s transaction before closing it."}</p></div></header><footer className="appearance-footer"><button className="button-secondary" onClick={() => setPendingTabClose(null)}>Cancel</button><div>{pendingTabClose.pending ? ["rollback", "commit"].map(action => <button key={action} disabled={pendingTabClose.resolving} className={action === "commit" ? "button-primary" : "transaction-button rollback"} onClick={() => { const pending = { ...pendingTabClose, resolving: true }; pendingTabCloseRef.current = pending; setPendingTabClose(pending); sendNativeCommand(`transaction.${action}`, { tabId: pending.tabId }); }}>{action === "commit" ? "Commit" : "Rollback"} & close</button>) : <button className="button-primary" onClick={pendingTabClose.retry}>Retry</button>}</div></footer></section></ModalBackdrop>}
    {pendingFileAction && <ModalBackdrop onClose={() => setPendingFileAction(null)}><section className="appearance-modal transaction-guard"><header className="appearance-header"><div><div className="eyebrow">UNSAVED SQL</div><h2>Save changes to {fileName}?</h2><p>Your edits will be lost if you continue without saving.</p></div></header><footer className="appearance-footer"><button className="button-secondary" onClick={() => setPendingFileAction(null)}>Cancel</button><div><button className="transaction-button rollback" onClick={() => { const run = pendingFileAction.run; setPendingFileAction(null); run(); }}>Discard changes</button><button className="button-primary" onClick={() => saveSqlFile(() => { setPendingFileAction(null); pendingFileAction.run(); })}><Check size={13} /> Save</button></div></footer></section></ModalBackdrop>}
    {showAppearance && <AppearanceSettings aliases={tnsAliases} profiles={dbConnections} originTabId={metadataOriginTabId} activeProfileId={completionSession.activeConnection?.id} metadataEpoch={completionMetadataRef.current.session(metadataOriginTabId).epoch} settings={settings} onSettingsChange={applySettings} settingsError={settingsError} workspaceRoot={workspace.root} theme={theme} onThemeChange={setTheme} tokenColors={tokenColors} onTokenColorChange={updateTokenColor} completionSettings={completionSettings} onCompletionSettingsChange={setCompletionSettings} completionError={completionError} queryTimeout={queryTimeout} onQueryTimeoutChange={setQueryTimeout} completionVocabulary={oracleVocabularyStatus(completionSettings.oracleVersion, completionSession.oracleVocabulary)} completionMetadataStatus={completionSession.completionMetadataStatus || (completionSession.activeConnection && !["No connection", "Disconnected"].includes(completionSession.activeConnection.id) ? "Oracle metadata is loaded on demand." : "Offline Oracle vocabulary; connect to load object metadata.")} codeStyle={codeStyle} onCodeStyleChange={setCodeStyle} systemLocale={systemLocale} onClose={() => setShowAppearance(false)} />}
  </main>;
}






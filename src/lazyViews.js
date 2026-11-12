// Views loaded on first use. Each is its own bundle chunk, so the workbench starts without them.
import { lazy } from "react";

export const CallHierarchyDialog = lazy(() => import('./CallHierarchyDialog.jsx').then(module => ({ default: module.CallHierarchyDialog })));

export const ExpressionExplainDialog = lazy(() => import('./ExpressionExplainDialog.jsx').then(module => ({ default: module.ExpressionExplainDialog })));

export const DependencyGraphDialog = lazy(() => import('./DependencyGraphDialog.jsx').then(module => ({ default: module.DependencyGraphDialog })));

export const StructuralSearchDialog = lazy(() => import('./StructuralSearchDialog.jsx').then(module => ({ default: module.StructuralSearchDialog })));

export const AppearanceSettings = lazy(() => import("./AppearanceSettings.jsx").then(module => ({ default: module.AppearanceSettings })));

export const ExplainPlanView = lazy(() => import("./ExplainPlanView.jsx").then(module => ({ default: module.ExplainPlanView })));

export const OracleObjectInspector = lazy(() => import("./OracleObjectInspector.jsx").then(module => ({ default: module.OracleObjectInspector })));

export const OracleDefinitionView = lazy(() => import("./OracleDefinitionView.jsx").then(module => ({ default: module.OracleDefinitionView })));

const OracleObjectDialog = lazy(() => import("./OracleObjectDialog.jsx").then(module => ({ default: module.OracleObjectDialog })));

export const BindParameterDialog = lazy(() => import("./BindParameterDialog.jsx").then(module => ({ default: module.BindParameterDialog })));

export const SqlScriptDialog = lazy(() => import("./SqlScriptDialog.jsx").then(module => ({ default: module.SqlScriptDialog })));

export const DraftRecoveryDialog = lazy(() => import("./DraftRecoveryDialog.jsx").then(module => ({ default: module.DraftRecoveryDialog })));

export const BindLookupDialog = lazy(() => import("./BindLookupDialog.jsx").then(module => ({ default: module.BindLookupDialog })));

export const DateFormatDialog = lazy(() => import("./DateFormatDialog.jsx").then(module => ({ default: module.DateFormatDialog })));

export const SubqueryTrialDialog = lazy(() => import("./SubqueryTrialDialog.jsx").then(module => ({ default: module.SubqueryTrialDialog })));

export const QuickEvalDialog = lazy(() => import("./QuickEvalDialog.jsx").then(module => ({ default: module.QuickEvalDialog })));

export const CompareDialog = lazy(() => import("./CompareDialog.jsx").then(module => ({ default: module.CompareDialog })));

export const LocalHistoryDialog = lazy(() => import("./LocalHistoryDialog.jsx").then(module => ({ default: module.LocalHistoryDialog })));

export const RelatedFileCreateDialog = lazy(() => import("./RelatedFileCreateDialog.jsx").then(module => ({ default: module.RelatedFileCreateDialog })));

export const RunConsoleDialog = lazy(() => import("./RunConsoleDialog.jsx").then(module => ({ default: module.RunConsoleDialog })));

export const SessionInspectorDialog = lazy(() => import("./SessionInspectorDialog.jsx").then(module => ({ default: module.SessionInspectorDialog })));

export const ConnectionDiagnosticsDialog = lazy(() => import("./ConnectionDiagnosticsDialog.jsx").then(module => ({ default: module.ConnectionDiagnosticsDialog })));

export const WorkspaceDevelopmentDialog = lazy(() => import("./WorkspaceDevelopmentDialog.jsx").then(module => ({ default: module.WorkspaceDevelopmentDialog })));

export const WorkspaceManager = lazy(() => import("./WorkspaceManager.jsx").then(module => ({ default: module.WorkspaceManager })));

export const ResultValueDialog = lazy(() => import("./ResultDialogs.jsx").then(module => ({ default: module.ResultValueDialog })));

export const Editor = lazy(() => import("./monacoEditor.js"));

export const LocalRenameDialog = lazy(() => import('./LocalRenameDialog.jsx').then(module=>({default:module.LocalRenameDialog})));

export const ChangeSignatureDialog = lazy(() => import('./ChangeSignatureDialog.jsx').then(module=>({default:module.ChangeSignatureDialog})));

export const ExtractProcedureDialog = lazy(() => import('./ExtractProcedureDialog.jsx').then(module=>({default:module.ExtractProcedureDialog})));

export const EmbeddedSqlDialog = lazy(() => import('./EmbeddedSqlDialog.jsx').then(module=>({default:module.EmbeddedSqlDialog})));

export const QuickFixDialog = lazy(() => import('./QuickFixDialog.jsx').then(module=>({default:module.QuickFixDialog})));

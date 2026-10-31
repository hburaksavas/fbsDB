# fbsDB

**A focused Oracle SQL workspace for Windows.** fbsDB combines a native WinUI 3 desktop shell with a Monaco editor, connection-aware SQL tabs, schema exploration, and a capable results workbench.

> The project is in active development. The desktop app needs Windows and a reachable Oracle database for live SQL features; the browser build is a UI preview.

## Highlights

- **Connection-aware editing:** save Oracle connection profiles using Basic host/service or SID, TNS aliases, or a custom Oracle Net descriptor. Each SQL tab keeps its own session and pending transaction.
- **SQL tools in the editor:** Oracle-aware completion, schema suggestions, snippets, formatting, diagnostics, bind prompts, and execution-plan viewing.
- **Workspace-first workflow:** browse and search SQL files, keep multiple files and drafts open, and remember a file's connection profile without running its SQL on open.
- **Results built for investigation:** fetch paged rows from the original cursor; inspect, select, sort, filter, group, pivot, and format loaded data. Export to formats including CSV, JSON, SQL INSERT, and XLSX, with streaming options for larger CSV exports.
- **Control over database changes:** DML uses explicit Commit/Rollback; query cancellation, `DBMS_OUTPUT`, and per-tab execution context remain visible.
- **Adjustable workbench:** dockable panels, resizable areas, themes, editor preferences, keyboard shortcuts, and result defaults.

## Tech stack

| Layer | Technology |
| --- | --- |
| Desktop shell | WinUI 3, Windows App SDK, .NET 10 |
| Editor and UI | WebView2, React 19, Vite 6, Monaco |
| Oracle access | ODP.NET Core (`Oracle.ManagedDataAccess.Core`) |
| Credential storage | Windows current-user DPAPI |

The UI and Oracle service communicate through a tab-aware WebView2 message bridge. The Vite build can also be served as a browser preview, where native database commands are unavailable.

## Get started on Windows

You need Node.js/npm, Windows, and Microsoft Edge WebView2 Runtime. The repository pins .NET SDK **10.0.402** in `global.json`; the desktop build script can install it locally under `.tools/dotnet/`. A separate Oracle client is not needed for ordinary TCP connections because ODP.NET Core is included. A reachable Oracle database and valid credentials are needed to run queries.

From the repository root:

```powershell
npm ci
.\scripts\run-desktop.ps1
```

`run-desktop.ps1` builds the web bundle and unpackaged x64 desktop app, then launches it. To build without launching, run `scripts/build-desktop.ps1`. To create a self-contained portable x64 ZIP, run `scripts/package-desktop.ps1`; output goes to `artifacts/`. The portable package is currently unsigned, has no installer, and still requires WebView2 Runtime on the target machine.

For UI-only development, `npm run dev` starts the Vite preview. It cannot connect to Oracle outside the native desktop host.

## Connect to Oracle

Create a profile in **Connections** using a host, port and service name/SID, a discovered TNS alias, or a custom descriptor. fbsDB checks `TNS_ADMIN`, `ORACLE_HOME\network\admin`, and standard Oracle network locations for `tnsnames.ora`; extra paths can be added in Settings. For TCPS or wallets, keep the relevant Oracle Net files together and configure `TNS_ADMIN` as needed. Saved credentials are encrypted for the current Windows user.

User settings live at `%LOCALAPPDATA%\fbsDB\settings.json`. A workspace stores per-file connection choices in `<workspace>\.fbsdb\workspace.json`; it does not store credentials.

## Results column actions

Click a result column title to sort ascending/descending; Shift/Ctrl-click adds or toggles that column in multi-sort. Titles retain drag reordering and show sorting in their tooltip and `aria-sort`, with no header format/sort icons or type subtitle.

Right-click a title, or focus it and press Shift+F10/the menu key, to select/copy the loaded column, format it, sort/filter, fit/set its width, pin/move/hide/show columns, inspect exact statistics and metadata, add highlights, or insert SQL drafts. **Select All**, column copies and statistics cover loaded rows in the current filtered view across pages. Local view, copy and statistics actions do not fetch additional result rows or run user SQL. Source metadata is loaded only by the explicit source-definition action; generated SQL is inserted without execution. Formatting affects display only. Column types and available source details are in **Column Details**. All menus/popovers use the three theme palettes.

`node tests/column-menu-native.mjs [debug-endpoint]` runs an isolated ResultsGrid fixture in native WebView2 (default endpoint port 9338), covering all three themes and narrow layouts without database calls, screenshots, or system clipboard writes.

## SQL mini tools

Run a SELECT, then open **SQL mini tools** in the activity rail and choose **Save SELECT as tool**. Name the tool, edit bind labels/types/required fields, and select visible result columns under **SQL and view definition**. **Save tool** writes a versioned JSON definition containing SQL and view settings to `<workspace>/.fbsdb/tools/`.

Copy that folder with the workspace to share tools. Open a saved tool, choose your own Oracle profile, enter parameters, and click **Run**. Opening or saving never runs SQL. SQL remains visible and editable; both the UI and native host restrict mini tools to a single SELECT, including ordinary WITH queries. SELECT functions can still have side effects and Oracle permissions apply. Bind values, result rows and connection details are not saved in tool definitions. Results use the current SQL tab's session and paged cursor; existing Commit/Rollback rules still apply.

Native persistence and classification checks: `.tools/dotnet/dotnet.exe run --project tests/MiniToolsSmoke/FbsDb.MiniToolsSmoke.csproj -c Release`. Live Oracle/profile permission checks require a database.

## Develop and test

The first UX phase (items 1–11) is implemented: **Ctrl+P** searches open editors, workspace files, loaded Oracle objects, profiles and SQL history, with type filters. History opens in a new SQL tab without executing. **Ctrl+Shift+F** retains workspace content search. The **Open editors** menu searches by file/object name, path and profile.

The connection control now contains the tab's profile/environment, available Oracle schema/PDB, execution stage and pending transaction summary. Results show **Loaded rows only** and removable search/filter/sort scope chips; a server-filter chip explicitly reruns the original SELECT when removed. Run briefly highlights the exact selection or caret statement. Compact controls move less frequent editor actions into **More editor actions** when space is limited.

`node tests/ux-phase-one-native.mjs` exercises the real WinUI/WebView2 interface using an isolated host fixture: database/file commands are blocked, only interface scaling is forwarded, and local preferences are restored. `node tests/editor-tabs-native.mjs` checks 40-tab navigation and narrow layouts. Both require a running desktop WebView2 debug endpoint (default port 9337), and neither captures screenshots. These checks do not establish live Oracle context, permission behavior, or user research outcomes.

```powershell
npm run build
node --test
.\scripts\test-workspace.ps1
```

The JavaScript tests cover editor, workbench, results, and bridge behavior. Additional .NET smoke projects under `tests/` cover native services; some require a configured live Oracle database. `npm run test:sites` checks the browser worker build.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/` | React workbench, Monaco integration, SQL helpers, results UI |
| `native/FbsDb/` | WinUI shell, WebView2 host, Oracle and local services |
| `tests/` | JavaScript and .NET checks |
| `scripts/` | Desktop build/run/package and local demo database setup |
| `worker/` | Browser build asset worker |

The optional `scripts/setup-banking-db.ps1` sets up a local sample banking database for development on a machine with Oracle Free installed. Review the script and its database prerequisites before running it.

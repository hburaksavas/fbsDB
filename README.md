# fbsDB

**A focused Oracle SQL workspace for Windows.** fbsDB is a native WinUI 3 desktop app with a Monaco editor, one database session per SQL tab, schema exploration, PL/SQL development tools and a results grid you can investigate and edit.

> In active development. Live SQL features need Windows and a reachable Oracle database; the browser build is a UI preview only.

## Download

Get `fbsDB-win-x64.zip` from the [latest release](https://github.com/hburaksavas/fbsDB/releases/latest), extract the whole ZIP and run `fbsDB.exe`. Keep the `app/` folder beside it.

- Needs Windows x64 and Microsoft Edge WebView2 Runtime. .NET and the Oracle driver are bundled; no Oracle client is required for ordinary TCP connections.
- Builds are not code-signed yet, so SmartScreen may warn on first launch.
- Changes are listed in the [changelog](CHANGELOG.md).

## What it does

### Connections

- Profiles use host/port/service or SID, a TNS alias, or a custom Oracle Net descriptor. `tnsnames.ora` is found through `TNS_ADMIN`, `ORACLE_HOME\network\admin` and the standard locations; more paths can be added in Settings.
- Saved credentials are encrypted for the current Windows user (DPAPI).
- Each SQL tab has its own session and pending transaction. DEV/TEST/UAT/PROD labels are shown on the editor and its tab.
- A Basic profile can connect through an **SSH tunnel**. fbsDB runs the Windows OpenSSH client with your ssh config, ssh-agent and `known_hosts`, signs in with keys only and stores no SSH secrets.

### SQL editor

- Oracle-aware completion, schema suggestions, snippets, formatting, diagnostics, signature help and hover.
- Bind prompts, execution plans, query cancellation and `DBMS_OUTPUT`.
- DML waits for an explicit Commit or Rollback. A single top-level DDL asks for confirmation and is refused while a transaction is pending.
- **Ctrl+P** searches open editors, workspace files, loaded Oracle objects, profiles, SQL history, symbols, settings and commands. Most actions described below are palette commands.
- A side editor can show a second document beside the main one, and a tab can be moved into its own window together with its session, fetched rows and pending transaction.
- Files of 524,288 characters or more open in a large-file mode that switches off expensive analysis; the native reader accepts files up to 8 MB.

### PL/SQL development

- **Compare and compile** shows the current server source beside the SQL to compile and requires explicit confirmation. The server revision is checked again just before the DDL.
- **Debugging** uses `DBMS_DEBUG`: line breakpoints (F9), Continue, Step over/into/out, call stack and read-only values. The account needs `DEBUG CONNECT SESSION`.
- **Profiling** uses `DBMS_PROFILER` and lists unit times and the slowest lines, with marks beside open sources.
- **Run configurations** build a reviewable anonymous block for a procedure or function call, with typed arguments; definitions are saved under `.fbsdb/runs/` without values.
- Package specification and body share one tab (**Alt+O** switches). Outline, breadcrumbs, go to definition, find references, bookmarks and foldable `-- #region` comments work on local source.
- **Call hierarchy**, **structural search** and the **dependency graph** are built from workspace files and open editors. They never query the database and report what they could not analyse, such as dynamic SQL.
- Local refactorings, each previewed and applied as one undoable edit: rename local variable or parameter, change local procedure signature, extract assignments into a procedure, extract subquery into a CTE, move statement up/down and quick fixes for compiler diagnostics.

### Results

- Rows are fetched in pages from the original cursor. Loaded rows can be sorted, filtered, grouped, pivoted, searched and formatted without running SQL again.
- The toolbar shows nine actions by default; the rest are in its overflow menu and in the palette with a `Result: ` prefix.
- Column headers offer copy, format, sort/filter, width, pin/move/hide, statistics and SQL drafts.
- Export to formats including CSV, JSON, SQL INSERT and XLSX, with streaming for large CSV exports.
- CLOB, NCLOB and BLOB values up to 16,384 characters or bytes arrive with the row. Larger ones arrive as a preview and are loaded on demand from the opened cell; Export always writes whole values.

### Editing rows

- The pencil in the result toolbar turns editing on for a single-table result. Rows are identified by primary key, or by ROWID when there is none; if neither is possible the grid says why.
- Change cells directly in the table (double-click, Enter, F2 or typing). Empty text stores NULL.
- Four buttons: **Apply**, **Discard**, new row and delete row. Apply sends every change in one batch; if a statement fails the whole batch is rolled back and the edits stay in the grid.
- Apply never commits. The tab's Commit and Rollback finish the work.

### Workspace

- Browse and search SQL and Oracle source files (`.sql`, `.pks`, `.pkb`, `.prc`, `.fnc`, `.trg`). A file remembers its connection profile; opening it never runs its SQL.
- **Project rules** in `.fbsdb/workspace.json` hold extension/type associations, package path pairs, test paths, a default connection, bind definitions and run defaults. No credentials are stored there.
- **Workspace Git** stages, reviews and commits changed workspace files. Nothing is pushed.
- Dockable, resizable panels with layout presets and a layout lock, themes, editor preferences and customizable shortcuts.

User settings live in `%LOCALAPPDATA%\fbsDB\settings.json`.

### Error log

Unexpected errors of the app and its interface are written to `%LOCALAPPDATA%\fbsDB\logs`, one file per day; **Open log folder** in the command palette shows it. The log stays on the computer and never contains executed SQL, bind values or credentials. Attach the day's file when reporting a problem.

## Tech stack

| Layer | Technology |
| --- | --- |
| Desktop shell | WinUI 3, Windows App SDK, .NET 10 |
| Editor and UI | WebView2, React 19, Vite 6, Monaco |
| Oracle access | ODP.NET Core (`Oracle.ManagedDataAccess.Core`) |
| Credential storage | Windows current-user DPAPI |

The UI and the Oracle service talk through a tab-aware WebView2 message bridge generated from `contracts/native-bridge.json`. Monaco and the fonts ship inside the app, so the editor needs no network access at runtime.

## Build from source

You need Windows, Node.js with npm and WebView2 Runtime. The .NET SDK version is pinned in `global.json`; the build script can install it locally under `.tools/dotnet/`.

```powershell
npm ci
.\scripts\build\run-desktop.ps1
```

| Command | What it does |
| --- | --- |
| `scripts\build\run-desktop.ps1` | Builds the web bundle and the unpackaged x64 app, then starts it |
| `scripts\build-run.cmd` | Builds and starts the app directly |
| `scripts\run.cmd` | Starts the last build without rebuilding |
| `scripts\build\build-desktop.ps1` | Builds without starting |
| `scripts\release\package-desktop.ps1` | Creates the portable x64 ZIP under `artifacts/` |
| `npm run dev` | Vite UI preview; it cannot connect to Oracle |

Building the portable launcher needs Visual Studio Build Tools with **Desktop development with C++** and the Windows SDK.

After changing `contracts/native-bridge.json`, run `npm run generate:bridge`. The production build fails when the generated JavaScript, TypeScript or C# files are out of date.

## Test

```powershell
npm run build
npm test
npm run typecheck:bridge
npm run typecheck:domain
.\scripts\test\test-native.ps1
```

| Command | Covers |
| --- | --- |
| `npm test` | JavaScript unit tests for editor, workbench, results and bridge behaviour |
| `scripts\test\test-native.ps1` | Eleven database-independent .NET smoke projects |
| `npm run test:load` | Database-independent load scenarios; see [load testing](docs/load-testing.md) |
| `npm run test:desktop` | An isolated WinUI/WebView2 copy with Oracle commands blocked: startup, tabs, file open/save, dirty close and draft recovery |
| `scripts\test\test-portable.ps1` | Extracts and starts the portable ZIP from a path with spaces and Turkish characters |
| `npm run test:release -- -OracleProfile <profile id>` | The release gate, including the live Oracle regression |

The live Oracle regression (`tests/OracleLiveRegression`) accepts only localhost profiles and needs a dedicated test user with CREATE SESSION, CREATE TABLE, CREATE PROCEDURE and a tablespace quota. It creates uniquely named temporary objects and drops them afterwards. Reports are written under `.artifacts/`.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/` | React workbench, Monaco integration, SQL helpers, results UI |
| `contracts/` | Native bridge contract that generates the JavaScript, TypeScript and C# bindings |
| `native/FbsDb/` | WinUI shell, WebView2 host, Oracle and local services |
| `native/PortableLauncher/` | Launcher at the root of the portable ZIP |
| `tests/` | JavaScript and .NET checks |
| `scripts/` | Build, release, test and code generation scripts |
| `docs/` | Project documentation |

## Documentation

- [Architecture](docs/architecture.md): document state, workbench modules, the error log, native command handlers and the bridge contract
- [Accepted UI decisions](docs/ui-decisions.md): user-approved product decisions that later changes must keep
- [Product and release](docs/product-and-release.md): product focus, execution acceptance, release gate and publishing
- [Windows CI](docs/ci.md): what runs on pull requests and `master`, and the release workflow
- [Load testing](docs/load-testing.md) and [large-scale load results](docs/large-scale-load-testing.md)

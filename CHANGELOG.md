# Changelog

## 0.3.0 - Unreleased

Portable Windows x64 build. Extract the whole ZIP and run `fbsDB.exe`. Needs Microsoft Edge WebView2 Runtime; .NET and the Oracle driver are bundled. The build is not code-signed, so Windows SmartScreen may warn on first launch. Compare the ZIP with the `.sha256` file to check the download.

### PL/SQL development

- Debug a statement with `DBMS_DEBUG`: line breakpoints, Continue, Step over/into/out, call stack and read-only values. Units without debug information are recompiled only after confirmation, never on PROD.
- Profile with `DBMS_PROFILER`: unit times, the slowest lines and time marks beside open sources.
- Call hierarchy, structural search over tables, columns and exception handlers, and an object dependency graph, all built from workspace files and open editors without querying the database.
- Completion ranks values by the type the caret expects, shows real project calls in routine details and names positional arguments. Hovering `EXECUTE IMMEDIATE` previews the joined text; the CASE or analytic function at the caret can be explained with sample rows.

### Results and grid editing

- Cells are edited directly in the table and sent with one **Apply**; a failed batch is rolled back as a whole. Tables without a primary key are edited by ROWID.
- Apply never commits. A Commit whose outcome is unknown is reconciled, and a connection lost during Commit can be recovered.
- A row opens in the vertical view instead of a side panel, and the cell menu can go to a referenced row or show referencing rows. Foreign key values can be picked from the parent table.
- Missing privileges are explained and lock what they do not allow. Zoned values no longer take the session's time zone silently.
- Large LOB values arrive as previews and are loaded in parts on request. Rows copied from another grid can be pasted as new rows.
- The toolbar shows nine actions by default; the others are in its overflow menu and the palette.

### SQL scripts

- A small SQL*Plus subset runs locally and never reaches Oracle: `DEFINE`/`UNDEFINE` with `&name` substitution, `SET DEFINE ON|OFF`, `WHENEVER SQLERROR CONTINUE|EXIT` (the script's continue-on-error default), `DESCRIBE` for tables and views, and `PROMPT`, `REM` and other `SET` lines are skipped. They no longer merge into the next statement.

### Workspace and windows

- A tab can move to its own window together with its session, fetched rows and pending transaction. A side editor shows a second document beside the main one.
- The Git dialog stages, reviews and commits changed workspace SQL files. Nothing is pushed.
- Saved connections can be renamed.

### Reliability

- Unexpected errors of the app and its interface go to a local log under `%LOCALAPPDATA%\fbsDB\logs`, without SQL text, bind values or credentials.
- Grid Apply, user-written checks, grants, triggers and views are tested against a real Oracle database.
- The build resolves the .NET SDK in one place and accepts newer SDK versions.

## 0.2.0 - 2026-11-05

Portable Windows x64 build. Extract the whole ZIP and run `fbsDB.exe`. Needs Microsoft Edge WebView2 Runtime; .NET and the Oracle driver are bundled. The build is not code-signed, so Windows SmartScreen may warn on first launch. Compare the ZIP with the `.sha256` file to check the download.

### Results and grid editing

- Turn row editing on from the result toolbar. Rare tools sit in a pinnable More menu and every edit action is in the command palette.
- The Apply confirmation shows effect, target and a production warning. A running Apply shows what is running, elapsed time and a clear stop.
- Related-record checks before deleting rows, Tab-driven entry, key descriptions, record view and row templates.
- Locale-aware numbers, checkbox columns, value suggestions and date-part edits.
- Unapplied edits kept for another result are announced and can be discarded.

### Editor and workbench

- Editor, results and grid features from the roadmap, plus transaction tools, color previews, a date format designer and a regex workbench.
- Follow-up actions on Oracle failures and guidance in empty result and pending-change states.
- Searchable keyboard shortcut map (`?`), Reset panel layout in the palette and marks on changed settings categories.
- The status bar shows the active connection and the unapplied edit count.

### Accessibility and polish

- Dialog accessibility audit, reduced-motion support and screen-reader announcements for results and edit state.
- A higher-contrast mode, even spacing tokens and delayed loading skeletons.
- Repaired double-encoded Turkish UI strings.

### Reliability

- Monaco and fonts ship inside the app, so the editor needs no network at runtime. The splash stays up until the editor is ready.
- Grid Apply is tested against real Oracle using the statements the grid generates.

## 0.1.0 - 2026-10-31

First tagged version.

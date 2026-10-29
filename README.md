# fbsDB

fbsDB is a Windows desktop Oracle SQL workspace built with WinUI 3, WebView2/Monaco, .NET 10, and Oracle ODP.NET Core.

## Build and run on Windows

The repository pins .NET SDK 10.0.402 in `global.json`. Run `scripts/build-desktop.ps1`; if that workspace-local SDK is missing, the script bootstraps it without requiring administrator rights, then builds Monaco and compiles the x64 desktop target. The first run can be launched unpackaged with:

```powershell
$env:PATH = "$PWD\.tools\dotnet;$env:PATH"
winapp run native/FbsDb -p WindowsPackageType=None
```

Create a self-contained x64 portable ZIP with `scripts/package-desktop.ps1`. The generated folder and archive are written under `artifacts/`; .NET and Windows App SDK are bundled. Microsoft Edge WebView2 Runtime (Evergreen) is required on the target machine. The current ZIP is unsigned and has no installer.

Validate workspace persistence and per-file connection affinity with `scripts/test-workspace.ps1`.

## Oracle connections

ODP.NET Core is bundled through NuGet; a separately installed Oracle client is not required for ordinary TCP connections. fbsDB discovers aliases from `tnsnames.ora` under `TNS_ADMIN`, `ORACLE_HOME\network\admin`, and the conventional per-user/per-machine Oracle network directories. The Connections pane can add another `tnsnames.ora` path. Set `TNS_ADMIN` to the folder containing `tnsnames.ora` and, when used, `sqlnet.ora` and wallet files. The original descriptor and its directory are used so TCPS, wallet settings, and descriptor options are preserved. Credentials can be remembered using Windows current-user DPAPI protection.

The local settings file is `%LOCALAPPDATA%\fbsDB\settings.json`. Optional `tnsPaths` is an array of additional directories to scan. A workspace stores per-file connection profiles in `<workspace>\.fbsdb\workspace.json`; credentials are never written into workspace files.

## Current MVP behavior

- Open a workspace folder and browse its `.sql` files.
- Search SQL text across workspace files with `Ctrl+Shift+F` and jump to matching lines.
- Keep multiple SQL files open in editor tabs; unsaved edits stay with each tab. A file's selected connection profile is remembered in the workspace.
- Search discovered TNS aliases, connect asynchronously, and enter bind values in a parameter dialog.
- Run the selected SQL or the statement under the cursor, cancel a running statement, and page through SELECT rows using the Rows selection.
- Review the last 50 executions in local query history and insert a statement back into the editor; SQL text stays on this device and bind values are never recorded.
- Browse results in the selected page size (100–10,000); Next fetches more rows from the original cursor. Local filters and sorting apply to fetched rows.
- Build an Oracle execution plan for the selected statement or the statement under the cursor without running that statement.
- Read `DBMS_OUTPUT` lines after SQL and PL/SQL execution.
- DML uses a pending transaction until Commit or Rollback. Connection switching prompts before resolving pending changes.
- Load current-schema objects, columns, and indexed columns for IntelliSense and WHERE templates. Completion supports typing, Ctrl+Space, and Tab acceptance. Lint warns on `SELECT *` and `= NULL`, reports empty `WHERE` clauses, and checks basic syntax/schema references.
- Choose Default Teal, Dark Carbon, or Light Clear themes, custom SQL token colors, automatic suggestion behavior, indentation, and editor font size.
- Filter fetched result rows locally and export fetched rows to CSV.
- Copy all fetched result rows to the clipboard as TSV for pasting into spreadsheets or other tools.

Live Oracle behavior requires a reachable Oracle database and valid TNS alias/credentials. Oracle Free 26ai connection, query, transaction, schema, and IntelliSense paths have been verified locally; TCPS/wallet and large-result cancellation still need live validation.

## Local banking demo database

On a machine with the local Oracle Free installation, run `scripts/setup-banking-db.ps1` once. It creates the `BANKING_DB` pluggable database, adds the `CUSTOMER_APP`, `ACCOUNT_APP`, `LOAN_APP`, and `INDEMNITY_APP` schemas, seeds connected example records, and adds four basic connection profiles to fbsDB. The generated demo password is printed by the script and shared by the schema users; it is not saved in the fbsDB credential store. Connect with host `127.0.0.1`, port `1521`, and service `BANKING_DB`.

There are 65 tables: 12 each in the customer, account, and loan schemas, plus 29 in the indemnity schema. The lending schema has foreign keys to both customer and account records. The indemnity schema models the claim through payment to the creditor, customer credit, repayment schedule, collection attempts, receipts and installment allocations, promises to pay, legal proceedings, costs, adjustments, and balance snapshots. Its object names are English; table and column comments are Turkish. Each schema has read-only access to the other demo tables so the sample database can be explored from any of the four profiles. `scripts/verify-banking-db.sql` checks profile connectivity, table and foreign-key counts, sample rows, and indemnity column-comment coverage.
- Sort fetched result rows by any column; numeric and date columns use value-aware ordering, with nulls kept last.
- Export fetched rows as an Oracle INSERT script, with quoted identifiers, type-aware numeric/date literals, and a warning when results were truncated.
- Choose a persistent result page size (100, 500, 1,000, 5,000, or 10,000). This is not a maximum result count.
- Run the current SQL statement or selection from the editor with Ctrl+Enter.
- Double-click a schema object to insert a qualified SELECT * query with a 100-row preview limit.
- View the Oracle profile associated with each workspace SQL file and bind the active connection from the editor toolbar.
- Format selected SQL or the full editor with `Ctrl+Shift+I`; SQL keywords and clause layout are normalized, while PL/SQL blocks are preserved.
- Export fetched query rows as JSON objects keyed by column name, with duplicate column names made unique.
- Search recent query history by SQL text, connection profile, execution status, or result detail.
- Click a result cell to inspect its full value, type, row, and copy the value; useful for long text and CLOB columns.
- Expand built-in Oracle SQL snippets from IntelliSense with triggers such as `sel`, `ins`, `upd`, `del`, `cte`, and `daterange`; use Ctrl+Space to open suggestions and Tab to move through placeholders.
- Browse built-in SQL snippets from the SQL Snippets activity-rail button; search by trigger or description, preview the template, then insert it at the editor cursor with editable Tab stops.
- Create custom SQL snippets with unique triggers and tab-stop placeholders; they are saved on this device and appear in both the snippet browser and IntelliSense.

## Saved connection profiles

Connections are saved profiles with separate IDs, display names, Oracle usernames and explicit UNKNOWN/DEV/TEST/UAT/PROD environments. Multiple profiles can use one discovered TNS alias. Use + under Connections to create one; manage profiles in the connection picker. The first launch migrates existing alias identities without changing credential or workspace keys. Subsequent alias discovery does not automatically create profiles. Missing TNS sources leave profiles visible but unavailable.

TNS_ADMIN is discovered automatically; Settings → TNS sources adds other tnsnames.ora locations. Test opens a temporary connection and leaves the active Oracle session unchanged. Every SQL tab has its own Oracle session, transaction, query cancellation and schema cache. Even tabs using the same profile are isolated. New tabs start disconnected; a saved file can restore its profile without executing SQL. Resolve pending transactions before switching, reconnecting or disconnecting. Disconnect an active profile before editing or deleting it.

Run connection persistence and credential regression checks with `.tools/dotnet/dotnet.exe run --project tests/ConnectionSmoke/FbsDb.ConnectionSmoke.csproj -c Release`. These checks use temporary settings and test-only DPAPI credentials, not a live Oracle server.

New connections default to Basic (host, TCP port, Service Name or SID); TNS and Custom descriptor are also supported. Basic and Custom descriptor profiles require no tnsnames.ora file. Existing profiles without a stored method remain TNS. Custom descriptors contain Oracle Net settings only; credentials stay in the separate username/password fields.

Read-only live paging checks: `.tools/dotnet/dotnet.exe run --project tests/PagingSmoke/FbsDb.PagingSmoke.csproj -c Release -- FBSDB_LOCAL`. These require saved credentials for that profile and verify sequential pages, boundaries, cursor replacement and page-size changes.

Tab isolation checks: `.tools/dotnet/dotnet.exe run --project tests/TabSessionsSmoke/FbsDb.TabSessionsSmoke.csproj -c Release -- FBSDB_LOCAL`. Uses two real Oracle sessions, SELECT queries and zero-row UPDATEs to test transaction, cancellation, cursor and close isolation without changing employee data.

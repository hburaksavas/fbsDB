# fbsDB

**A focused Oracle SQL workspace for Windows.** fbsDB combines a native WinUI 3 desktop shell with a Monaco editor, connection-aware SQL tabs, schema exploration, and a capable results workbench.

> The project is in active development. The desktop app needs Windows and a reachable Oracle database for live SQL features; the browser build is a UI preview.

## Download

Get `fbsDB-win-x64.zip` from the [latest release](https://github.com/hburaksavas/fbsDB/releases/latest), extract the whole ZIP and run `fbsDB.exe`. It needs Windows x64 and Microsoft Edge WebView2 Runtime; .NET and the Oracle driver are bundled. Builds are not code-signed yet, so SmartScreen may warn on first launch. Changes are listed in the [changelog](CHANGELOG.md).

## Highlights

- **Connection-aware editing:** save Oracle connection profiles using Basic host/service or SID, TNS aliases, or a custom Oracle Net descriptor. Each SQL tab keeps its own session and pending transaction.
- **SQL tools in the editor:** Oracle-aware completion, schema suggestions, snippets, formatting, diagnostics, bind prompts, and execution-plan viewing.
- **Workspace-first workflow:** browse and search SQL files, keep multiple files and drafts open, and remember a file's connection profile without running its SQL on open.
- **Results built for investigation:** fetch paged rows from the original cursor; inspect, select, sort, filter, group, pivot, and format loaded data. Export to formats including CSV, JSON, SQL INSERT, and XLSX, with streaming options for larger CSV exports.
- **Editable results:** turn on row editing for a single-table result with a primary key, stage changes locally, review the exact SQL, and Apply without committing.
- **Control over database changes:** DML uses explicit Commit/Rollback; query cancellation, `DBMS_OUTPUT`, and per-tab execution context remain visible.
- **Adjustable workbench:** dockable panels, resizable areas, themes, editor preferences, keyboard shortcuts, and result defaults.

## Tech stack

| Layer | Technology |
| --- | --- |
| Desktop shell | WinUI 3, Windows App SDK, .NET 10 |
| Editor and UI | WebView2, React 19, Vite 6, Monaco |
| Oracle access | ODP.NET Core (`Oracle.ManagedDataAccess.Core`) |
| Credential storage | Windows current-user DPAPI |

The UI and Oracle service communicate through a tab-aware WebView2 message bridge. Monaco and the fonts ship inside the application bundle, so the editor needs no network access at runtime. The Vite build can also be served as a browser preview, where native database commands are unavailable.

## Get started on Windows

You need Node.js/npm, Windows, and Microsoft Edge WebView2 Runtime. The repository pins .NET SDK **10.0.402** in `global.json`; the desktop build script can install it locally under `.tools/dotnet/`. A separate Oracle client is not needed for ordinary TCP connections because ODP.NET Core is included. A reachable Oracle database and valid credentials are needed to run queries.

From the repository root:

```powershell
npm ci
.\scripts\run-desktop.ps1
```

`run-desktop.ps1` builds the web bundle and unpackaged x64 desktop app, then launches it. To build without launching, run `scripts/build-desktop.ps1`. To create a self-contained portable x64 ZIP, run `scripts/package-desktop.ps1`; output goes to `artifacts/`. Building the portable launcher requires Visual Studio Build Tools with **Desktop development with C++** and the Windows SDK. The portable package is currently unsigned, has no installer, and still requires WebView2 Runtime on the target machine.

Extract the entire ZIP and run the icon-bearing `fbsDB.exe` at its root. Keep the `app/` folder beside it when moving the package. Application DLLs, .NET/Windows App SDK files, localization folders, icons and the web editor are grouped inside `app/`; the root contains only the launcher, `app/` and `README-portable.txt`. The native launcher adds no additional runtime dependency. Web content is replaced on each build so obsolete hashed bundles do not accumulate in the ZIP.

`scripts/test-portable.ps1` extracts the ZIP into a new path containing spaces and Turkish characters, launches it from an unrelated working directory with isolated settings, and checks WebView2/Monaco startup plus embedded EXE icons and running window icons. It saves its report under `.artifacts/portable-smoke/`.

For UI-only development, `npm run dev` starts the Vite preview. It cannot connect to Oracle outside the native desktop host.

## Connect to Oracle

Create a profile in **Connections** using a host, port and service name/SID, a discovered TNS alias, or a custom descriptor. fbsDB checks `TNS_ADMIN`, `ORACLE_HOME\network\admin`, and standard Oracle network locations for `tnsnames.ora`; extra paths can be added in Settings. For TCPS or wallets, keep the relevant Oracle Net files together and configure `TNS_ADMIN` as needed. Saved credentials are encrypted for the current Windows user.

User settings live at `%LOCALAPPDATA%\fbsDB\settings.json`. A workspace stores per-file connection choices in `<workspace>\.fbsdb\workspace.json`; it does not store credentials.

Workspaces also include Oracle source files: `.pks` (package specification), `.pkb`
(package body), `.prc` (procedure), `.fnc` (function), and `.trg` (trigger). They
participate in search, Git/replace, worksets and ordinary file operations. Use
**New Oracle source file** and enter the extension to create a source template;
names without an extension default to an empty `.sql` file. Review the generated
declaration and replace the trigger's `table_name` placeholder before running it.
Creation never executes SQL. The editor reads supported object declaration headers
and warns when the declared type disagrees with the extension. This checks source
identity, not full PL/SQL syntax or Oracle compilation.

Open both local package sources in the workspace, then use **Switch to body /
specification**, **Alt+O** while the editor has focus, or the command palette to
switch between them. Matching uses the declarations, workspace, connection and
schema context, including Oracle quoted-name casing. Ambiguous matches are disabled;
when no schema is known, unqualified declarations must also share a folder. Each
file keeps its own unsaved text, cursor position and native session. A unique pair
shares one logical tab with **Specification** and **Body** views. The tab's close
button reviews both documents through the existing close flow; **Open editors**
continues to offer each file separately.

Use **Find related sources** (or Alt+O when there is no open pair) to inspect
unopened package sources by their declarations, then explicitly choose a file to
open. Search reads up to 300 workspace files, 1 MB per file and 8 MB total; skipped
files and partial results are reported. Hidden/ignored folders and links are
excluded. Unsaved open-editor text takes precedence over disk snapshots. Discovery
never runs SQL or changes connection preferences.

Open **Project rules** in the workspace background menu or **Configure project
rules** in the command palette to edit workspace-specific extension/type
associations, package path pairs and related test paths. Rules are versioned in
`.fbsdb/workspace.json`; stale edits are rejected if the saved rules have changed.
Patterns use `{name}` for the declared package name and optional `{directory}/`
for the source folder. For example, pair `spec/{name}.spec` with
`impl/{name}.impl` after associating `.spec` with PACKAGE and `.impl` with PACKAGE
BODY. Identity and connection/schema checks still apply. Relative test patterns
such as `tests/test_{name}.sql` add test files to **Find related sources**;
**Alt+Shift+O** opens this chooser from the editor. Choosing a test opens its text
without running it. Reverse discovery from a test back to its package and dedicated
compile actions are available through **Compare and compile**.

`npm run test:desktop -- -ProjectRulesTest` runs an isolated native UI check of
rule persistence, custom-source discovery/grouping, independent unsaved text and
caret positions, grouped close review, saving one member and opening a related
test. Oracle commands are blocked; the actual file handlers and rule storage run
against a temporary workspace. Its report is `project-rules-report.json` under
`.artifacts/desktop-regression/`. The same flag also runs the source comparison,
run configuration and script source fixtures.

## Source compilation and database comparison

**Compare and compile** opens the current server source beside the exact SQL to
compile. Connected local source files capture a metadata baseline; changes since
that baseline are highlighted during review. The same review opens when Run or
Run script targets one supported package/procedure/function/trigger source.
Scripts pause before each PL/SQL source step for its own review and approval.

Compilation requires explicit review confirmation and no pending transaction.
An expiring, single-use native token binds the submitted SQL, physical connection
and server revision. The server revision is checked again immediately before DDL;
a changed source or connection requires a new comparison. The check is not an
atomic replacement against other Oracle sessions. Unknown/inaccessible source is
reported rather than treated as an empty definition. Problems links retain the
submitted editor snapshot and map compiler locations only when source matches.
Oracle DDL's implicit commits are described in the [Oracle SQL reference](https://docs.oracle.com/en/database/oracle/oracle-database/26/sqlrf/Types-of-SQL-Statements.html).

The live regression includes uniquely named temporary procedures/packages for
successful compilation, compiler errors, source-version conflicts and pending DML
protection, then removes its fixtures. The native renderer comparison test uses a
deterministic metadata fixture and sends no DDL.

## Procedure and function calls

Use **Create call** on a package specification or standalone routine, or open
**Open procedure/function run configurations** from the command palette. Choose
an overload, enter typed values, optionally omit defaulted IN arguments, review
the generated anonymous block and click **Run call**. Calls execute the current
database routine on this tab's session; compilation is a separate action. The
profile and auto commit mode remain visible, and routines can change data or
commit internally. OUT/IN OUT values and function returns appear in Output.

**Save call definition** stores versioned target/parameter definitions under
`.fbsdb/runs/`. Values, outputs and connection details are excluded. Opening or
saving a definition never executes it, and reopening clears values. Sensitive
inputs are also excluded from execution parameter metadata. Supported binds are
NUMBER, VARCHAR2/NVARCHAR2, DATE, TIMESTAMP and input CLOB. Record/collection,
REF CURSOR, timezone-specific and other unsupported signatures are reported
rather than mapped to guessed scalar values. NUMBER outputs preserve Oracle
precision; DATE/TIMESTAMP outputs retain their components and fractional seconds.
ODP.NET direction semantics are documented in [OracleParameter properties](https://docs.oracle.com/en/database/oracle/oracle-database/26/odpnt/ParameterProperties.html).

## Results column actions

Click a result column title to sort ascending/descending; Shift/Ctrl-click adds or toggles that column in multi-sort. Titles retain drag reordering and show sorting in their tooltip and `aria-sort`, with no header format/sort icons or type subtitle.

Right-click a title, or focus it and press Shift+F10/the menu key, to select/copy the loaded column, format it, sort/filter, fit/set its width, pin/move/hide/show columns, inspect exact statistics and metadata, add highlights, or insert SQL drafts. **Select All**, column copies and statistics cover loaded rows in the current filtered view across pages. Local view, copy and statistics actions do not fetch additional result rows or run user SQL. Source metadata is loaded only by the explicit source-definition action; generated SQL is inserted without execution. Formatting affects display only. Column types and available source details are in **Column Details**. All menus/popovers use the three theme palettes.

### Large values

CLOB, NCLOB and BLOB values up to 16,384 characters or bytes arrive with the row. Larger ones arrive as a preview (the first 2,000 characters, or 512 bytes for a BLOB) together with their full size. Open the cell (Enter) to load the next part or the whole value, with progress and a Stop button; loaded whole, the value replaces the preview in the grid. Copying a cell that is still a preview copies the preview with a note saying it is incomplete; Export always writes whole values. A preview reads the value as it was when the query ran, even after Commit, Rollback or changes from other sessions, until the result is closed, the query runs again or the tab disconnects; after that it asks you to run the query again.

`node tests/column-menu-native.mjs [debug-endpoint]` runs an isolated ResultsGrid fixture in native WebView2 (default endpoint port 9338), covering all three themes and narrow layouts without database calls, screenshots, or system clipboard writes.

## Editing result rows

Turn on editing with the pencil in the result toolbar. A result is editable only when it comes from one source table and includes that table's primary key columns; otherwise the grid lists the reasons. Computed, generated, expression, LOB and binary columns stay locked and explain why in their header.

Edits are local drafts until you apply them: F2 edits a cell, **Set NULL** stores an explicit NULL (different from empty text), **New row** adds a row whose omitted columns use database defaults, **Delete row** marks a row, and Ctrl+Z/Ctrl+Y undo and redo draft changes. Rarer tools sit in **More** and can be pinned to the edit row: record view, checkbox columns, spreadsheet paste with preview, bulk edit, duplicate row, row templates, changes-only and deletions-only views, and SELECT checks. Every edit action is also in the command palette (Ctrl+P) with a `Grid: ` prefix. Drafts stay in memory for the tab and table, are never written to disk, and a notice offers to discard them when another result is showing.

**Pending** shows each change with the parameterized SQL it would run. **Apply** states the effect, the target connection and a production warning, then sends the statements one at a time after a savepoint in the tab's session. Apply never commits and is refused while auto commit is on. It stops at the first failure or unexpected row count and by default returns to the savepoint; values changed by another session are reported rather than overwritten. The last Apply can be undone back to its savepoint, and corrected drafts can be retried without resending what already succeeded. Commit or Rollback remains your explicit step. Before deleting, **related-record checks** list foreign keys in both directions and can count referencing rows.

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
npm test
npm run typecheck:bridge
npm run typecheck:domain
.\.tools\dotnet\dotnet.exe run --project tests/BridgeContractSmoke/BridgeContractSmoke.csproj -c Release
.\scripts\test-workspace.ps1
```

The JavaScript tests cover editor, workbench, results, and bridge behavior. Additional .NET smoke projects under `tests/` cover native services; some require a configured live Oracle database.

`npm run test:load` runs repeatable database-independent load scenarios for large result filtering/sorting, CSV export, schema completion, SQL batches and workspace search. Use `-- --profile smoke --enforce-budgets` for the CI check, or `-- --profile stress` for larger datasets. JSON reports go to `.artifacts/load/`. Workload sizes, timed runs, measurement limits and complementary live Oracle scenarios are described in [Load testing](docs/load-testing.md).

`npm run test:desktop` builds and launches an isolated WinUI/WebView2 copy, then checks startup, tab editing/switching, native file open/save, Save As, save acknowledgement ordering, dirty close, external changes, and draft recovery/discard. It uses separate settings and browser storage, blocks Oracle commands, and keeps a JSON report under `.artifacts/desktop-regression/`. Picker path selection is substituted by the fixture; actual file reads/writes use the native handlers. The Windows picker window itself is not covered. Use `npm run test:desktop -- -SkipBuild` to reuse the current web bundle while still building a separate desktop copy. `-LoadTest` runs the desktop grid load fixture and `-DragTest` the Object Explorer drag fixture. Each run removes the app copies, WebView2 profiles and test files of all but the newest 5 runs and keeps every report; `npm run clean:test-output` lists that removal without performing it.

Live Oracle service regression: `.\.tools\dotnet\dotnet.exe run --project tests/OracleLiveRegression/OracleLiveRegression.csproj -c Release -- FBSDB_LOCAL`. It accepts only localhost profiles and requires an open local test database, saved credentials, Node.js, and CREATE SESSION, CREATE TABLE and CREATE PROCEDURE with a tablespace quota; run it from the repository root with a dedicated test user. `scripts/setup-fbsqa-fixtures.ps1` adds what the grant, identity, trigger and view checks need on the local BANKING_DB test database, and those checks are reported as skipped without it. It creates uniquely named temporary tables, procedures and packages, tests real DML/Commit/Rollback on those fixtures only, and drops them during cleanup. It also checks independent sessions, paging, cancellation, timeout, queued metadata cancellation, explicit/idle reconnect, source compilation, and grid Apply using the statements the grid's own code generates. JSON reports go to `.artifacts/oracle-live/`; user tables and saved credentials are not changed.

Document state, native command handlers, and the shared bridge contract are described in [Architecture](docs/architecture.md). After changing `contracts/native-bridge.json`, run `npm run generate:bridge`; the production build checks that generated JavaScript, TypeScript, and C# files are up to date.

[Windows CI](docs/ci.md) validates PRs and `master` pushes with JavaScript tests, bridge generation/type checks, load smoke scenarios, eleven database-independent native smoke projects, a large TNS smoke, and a Windows x64 Release build. The shared native suite is available locally as `scripts/test-native.ps1`; desktop UI and live Oracle checks remain separate integration commands.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/` | React workbench, Monaco integration, SQL helpers, results UI |
| `contracts/` | Native bridge contract that generates the JavaScript, TypeScript and C# bindings |
| `native/FbsDb/` | WinUI shell, WebView2 host, Oracle and local services |
| `tests/` | JavaScript and .NET checks |
| `scripts/` | Desktop build/run/package and local demo database setup |
| `docs/` | Architecture, CI, load testing, release acceptance and UI decisions |

The optional `scripts/setup-banking-db.ps1` sets up a local sample banking database for development on a machine with Oracle Free installed. Review the script and its database prerequisites before running it.

Product focus, execution acceptance, history privacy, upgrade/rollback and the signed release gate: [Product and release](docs/product-and-release.md).

## Feature notes

Editor context: explicit DEV/TEST/UAT/PROD labels appear on the editor border and
saved file/profile associations in the project tree. File tabs show PROD as text
and other environments as a small colored dot with an accessible label and tooltip
([accepted UI decisions](docs/ui-decisions.md)). Unknown classifications stay unknown. Tab state text distinguishes connecting, connected,
disconnected, inactive and pending transactions. Result provenance compares the
captured editor text and session context with the current document; a matching
snapshot does not imply current database data. Reverting to the executed text
clears the edit marker independently of saving. Related-source discovery also
works from a test file back to source declarations through configured test paths;
ambiguous matches require explicit selection.

Source scripts pause at each native PL/SQL source step for a separate server diff
and explicit approval. A nonce binds approval to that script, tab and statement;
the source version and SQL are checked again immediately before DDL. Cancel stops
remaining statements and preserves the report of already completed work. Up to 32
source units per open file receive an initial metadata baseline; absence of an
earlier baseline is displayed explicitly. Oracle source replacement remains
non-atomic with respect to DDL from other sessions after the final check.

Explorer > Structure lists routines, cursors, types and subtypes with text/type
filters. F12, Alt+Left/Right and Shift+F12 share symbol identities. Shift+F12 searches
the current document (100,000 characters; first 128 same-name candidates); the UI
reports limits. PL/Scope remains a separate explicit action for collected server
references. Signature help and hover include attached local comments, available
metadata descriptions and illustrative bind calls; no example executes itself.


Project rules include relative package/migration/script/test folders, saved profile
references, a default connection, bind definitions and run defaults. Explorer can
filter by project area. The command palette exposes project connections, “New
project SQL file” and “Use project run defaults”. Opening or saving a project does
not connect or execute SQL. Creating a project SQL file connects only to its
explicit saved default profile; a missing profile remains visible for selection.
Project bind definitions seed the execution form, while file-specific definitions
take precedence. Values are entered at execution and are not stored in the project.
Timeout/page-size defaults apply on an explicit action; transaction mode is
controlled separately. Project settings retain revision checks and reject linked
settings paths and invalid folders, variable definitions or run limits.


View > Layout can lock panel placement and resizing. The lock applies to pointer
and keyboard resizing, including dock splits, results height and detail widths.
Use the visible unlock action or View menu to resume arranging panels. Same-name
file tabs show the shortest distinguishing directory suffix; full paths remain in
tooltips. A second view of the same file gets a number such as `(2)`.


Ctrl+Alt+Home/PageUp/PageDown navigate tracked edit locations; Ctrl+Alt+End returns
to the latest execution source. Changed or ambiguous execution source opens a
read-only recorded snapshot. These shortcuts can be customized. Breadcrumb nodes
and the sibling selector navigate package/routine/block positions. Sticky headers
use the same local source structure and can be toggled in View > Editor. Paired
`-- #region Name` / `-- #endregion` comments define foldable regions. The command
palette offers “Focus current PL/SQL routine”, “Show all source regions” and “Fold
named code regions”; these actions change visibility only. Batch close review
lists unsaved documents with independent save/keep/discard choices and waits for
native save acknowledgement before closing a saved document.


Source bookmarks use Ctrl+Alt+B to name the current position, Ctrl+Alt+J for next
and Ctrl+Alt+Shift+J for previous. File marks persist on the device as path/name/
line/column only; draft/server marks last for the session. Local edits move marks.
Ctrl+P now searches current source symbols, settings and commands alongside files,
objects, profiles and history. Settings can optionally enable double Shift.
Selecting history, a symbol or a bookmark never executes SQL.

To edit result column names together, copy a header row (tab separated) or a
vertical list of names, then choose **Paste column names as multiple cursors**
from the editor context menu or command palette. The names replace the current
selection, and each becomes a Monaco selection for simultaneous alias or function
edits. Spaces and special characters are quoted as Oracle identifiers. The action
accepts 2–100 names and does not run SQL.

**Project rules** can store a shared naming dictionary with a preferred case
style, full terms, abbreviations and known alternative spellings. Select source
identifiers and open **Convert identifier case** to preview project full-term or
abbreviated names. Known alternatives appear in the preview. Applying changes is
explicit and affects only the selection; other references are not renamed.

Drag a table or a loaded column from **Object Explorer** into the SQL editor to
insert a reviewable SELECT draft. When the editor names one unambiguous loaded
table and metadata has one verified foreign-key relationship to the dragged
table, the draft includes a JOIN predicate. The drop does not execute SQL;
tables with more than 200 loaded columns show the projection limit in the draft.

For PL/SQL, place the caret on a local variable or parameter and choose **Rename
local variable or parameter** from the editor menu or command palette. The dialog
lists resolved uses in the current document before applying one undoable edit.
Ambiguous or truncated reference analysis stops the rename; dynamic SQL and
server-side references are outside its scope.

**Change local procedure signature** previews renaming, reordering or adding
parameters for one unambiguous local procedure in the current document. Named
call labels and positional arguments are updated as needed. Added IN parameters
use `DEFAULT NULL`, so existing calls remain valid. Overloads, qualified calls,
comments in affected lists, dynamic SQL and other files require manual review.
The preview applies as one undoable edit and never runs the source.

**Extract selected PL/SQL assignments** accepts complete adjacent assignments
inside a top-level `DECLARE` block. It previews a local procedure, a replacement
call and inferred IN/OUT modes for simple scalar locals. Complex expressions,
SQL and control flow are rejected for manual refactoring. Apply is one undoable
edit and does not run or compile the source.

**Move SQL item or PL/SQL statement up/down** works on SELECT expressions,
simple AND conditions and adjacent PL/SQL statements or blocks. It preserves
list separators or line indentation and applies as one undoable edit. Comments,
mixed separators, OR/BETWEEN and SELECT modifiers require manual movement.

**Edit SQL inside EXECUTE IMMEDIATE** opens one ordinary, static single-quoted
SQL literal in a separate SQL editor with completion and formatting. The write
back preview doubles Oracle quote characters and applies as one undoable edit.
Concatenated fragments, variable expressions and q-quoted literals are rejected
explicitly; editing never executes SQL.

**Clipboard history** is off by default. Opt in from its dialog to remember up
to 20 copied SQL fragments in memory for the current app session, search them,
paste them or clear them. Disabling collection clears the entries. Matching
multiple selections receive their copied fragments; an option distributes
matching lines across selections. Other apps' clipboard contents are not read.

**Editor macros** record supported Move up, Move down and Toggle line comment
actions from the editor menu. Name and save up to nine session macros, then
replay the most recent with Ctrl+Alt+Shift+M or choose one in the macro dialog.
SQL execution, file operations and connection changes cannot be recorded.

**Review references before delete** opens from a local procedure, function or
parameter. It shows resolved current-document uses and bounded workspace text
matches. These are candidates for review; dynamic SQL, server callers, unsaved
changes in other editors and files outside the scan remain unresolved. The
review does not delete source.

**Quick fixes** (Alt+Enter) review supported Oracle compiler diagnostics tied to
the current editor text. The current actions add an expected semicolon or stage a
missing local declaration with an explicit placeholder type. Apply is a single
undoable edit; it does not compile or execute the source.


View → Quick applies editor font/line spacing, coordinated compact/comfortable density and the selected result's NULL label immediately. The footer prioritizes active execution and cancellation, real errors, pending transactions and result selection summaries; commit mode follows the physical session.

View → Layout previews three presets (Ctrl+Alt+1/2/3) and up to twelve named saved panel arrangements. Header buttons or a double-click on empty header space temporarily maximize the editor/results; Escape restores the arrangement. Panel snapshots exclude workspace expansion paths. Long editor, connection, object, workspace, File and column action menus support action search; Escape first clears a filter, then closes the menu.

Package specifications expose a Public API reference with source links, overloads, parameter modes, exact default expressions, documentation and public types. Bodies and incomplete/unsupported specifications do not produce an API reference. Hover a SQL tab or press Alt+Down on its tab button to preview its path, environment, profile, connection state, relevant flags and bounded source. Open Editors is a searchable, resizable vertical list.

SQL documents of at least 524,288 characters open in large file mode. Lightweight rendering disables expensive automatic completion/navigation, diagnostics, outline/folding and source identity/comparison; opt into each separately for the current document. The native reader still limits files to 8 MB. Normal settings return when a smaller document is active.


The optional editor overview ruler combines Monaco diagnostics/find matches with local changes against the last saved snapshot. Click it to scroll, or use Next local change. Local comparison runs in the worker with bounded work, marks coarse comparisons explicitly, pauses for large files and reports unknown baselines after recovery. Source baselines stay in memory and are excluded from draft persistence.

Hover anchored PL/SQL variables to inspect `%TYPE` column types and `%ROWTYPE` record fields. Metadata shows its retrieval time or an unavailable/unknown/stale state; refreshing after schema DDL remains necessary. The viewer never treats cached metadata as proof of the current server definition.

# Workbench architecture

The React workbench runs inside a WinUI WebView2 host. Oracle access and local file operations run in the native process. The browser preview uses the same UI with native commands disabled.

## Monaco

Monaco ships inside the application bundle and is never downloaded at runtime. `src/monacoEditor.js` is the only module that imports `@monaco-editor/react`; it passes the bundled `monaco-editor` to the loader, whose default would otherwise fetch the editor from a CDN. The module is loaded lazily to stay out of the startup chunk. `monaco-editor` is pinned to an exact version, so upgrades are deliberate.

The native splash stays up until `ui.ready`. The workbench sends it after `src/editorStartup.js` reports the editor presentable, meaning mounted, with SQL colors and fonts loaded and painted, so the user never sees the editor finish loading. That wait is time-limited and cannot fail, so it can never keep the splash up.

## Documents and sessions

`src/documentSessions.js` owns document order, active document identity, content, path, dirty state, disk version, and external-change notices. Every transition runs through `documentSessionsReducer`. `useDocumentSessions` subscribes through React's `useSyncExternalStore`; active editor fields are derived from this state. Asynchronous callbacks read the same store directly, without copies synchronized after a render.

Opening a document updates its contents and active identity in one transition. Tab switches preserve each document's text. Oracle connection state, pending transactions, and query results remain separate from document state and retain their physical tab-session identity.

`DocumentSaves` tracks saves by request ID and document identity. Saves for different documents can overlap; a document has at most one pending save. A reply advances its disk baseline, but clears the dirty flag and resumes a save-and-close action only when the current content still equals the sent content. Replies for closed or moved documents are ignored. Failed or canceled requests release only their own pending save.

External-change notifications are checked against each document's path and disk baseline. They preserve editor text until the user reloads or explicitly keeps it. Keeping a deleted file converts it to a draft. Recovery snapshots read the document store directly.

## Query and result coordination

`src/queryExecution.js` owns Run, Explain, script execution, cancellation, and paging requests. Its ports provide current document/session/result state, editor access, preferences, history, and UI effects. Each operation captures its tab identity once and sends that identity explicitly, including when another tab becomes active before a response arrives. `useQueryExecution` keeps the actions stable while refreshing their ports on each render.

Query ownership, cancellation requests, script runs, cursor requests, and execution snapshots live in one per-workbench operations object. `App` handles presentation and message-driven UI effects using those operation identities.

`src/resultSessions.js` owns result state independently of React renders. It publishes executions while retaining pinned/script results, appends pages only at the expected cursor offset, invalidates consumed or failed cursors, records render timing once, and releases loaded rows. Closed-tab identities prevent late result updates from recreating removed state. `useResultSessions` subscribes to this store using `useSyncExternalStore`.

The native `OracleSessionService` remains the owner of the physical connection, transaction, session gate, and active cancellation operation. Its metadata collaborator in `OracleMetadataOperations.cs` borrows that session and gate; it never creates or owns a separate session. `OracleResultCursors.cs` owns active/parked readers and commands. The session gate serializes cursor operations, while transaction state and cancellation tokens are supplied for each read. Connection switching, idle suspension, and disposal close the same cursor owner. Public service APIs remain unchanged; wire/data records live in `OracleDataModels.cs`.

## Grid editing

Result editing is local until the user applies it. `src/gridEditability.js` decides whether a result can be edited and which columns identify a row; a SELECT is never assumed to be updatable. Rows are found by the primary key when its columns are in the result, otherwise by ROWID: `sql.evaluate` with `withRowIds` reads the executed query again through `GridRowIds.Wrap` (an inline view with `ROWID` in front), and `src/gridRowIds.js` pairs those ROWIDs with the loaded rows by value. Oracle refuses that read for queries whose rows are not single table rows, and such a result is not editable. `src/gridDrafts.js` holds staged values, where an explicit NULL differs from an empty string. `src/draftStore.js` keeps drafts per tab and source table so they outlive grid remounts; they stay in memory and are never written to disk. `src/dmlPreview.js` builds the parameterized statements sent on Apply. The edit bar (`src/GridEditBar.jsx`) has only Apply, Discard, new row and delete row: cells are changed in the table itself and one Apply sends all of them as a single batch that is rolled back as a whole if any statement fails.

`native/FbsDb/Services/GridDmlGuard.cs` accepts only the three DML shapes the grid generates. `GridDmlBatch.cs` runs them one at a time in the tab's session after a savepoint, stops at the first failure or unexpected row count, and by default rolls back to that savepoint, leaving earlier session work untouched. It never commits and refuses to run while auto commit is on. After a successful Apply the changes wait in the tab's transaction for Commit or Rollback, like any other DML.

## Workbench modules

`src/App.jsx` holds the workbench state, its effects and the functions that act on it. Views that need none of that live in their own modules:

- `SqlResultsView.jsx`, `ConnectionPicker.jsx`, `OracleObjectTree.jsx` and `ResizeHandle.jsx` are ordinary components.
- `lazyViews.js` declares every view that is loaded on first use.
- `WorkbenchCommandPalette.jsx`, `WorkbenchToolDialogs.jsx`, `WorkbenchEditorDialogs.jsx`, `WorkbenchOverlays.jsx`, `WorkbenchPrompts.jsx`, `WorkbenchEditorWorkspace.jsx` (toolbar, tabs, breadcrumb and the Monaco editor), `WorkbenchResultPanel.jsx` (results, problems and output tabs), `WorkbenchFileMenu.jsx` (the hidden file input and the File, Run and View menus), `WorkbenchActivityRail.jsx` and `WorkbenchFooter.jsx` (the status bar) each export one `render…(ctx)` function. `App` calls it inside its own return and passes the values the markup reads. These are functions, not components, on purpose: they add no component boundary, so state, effects and render order stay exactly as they were when the markup was written inline.
- `WorkbenchNativeMessages.jsx` holds the handler of native host messages. App's mount effect is `useEffect(() => subscribeWorkbenchMessages({ … }), [])`. The object is built when the effect runs, not during the render, because some of the values it passes are declared further down in `App`; it therefore holds exactly the values the effect read when it was written inline.
- `WorkbenchDockPanels.jsx`, `WorkbenchToolbarDefs.jsx` and `WorkbenchManagementContent.jsx` return the values of App's `dockPanels`, `toolbarDefs` and `managementContent` constants, which App builds with them at the same point of its render (`const dockPanels = renderDockPanels({ … })`). Every value they receive is declared above that line.
- `WorkbenchShortcutEffects.js` (window keyboard shortcuts) and `WorkbenchEditorEffects.js` (language providers, diagnostics, the editor context menu and source baseline reviews) hold the bodies of App effects. The effect stays in App with its dependency list, and only its body moves: `useEffect(() => installEditorShortcuts({ … }), [settings.user['editor.shortcuts']])`. As with the message handler, the object is built when the effect runs, so it holds the values the inline body read, and the function's return value is the effect's cleanup.
- `WorkbenchContextActions.js`, `WorkbenchEditorActions.js`, `WorkbenchTabActions.js`, `WorkbenchScriptActions.js` and `WorkbenchResultExports.js` hold the bodies of App functions. App keeps a function of the same name and parameters that passes its values in: `function closeTabs(ids) { return tabActions.closeTabs({ … }, ids); }`. Default values and destructuring stay in App's parameter list, so they are evaluated where they were; the moved body receives the names they bind. The object is built when the function is called, so a function moves only if every `const` it reads is declared before the earliest point the render can call it (calls from effects run after the render). The wrapper of an async function is not async, so it returns the module's promise unchanged.
- `ResultsGridView.jsx` follows the same pattern for `ResultsGrid.jsx`: `renderResultsGridView(ctx)` is the grid's return value.
- `ResultsGridCommands.js` (commands, edits, jumps) and `ResultsGridPointer.js` (keyboard, selection, row and column drags) hold function bodies moved out of `ResultsGrid` with `scripts/refactor/move-functions.mjs --component ResultsGrid`. `ResultsGrid` keeps wrappers of the same name and parameters that pass the grid's values in one `ctx` object.

`scripts/refactor/` holds the tools that made these moves and verify them (see its README): they list which functions can move, write the wrapper and module, and check that putting the moved text back gives the original file byte for byte.

A `render…` function must not call hooks and must not assign to a value it receives. To move more markup out, pass every `App` value the moved lines read and nothing else; a name that is missing from `ctx` is an unresolved identifier, which `tsc --allowJs --checkJs` reports as "Cannot find name". `npm run check:names` runs that check on `App.jsx` and the `Workbench*` modules and fails on any such report; CI runs it.

`SqlResultsView` takes its callbacks in one `actions` prop (`actions={{ onRun, onCancel, … }}`); every other prop is passed as before.

## Error log

`DiagnosticLog` (native) appends to one file per day in `%LOCALAPPDATA%\fbsDB\logs` (`FBSDB_LOG_PATH` overrides the folder; the desktop tests use it). A file stops taking entries at 2 MB and the ten newest files are kept. Nothing is sent anywhere, and writing never throws.

What is recorded:

- The application start line with the app, Windows and .NET versions.
- Unhandled exceptions of the UI thread, the process and unobserved tasks (`App.xaml.cs`). They are recorded only; none is marked as handled.
- A WebView2 process failure, for the main window and for SQL windows.
- A command that fails with a programming error such as `NullReferenceException`. Failures that are part of normal work (a refused action, a missing file, an Oracle error) are not logged, because their text can name the user's objects and files.
- Interface errors: `src/errorReporting.js` listens for `error` and `unhandledrejection`, and the error boundary in `main.jsx` reports render failures, through the `ui.logError` command. A session sends at most 25 distinct entries. Chromium's ResizeObserver notice and Monaco's cancelled delays are ignored.

Executed SQL, bind values and credentials are never passed to the log. **Open log folder** in the command palette (`ui.openLogFolder`) shows the folder in Explorer.

## Native commands

`MainPage` initializes WebView2, validates the command envelope, selects the tab session, applies operation guards, and dispatches commands. Four handlers in `native/FbsDb/Commands/` own UI, file, workspace, and Oracle commands. They are nested classes to access WinUI host facilities; their shared base exposes host services and an explicit immutable request context.

Each handler instance receives the sender, request ID, command, payload, and physical `TabSession`. Replies and progress callbacks retain that context across awaits. There is no ambient `AsyncLocal` session. Shared workspace notifications can also be emitted without a tab context.

The workspace semaphore serializes workspace operations. Oracle services retain their per-session gate. Cancellation commands bypass session resumption so they can reach cancellation tokens while an operation holds that gate.

## Bridge contract

`contracts/native-bridge.json` defines command names, payload fields, handler ownership, session-resume policy, reply discriminators, and shared data shapes. Additional domain fields are allowed for compatibility; the contract validates the declared fields rather than replacing service-level checks such as path containment, permissions, transaction guards, or SQL classification.

`scripts/generate/generate-bridge-contract.mjs` produces:

- JavaScript runtime schema data in `src/bridge/contract.generated.js`.
- TypeScript payload maps and discriminated reply types in `src/bridge/contract.generated.d.ts`.
- C# payload/reply DTOs and schema data in `native/FbsDb/Bridge/NativeBridgeContract.g.cs`.

The JavaScript bridge validates outgoing commands and incoming replies. The native host validates commands before creating tab sessions and validates serialized replies. File saves use the generated C# request and reply DTOs; other handlers can incrementally adopt the generated DTOs while their JSON payloads are already validated at the boundary.

`src/nativeBridge.d.ts` exposes the typed API to TypeScript callers. `tests/bridge-types.test.ts` verifies valid calls, required payloads, rejected command names, nested bind fields, and reply narrowing. The application remains JavaScript/JSX; this check covers the bridge API rather than claiming to typecheck the entire workbench.

After editing the contract, run `npm run generate:bridge`. `npm run check:bridge` detects stale generated files and runs before the production build. Commit the source contract and generated files together.

## Verification

`npm test` runs JavaScript unit and integration fixtures, including document transitions and saves across tab switches, Save As, closing, external changes, and recovery. `npm run typecheck:bridge` checks the TypeScript API. `BridgeContractSmoke` runs the same JSON acceptance/rejection corpus as JavaScript and checks native routing, cancellation policy, and DTO round trips without an Oracle database.

The existing workspace smoke projects exercise file persistence and conflict detection. A desktop build checks the WinUI handlers. Live database behavior and interactive WebView2 tests still require a running desktop host and, for SQL execution, an Oracle database.

`SessionServicesSmoke` checks disconnected and cancelled metadata/paging calls, gate release, and per-session state without a database. Query/result tests use the real stores, coordinator, and bridge validator with explicit fake transport/session ports, covering concurrent tab ownership, stale cancellation, bind prompts, script binds, pinned cursors, duplicate pages, and late closed-tab callbacks.

`node tests/startup-native.mjs [debug-endpoint]` reloads a running native host (default `http://127.0.0.1:9337`) and verifies Monaco mounting, the `ui.ready` handshake, native initialization replies, and absence of runtime errors. Use an isolated WebView2 profile for this check. Server-rendered UI tests do not execute Monaco's mount callback and cannot replace this startup check.

`npm run test:desktop` runs the document lifecycle regression suite. Its PowerShell runner builds a separate application output, reserves a debugger port, and launches that process with separate theme, workspace, connection-settings, and WebView2-storage paths. The runner always stops its own process and restores environment variables; it retains artifacts for diagnosis and never stops another fbsDB process.

The suite uses real Monaco, UI shortcuts/controls, the native bridge, and native disk persistence. A document-start fixture supplies predetermined picker selections inside the test directory and can delay genuine save replies. It does not fabricate file replies or file writes. Oracle execution/connection commands and file paths outside the test directory are blocked. Native Windows picker interaction is explicitly excluded from the coverage report. Recovery is tested across renderer reloads.

`tests/nativeCdp.mjs` provides bounded debugger calls and browser-error-aware waits. The suite waits for the initial native navigation to commit before reloading with its fixture; a newly advertised debugger URL alone does not establish that a document has loaded. Every run writes scenario results and bounded metadata-only command/reply diagnostics to `report.json` under its artifact directory.

`OracleLiveRegression` exercises the real native Oracle services against an explicitly selected local profile. The account needs CREATE TABLE and CREATE PROCEDURE. Its uniquely named global temporary table uses `ON COMMIT DELETE ROWS`, allowing server-side commit/rollback effects to be observed without modifying existing tables. Uniquely named procedures, packages and ordinary tables cover source compilation and grid Apply. `GridApplyChecks.cs` asks the grid's own code, through `grid-statements.mjs`, to generate the statements it runs, so the run also needs Node.js. Cleanup rolls back both owned sessions and drops the fixtures, and cleanup failures make the run fail. Other checks cover distinct physical sessions, parked/paged cursors, cancellation while another tab runs, queued schema/completion cancellation, configured query timeouts, transaction guards, NLS reapplication, and old-cursor invalidation after idle resume. Reports identify this as service-level live coverage; it does not claim that Oracle execution was tested through the WebView2 UI or that a long-running dictionary query was cancelled in flight.

## Review follow-up boundaries

`connectionLifecycle.js` owns connection/authentication/switch/disconnect/transaction actions through current ports; `useConnectionLifecycle` keeps callbacks stable without retaining stale tab state. `QueryHistoryDialog` owns history presentation, `queryHistory.js` owns retention and profile exclusions, and `localPersistence.js` reports local write failures including draft recovery. The native message subscription remains in App; this is an incremental extraction, not a complete rewrite of the application.

`npm run typecheck:domain` checks history retention and query outcome helpers using strict JavaScript/JSDoc types in addition to the generated bridge API. It does not claim full React or coordinator type coverage.

The desktop runner now also executes `review-improvements-native.mjs` after the document lifecycle checks. That separate fixture uses simulated Oracle/tool replies and blocks actual database/file commands. It checks configurable history, DDL confirmation/cancellation and pending-state guard, and shared tool metadata, writing `review-improvements.json`. The original lifecycle report retains real native file coverage separately. Startup reports include navigation-relative WebView2 milestones.

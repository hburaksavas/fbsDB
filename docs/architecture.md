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

## Native commands

`MainPage` initializes WebView2, validates the command envelope, selects the tab session, applies operation guards, and dispatches commands. Four handlers in `native/FbsDb/Commands/` own UI, file, workspace, and Oracle commands. They are nested classes to access WinUI host facilities; their shared base exposes host services and an explicit immutable request context.

Each handler instance receives the sender, request ID, command, payload, and physical `TabSession`. Replies and progress callbacks retain that context across awaits. There is no ambient `AsyncLocal` session. Shared workspace notifications can also be emitted without a tab context.

The workspace semaphore serializes workspace operations. Oracle services retain their per-session gate. Cancellation commands bypass session resumption so they can reach cancellation tokens while an operation holds that gate.

## Bridge contract

`contracts/native-bridge.json` defines command names, payload fields, handler ownership, session-resume policy, reply discriminators, and shared data shapes. Additional domain fields are allowed for compatibility; the contract validates the declared fields rather than replacing service-level checks such as path containment, permissions, transaction guards, or SQL classification.

`scripts/generate-bridge-contract.mjs` produces:

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

`OracleLiveRegression` exercises the real native Oracle services against an explicitly selected local profile. The account needs permission to create a global temporary table. Its uniquely named fixture uses `ON COMMIT DELETE ROWS`, allowing server-side commit/rollback effects to be observed without modifying existing tables. Cleanup rolls back both owned sessions and drops the fixture, and cleanup failures make the run fail. Other checks cover distinct physical sessions, parked/paged cursors, cancellation while another tab runs, queued schema/completion cancellation, configured query timeouts, transaction guards, NLS reapplication, and old-cursor invalidation after idle resume. Reports identify this as service-level live coverage; it does not claim that Oracle execution was tested through the WebView2 UI or that a long-running dictionary query was cancelled in flight.

## Review follow-up boundaries

`connectionLifecycle.js` owns connection/authentication/switch/disconnect/transaction actions through current ports; `useConnectionLifecycle` keeps callbacks stable without retaining stale tab state. `QueryHistoryDialog` owns history presentation, `queryHistory.js` owns retention and profile exclusions, and `localPersistence.js` reports local write failures including draft recovery. The native message subscription remains in App; this is an incremental extraction, not a complete rewrite of the application.

`npm run typecheck:domain` checks history retention and query outcome helpers using strict JavaScript/JSDoc types in addition to the generated bridge API. It does not claim full React or coordinator type coverage.

The desktop runner now also executes `review-improvements-native.mjs` after the document lifecycle checks. That separate fixture uses simulated Oracle/tool replies and blocks actual database/file commands. It checks configurable history, DDL confirmation/cancellation and pending-state guard, and shared tool metadata, writing `review-improvements.json`. The original lifecycle report retains real native file coverage separately. Startup reports include navigation-relative WebView2 milestones.

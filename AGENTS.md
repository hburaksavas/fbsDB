# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

When the user says “Run” for fbsDB, build and launch the Windows desktop app (WinUI 3/WebView2), not just the Vite browser preview. Keep this behavior in future sessions; use `scripts/run-desktop.ps1` or the equivalent desktop build and launch flow, and verify that the native window opens.

Right-clicking anywhere in the application must never open the browser/WebView2 default context menu. Preserve application-specific right-click actions, including the Results grid menu.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## fbsDB Product Decisions

- Product: Windows desktop Oracle SQL IDE for developers; polished, minimal, and performance-focused.
- All P0, P1, and P2 features in docs/FEATURE_PLAN.md are in scope for the first release. Priority labels describe implementation order, not separate releases. Complete the open IntelliSense work first, then implement B1, B2, B3 and B4 in that order, followed by C.
- Planned shell: WinUI 3 + C#/.NET 10. SQL editor: Monaco hosted inside WebView2. Oracle access: ODP.NET Core.
- The production desktop shell is WinUI 3 + .NET 10. Its React/Vite editor bundle is hosted by Monaco inside WebView2 and shipped in the Windows x64 package.
- A workspace contains SQL files and fbsDB settings. Each file can remember its connection profile; opening a file connects but never runs its SQL.
- `Ctrl+O` opens the connection picker. `Ctrl+Shift+O` opens a SQL file.
- TNS Alias Explorer supports fuzzy search across alias/host/service/environment, favorites, recent aliases, user groups, detail preview, async loading, and duplicate alias warnings.
- SQL text does not support the fbsDB CONNECT command or connection-profile completion. Change connections through the connection picker. Pending transactions require Commit, Rollback, or Cancel before switching.
- DML is manual-commit by default. Keep database work and IntelliSense off the UI thread.
- Visual direction: compact IDE layout, dark slate surfaces, refined teal accents in the default theme, visible environment badges, dense schema/results panels, and keyboard-first interactions. Themes and SQL token colors must be user-customizable.
- Native startup uses the user-provided fbsDB splash reference in its own centered, compact, borderless window with no close/minimize controls. Show only the splash while initializing; keep the full workbench window hidden until the React workbench and Monaco SQL editor are mounted and saved workspace/connection state is restored, then close the splash and reveal the maximized app.
- Query results and output are displayed in a horizontal panel below the SQL editor; the editor remains above it and both panels stay visible.
- Ctrl+Enter runs the current SQL statement from the focused editor in the Windows desktop app. SQL completion after FROM/JOIN must work when the keyword directly follows punctuation (for example, `SELECT*FROM`), and insert a separating space when a table suggestion is accepted.
- If the caret is immediately after a statement-ending semicolon, run the statement that ended there; move beyond the delimiter to run the next statement.

- Place Run and query controls directly above the SQL file tabs, scoped to the editor area. Keep Workspace, SQL Files, Connections, and Schema Explorer in individually collapsible sections on the left. Avoid multiple visible buttons for the same action.

- In Switch connection, a single click selects a profile for preview; double-click connects using the same flow as the Connect button.
- In the editor toolbar’s connection picker, show “Connect” when no profile is connected; show the active profile and environment when connected.
- Style the disconnected “Connect” picker with the active theme accent, including hover, border, text, and status dot; keep sufficient contrast in Default, Dark, and Light themes.

- The idle Run button shows only its icon; keep its tooltip and accessible label.

- Do not show the Ctrl O shortcut text in the connection switch button; retain the keyboard shortcut.

- Show Run glyphs in the SQL editor gutter at statement start lines. Clicking a glyph executes its statement through the normal connection, bind-parameter, and transaction flow.

- Place Undo beside the SQL formatter in the editor toolbar as an icon-only button with a tooltip.

- Do not show a workspace name or “No workspace” label in the custom top header. The persistent Database icon at the top of the activity rail, above Search, fully hides or shows the left explorer; keep the activity rail visible so the user can reopen it.

- Show the active/inactive explorer state on the Database toggle in the activity rail.

- Remove the top-right DB avatar. Show Saved/Unsaved in the editor footer beneath the SQL file, replacing the IntelliSense readiness text.

- Show Commit and Rollback as icon-only editor toolbar buttons with tooltips and accessible labels.

- Let users drag the explorer’s right edge to resize its width and the divider above Results to resize its height. Persist sizes locally, support arrow-key resizing, and keep editor and results visible.

- Use “Search” as the Connections search placeholder and omit the TNS files indexed count.

- Show a SQL file icon for SQL Files, a database icon for Connections, and a layers icon for Schema Explorer in the collapsible sidebar headings.
- Left explorer visual reference: persistent activity rail beside the explorer, with the Database explorer toggle above Search; no Session card in the explorer; numbered, individually collapsible Workspace, SQL Files, Connections and Object Explorer sections. Preserve the section-specific icons, compact dark slate surfaces, teal connected/selected accents, and user-resizable section heights. Toggling the Database icon removes the explorer pane completely while leaving the activity rail available to show it again.

- In the sidebar Connections list, show the profile name and environment tag without the host/service subtitle; use compact single-line rows.

- Connections are saved profiles with independent IDs, display names, TNS alias/source, Oracle usernames, and explicitly chosen environments. Multiple profiles may use the same alias. Existing alias identities migrate once to preserve workspace/credential references. Unknown environments stay UNKNOWN.
- The Connections + action creates a profile from discovered aliases. TNS file discovery/source configuration belongs in Settings → TNS sources.
- Test uses a separate temporary Oracle connection without changing the active session or saved credentials. Support edit, duplicate, delete, reconnect, and disconnect; resolve pending transactions before reconnect/disconnect.
- Each SQL tab owns an independent Oracle session, selected profile, transaction, cancellation and metadata cache. Even tabs selecting the same profile use separate physical sessions; changing tabs never reconnects other tabs. Manually opening a new SQL tab uses only the currently active connected profile in its own pooled session; if none is active, it stays disconnected; opening a file follows its saved connection preference.
- Automatic reconnect preserves saved credentials. Saving or forgetting credentials must be explicit. Connection status reflects actual state; do not render static Connected text.

- New connections default to Basic (host, port, Service Name or SID). Also support TNS aliases and full Custom descriptors. All methods share profile identity, credentials, environment, Test, and Save & connect. Existing profiles without a method remain TNS. Direct methods must work without TNS files.

- Escape dismisses every app popup, including connection forms during pending operations, bind parameters, unsaved-file and transaction prompts. Dismiss only the topmost popup; cancelling a prompt must not discard SQL or commit/rollback a transaction.

- Table suggestions after FROM/JOIN must work across line breaks and indentation, including schema-qualified names. Open suggestions automatically when enabled; Ctrl+Space must work when automatic suggestions are off.
- When the SQL suggestion list is open, Enter accepts its highlighted suggestion, including the initially highlighted first candidate; arrow-key navigation is not required. When the list is closed, Enter inserts a new line. Escape dismisses the list. Tab and mouse selection continue to accept suggestions.
- On an otherwise blank SQL editor line, automatic code suggestions must stay relevant to the current statement and clause. Do not show a broad, unrelated keyword or object list merely because the line is empty; preserve useful completion after a multiline FROM/JOIN or another clear syntactic expectation. Ctrl+Space may request broader suggestions explicitly.

- Keep query results/output separate from Explain Plan data/errors. Opening or running Explain must preserve the last query results; Results always returns to that dataset, including while a plan is loading or after plan failure.

- Results grid scrollbars match Default, Dark, and Light themes on both axes. Keep column headings visible during vertical scrolling and horizontally aligned with their cells.

- Rows beside Run controls result page size, never the total query result limit. Fetch subsequent pages from the same open Oracle cursor without rerunning SQL; retain fetched pages for backward navigation. Clearly distinguish loaded rows from total rows until the cursor is exhausted.

- Panel dragging previews CSS sizes at animation-frame cadence and commits React state/persistence only on release. Virtualize result rows so resize and scroll cost depend on the visible viewport, not all 1,000–10,000 rows in a page; preserve page, sorting and scroll position during resize.

- Opening a new SQL tab with + never requires saving the current tab. Preserve its content, dirty state, and connection preference in memory while the new tab opens.

- Keep Results, Output, Explain Plan, filters, page and sort state per SQL tab. Switching tabs never clears results. Route asynchronous SQL replies to the originating tab. Preserve each tab’s result cursor until that tab reruns/closes or the connection changes; connection changes keep fetched rows but invalidate further fetching.

- Include stable tab IDs on native commands and replies. Saving a file never changes its tab/session identity. Close only the target session; pending transactions require Commit, Rollback, or Cancel before closing.

- Results use single-click cell selection, row-number whole-row selection, arrow-key navigation (including Up/Down for selected rows), Shift ranges, Ctrl+C selection copying, and double-click/Enter inspection. Columns support resizing, fit, reorder, hide and pin. Clearly label local sort/filter scope; export filtered loaded rows in display sort order through one Export menu. Explain tab navigation never executes SQL.

- Ctrl-click toggles disjoint result cells or whole rows by row number without clearing other selections. Shift extends the active range; copying retains display order and blank gaps between selected cells.

- Keep Results free of persistent instructional text or shortcut banners. Put usage hints in tooltips and accessible descriptions.

- Mouse press-and-drag selects rectangular result cell ranges; dragging row numbers selects whole rows. Auto-scroll at grid edges, preserve Ctrl additive selections, and retain double-click inspection.

- A separate grip beside each result row number reorders rows by drag/drop (or Alt+Up/Down). Row-number dragging still selects rows. Reordering affects only the tab’s displayed/fetched result order and copy/export, never database records; column sorting and rerunning reset manual ordering.

- Saved connection credentials connect without an authentication modal. Show per-tab connection progress at bottom right; open authentication only for missing credentials or a failed attempt. Prefill saved username and show a masked saved-password indicator without sending the stored password into WebView.

- Result selection/focus must stay within selected cells and rows; never outline the entire Results scroll viewport. Keyboard focus is indicated on the active cell.

- Implement approved Results features 1–22 and 25–29 from the feature selection. Sensitive-data masking (23), cell/row notes (24), and view Undo/Redo history (30) do not fit this product: do not implement or suggest them again. Result comparison was also declined.

- Results analysis (column filters, multi-sort, distinct values, duplicates, conditional rules) applies to loaded records; formats change display only and copy/export retains raw values. Keep quick filters, sorting, columns, appearance, highlights, and export in hover-triggered toolbar popovers; apply changes immediately and provide scoped clear/reset actions that restore the initial state for that feature without changing unrelated result settings. Keep rare/advanced controls in the searchable Results Settings window.
- Keep per-SQL-tab result-set history with explicit close/pin controls; preserve each result cursor until closed/disconnected. Pinned snapshots retain their displayed data and view options. Large CSV export streams the remaining cursor to a temporary file, supports cancellation, then publishes the completed file; it never reruns SQL or commits. Consuming/exporting a cursor must leave loaded rows visible and mark further fetching unavailable.
- Related-record navigation uses Oracle source-column and FK metadata (including composite keys when all values are available), opens a new connected SQL tab, and never executes generated SQL automatically.

- Do not capture or share screenshots unless the user explicitly asks again. Implement the second approved Results list (20 items) in order, without reintroducing masking, notes, view history, or result comparison.

- The second Results feature set is approved: transpose, independent split panes, right-pinned columns, up to ten frozen result rows, configurable NULL order, case-sensitive and regex matching, nested AND/OR filter groups, explicit server-side filtering, grouped summaries, result command palette, export column projection/order, typed XLSX, streaming CSV.GZ, binary preview/hex/save, visible whitespace, per-column display formats, explicit UTF-8 byte/Unicode character/UTF-16 lengths, reverse FK navigation, and primary-key lookup.
- Server filtering is an explicit user action that reruns only the original SELECT with bound filter parameters and preserves its existing bind values. Local filters remain local by default. Generated relationship/primary-key SQL opens in a new connected tab without automatic execution.
- Binary results retain a typed base64 payload and byte length; text copy uses base64. XLSX writes numeric/date cells using native types and preserves long numeric values as text when Excel precision would be lost. CSV.GZ uses the same cancellable cursor stream as CSV.

- The third Results list (20 items) is approved: arithmetic and JSONPath derived columns, pivot, exact Oracle NUMBER transport/display/copy, result names/search/memory release, fetch metrics, quick cell filters, alignment and HTTP/HTTPS launch, binary text decoding, source definitions, execution/binds panel, generated UPDATE/MERGE drafts, configurable CSV encoding/quoting/NULLs, metadata JSON/XLSX sheet, and per-column sort locale/natural order.
- NUMBER results and NUMBER binds must preserve Oracle precision as invariant text/provider decimals; do not convert them to JavaScript Number for comparisons or arithmetic. Derived arithmetic uses a restricted parser with exact decimal values, never eval/JavaScript execution. Original result data is immutable.
- UPDATE and MERGE generation only opens an editable SQL draft in a new connected tab; it never executes SQL automatically. External result links accept only HTTP/HTTPS. Memory release closes the result cursor and frees its rows while retaining execution context.

- Results actions belong in one compact icon-only toolbar, with tooltips and accessible names. Avoid duplicate visible actions, horizontal text menus, and an additional toolbar in split panes.
- Remove the Result Settings window. Keep its previously exposed actions available through compact toolbar popovers, grouped toolbar menus, or focused dialogs/inspectors, preserving the existing per-tab option behavior. Group table display and view actions in a Table view popover; do not replace Result Settings with another general-purpose settings window.
- Result toolbar quick-action popovers (filters, sorting, columns, appearance, highlights, export, memory) open on click, flip above the toolbar when needed, and remain open until outside click, Escape, or another toolbar action. Each popover offers a scoped clear/reset. Do not duplicate these direct quick actions as standalone Result Settings pages; reserve Settings for advanced configuration.
- Result memory management belongs in the toolbar popover, including retained result rows, estimated memory, and per-result release. Do not place it in Result Settings.
- The result command palette is a toolbar click popover with direct command entries and no search field; do not place it in Result Settings.
- Result navigation is a dedicated toolbar icon that opens its own click-triggered row/column target popup. Close it on Escape or an outside click; do not place navigation in Result Settings.
- Keep Appearance options in their own toolbar popover. Transpose, Split result view, Grouped summary, and Calculated columns are available from the grouped Table view popover; table views do not belong in Appearance. Pivot has its own icon in the Results toolbar. Clicking it opens Pivot options in a right-side panel beside the result table, where changes update the view immediately. Do not add saved Layout Profiles.
- Keep row marks in a dedicated Marks toolbar popover. Conditional highlights use a separate Highlighter toolbar icon and popover with rule colors, case-sensitive matching, matching-row-only filtering, and a scoped clear action. When opened with a selected result cell, default its column field to that cell's column.
- Per-column formatting opens from a settings icon in that column's header. Keep alignment, locale/precision/date display, sort locale/natural sorting, and URL highlighting scoped to that one column; close the popup on Escape or an outside click, and do not put Column format in Result Settings.
- Calculated columns are managed from a dedicated toolbar icon popup, not Result Settings. Preserve arithmetic/JSONPath creation and per-column removal; close on Escape or an outside click.
- Do not attach native title tooltips to result cells; navigating or hovering through the grid must not produce intrusive tooltips. Keep interaction guidance on the grid's accessible description.
- Do not show redundant column metadata tooltips on hover when the column type and size are already visible in the header.
- In the left explorer, resizing Connections must let users extend it through the available space while Object Explorer always fills the remaining height down to the bottom status bar.
- Each collapsible left-explorer section must have its own scrollbar when content overflows; keep its heading visible and all overflowing content reachable.

- In the SQL editor, Ctrl+D deletes the current line (or selected lines) using the editor line-delete operation, with normal Undo support.

- Inline SQL suggestions must work from the first typed character (for example s → select), and offer short context continuations such as SELECT → * FROM and SELECT * → FROM. Preserve typed text, suppress unrelated suggestions on blank lines, and accept ghost text with Tab.

- Open synonym and non-PL/SQL object DDL in a dedicated, nonmodal, read-only definition pane beside the SQL editor. Do not create a SQL file/session or change the active connection for these views. Keep the underlying SQL file, connection picker and close actions usable; the definition pane closes with its Close action or Escape.

- Preserve the current splash design; use subtle startup motion (brief brand fade-in and slow database-outline breathing), respect Windows animation preferences, and never delay readiness to finish an animation.

- Judge completion quality by correct candidates ranking first, unrelated candidate kinds being excluded, acceptance preserving surrounding SQL, and uninterrupted typing. Candidate existence and unit/DOM success alone do not establish completion quality; verify native WebView2 interaction and live Oracle metadata separately.

- When a nonempty typed prefix matches a schema name in a query block's FROM source list (including JOIN/comma sources before that block's WHERE), rank the best schema match first in the popup and offer the same candidate inline, preserving typed text. Exact schema matches precede longer prefix matches. Do not apply this special priority/inline behavior to WHERE/ON expressions, aliases, SELECT expressions, UPDATE/INSERT targets, or an empty prefix. After the schema dot, suggest that schema's relations normally; preserve existing dots and SQL suffixes.

- App icon palette: preserve the recognizable F/database silhouette without a background tile. Use a light mint teal for the F and top disk and a deeper teal for the database tiers. Keep the existing splash design separate from icon updates.

- View layout preferences are global per user, never workspace-specific. Persist panel docking positions, groups, sizes, visibility, and explorer section expansion globally; switching workspaces must preserve the current layout, and restarting must restore it. Reset Layout resets only these global layout preferences.

- Explorer information architecture comes before View/docking work: show the active workspace as a hierarchical SQL file/folder tree, with a separate Open Editors list for open documents and unsaved drafts. Keep Connections and Object Explorer independent. Workspace switching and recents belong in the File menu, not a persistent workspace list/path card. Opening files or changing/closing a workspace preserves existing SQL tabs, dirty content, sessions and results; only closing a document uses its save/transaction guards. The active workspace name may appear in the explorer, never the custom top header.

- With docking and tabbed panel groups, remove collapse/expand controls and collapsed states from explorer panel headings. Panels can be hidden through their header action menu and reopened through View → Panels. Preserve folder/object tree expansion and the separate Results minimize/restore action.

- Keep docking visually quiet: never show a labeled multi-zone overlay over every panel at once. During dragging, show only one rectangle preview of the resulting destination; omit action labels, persistent edge targets and the floating dragged-panel label. Panel action buttons and section resize grips appear on hover or keyboard focus.

- Docking follows spatial intent: dropping beside a panel creates a horizontal split on that side; top/bottom edges create vertical splits; dropping on a heading groups/reorders tabs. A drop at the lower-left/lower-right workbench edge inserts at that sidebar's bottom. Support nested splits, and preview the actual resulting region with one quiet rectangle. Do not use arbitrary three-part drop zones or Place above/below action labels.

- Keep the bottom-right connection progress notification compact: use an 11px medium-weight main message and smaller secondary text, a viewport-bounded width, and wrapping for long profile/file names so the full message fits without clipping.

- The idle Run control has a transparent background with no colored fill or shadow; only its Play glyph uses the theme accent (teal in Default). Keep its tooltip and accessible label.

- The disconnected Connect picker uses a warm orange/amber accent for its text, border, chevron, hover and status dot, with a darker accessible amber in Light theme. Preserve the compact, lightly tinted treatment.

- Connection context menus use short labels (Connect, New SQL Tab, Test, Edit, Duplicate, Group, Copy, Forget Credentials, Delete; Disconnect/Reconnect when applicable). Do not include Favorite in the menu: the existing row star is the sole favorite action.

- The Connections filter shows a compact clear (X) button only when its textbox contains text. Clearing restores the unfiltered list and keeps keyboard focus in the textbox.

- Keep the editor toolbar's connection control at 28px high with a 14px icon, matching the Run and neighboring toolbar controls. Use compact spacing, a small environment badge and a single-line profile name.

- Keep SQL file tabs compact (28px strip, content-sized tabs bounded around 96–176px), with the accent top border only on the active tab. Many tabs must scroll within their own viewport without a visible browser scrollbar or changing the editor width/height. Keep new/bind actions fixed, provide tab scrolling and an open-editors picker, and reveal the active/new tab automatically. Place Save beside Saved/Unsaved in the editor footer. Ctrl+Tab and Ctrl+Shift+Tab navigate SQL tabs; Ctrl+N opens a new SQL tab using only the active connected profile, otherwise disconnected.

- SQL tabs share the ODP.NET connection pool while retaining independent transactions and sessions. Tab context menus provide Close, Close Others, Close Left, Close Right and Close All, applying save/transaction guards sequentially; cancellation stops the batch.

- After ten minutes without database activity, return idle Oracle sessions to the shared pool and show Inactive while retaining the selected profile. Never suspend a pending transaction, read-only analysis or active operation. Resume silently on SQL/Object Explorer access, restoring NLS and DBMS_OUTPUT; keep fetched rows but invalidate suspended cursors.
- Double-clicking empty space in the SQL tab strip opens a new SQL tab through the normal new-tab connection flow; double-clicking existing tabs or toolbar actions does not create tabs.

- Do not show object favorites in Object Explorer; keep recent object navigation available.

# Accepted UI decisions

## 2026-11-02 — Editor tab titles and hover previews

User-approved product decision. Preserve these choices in later changes.

- Prioritize the file/object name and an unsaved-change dot. Show close on the active tab, hover or keyboard focus; the dirty dot remains visible on inactive tabs.
- Keep the connected plug icon. Also retain connecting, disconnected, pending transaction and query failure indicators. Query failures remain visible on active tabs too.
- Keep PROD as visible text. Other environments use a small colored dot with an accessible label and tooltip.
- Remove `draft`, `server`, `copy`, `Δ` and `S/B` from visible tab titles. Keep source-change and package details in the preview and accessible tab description.
- Name new untitled queries `Query 1`, `Query 2`, etc. Use a short directory suffix only to distinguish same-name files with different paths. A second view of the same file may use `(2)`; do not label independent queries as copies.
- Hover previews keep the name, full path, environment, readable connection profile name, connection state, relevant source/package flags and source excerpt.
- Remove the entire `Latest status` row. Do not replace it with a last-execution summary, row count, duration or error summary. The explicit query-failure flag may remain.

Scope: title/preview presentation. Normal file opening continues to activate an existing tab; explicit opening in a new tab keeps its existing behavior.

## 2026-11-04 — Grid edit controls

User-approved product decision. The third point was replaced on 2026-11-11 (see below); the others still hold.

- The switch that turns row editing on lives in the result toolbar (pencil icon, `aria-pressed`), next to the other view controls. (Replaced on 2026-11-11: Descriptions is no longer a button by default, see "Fewer buttons and menu entries".)
- (Replaced on 2026-11-11: the buttons moved into the toolbar row.) The separate edit row above the grid appears only while editing is on (or while an applied-changes status or verification is shown). Outside edit mode no extra row takes space.
- Inside the edit row, core actions stay visible (Set NULL, New row, Delete row, Undo/Redo, invalid-cell counter, Pending); the rest sit in a "More" menu and can be pinned to the row. A switched-on filter stays visible on the row.
- Every grid edit action is also available in the command palette with a "Grid: " prefix.

## 2026-11-11 — Grid editing is cell edits plus Apply

User-approved product decision. It replaces the edit-row contents described under 2026-11-04; preserve it in later changes.

- The pencil in the result toolbar turns editing on. Cells are then changed directly in the table: double-click, Enter, F2 or simply typing on the selected cell. Enter keeps the value, Tab keeps it and moves on, Escape cancels, Delete clears the cell. Empty text stores NULL.
- The four edit buttons sit in the result toolbar's own row, at its right end, while editing is on. There is no separate edit row; only a reason why a result cannot be edited takes a line under the toolbar.
- A table without a usable primary key (none, or its columns are not in the result) is edited by ROWID. Nothing is asked: the executed query is read again with each row's ROWID and the loaded rows are matched to it by value. If Oracle cannot give ROWIDs (DISTINCT, GROUP BY, ROWNUM, joins), the reason is shown. The "choose the columns that identify a row" box is removed; do not bring it back.
- There are four edit buttons only: Apply (with the number of changes), Discard, new row and delete row. Apply is enabled as soon as there is a change and sends every change in one batch, without a review drawer or a confirmation step. If a statement fails, the whole batch is rolled back and the edits stay in the grid.
- Apply does not commit. The tab's Commit and Rollback finish the work as for any other DML.
- Removed on purpose, do not bring back without asking: the More menu and pinning, the pending-changes drawer and SQL preview, bulk edit, the paste panel, record view, checkbox columns, row templates, the related-record picker and checks, pre-commit checks, changes-only and deletions-only views, edit tips, client-side value validation, the transaction label, receipts, verification and "Undo last Apply".
- The command palette keeps the remaining grid actions with the "Grid: " prefix.

## 2026-11-08 — Moving tabs between windows (FI-106)

User-approved product decision. Preserve these choices in later changes.

- A tab moved out of the main window opens in a lightweight SQL window: tab strip, editor and results. Workspace explorer, Git and the other side panels stay in the main window.
- Tabs move from the tab context menu and the command palette (`Move to New Window`, `Move to Window N`, `Move to Main Window`). There is no drag-out of tabs.
- Fetched rows, the open cursor and a pending transaction move with the tab. A running statement, script, export or page fetch, or unapplied grid edits, block the move with the reason.
- Database sessions stay in one process; each session belongs to exactly one window, and another window's command for it is refused. Window titles and the status bar name the owning window.
- Closing a secondary window returns its tabs, with their sessions, to the main window. Closing the main window returns all tabs first, so their unsaved SQL is offered on the next start.

## 2026-11-09 — SSH tunnels (FI-069)

User-approved product decision. Preserve these choices in later changes.

- Tunnels use the Windows OpenSSH client (`ssh.exe -N -L`) as a child process, so the user's ssh config, ssh-agent and known_hosts apply. No SSH library is bundled.
- Sign-in uses keys or ssh-agent only (`BatchMode=yes`). fbsDB stores no SSH passwords or passphrases.
- An unknown SSH host shows its SHA256 key fingerprint; only after the user confirms it is that key added to known_hosts. A changed host key is always refused, never replaced by fbsDB.
- One tunnel per profile is shared by every tab connected through it and closes with the last of them. The status bar shows `SSH` for a session that uses a tunnel.
- The first version covers Basic (host, port, service) profiles; TNS aliases and custom descriptors are not rewritten for tunnels.

## 2026-11-10 — PL/SQL debugging (FI-007)

User-approved product decision. Preserve these choices in later changes.

- The debugger uses `DBMS_DEBUG` with two sessions: the tab's own session runs the statement, a second unpooled connection of the same profile drives it. No JDWP listener or network ACL is needed.
- First version: line breakpoints (F9 or gutter click in stored PL/SQL source), Continue, Step over/into/out, Stop, call stack and read-only values. No variable editing, conditional breakpoints or watches yet.
- Debug runs the statement at the caret of a SQL tab, in that tab's own session, like Run: the same NLS settings, package state and transaction; changes wait for Commit or Rollback as after a normal run. It is refused from a unit's own source, which would compile it.
- Units without debug information are listed and recompiled with `ALTER … COMPILE DEBUG` only after the user confirms; never on a PROD connection.

## 2026-11-10 — PL/SQL profiling (FI-031)

User-approved product decision. Preserve these choices in later changes.

- Profiling uses `DBMS_PROFILER` for line-level times and run counts.
- Profile runs the statement at the caret of a SQL tab in that tab's own session, like Run. The profiler writes its rows in autonomous transactions, so the session's open work and the profiled code's changes still wait for Commit or Rollback (verified on Oracle 26ai with an explicit transaction).
- Missing `PLSQL_PROFILER_*` tables are listed with their DDL and created in the user's schema only after the user confirms; never on a PROD connection. Profiling itself is allowed on PROD when the tables already exist.
- Each run is read and then deleted from the tables; the panel offers Copy as CSV.
- Results: a panel with unit times and the slowest lines, and line time/count marks beside open sources of profiled units, with hot (≥10% of the unit) and warm (≥2%) lines highlighted.

## 2026-11-11 — Fewer buttons and menu entries

User-approved product decision. Preserve these choices in later changes.

- The result toolbar shows nine actions by default: Table view options, Edit rows, Filters, Sorting, Find in results, Copy selection formats, Load result rows, Export results and Reset result view.
- The other ten wait in the toolbar's overflow menu and in the command palette with a "Result: " prefix: Descriptions, Pivot options, Navigate to row or column, Marks, Highlights, SQL generation, Pin result, Result memory, Generate execution plan and Result commands. Settings → Toolbars can bring any of them back as a button; a user's own saved choice is kept.
- The editor context menu keeps what belongs to the clicked place: Run, Explain plan, Format, Undo, Redo, Cut, Copy, Paste, Select all, Toggle comment, Rename local variable or parameter, Quick fixes, Surround with, Find and Replace (plus the bind entries on a bind).
- Removed from the context menu and available from the command palette only; do not put them back without asking: Explain CASE or analytic function, Convert identifier case, Change local procedure signature, Extract PL/SQL assignments, Move statement up/down, Edit SQL inside EXECUTE IMMEDIATE, Review references before delete, Extract query into CTE, Generate documentation comment, Paste column names as cursors and Paste as.
- Commands shown in both the palette and the context menu are described once in `src/editorCommands.js`.

## 2026-11-13 — Four more side features removed

User-approved product decision. Do not bring these back without asking.

- Removed: editor macros (with Ctrl+Alt+Shift+M), clipboard history, opening SQLcl, SQL*Plus or a terminal in the project directory (`ui.openTerminal`, `ExternalTerminalService`) and the workspace portability check.

## 2026-11-14 — Vertical view instead of side row details; foreign keys in the cell menu

User-approved product decision. Preserve these choices in later changes.

- A row is read in the vertical view: the table area itself switches from the table to one row at a time, one line per column. There is no row-details side panel; do not bring it back without asking. The side panel keeps cell value, source definition and execution details.
- The vertical view is the existing Transpose view option. It opens on the grid's focused row from the cell menu (`Vertical view`), the floating toolbar's Details, the list button in the panel's switcher and the `details` result command. `Table view` or Esc returns to the table on the row that was shown, on its page.
- The vertical view walks every loaded row, not only the current page, and offers previous/next, Copy row and the same foreign key entries as the table.
- While grid edits are unapplied the switch is refused with the reason, because the vertical view replaces the grid.
- The cell menu has `Go to referenced row` and `Show referencing rows…`. They use the existing related/child record lookups and open the generated SELECT in a new query tab, which connects with its own session and runs the SELECT once (updated the same day: it first opened without running). Only a single SELECT without binds runs by itself, and only on that tab; if the user leaves the tab or the connection fails it is dropped and never runs later. UPDATE drafts and primary key lookups still open without running. The entries are enabled for columns with a known source table.

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

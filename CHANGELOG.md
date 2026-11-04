# Changelog

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

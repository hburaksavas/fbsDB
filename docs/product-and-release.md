# Product focus and release acceptance

Primary users are Oracle developers and analysts doing daily SQL work and data investigation. The first-use guide covers profile selection, environment verification, workspace files, SELECT with binds, and reusable mini tools. DBA administration and team governance are not release promises.

## Success criteria for a moderated pilot

Run five task sessions with representative users, recording outcomes in a local spreadsheet or issue; do not collect SQL, credentials, or personal data. Initial targets (hypotheses, not measured results): four of five users complete first connection and SELECT in five minutes; four of five save and reopen a mini tool without assistance; every user correctly identifies the environment and explains Commit/Rollback before a data change. Track task completion, elapsed time and confusion points. Repeat after material workflow changes. No telemetry is sent by the guide.

## Execution acceptance

- Single top-level DDL requires explicit confirmation. PL/SQL routines may commit internally; this classifier is not a security boundary. The native service rejects DDL while any transaction is pending, including script steps after DML. Commit or Rollback explicitly before that DDL; continue-on-error does not bypass the guard.
- A rejected DDL leaves pending DML rollbackable. Invalid DDL without pending changes must not invent a transaction. OracleLiveRegression checks both using its own temporary fixture.
- Timeout, cancellation and connection failure show the reported transaction state, or explicitly say it is unconfirmed. Never automatically retry a data change. Script progress identifies completed/failed steps; earlier commits survive subsequent failures.
- SQL history stores SQL text, which can contain sensitive literals. Users can disable it globally (limit zero), exclude profile IDs, or expire it by age. Expiry runs on load, settings changes and every minute while open. Bind values remain excluded.
- Draft recovery storage failure is visible and tells users to save to a file. Failed local preferences/history writes never crash the renderer.
- Mini tools retain description, usage example, latest change notes and monotonically increasing revision. Old version-1 definitions default to revision zero. Stale saves are rejected within the app process; this is not a distributed collaboration protocol or a full revision archive. Avoid personal values in shared example text.

## Release gate

Run `npm run test:release -- -OracleProfile FBSDB_LOCAL`. A local test database and saved credentials are mandatory; the live suite restricts profiles to localhost and uses temporary fixture objects. Desktop and portable checks run isolated application copies. Keep reports under `.artifacts/desktop-regression`, `.artifacts/oracle-live`, and `.artifacts/portable-smoke` with the release record and the emitted package SHA256.

For a signed release add `-RequireSigned -CertificateThumbprint <thumbprint>` using a trusted code-signing certificate in CurrentUser/My with its private key. The packaging script signs the launcher and application before archiving and rejects invalid signatures. No certificate is bundled or generated automatically. Signing and external timestamp access require the release owner's environment.

Extract an upgrade to a new directory rather than overwriting a running app. Close sessions, resolve transactions, save SQL, and back up `%LOCALAPPDATA%/fbsDB` and workspace `.fbsdb` first; WebView2 history/preferences reside in the configured WebView2 profile and should be backed up with the app closed. Credentials use current-user DPAPI and are not portable across users. Smoke-test the new build before removing the old directory. To roll back, close it and restore the previous application plus its matching settings/workspace/profile backup; newer settings may be read-only in older builds. Workspace tools remain format version 1 with additive metadata, but older writers can discard newer fields; do not edit shared tools with old builds after upgrading.

## User-visible performance budgets

Provisional targets on a documented reference Windows machine: packaged editor ready p95 <= 3 seconds, first local connection/SELECT <= 5 seconds, first schema discovery <= 5 seconds. Record machine, Oracle version, network conditions, sample count and cold/warm distinction. Browser bundle size is diagnostic, not acceptance for desktop startup. The desktop regression report records navigation-relative WebView2 shell/editor measurements; live regression reports connection and metadata durations. These are not process-launch-to-ready or production-network guarantees. Use at least 20 independent samples for release p95; a single regression run proves functionality only. Revisit targets after the pilot.

# Windows continuous integration

`.github/workflows/windows-ci.yml` runs on pull requests, pushes to the repository's `master` branch, merge-queue events, and manual workflow dispatch. The `Windows validation` job uses `windows-2025`, Node.js 24, and the .NET SDK selected by `global.json`.

The job performs these checks in order:

1. Install JavaScript dependencies with `npm ci`.
2. Reject stale generated bridge files and typecheck the TypeScript bridge API.
3. Build the web bundle and reject generated theme-file drift.
4. Run JavaScript tests with console and JUnit reports. The build runs first because the Sites packaging test inspects `dist`.
5. Run the ten database-independent native smoke projects listed explicitly in `scripts/test-native.ps1`.
6. Sync the editor bundle and build the unpackaged Windows x64 application in Release configuration.

The workflow uses read-only repository permissions, does not persist checkout credentials, and pins actions by commit SHA. npm's download cache is keyed by `package-lock.json`. Older in-progress runs for the same PR/ref are canceled. The job has a 30-minute limit.

Reports under `.artifacts/ci/` are uploaded even when a check fails and retained for 14 days. They include JavaScript JUnit output, individual native-project logs, the native JSON summary, and the Windows MSBuild binary log when that build step was reached. They are diagnostics, not a signed application release.

## Local verification

From a Windows checkout with Node.js 24 and the SDK required by `global.json`:

```powershell
npm ci
npm run check:bridge
npm run typecheck:bridge
npm run build
npm test
.\scripts\test-native.ps1
node scripts/sync-webcontent.mjs
dotnet build native/FbsDb/FbsDb.csproj -c Release -r win-x64 -p:Platform=x64 -p:WindowsPackageType=None
```

The native runner accepts `-DotnetExe <absolute-path>` for a workspace-local SDK and `-ReportDirectory <path>` for an alternate report location. It returns a failure if any allowlisted project fails or the suite does not finish. JavaScript reporter flags can be passed through `npm test -- ...`.

## Separate integration checks

Hosted validation does not launch the WinUI/WebView2 workbench or connect to Oracle. `npm run test:desktop` remains the isolated desktop integration command. `OracleLiveRegression`, `OracleAcceptance`, `PagingSmoke`, and `TabSessionsSmoke` require a configured live database and are intentionally absent from the native CI allowlist. No Oracle secret is required by the workflow.

The workflow becomes available after these files are committed and pushed. To require it before merging, a repository administrator can add `Windows validation` as a required check in the repository's branch rules; this change does not modify those remote rules.

Action and runner references: [setup-node](https://github.com/actions/setup-node), [setup-dotnet](https://github.com/actions/setup-dotnet), [Windows runner image](https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-Readme.md).

# Windows continuous integration

`.github/workflows/windows-ci.yml` runs on pull requests, pushes to the repository's `master` branch, merge-queue events, and manual workflow dispatch. The `Windows validation` job uses `windows-2025`, Node.js 24, and the .NET SDK selected by `global.json`.

The job performs these checks in order:

1. Install JavaScript dependencies with `npm ci`.
2. Reject stale generated bridge files, then typecheck the TypeScript bridge API and the history and query outcome helpers. Then check that App.jsx and the Workbench modules use no undefined name (`npm run check:names`).
3. Build the web bundle and reject generated theme-file drift.
4. Run JavaScript tests with console and JUnit reports.
5. Run the load smoke scenarios with budgets enforced.
6. Run the eleven database-independent native smoke projects listed explicitly in `scripts/test/test-native.ps1`.
7. Run the large TNS smoke, `tests/ScaleLoad` with 1,000 aliases and no database.
8. Sync the editor bundle and build the unpackaged Windows x64 application in Release configuration.

The workflow uses read-only repository permissions, does not persist checkout credentials, and pins actions by commit SHA. npm's download cache is keyed by `package-lock.json`. Older in-progress runs for the same PR/ref are canceled. The job has a 30-minute limit.

Reports under `.artifacts/ci/` are uploaded even when a check fails and retained for 14 days. They include JavaScript JUnit output, the load and TNS smoke reports, individual native-project logs, the native JSON summary, and the Windows MSBuild binary log when that build step was reached. They are diagnostics, not a signed application release.

## Local verification

From a Windows checkout with Node.js 24. The scripts find a .NET SDK through `scripts/build/resolve-dotnet.ps1`: the system SDK when it satisfies `global.json` (its version or any newer one), otherwise a workspace-local copy under `.tools/dotnet/` that is downloaded on first use. The two bare `dotnet` commands below need an SDK on `PATH`; without one, use the path that script prints.

```powershell
npm ci
npm run check:bridge
npm run typecheck:bridge
npm run typecheck:domain
npm run check:names
npm run build
npm test
npm run test:load -- --profile smoke --enforce-budgets
.\scripts\test\test-native.ps1
dotnet run --project tests/ScaleLoad/ScaleLoad.csproj -c Release -- tns 1000 1 .artifacts/ci/tns-load.json
node scripts/build/sync-webcontent.mjs
dotnet build native/FbsDb/FbsDb.csproj -c Release -r win-x64 -p:Platform=x64 -p:WindowsPackageType=None
```

The native runner accepts `-DotnetExe <absolute-path>` for a workspace-local SDK and `-ReportDirectory <path>` for an alternate report location. It returns a failure if any allowlisted project fails or the suite does not finish. JavaScript reporter flags can be passed through `npm test -- ...`.

## Release workflow

`.github/workflows/release.yml` runs when a `vX.Y.Z` tag is pushed. It reruns the validation job, rejects a tag that differs from the `package.json` version or has no `CHANGELOG.md` section, builds the portable package and publishes it with its `.sha256` file as a GitHub release. Only this job has write access to the repository. The steps are in [Product and release](product-and-release.md#publishing-a-release).

## Separate integration checks

Hosted validation does not launch the WinUI/WebView2 workbench or connect to Oracle. `npm run test:desktop` remains the isolated desktop integration command. Its interface tests use a simulated bridge; `scripts/test/test-desktop.ps1 -OracleFlowTest` runs the same application against a local, non-production Oracle profile with saved credentials, with nothing faked, and loses the connection through a local relay during Commit and Rollback. `scripts/dev/setup-fbsqa-fixtures.ps1` prepares the local test database for the checks that need grants from another owner, identity columns, triggers and views; those checks report themselves as skipped without it, and `-Remove` undoes it. `OracleLiveRegression` and `OracleLoad` require a configured live database and are intentionally absent from the native CI allowlist; the Oracle mode of `ScaleLoad` does too and is not run by the workflow. No Oracle secret is required by the workflow.

To require the workflow before merging, a repository administrator can add `Windows validation` as a required check in the repository's branch rules.

Action and runner references: [setup-node](https://github.com/actions/setup-node), [setup-dotnet](https://github.com/actions/setup-dotnet), [Windows runner image](https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-Readme.md).

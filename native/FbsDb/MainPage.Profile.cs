using FbsDb.Services;

namespace FbsDb;

// FI-031: profiling commands. The page starts the profiler, runs its statement
// with the ordinary sql.execute command and then asks for the report.
public sealed partial class MainPage
{
    private async Task HandleProfileCommandAsync(NativeCommandContext context)
    {
        var (sender, id, payload, tab) = (context.Sender, context.RequestId, context.Payload, context.Tab);
        switch (context.Command)
        {
            case "profile.state":
            {
                var state = await Task.Run(() => tab.Oracle.ProfilerStateAsync());
                Send(sender, new { type = "profile.state", requestId = id, tablesReady = state.TablesReady, missing = state.Missing, transactionPending = state.TransactionPending, production = await IsProductionAsync(tab), ddl = OracleSessionService.ProfilerDdl }, tab);
                break;
            }
            case "profile.createTables":
                try
                {
                    if (await IsProductionAsync(tab)) throw new InvalidOperationException("Profiler tables are not created on a PROD connection.");
                    await Task.Run(() => tab.Oracle.CreateProfilerTablesAsync());
                    Send(sender, new { type = "profile.tablesCreated", requestId = id, success = true }, tab);
                }
                catch (Exception error) when (error is InvalidOperationException or Oracle.ManagedDataAccess.Client.OracleException)
                { Send(sender, new { type = "profile.tablesCreated", requestId = id, success = false, message = error.Message }, tab); }
                break;
            case "profile.start":
            {
                if (_debugRuns.ContainsKey(tab.Id)) throw new InvalidOperationException("Stop debugging before profiling.");
                if (_scriptRuns.ContainsKey(tab.Id)) throw new InvalidOperationException("Finish the running script before profiling.");
                var runId = await Task.Run(() => tab.Oracle.StartProfilerAsync());
                Send(sender, new { type = "profile.started", requestId = id, runId }, tab);
                break;
            }
            case "profile.finish":
            {
                var report = await Task.Run(() => tab.Oracle.FinishProfilerAsync());
                Send(sender, new { type = "profile.report", requestId = id, report, transactionPending = tab.Oracle.HasPendingTransaction }, tab);
                break;
            }
            case "profile.source":
            {
                var owner = PlsqlDebugger.Validate(payload.GetProperty("owner").GetString() ?? "", "schema");
                var name = PlsqlDebugger.Validate(payload.GetProperty("name").GetString() ?? "", "unit");
                var unitType = payload.GetProperty("unitType").GetString() ?? "";
                if (!PlsqlDebugger.DebuggableTypes.Contains(unitType)) throw new InvalidOperationException("This unit has no source to show.");
                var definition = await Task.Run(() => tab.Oracle.LoadCompletionDefinitionAsync(owner, name, unitType.Replace(" BODY", ""), unitType.EndsWith(" BODY", StringComparison.Ordinal), CancellationToken.None));
                Send(sender, new { type = "profile.source", requestId = id, owner, name, unitType, text = definition.Text }, tab);
                break;
            }
        }
    }
}

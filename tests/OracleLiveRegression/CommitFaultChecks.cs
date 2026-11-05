using FbsDb.Services;

// A connection lost during Commit against real Oracle. The two failures look identical to the application and leave different data behind,
// which is why it must report the outcome as unknown and let the user get the tab working again without retrying anything.
sealed class CommitFaultChecks(OracleSessionService observer, ConnectionProfile profile, string user, Func<string, Func<Task>, Task> check, Action<bool, string> require, List<string> created)
{
    private readonly string _table = $"\"{user}\".\"FBSQA_CF_{Guid.NewGuid().ToString("N")[..10].ToUpperInvariant()}\"";

    private async Task<int> Rows(int id) => Convert.ToInt32((await observer.ExecuteAsync($"SELECT COUNT(*) FROM {_table} WHERE ID={id}")).Rows[0][0]);

    private async Task LoseConnectionDuringCommit(FaultProxy.Cut cut, int id, int expectedRows)
    {
        using var proxy = new FaultProxy(profile.Host, int.Parse(profile.Port));
        var throughProxy = profile with { Method = "basic", Descriptor = $"(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=127.0.0.1)(PORT={proxy.Port}))(CONNECT_DATA=(SERVICE_NAME={profile.Service})))" };
        using var session = new OracleSessionService();
        await session.ConnectAsync(throughProxy, "", "", null);
        await session.ExecuteAsync($"INSERT INTO {_table} (ID) VALUES ({id})");
        require(session.HasPendingTransaction, "The insert did not open a transaction.");

        proxy.Arm(cut);
        Exception? failure = null;
        try { await session.CommitAsync().WaitAsync(TimeSpan.FromSeconds(60)); }
        catch (Exception error) { failure = error; }
        proxy.Disarm();

        require(failure is not null, "Commit reported success although the connection was lost.");
        require(failure is not TimeoutException, "Commit did not notice the lost connection within 60 seconds.");
        require(!session.IsConnected, "The session still claims to be connected, so the failure would not be reported as an unknown outcome.");
        require(await Rows(id) == expectedRows, $"Oracle holds a different result than this scenario produces (expected {expectedRows} row).");

        require(!session.HasPendingTransaction, "A transaction outlived its connection, so the tab cannot reconnect, disconnect or close.");

        Exception? repeated = null;
        try { await session.CommitAsync().WaitAsync(TimeSpan.FromSeconds(30)); }
        catch (Exception error) { repeated = error; }
        require(repeated is not null, "A repeated Commit on the lost connection reported success.");

        await session.ConnectAsync(throughProxy, "", "", null).WaitAsync(TimeSpan.FromSeconds(30));
        require(session.IsConnected && !session.HasPendingTransaction, "Reconnecting did not give the tab a clean session.");
        require(Convert.ToInt32((await session.ExecuteAsync("SELECT 46 FROM dual")).Rows[0][0]) == 46, "The reconnected session cannot run queries.");
    }

    private async Task LoseConnectionDuringRollback(int id)
    {
        using var proxy = new FaultProxy(profile.Host, int.Parse(profile.Port));
        var throughProxy = profile with { Method = "basic", Descriptor = $"(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=127.0.0.1)(PORT={proxy.Port}))(CONNECT_DATA=(SERVICE_NAME={profile.Service})))" };
        using var session = new OracleSessionService();
        await session.ConnectAsync(throughProxy, "", "", null);
        await session.ExecuteAsync($"INSERT INTO {_table} (ID) VALUES ({id})");

        proxy.Arm(FaultProxy.Cut.BeforeServer);
        Exception? failure = null;
        try { await session.RollbackAsync().WaitAsync(TimeSpan.FromSeconds(60)); }
        catch (Exception error) { failure = error; }
        proxy.Disarm();

        require(failure is not null, "Rollback reported success although the connection was lost.");
        require(!session.IsConnected && !session.HasPendingTransaction, "A transaction outlived its connection after Rollback failed.");
        require(await Rows(id) == 0, "A row whose Rollback failed became visible.");
        await session.DisconnectAsync(rollbackPending: false).WaitAsync(TimeSpan.FromSeconds(30));
    }

    private async Task LoseConnectionDuringAutoCommit(FaultProxy.Cut cut, int id, int expectedRows)
    {
        using var proxy = new FaultProxy(profile.Host, int.Parse(profile.Port));
        var throughProxy = profile with { Method = "basic", Descriptor = $"(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=127.0.0.1)(PORT={proxy.Port}))(CONNECT_DATA=(SERVICE_NAME={profile.Service})))" };
        using var session = new OracleSessionService();
        await session.ConnectAsync(throughProxy, "", "", null);
        await session.SetAutoCommitAsync(true);

        Exception? failure = null;
        var reachedCommit = false;
        var armAtCommit = new InlineProgress(stage => { if (stage == "Committing statement") { reachedCommit = true; proxy.Arm(cut); } });
        try { await session.ExecuteAsync($"INSERT INTO {_table} (ID) VALUES ({id})", progress: armAtCommit).WaitAsync(TimeSpan.FromSeconds(60)); }
        catch (Exception error) { failure = error; }
        proxy.Disarm();

        require(reachedCommit, "The statement never reached its automatic Commit.");
        require(failure is OracleCommitOutcomeUnknownException, $"The outcome was not reported as unknown: {failure?.GetType().Name}: {failure?.Message}");
        require(!session.IsConnected && !session.HasPendingTransaction, "A transaction outlived its connection.");
        require(await Rows(id) == expectedRows, $"Oracle holds a different result than this scenario produces (expected {expectedRows} row).");

        await session.ConnectAsync(throughProxy, "", "", null).WaitAsync(TimeSpan.FromSeconds(30));
        require(session.IsConnected && !session.HasPendingTransaction, "Reconnecting did not give the tab a clean session.");
    }

    private async Task LoseConnectionBeforeAutoCommit(int id)
    {
        using var proxy = new FaultProxy(profile.Host, int.Parse(profile.Port));
        var throughProxy = profile with { Method = "basic", Descriptor = $"(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=127.0.0.1)(PORT={proxy.Port}))(CONNECT_DATA=(SERVICE_NAME={profile.Service})))" };
        using var session = new OracleSessionService();
        await session.ConnectAsync(throughProxy, "", "", null);
        await session.SetAutoCommitAsync(true);

        proxy.Arm(FaultProxy.Cut.BeforeServer);
        Exception? failure = null;
        try { await session.ExecuteAsync($"INSERT INTO {_table} (ID) VALUES ({id})").WaitAsync(TimeSpan.FromSeconds(60)); }
        catch (Exception error) { failure = error; }
        proxy.Disarm();

        require(failure is not null && failure is not OracleCommitOutcomeUnknownException, $"A statement that never reached Commit was reported wrongly: {failure?.GetType().Name}: {failure?.Message}");
        require(!session.IsConnected && !session.HasPendingTransaction, "A transaction outlived its connection.");
        require(await Rows(id) == 0, "A statement that never ran was saved.");
    }

    public async Task RunAsync()
    {
        await check("commit fault fixture table is created", async () => {
            await observer.ExecuteAsync($"CREATE TABLE {_table} (ID NUMBER(10) PRIMARY KEY)");
            created.Insert(0, _table);
        });
        await check("connection lost before Commit reaches Oracle: reported as failed connection, nothing is saved, the tab reconnects", () => LoseConnectionDuringCommit(FaultProxy.Cut.BeforeServer, 1, 0));
        await check("connection lost after Oracle commits: reported as failed connection, the row is saved, the tab reconnects", () => LoseConnectionDuringCommit(FaultProxy.Cut.AfterServer, 2, 1));
        await check("connection lost during Rollback: the failure is reported, nothing is saved, the tab can disconnect", () => LoseConnectionDuringRollback(3));
        await check("auto commit, connection lost before the automatic Commit reaches Oracle: outcome unknown, nothing is saved", () => LoseConnectionDuringAutoCommit(FaultProxy.Cut.BeforeServer, 4, 0));
        await check("auto commit, connection lost after Oracle commits: outcome unknown, the row is saved", () => LoseConnectionDuringAutoCommit(FaultProxy.Cut.AfterServer, 5, 1));
        await check("auto commit, connection lost before the statement runs: an ordinary failure, not an unknown outcome", () => LoseConnectionBeforeAutoCommit(6));
    }
}

using FbsDb.Services;

async Task Reject<T>(Func<Task> operation) where T : Exception
{
    try { await operation().WaitAsync(TimeSpan.FromSeconds(5)); }
    catch (T) { return; }
    throw new Exception($"Expected {typeof(T).Name}.");
}
using var a = new OracleSessionService();
using var b = new OracleSessionService();
using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
await Reject<OperationCanceledException>(() => a.LoadSchemaAsync(cancelled.Token));
await Reject<OperationCanceledException>(() => a.LoadTableDetailsAsync("T", cancellationToken: cancelled.Token));
await Reject<OperationCanceledException>(() => a.FetchNextPageAsync("stale", 100, cancelled.Token));
await Reject<InvalidOperationException>(() => a.LoadSchemaAsync());
await Reject<InvalidOperationException>(() => a.LoadTableDetailsAsync("T"));
await Reject<InvalidOperationException>(() => a.GetColumnDefinitionAsync("APP", "T", "ID"));
await Reject<InvalidOperationException>(() => a.GetPrimaryKeyAsync("APP", "T"));
await Reject<InvalidOperationException>(() => a.FetchNextPageAsync("stale", 100));
await a.CloseResultAsync("stale").WaitAsync(TimeSpan.FromSeconds(5));
await a.SetAutoCommitAsync(true).WaitAsync(TimeSpan.FromSeconds(5));
if (!a.AutoCommit || b.AutoCommit || a.HasPendingTransaction || b.HasPendingTransaction || a.IsConnected || b.IsConnected)
    throw new Exception("Metadata/paging changed session ownership or transaction state.");
await a.RollbackAsync(); await b.CommitAsync();
await a.DisconnectAsync(false);
if (a.CancelCurrentOperation() || b.CancelCurrentOperation()) throw new Exception("A failed/cancelled operation retained active cancellation state.");
Console.WriteLine("PASS session services: cancelled metadata/paging, disconnected guards, gate release and session isolation without a database.");

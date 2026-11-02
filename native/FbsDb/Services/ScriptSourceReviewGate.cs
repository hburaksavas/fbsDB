using System.Collections.Concurrent;
namespace FbsDb.Services;

// One explicit review per paused script/tab. Late acknowledgements cannot
// release another run or step. The caller owns cancellation and cleanup.
public sealed class ScriptSourceReviewGate
{
    public sealed record Pending(string RunId, int Index, string Nonce, TaskCompletionSource<string> Completion);
    private readonly ConcurrentDictionary<string, Pending> _pending = new();
    public Pending Begin(string tabId, string runId, int index)
    {
        var pending = new Pending(runId,index,Guid.NewGuid().ToString("N"),new(TaskCreationOptions.RunContinuationsAsynchronously));
        if (!_pending.TryAdd(tabId,pending)) throw new InvalidOperationException("A script source review is already pending in this tab.");
        return pending;
    }
    public bool Approve(string tabId,string runId,int index,string nonce,string reviewId)
    {
        return !string.IsNullOrWhiteSpace(reviewId) && _pending.TryGetValue(tabId,out var pending) && pending.RunId==runId && pending.Index==index && pending.Nonce==nonce && pending.Completion.TrySetResult(reviewId);
    }
    public void Remove(string tabId) { if (_pending.TryRemove(tabId,out var pending)) pending.Completion.TrySetCanceled(); }
}

using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using Windows.Storage;
using Windows.Storage.Pickers;
using WinRT.Interop;
using FbsDb.Services;

namespace FbsDb;

public sealed partial class MainPage
{
    private sealed record NativeCommandContext(CoreWebView2 Sender, string? RequestId, string Command, JsonElement Payload, TabSession Tab);

    private abstract class NativeCommandHandler(MainPage host, NativeCommandContext context)
    {
        protected MainPage Host { get; } = host;
        protected NativeCommandContext Context { get; } = context;
        protected OracleSessionService _oracle => Context.Tab.Oracle;
        protected string? _activeFilePath { get => Context.Tab.FilePath; set => Context.Tab.FilePath = value; }
        protected TnsProfileService _profiles => Host._profiles;
        protected TabSessionRegistry _sessions => Host._sessions;
        protected OracleSessionService _credentials => Host._credentials;
        protected WorkspaceService _workspace => Host._workspace;
        protected WorkspaceDevelopmentService Development => Host.Development;
        protected ConcurrentDictionary<string, CancellationTokenSource> _scriptRuns => Host._scriptRuns;
        protected ConcurrentDictionary<string, CancellationTokenSource> _gridApplies => Host._gridApplies;
        protected ConcurrentDictionary<string, CancellationTokenSource> _resultExports => Host._resultExports;
        protected ConcurrentDictionary<string, CancellationTokenSource> _completionRequests => Host._completionRequests;
        protected ConcurrentDictionary<string, CancellationTokenSource> _schemaRequests => Host._schemaRequests;
        protected void Send(CoreWebView2 sender, object value) => MainPage.Send(sender, value, Context.Tab);
        protected Task SendAsync(CoreWebView2 sender, object value) => MainPage.SendAsync(sender, value, Context.Tab);
        protected void PostError(CoreWebView2 sender, string? id, string message) => MainPage.PostError(sender, id, message, Context.Tab);
        protected Task SendProfilesAsync(CoreWebView2 sender, string? id = null) => Host.SendProfilesAsync(sender, id, Context.Tab);
        protected Task SendWorkspaceAsync(CoreWebView2 sender) => Host.SendWorkspaceAsync(sender, Context.Tab);
        protected void EnsureWorkspaceRoot(JsonElement payload) => Host.EnsureWorkspaceRoot(payload);
        public abstract Task HandleAsync();
    }
}

using System.Net;
using System.Net.Sockets;

// A loopback TCP relay that loses the connection at a chosen moment, so a real Oracle session fails the way a network failure does.
sealed class FaultProxy : IDisposable
{
    public enum Cut { None, BeforeServer, AfterServer }

    private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
    private readonly string _host;
    private readonly int _port;
    private volatile Cut _cut;

    public FaultProxy(string host, int port)
    {
        (_host, _port) = (host, port);
        _listener.Start();
        _ = AcceptAsync();
    }

    public int Port => ((IPEndPoint)_listener.LocalEndpoint).Port;

    // Applies to the next bytes the client sends. BeforeServer drops them; AfterServer delivers them and drops the server's reply.
    public void Arm(Cut cut) => _cut = cut;
    public void Disarm() => _cut = Cut.None;

    private async Task AcceptAsync()
    {
        try
        {
            while (true)
            {
                var client = await _listener.AcceptTcpClientAsync();
                _ = RelayAsync(client);
            }
        }
        catch (ObjectDisposedException) { }
        catch (SocketException) { }
    }

    private async Task RelayAsync(TcpClient client)
    {
        using (client)
        using (var server = new TcpClient())
        {
            client.NoDelay = true;
            server.NoDelay = true;
            void Abort()
            {
                foreach (var socket in new[] { client, server })
                {
                    try { socket.LingerState = new LingerOption(true, 0); socket.Close(); }
                    catch (SocketException) { }
                    catch (ObjectDisposedException) { }
                }
            }
            try
            {
                await server.ConnectAsync(_host, _port);
                var fromClient = client.GetStream();
                var fromServer = server.GetStream();
                var dropReplies = false;
                async Task Requests()
                {
                    var buffer = new byte[65536];
                    int read;
                    while ((read = await fromClient.ReadAsync(buffer)) > 0)
                    {
                        if (_cut == Cut.BeforeServer) { Abort(); return; }
                        if (_cut == Cut.AfterServer) Volatile.Write(ref dropReplies, true);
                        await fromServer.WriteAsync(buffer.AsMemory(0, read));
                    }
                }
                async Task Replies()
                {
                    var buffer = new byte[65536];
                    int read;
                    while ((read = await fromServer.ReadAsync(buffer)) > 0)
                    {
                        if (Volatile.Read(ref dropReplies)) { Abort(); return; }
                        await fromClient.WriteAsync(buffer.AsMemory(0, read));
                    }
                }
                await Task.WhenAny(Requests(), Replies());
            }
            catch (IOException) { }
            catch (SocketException) { }
            catch (ObjectDisposedException) { }
            Abort();
        }
    }

    public void Dispose() => _listener.Stop();
}

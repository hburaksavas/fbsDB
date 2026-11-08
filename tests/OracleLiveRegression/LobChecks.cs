using System.Text.Json;
using FbsDb.Bridge;
using FbsDb.Services;

// Large values in grid results arrive as previews; their locators are read in chunks until the result closes.
sealed class LobChecks(OracleSessionService a, OracleSessionService b, string user, Func<string, Func<Task>, Task> check, Action<bool, string> require, List<string> created)
{
    private readonly string _name = "FBSQA_LOB_" + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();
    private string Table => $"\"{user}\".\"{_name}\"";
    private const int LargeCharacters = 600_003, BlobBytes = 1_100_001;
    private static string Expected(int length) => string.Concat(Enumerable.Range(0, length / 7 + 1).Select(i => (i % 10).ToString() + "ğabcdé")).Substring(0, length);
    private static byte[] ExpectedBytes(int length) => Enumerable.Range(0, length).Select(i => (byte)(i * 31 % 251)).ToArray();

    private static async Task<string> ReadAll(OracleSessionService session, LobCell cell)
    {
        var text = new System.Text.StringBuilder(cell.Preview);
        while (text.Length < cell.Length) { var chunk = await session.ReadLobAsync(cell.LobId!, text.Length, int.MaxValue); text.Append(chunk.Text); if (chunk.Count == 0) break; }
        return text.ToString();
    }

    public async Task RunAsync()
    {
        await check("large CLOB, NCLOB and BLOB values become previews readable in chunks", async () => {
            await a.ExecuteAsync($"CREATE TABLE {Table} (ID NUMBER PRIMARY KEY, DOC CLOB, NDOC NCLOB, BIN BLOB)");
            created.Add(Table);
            await a.ExecuteAsync($"INSERT INTO {Table} (ID, DOC) VALUES (1, 'short value')");
            var text = Expected(LargeCharacters);
            var bytes = ExpectedBytes(BlobBytes);
            // Each value is written once: a CLOB bind, and a BLOB built in a temporary LOB from its 251-byte period. Appending many times would keep LOB versions and exhaust the test user's quota.
            await a.ExecuteAsync($"INSERT INTO {Table} (ID, DOC, NDOC, BIN) VALUES (2, :doc, TO_NCLOB(:doc), EMPTY_BLOB())", [new SqlBindParameter("doc", "Clob", text)]);
            await a.ExecuteAsync($"DECLARE l BLOB; b RAW(251) := HEXTORAW(:block); BEGIN DBMS_LOB.CREATETEMPORARY(l, TRUE); FOR i IN 1 .. CEIL(:total / 251) LOOP DBMS_LOB.WRITEAPPEND(l, 251, b); END LOOP; DBMS_LOB.TRIM(l, :total); UPDATE {Table} SET BIN = l WHERE ID = 2; DBMS_LOB.FREETEMPORARY(l); END;",
                [new SqlBindParameter("block", "Varchar2", Convert.ToHexString(bytes, 0, 251)), new SqlBindParameter("total", "NUMBER", BlobBytes.ToString(System.Globalization.CultureInfo.InvariantCulture))]);
            await a.ExecuteAsync($"INSERT INTO {Table} (ID, DOC) VALUES (3, NULL)");
            await a.CommitAsync();

            var result = await a.ExecuteAsync($"SELECT ID, DOC, NDOC, BIN FROM {Table} ORDER BY ID", deferLobs: true);
            require(!result.HasMore && result.Rows.Count == 3, "The LOB fixture rows were not read in one page.");
            require(result.Rows[0][1] as string == "short value" && result.Rows[2][1] is null, "Small and NULL CLOB values must stay ordinary values.");
            var doc = result.Rows[1][1] as LobCell ?? throw new InvalidOperationException("A large CLOB was not sent as a preview.");
            var ndoc = result.Rows[1][2] as LobCell ?? throw new InvalidOperationException("A large NCLOB was not sent as a preview.");
            var bin = result.Rows[1][3] as LobCell ?? throw new InvalidOperationException("A large BLOB was not sent as a preview.");
            require(doc.LobType == "CLOB" && doc.Length == LargeCharacters && doc.Preview == text[..OracleLobLocators.PreviewCharacters], $"CLOB preview is wrong: {doc.LobType} {doc.Length}.");
            require(ndoc.LobType == "NCLOB" && ndoc.Length == LargeCharacters, $"NCLOB preview is wrong: {ndoc.LobType} {ndoc.Length}.");
            require(bin.LobType == "BLOB" && bin.Length == BlobBytes && Convert.FromBase64String(bin.Preview).SequenceEqual(bytes[..OracleLobLocators.PreviewBytes]), "BLOB preview is wrong.");
            var wire = JsonSerializer.Serialize<object?[]>(result.Rows[1], NativeBridgeContract.JsonOptions);
            require(wire.Contains("\"kind\":\"lob\"") && wire.Contains("\"lobType\":\"CLOB\"") && wire.Contains("\"lobId\":") && wire.Contains("\"length\":600003"), "The preview does not reach the interface in its documented shape: " + wire[..Math.Min(200, wire.Length)]);

            var first = await a.ReadLobAsync(doc.LobId!, 0, int.MaxValue);
            require(first.Count == OracleLobLocators.MaxChunkCharacters && !first.Complete, "A chunk was not capped at the documented size.");
            require(await ReadAll(a, doc) == text, "The CLOB read in chunks differs from the stored value.");
            require(await ReadAll(a, ndoc) == text, "The NCLOB read in chunks differs from the stored value.");
            var blobRead = new List<byte>(Convert.FromBase64String(bin.Preview));
            while (blobRead.Count < bin.Length) blobRead.AddRange(Convert.FromBase64String((await a.ReadLobAsync(bin.LobId!, blobRead.Count, int.MaxValue)).Base64!));
            require(blobRead.SequenceEqual(bytes), "The BLOB read in chunks differs from the stored value.");
            var tail = await a.ReadLobAsync(doc.LobId!, LargeCharacters - 3, 10);
            require(tail.Text == text[^3..] && tail.Complete, "Reading past the end did not stop at the last character.");

            var whole = await a.ExecuteAsync($"SELECT DOC FROM {Table} WHERE ID = 2");
            require(whole.Rows[0][0] is string direct && text.StartsWith(direct, StringComparison.Ordinal), "Statements outside the grid must keep reading the value itself.");
            if (whole.ResultId is { } wholeId) await a.CloseResultAsync(wholeId);

            await a.ExecuteAsync($"UPDATE {Table} SET DOC = DOC WHERE ID = 1");
            await a.RollbackAsync();
            await b.ExecuteAsync($"UPDATE {Table} SET DOC = 'changed elsewhere' WHERE ID = 2");
            await b.CommitAsync();
            require((await a.ReadLobAsync(doc.LobId!, 0, 10)).Text == text[..10], "After a rollback and another session's commit the locator must still read the value as of the query.");

            await a.CloseResultAsync(result.ResultId!);
            try { await a.ReadLobAsync(doc.LobId!, 0, 10); throw new InvalidOperationException("A closed result's value was still readable."); }
            catch (InvalidOperationException error) when (error.Message.Contains("Run the query again", StringComparison.Ordinal)) { }
            await a.ExecuteAsync($"DROP TABLE {Table} PURGE");
            created.Remove(Table);
        });
    }
}

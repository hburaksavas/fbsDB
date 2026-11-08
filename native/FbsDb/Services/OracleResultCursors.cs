using System.Globalization;
using Oracle.ManagedDataAccess.Client;

namespace FbsDb.Services;

public sealed partial class OracleSessionService
{
    // Owns readers/commands only. Callers serialize access with the session gate;
    // the transaction and cancellation token are supplied for each operation.
    private sealed class OracleResultCursors : IDisposable
    {
        private sealed record ParkedResult(OracleDataReader Reader, OracleCommand Command, object?[]? NextRow, SqlColumn[] Columns, int Offset);
        private readonly Dictionary<string, ParkedResult> _parkedResults = new();
        private OracleDataReader? _pageReader;
        private OracleCommand? _pageCommand;
        public OracleCommand? Command => _pageCommand;
        private object?[]? _nextRow;
        private string? _resultId;
        private SqlColumn[] _pageColumns = [];
        private int _pageOffset;
        private readonly OracleLobLocators _lobs = new();

        public async Task OpenAsync(OracleCommand command, OracleConnection connection, OracleTransaction? transaction, CancellationToken token)
        {
            _pageReader = await command.ExecuteReaderAsync(token);
            _pageCommand = command;
            _resultId = Guid.NewGuid().ToString("N"); _pageOffset = 0;
            _pageColumns = ReadResultColumns(_pageReader);
            if (_pageColumns.Any(column => column.TemporalKind == "TIMESTAMP WITH LOCAL TIME ZONE"))
            {
                await using var timezone = connection.CreateCommand();
                timezone.CommandText = "SELECT SESSIONTIMEZONE FROM dual"; timezone.CommandTimeout = 5;
                if (transaction is not null) timezone.Transaction = transaction;
                var zone = Convert.ToString(await timezone.ExecuteScalarAsync(token), CultureInfo.InvariantCulture);
                _pageColumns = _pageColumns.Select(column => column.TemporalKind == "TIMESTAMP WITH LOCAL TIME ZONE" ? column with { SessionTimeZone = zone } : column).ToArray();
            }
        }

        private static SqlColumn[] ReadResultColumns(OracleDataReader reader)
        {
            System.Data.DataTable? schema = null;
            try { schema = reader.GetSchemaTable(); } catch (NotSupportedException) { }
            return Enumerable.Range(0, reader.FieldCount).Select(i => {
                var row = schema is not null && i < schema.Rows.Count ? schema.Rows[i] : null;
                object? Get(string key) => row is not null && row.Table.Columns.Contains(key) && row[key] is not DBNull ? row[key] : null;
                int? Number(string key) => Get(key) is { } value ? Convert.ToInt32(value, CultureInfo.InvariantCulture) : null;
                var temporal=reader.GetProviderSpecificFieldType(i).Name switch {"OracleDate"=>"DATE","OracleTimeStamp"=>"TIMESTAMP","OracleTimeStampTZ"=>"TIMESTAMP WITH TIME ZONE","OracleTimeStampLTZ"=>"TIMESTAMP WITH LOCAL TIME ZONE",_=>null};
                return new SqlColumn(reader.GetName(i), temporal??reader.GetDataTypeName(i)) { TemporalKind=temporal,
                    Size = Number("ColumnSize"), Precision = Number("NumericPrecision"), Scale = Number("NumericScale"),
                    Nullable = Get("AllowDBNull") is bool nullable ? nullable : null,
                    SourceSchema = Get("BaseSchemaName")?.ToString(), SourceTable = Get("BaseTableName")?.ToString(), SourceColumn = Get("BaseColumnName")?.ToString()
                };
            }).ToArray();
        }
        private object?[] ReadCurrentRow(bool deferLobs)
        {
            var row = new object?[_pageReader!.FieldCount];
            for (var i = 0; i < row.Length; i++) {
                if(_pageReader.IsDBNull(i)){row[i]=null;continue;}
                if(deferLobs&&_resultId is { } owner&&_pageColumns[i].Type is "Clob" or "NClob" or "Blob"){row[i]=_lobs.Cell(owner,_pageColumns[i].Type,_pageReader,i);continue;}
                var temporal=_pageColumns[i].TemporalKind;
                if(temporal is not null){row[i]=temporal switch{"DATE"=>OracleTemporalCell.From(_pageReader.GetOracleDate(i)),"TIMESTAMP"=>OracleTemporalCell.From(_pageReader.GetOracleTimeStamp(i)),"TIMESTAMP WITH TIME ZONE"=>OracleTemporalCell.From(_pageReader.GetOracleTimeStampTZ(i)),_=>OracleTemporalCell.From(_pageReader.GetOracleTimeStampLTZ(i),_pageColumns[i].SessionTimeZone)};continue;}
                var type=_pageReader.GetFieldType(i);
                row[i]=type==typeof(decimal)?_pageReader.GetOracleDecimal(i).ToString().Replace(CultureInfo.CurrentCulture.NumberFormat.NumberDecimalSeparator,"."):ToWireValue(_pageReader.GetValue(i));
            }
            return row;
        }
        // deferLobs: large CLOB/BLOB values become previews whose locators stay readable through ReadLob until the result is closed.
        public async Task<SqlExecutionResult> ReadPageAsync(int size, bool transactionPending, CancellationToken token, bool deferLobs = false)
        {
            var id = _resultId;
            var offset = _pageOffset;
            var columns = _pageColumns;
            var rows = new List<object?[]>();
            if (_nextRow is not null) { rows.Add(_nextRow); _nextRow = null; }
            try
            {
                while (rows.Count < size && await _pageReader!.ReadAsync(token)) rows.Add(ReadCurrentRow(deferLobs));
                if (rows.Count == size && await _pageReader!.ReadAsync(token)) _nextRow = ReadCurrentRow(deferLobs);
            }
            catch { if (offset == 0 && id is not null) _lobs.Release(id); throw; }
            var hasMore = _nextRow is not null;
            _pageOffset += rows.Count;
            if (!hasMore) await ClosePagedResultAsync();
            return new SqlExecutionResult(columns, rows, null, 0, rows.Count, false, transactionPending, []) { ResultId = id, HasMore = hasMore, PageSize = size, Offset = offset };
        }
        public void ParkPagedResult()
        {
            if (_resultId is not null && _pageReader is not null && _pageCommand is not null)
                _parkedResults[_resultId] = new(_pageReader, _pageCommand, _nextRow, _pageColumns, _pageOffset);
            _pageReader = null; _pageCommand = null; _nextRow = null; _resultId = null;
        }
        public async Task CloseAllPagedResultsAsync()
        {
            await ClosePagedResultAsync();
            foreach (var cursor in _parkedResults.Values) { await cursor.Reader.DisposeAsync(); await cursor.Command.DisposeAsync(); }
            _parkedResults.Clear();
            _lobs.ReleaseAll();
        }
        public async Task CloseAsync(string resultId)
        {
            _lobs.Release(resultId);
            if (_resultId == resultId) await ClosePagedResultAsync();
            else if (_parkedResults.Remove(resultId, out var cursor)) { await cursor.Reader.DisposeAsync(); await cursor.Command.DisposeAsync(); }
        }
        public LobChunk ReadLob(string lobId, long offset, int count) => _lobs.Read(lobId, offset, count, limitChunk: true);
        public LobChunk ReadWholeLob(string lobId) => _lobs.Read(lobId, 0, int.MaxValue);
        public async Task ClosePagedResultAsync()
        {
            var reader = _pageReader; var command = _pageCommand;
            _pageReader = null; _pageCommand = null; _nextRow = null; _resultId = null;
            if (reader is not null) await reader.DisposeAsync();
            if (command is not null) await command.DisposeAsync();
        }
        public void Activate(string resultId)
        {
            if (_resultId != resultId && _parkedResults.Remove(resultId, out var parked))
            {
                ParkPagedResult();
                _resultId = resultId; _pageReader = parked.Reader; _pageCommand = parked.Command;
                _nextRow = parked.NextRow; _pageColumns = parked.Columns; _pageOffset = parked.Offset;
            }
            if (_pageReader is null || _resultId != resultId) throw new InvalidOperationException("This result cursor is no longer available. Run the query again.");
        }

        public void Dispose()
        {
            _lobs.ReleaseAll();
            foreach (var cursor in _parkedResults.Values) { cursor.Reader.Dispose(); cursor.Command.Dispose(); }
            _parkedResults.Clear();
            _pageReader?.Dispose(); _pageCommand?.Dispose();
            _pageReader = null; _pageCommand = null; _nextRow = null; _resultId = null;
        }
    }
}

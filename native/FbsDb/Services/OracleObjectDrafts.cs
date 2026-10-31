namespace FbsDb.Services;

public sealed partial class OracleSessionService
{
    public async Task<ObjectDraftMetadata> LoadObjectDraftMetadataAsync(string owner, string name, string type, CancellationToken token)
    {
        if (type != "TABLE") throw new InvalidOperationException("Writable column metadata is available for tables only.");
        await _gate.WaitAsync(token);
        try
        {
            await using var command = CompletionCommand(@"SELECT c.column_name,c.data_type,c.identity_column,c.virtual_column,
                CASE WHEN EXISTS(SELECT 1 FROM all_constraints p JOIN all_cons_columns k ON k.owner=p.owner AND k.constraint_name=p.constraint_name
                    WHERE p.owner=c.owner AND p.table_name=c.table_name AND p.constraint_type='P' AND p.status='ENABLED' AND p.validated='VALIDATED' AND k.column_name=c.column_name) THEN 1 ELSE 0 END
                FROM all_tab_cols c WHERE c.owner=:owner AND c.table_name=:name AND c.hidden_column='NO' ORDER BY c.column_id", owner, name);
            var columns = new List<ObjectDraftColumn>();
            await using var reader = await command.ExecuteReaderAsync(token);
            while (await reader.ReadAsync(token))
                columns.Add(new(reader.GetString(0),reader.GetString(1),reader.GetString(2)!="YES" && reader.GetString(3)!="YES",reader.GetInt32(4)==1));
            return new(owner,name,columns);
        }
        finally { Touch(); _gate.Release(); }
    }
}
public sealed record ObjectDraftColumn(string Name,string Type,bool Writable,bool PrimaryKey);
public sealed record ObjectDraftMetadata(string Owner,string Name,IReadOnlyList<ObjectDraftColumn> Columns);

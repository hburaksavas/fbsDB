using Oracle.ManagedDataAccess.Client;

namespace FbsDb.Services;

public sealed partial class OracleSessionService
{
    public async Task<OracleObjectAnalysis> LoadObjectAnalysisAsync(string owner, string name, string type, CancellationToken token)
    {
        var grants = new List<OracleObjectGrant>(); var dependencies = new List<OracleObjectDependency>();
        var impact = new List<OracleObjectDependency>();
        await _gate.WaitAsync(token);
        try
        {
            await using (var command = CompletionCommand("SELECT grantee,privilege,grantable,grantor,CAST(NULL AS VARCHAR2(128)) column_name FROM all_tab_privs WHERE table_schema=:owner AND table_name=:name UNION ALL SELECT grantee,privilege,grantable,grantor,column_name FROM all_col_privs WHERE table_schema=:owner AND table_name=:name ORDER BY grantee,privilege,column_name FETCH FIRST 1001 ROWS ONLY", owner, name))
            await using (var reader = await command.ExecuteReaderAsync(token))
                while (await reader.ReadAsync(token)) grants.Add(new(reader.GetString(0), reader.GetString(1), reader.GetString(2) == "YES", reader.GetString(3), reader.IsDBNull(4) ? null : reader.GetString(4)));
            foreach (var reverse in new[] { false, true })
            {
                var sql = reverse
                    ? "SELECT owner,name,type,referenced_link_name FROM all_dependencies WHERE referenced_owner=:owner AND referenced_name=:name AND referenced_type=:objectType ORDER BY owner,name,type FETCH FIRST 1001 ROWS ONLY"
                    : "SELECT referenced_owner,referenced_name,referenced_type,referenced_link_name FROM all_dependencies WHERE owner=:owner AND name=:name AND type=:objectType ORDER BY referenced_owner,referenced_name,referenced_type FETCH FIRST 1001 ROWS ONLY";
                await using var command = CompletionCommand(sql, owner, name);
                command.Parameters.Add("objectType", OracleDbType.Varchar2).Value = type;
                await using var reader = await command.ExecuteReaderAsync(token);
                while (await reader.ReadAsync(token)) (reverse ? impact : dependencies).Add(new(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.IsDBNull(3) ? null : reader.GetString(3)));
            }
        }
        finally { Touch(); _gate.Release(); }
        string? ddl = null, ddlError = null;
        try { ddl = (await LoadCompletionDefinitionAsync(owner, name, type, false, token)).Text; }
        catch (Exception error) when (error is not OperationCanceledException) { ddlError = error.Message; }
        return new(owner, name, type, ddl, ddlError, grants.Take(1000).ToArray(), dependencies.Take(1000).ToArray(), impact.Take(1000).ToArray(), grants.Count > 1000 || dependencies.Count > 1000 || impact.Count > 1000);
    }
}

public sealed record OracleObjectGrant(string Grantee, string Privilege, bool Grantable, string Grantor, string? Column);
public sealed record OracleObjectDependency(string Owner, string Name, string Type, string? Link);
public sealed record OracleObjectAnalysis(string Owner, string Name, string Type, string? Ddl, string? DdlError, IReadOnlyList<OracleObjectGrant> Grants, IReadOnlyList<OracleObjectDependency> Dependencies, IReadOnlyList<OracleObjectDependency> Impact, bool Truncated);

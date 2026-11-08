using Oracle.ManagedDataAccess.Client;

namespace FbsDb.Services;

public sealed partial class OracleSessionService
{
    private IReadOnlyDictionary<string,string>? _initialNls;
    private IReadOnlyDictionary<string,string> _configuredNls=new Dictionary<string,string>();

    private static async Task<Dictionary<string,string>> ReadNlsConnectionAsync(OracleConnection connection,OracleTransaction? transaction,CancellationToken token)
    {
        await using var command=connection.CreateCommand();command.CommandTimeout=5;
        if(transaction is not null)command.Transaction=transaction;
        command.CommandText="SELECT parameter,value FROM nls_session_parameters UNION ALL SELECT 'SESSIONTIMEZONE',SESSIONTIMEZONE FROM dual";
        await using var reader=await command.ExecuteReaderAsync(token);var values=new Dictionary<string,string>(StringComparer.Ordinal);
        while(await reader.ReadAsync(token))values[reader.GetString(0)]=reader.IsDBNull(1)?"":reader.GetString(1);
        return values;
    }
    private static async Task<Dictionary<string,string>> ApplyNlsConnectionAsync(OracleConnection connection,IReadOnlyDictionary<string,string> overrides,CancellationToken token)
    {
        var validated=OracleNlsSettings.Validate(overrides);
        foreach(var parameter in OracleNlsSettings.Parameters.Where(validated.ContainsKey))
        {
            await using var command=connection.CreateCommand();command.CommandTimeout=5;command.CommandText=OracleNlsSettings.Statement(parameter,validated[parameter]);
            try{await command.ExecuteNonQueryAsync(token);}catch(OracleException error){throw new InvalidOperationException($"{parameter} was rejected: ORA-{error.Number:D5}. {error.Message}",error);}
        }
        var effective=await ReadNlsConnectionAsync(connection,null,token);
        foreach(var parameter in validated.Keys)if(!effective.TryGetValue(parameter,out var value)||string.IsNullOrEmpty(value))throw new InvalidOperationException($"Cannot verify the effective value of {parameter}.");
        return effective;
    }
    public async Task<OracleNlsReport> ReadNlsAsync(CancellationToken token=default)
    {
        await _gate.WaitAsync(token);
        try
        {
            if(!IsConnected)throw new InvalidOperationException("Connect this SQL tab to read its effective NLS values.");
            var effective=await ReadNlsConnectionAsync(_connection!,_transaction,token);
            return new(ProfileId,_configuredNls,_initialNls,effective,false);
        }
        finally{Touch(); _gate.Release();}
    }
    public async Task<OracleNlsReport> TestNlsAsync(ConnectionProfile profile,IReadOnlyDictionary<string,string> overrides,string user,string password,CancellationToken token=default)
    {
        var validated=OracleNlsSettings.Validate(overrides);
        if(string.IsNullOrEmpty(password)){var saved=await GetSavedCredentialsAsync(profile.Id);if(saved is not null&&(string.IsNullOrWhiteSpace(user)||string.Equals(user,saved.Value.User,StringComparison.OrdinalIgnoreCase)))(user,password)=saved.Value;}
        if(string.IsNullOrWhiteSpace(user)||string.IsNullOrEmpty(password))throw new InvalidOperationException("Provide temporary test credentials or explicitly save credentials for this profile first.");
        await using var lease=await SshTunnelRegistry.Shared.AcquireAsync(profile,token);
        var builder=new OracleConnectionStringBuilder{DataSource=lease.DataSource,UserID=user,Password=password,Pooling=false,ConnectionTimeout=15};
        if(profile.Method=="tns")builder.TnsAdmin=Path.GetDirectoryName(profile.Source);
        await using var connection=new OracleConnection(builder.ConnectionString);await connection.OpenAsync(token);
        var initial=await ReadNlsConnectionAsync(connection,null,token);var effective=await ApplyNlsConnectionAsync(connection,validated,token);
        return new(profile.Id,validated,initial,effective,true);
    }
}
public sealed record OracleNlsReport(string? ProfileId,IReadOnlyDictionary<string,string> Configured,IReadOnlyDictionary<string,string>? Initial,IReadOnlyDictionary<string,string> Effective,bool Temporary);

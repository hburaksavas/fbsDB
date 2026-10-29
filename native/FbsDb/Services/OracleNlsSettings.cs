using System.Text.RegularExpressions;

namespace FbsDb.Services;

public static class OracleNlsSettings
{
    public static readonly string[] Parameters = ["NLS_LANGUAGE","NLS_TERRITORY","NLS_DATE_LANGUAGE","NLS_DATE_FORMAT","NLS_TIMESTAMP_FORMAT","NLS_TIMESTAMP_TZ_FORMAT","NLS_NUMERIC_CHARACTERS","SESSIONTIMEZONE"];
    public static Dictionary<string,string> Validate(IReadOnlyDictionary<string,string> values)
    {
        var result=new Dictionary<string,string>(StringComparer.Ordinal);
        foreach(var (key,value) in values)
        {
            if(!Parameters.Contains(key,StringComparer.Ordinal))throw new InvalidOperationException($"Unsupported NLS parameter: {key}.");
            if(string.IsNullOrEmpty(value)||value.Length>128||value.Any(char.IsControl))throw new InvalidOperationException($"Invalid value for {key}.");
            if(key=="NLS_NUMERIC_CHARACTERS")
            {
                if(value.Length!=2||value[0]==value[1]||value.Any(ch=>ch<' '||ch>'~'||char.IsDigit(ch)||"+-<>".Contains(ch)))throw new InvalidOperationException("NLS_NUMERIC_CHARACTERS requires two distinct single-byte, nonnumeric characters.");
            }
            else if(key=="SESSIONTIMEZONE")
            {
                var offset=Regex.Match(value,@"^([+-])(\d{2}):(\d{2})$");
                if(offset.Success){var hour=int.Parse(offset.Groups[2].Value);var minute=int.Parse(offset.Groups[3].Value);var maximum=offset.Groups[1].Value=="+"?14:12;if(hour>maximum||minute>59||hour==maximum&&minute!=0)throw new InvalidOperationException("Invalid session time-zone offset.");}
                else if(!Regex.IsMatch(value,@"^[A-Za-z][A-Za-z0-9_+.\-]*(?:/[A-Za-z0-9_+.\-]+)*$"))throw new InvalidOperationException("Enter an Oracle time-zone region or ±HH:MM offset.");
            }
            else if(key is "NLS_LANGUAGE" or "NLS_TERRITORY" or "NLS_DATE_LANGUAGE")
            {
                if(!Regex.IsMatch(value,@"^[A-Za-z][A-Za-z _]{0,63}$"))throw new InvalidOperationException($"Invalid Oracle name for {key}.");
            }
            result[key]=key is "NLS_LANGUAGE" or "NLS_TERRITORY" or "NLS_DATE_LANGUAGE"?value.ToUpperInvariant():value;
        }
        return result;
    }
    public static string Statement(string parameter,string value)
    {
        var validated=Validate(new Dictionary<string,string>{{parameter,value}});
        return $"ALTER SESSION SET {(parameter=="SESSIONTIMEZONE"?"TIME_ZONE":parameter)} = '{validated[parameter].Replace("'","''")}'";
    }
}

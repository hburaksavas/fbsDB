using System.Globalization;
using System.Text.RegularExpressions;
using Oracle.ManagedDataAccess.Types;

namespace FbsDb.Services;

public sealed record OracleTemporalCell(string OracleType,string Value,string? Offset=null,string? Region=null,string? SessionTimeZone=null)
{
    public string Kind => "temporal";
    public override string ToString()=>Value+(Offset??"")+(Region is {Length:>0}?"["+Region+"]":SessionTimeZone is {Length:>0}?"[session:"+SessionTimeZone+"]":"");
    private static string Wall(int year,int month,int day,int hour,int minute,int second,int? nanos=null)=>FormattableString.Invariant($"{(year<0?"-":"")}{Math.Abs(year):D4}-{month:D2}-{day:D2}T{hour:D2}:{minute:D2}:{second:D2}")+(nanos.HasValue?"."+nanos.Value.ToString("D9",CultureInfo.InvariantCulture):"");
    public static OracleTemporalCell From(OracleDate value)=>new("DATE",Wall(value.Year,value.Month,value.Day,value.Hour,value.Minute,value.Second));
    public static OracleTemporalCell From(OracleTimeStamp value)=>new("TIMESTAMP",Wall(value.Year,value.Month,value.Day,value.Hour,value.Minute,value.Second,value.Nanosecond));
    public static OracleTemporalCell From(OracleTimeStampTZ value)
    {
        var delta=value.GetTimeZoneOffset();
        var offset=(delta<TimeSpan.Zero?"-":"+")+Math.Abs((int)delta.TotalHours).ToString("D2",CultureInfo.InvariantCulture)+":"+Math.Abs(delta.Minutes).ToString("D2",CultureInfo.InvariantCulture);
        return new("TIMESTAMP WITH TIME ZONE",Wall(value.Year,value.Month,value.Day,value.Hour,value.Minute,value.Second,value.Nanosecond),offset,Regex.IsMatch(value.TimeZone,@"^[+-]\d{2}:\d{2}$")?null:value.TimeZone);
    }
    public static OracleTemporalCell From(OracleTimeStampLTZ value,string? sessionTimeZone)=>new("TIMESTAMP WITH LOCAL TIME ZONE",Wall(value.Year,value.Month,value.Day,value.Hour,value.Minute,value.Second,value.Nanosecond),SessionTimeZone:sessionTimeZone);
    public string SqlLiteral()
    {
        if(!Regex.IsMatch(Value,@"^-?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?$"))throw new InvalidOperationException("Invalid invariant Oracle datetime.");
        if(OracleType.Contains("LOCAL TIME ZONE",StringComparison.Ordinal)&&Offset is null)throw new InvalidOperationException("Oracle LOCAL TIME ZONE values expose session wall time without an unambiguous offset. Include CAST(column AS TIMESTAMP WITH TIME ZONE) in the SELECT before generating precise key or DML SQL.");
        if(Offset is not null&&!Regex.IsMatch(Offset,@"^[+-]\d{2}:\d{2}$"))throw new InvalidOperationException("Invalid Oracle datetime offset.");
        var literal="TIMESTAMP '"+Value.Replace('T',' ')+(Offset is null?"":" "+Offset)+"'";
        if(OracleType=="DATE")return "CAST("+literal+" AS DATE)";
        return Region is {Length:>0}?"("+literal+" AT TIME ZONE '"+Region.Replace("'","''")+"')":literal;
    }
    public static OracleTemporalCell Parse(string value,string type)
    {
        var match=Regex.Match(value,@"^(?<wall>-?\d{4}-\d{2}-\d{2})(?:[T ](?<time>\d{2}:\d{2}:\d{2})(?<fraction>\.\d{1,9})?)?(?<offset>Z|[+-]\d{2}:\d{2})?(?:\[(?<region>[^\]\r\n]+)\])?$");
        if(!match.Success)throw new InvalidOperationException("Enter an invariant ISO Oracle datetime.");
        var region=match.Groups["region"].Success?match.Groups["region"].Value:null;
        var wall=match.Groups["wall"].Value+"T"+(match.Groups["time"].Success?match.Groups["time"].Value:"00:00:00")+match.Groups["fraction"].Value;
        var offset=match.Groups["offset"].Success?match.Groups["offset"].Value:null;
        return new(type.ToUpperInvariant(),wall,offset=="Z"?"+00:00":offset,region?.StartsWith("session:")==true?null:region,region?.StartsWith("session:")==true?region[8..]:null);
    }
    public static OracleTimeStamp TimestampBind(string value)
    {
        var parsed=Parse(value,"TIMESTAMP");
        if(parsed.Offset is not null||parsed.Region is not null||parsed.SessionTimeZone is not null)throw new InvalidOperationException("DATE and TIMESTAMP binds require wall time without a time-zone suffix.");
        var parts=Regex.Match(parsed.Value,@"^(?<year>-?\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d{1,9}))?$");
        int Number(string name)=>int.Parse(parts.Groups[name].Value,CultureInfo.InvariantCulture);
        return new OracleTimeStamp(Number("year"),Number("month"),Number("day"),Number("hour"),Number("minute"),Number("second"),int.Parse(parts.Groups["fraction"].Value.PadRight(9,'0'),CultureInfo.InvariantCulture));
    }
    // The offset fixes the instant, which is what Oracle compares, so a stored value read with a region also finds its row by its offset.
    public static OracleTimeStampTZ ZonedBind(string value)
    {
        var parsed=Parse(value,"TIMESTAMP WITH TIME ZONE");
        if(parsed.Offset is null)throw new InvalidOperationException("A TIME ZONE value needs its offset, such as 2026-11-02 10:30:00+03:00; without one Oracle would apply the session's time zone.");
        var wall=TimestampBind(parsed.Value);
        return new OracleTimeStampTZ(wall.Year,wall.Month,wall.Day,wall.Hour,wall.Minute,wall.Second,wall.Nanosecond,parsed.Offset);
    }
    public static OracleDate DateBind(string value)
    {
        var timestamp=TimestampBind(value);
        if(timestamp.Nanosecond!=0)throw new InvalidOperationException("Oracle DATE stores whole seconds; use a TIMESTAMP bind for fractional seconds.");
        return timestamp.ToOracleDate();
    }
}

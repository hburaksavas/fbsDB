using System.Text.RegularExpressions;

namespace FbsDb.Services;

public sealed record OracleCompilationTarget(string? Owner, string Name, string Type);

public static class OracleSqlUnit
{
    private const string Identifier = "(?:\"(?:[^\"]|\"\")+\"|[A-Za-z_$#][A-Za-z0-9_$#]*)";
    private static string Head(string sql) => Regex.Replace(sql, "\"(?:[^\"]|\"\")*\"|'(?:[^']|'')*'|--[^\\r\\n]*|/\\*[\\s\\S]*?\\*/", match => match.Value.StartsWith('"') || match.Value.StartsWith('\'') ? match.Value : " ").TrimStart();
    private static string Unquote(string value) => value.StartsWith('"') ? value[1..^1].Replace("\"\"", "\"") : value.ToUpperInvariant();

    public static string Normalize(string sql)
    {
        var statement = Regex.Replace(sql.Trim(), @"(?:\r?\n)[ \t]*/[ \t]*$", "").TrimEnd();
        var head = Head(statement);
        var block = Regex.IsMatch(head, @"^(?:<<\s*" + Identifier + @"\s*>>\s*)?(?:DECLARE|BEGIN)\b|^CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:NON)?EDITIONABLE\s+)?(?:PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE\s+BODY)\b", RegexOptions.IgnoreCase);
        return block ? statement : Regex.Replace(statement, @";(?=(?:\s|--[^\r\n]*(?:\r?\n|$)|/\*[\s\S]*?\*/)*\z)", " ").TrimEnd();
    }

    public static bool RequiresManualTransaction(string sql) => Regex.IsMatch(Head(sql), @"^(?:<<\s*" + Identifier + @"\s*>>\s*)?(?:INSERT|UPDATE|DELETE|MERGE|DECLARE|BEGIN|CALL)\b", RegexOptions.IgnoreCase);

    public static OracleCompilationTarget? CompilationTarget(string sql)
    {
        var head = Head(sql);
        var match = Regex.Match(head, @"^CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:NON)?EDITIONABLE\s+)?(?<type>PACKAGE(?:\s+BODY)?|PROCEDURE|FUNCTION|TRIGGER|TYPE(?:\s+BODY)?)\s+(?:(?<owner>" + Identifier + @")\s*\.\s*)?(?<name>" + Identifier + @")(?=\s|\(|$)", RegexOptions.IgnoreCase);
        if (!match.Success)
        {
            match = Regex.Match(head, @"^ALTER\s+(?<type>PACKAGE|PROCEDURE|FUNCTION|TRIGGER|TYPE)\s+(?:(?<owner>" + Identifier + @")\s*\.\s*)?(?<name>" + Identifier + @")\s+COMPILE\b(?<suffix>[\s\S]*)$", RegexOptions.IgnoreCase);
            if (!match.Success) return null;
        }
        var type = Regex.Replace(match.Groups["type"].Value.ToUpperInvariant(), @"\s+", " ");
        if (type is "PACKAGE" or "TYPE" && Regex.IsMatch(match.Groups["suffix"].Value, @"\bBODY\b", RegexOptions.IgnoreCase)) type += " BODY";
        return new OracleCompilationTarget(match.Groups["owner"].Success ? Unquote(match.Groups["owner"].Value) : null, Unquote(match.Groups["name"].Value), type);
    }
}

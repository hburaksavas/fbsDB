namespace FbsDb.Services;

// Accepts exactly one SELECT (or WITH ... SELECT). Conservative classification: SELECT functions can still have side effects.
public static class SelectOnlyGuard
{
    public static void AssertSelect(string sql)
    {
        // Strip literals/comments before classification, including Oracle q quoting.
        var words = new List<string>();
        var depth = 0; var topSelect = false; var ended = false;
        for (var i = 0; i < sql.Length;)
        {
            if (char.IsWhiteSpace(sql[i])) { i++; continue; }
            if (sql.AsSpan(i).StartsWith("--")) { var end = sql.IndexOf('\n', i); i = end < 0 ? sql.Length : end + 1; continue; }
            if (sql.AsSpan(i).StartsWith("/*")) { var end = sql.IndexOf("*/", i + 2, StringComparison.Ordinal); if (end < 0) throw InvalidSelect(); i = end + 2; continue; }
            if (ended) throw InvalidSelect();
            var qLength = (sql[i] is 'q' or 'Q') && i + 1 < sql.Length && sql[i + 1] == '\'' ? 2
                : (sql[i] is 'n' or 'N') && i + 2 < sql.Length && (sql[i + 1] is 'q' or 'Q') && sql[i + 2] == '\'' ? 3 : 0;
            if (qLength != 0)
            {
                var at = i + qLength; if (at >= sql.Length) throw InvalidSelect();
                var close = sql[at] switch { '[' => ']', '{' => '}', '(' => ')', '<' => '>', var c => c };
                var end = sql.IndexOf(close + "'", at + 1, StringComparison.Ordinal); if (end < 0) throw InvalidSelect(); i = end + 2; continue;
            }
            if (sql[i] is '\'' or '"')
            {
                var quote = sql[i++]; var closed = false;
                while (i < sql.Length) { if (sql[i++] != quote) continue; if (i < sql.Length && sql[i] == quote) { i++; continue; } closed = true; break; }
                if (!closed) throw InvalidSelect(); continue;
            }
            if (char.IsLetter(sql[i]) || sql[i] is '_' or '$' or '#')
            {
                var start = i++;
                while (i < sql.Length && (char.IsLetterOrDigit(sql[i]) || sql[i] is '_' or '$' or '#')) i++;
                var word = sql[start..i].ToUpperInvariant(); words.Add(word);
                if (depth == 0 && word == "SELECT") topSelect = true;
                if (word is "INSERT" or "UPDATE" or "DELETE" or "MERGE" or "BEGIN" or "DECLARE" or "FUNCTION" or "PROCEDURE" or "INTO") throw InvalidSelect();
                continue;
            }
            if (sql[i] == ';') ended = true;
            if (sql[i] == '(') depth++;
            if (sql[i] == ')' && --depth < 0) throw InvalidSelect();
            i++;
        }
        if (words.Count == 0 || words[0] is not ("SELECT" or "WITH") || !topSelect || depth != 0) throw InvalidSelect();
    }

    private static InvalidOperationException InvalidSelect() => new("Only one SELECT query can be run here. SELECT functions can still have side effects.");
}

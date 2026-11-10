namespace FbsDb.Services;

// A result whose table has no usable primary key is edited by ROWID. The executed query is read again as an inline view with each
// row's ROWID in front; Oracle only answers when every row of the query is exactly one row of one table (no DISTINCT, GROUP BY, set
// operation or non-key-preserved join), which is the same condition under which editing the row is meaningful.
public static class GridRowIds
{
    public const string Column = "FBSDB_ROWID";
    public const int MaxRows = 200000;

    // The line breaks keep a trailing line comment of the query from swallowing the closing parenthesis.
    public static string Wrap(string sql) => $"SELECT ROWIDTOCHAR(fbsdb_q.ROWID) AS \"{Column}\", fbsdb_q.* FROM (\n{sql.TrimEnd().TrimEnd(';').TrimEnd()}\n) fbsdb_q";
}

namespace FbsDb.Services;

public sealed record SqlColumn(string Name, string Type)
{
    public string? TemporalKind {get;init;}
    public string? SessionTimeZone {get;init;}
    public int? Size { get; init; }
    public int? Precision { get; init; }
    public int? Scale { get; init; }
    public bool? Nullable { get; init; }
    public string? SourceSchema { get; init; }
    public string? SourceTable { get; init; }
    public string? SourceColumn { get; init; }
}
public sealed record SqlExecutionResult(IReadOnlyList<SqlColumn> Columns, IReadOnlyList<object?[]> Rows, int? RowsAffected, long ElapsedMs, int ReturnedRows, bool Truncated, bool TransactionPending, IReadOnlyList<string> Output)
{
    public string? SqlId { get; init; }
    public string? ResultId { get; init; }
    public bool HasMore { get; init; }
    public int PageSize { get; init; } = 1000;
    public int Offset { get; init; }
    public IReadOnlyList<SqlOutputParameter> OutParameters { get; init; } = [];
}
public sealed record SchemaColumn(string Name, string Type, bool Nullable, bool Indexed)
{
    public int? Length { get; init; }
    public int? CharacterLength { get; init; }
    public string? LengthUnit { get; init; }
    public int? Precision { get; init; }
    public int? Scale { get; init; }
    public string? DefaultValue { get; init; }
    public string? Comment { get; init; }
}
public sealed record SchemaProperty(string Name, string Value);
public sealed record SchemaObject(string Name, string Type, IReadOnlyList<SchemaColumn> Columns)
{
    public string Owner { get; init; } = string.Empty;
    public string Key => $"{Owner}.{Type}.{Name}";
    public string? TargetOwner { get; init; }
    public string? TargetName { get; init; }
    public string? DbLink { get; init; }
    public IReadOnlyList<SchemaProperty> Details { get; init; } = [];
}
public sealed record SchemaSnapshot(string Owner, IReadOnlyList<SchemaObject> Objects);
public sealed record SqlBindParameter(string Name, string Type, string? Value, string Direction = "IN");
public sealed record SqlOutputParameter(string Name, string Type, [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.Never)] object? Value);

public sealed record LookupColumn(string Name,string Type);
public sealed record PrimaryKeyInfo(string Schema,string Table,IReadOnlyList<LookupColumn> Columns);
public sealed record RelatedRecordLink(string Label,string Sql);

public sealed record ForeignKeyRelation(string Owner,string Table,string Constraint,string DeleteRule,IReadOnlyList<ForeignKeyPair> Pairs);
public sealed record ForeignKeyPair(string Child,string Parent);
public sealed record TableRelations(IReadOnlyList<ForeignKeyRelation> Children,IReadOnlyList<ForeignKeyRelation> Parents);
public sealed record ConstraintInfo(string Owner,string Name,string Type,string? Condition,string? ReferencedConstraint,IReadOnlyList<string> Columns);
public sealed record ColumnConstraint(string Name,string Type,string? Condition,string Status);
public sealed record ColumnDefinition(string Schema,string Table,string Name,string Type,int? Size,int? Precision,int? Scale,bool Nullable,string? DefaultValue,IReadOnlyList<ColumnConstraint> Constraints);

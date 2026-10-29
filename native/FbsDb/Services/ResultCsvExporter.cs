namespace FbsDb.Services;
public sealed record CsvExportOptions(string Delimiter=",",string Newline="crlf",string Quote="always",string NullValue="",bool Headers=true);
public static class ResultCsvExporter
{
    public static string Escape(object? value)=>EscapeField(value,new CsvExportOptions());
    public static string EscapeField(object? value,CsvExportOptions options) {
        var binary=value?.GetType().GetProperty("base64")?.GetValue(value);
        var text=value is null?options.NullValue:Convert.ToString(binary??value,System.Globalization.CultureInfo.InvariantCulture)??"";
        var delimiter=options.Delimiter=="tab"?"\t":options.Delimiter;
        return options.Quote=="always"||text.Contains(delimiter)||text.IndexOfAny(['"','\r','\n'])>=0?"\""+text.Replace("\"","\"\"")+"\"":text;
    }
    public static async Task<int> WriteAsync(TextWriter writer,IEnumerable<string> columns,IEnumerable<object?[]> initialRows,
        Func<CancellationToken,Task<SqlExecutionResult>>? fetchNext=null,Func<int,Task>? progress=null,CancellationToken token=default,CsvExportOptions? options=null)
    {
        options??=new();var delimiter=options.Delimiter=="tab"?"\t":options.Delimiter;
        if(delimiter is not ("," or ";" or "\t" or "|"))throw new InvalidOperationException("Invalid CSV delimiter.");
        writer.NewLine=options.Newline=="lf"?"\n":"\r\n";
        if(options.Headers)await writer.WriteLineAsync(string.Join(delimiter,columns.Select(column=>EscapeField(column,options))));
        var count=0;
        async Task WriteRows(IEnumerable<object?[]> rows){foreach(var row in rows){token.ThrowIfCancellationRequested();await writer.WriteLineAsync(string.Join(delimiter,row.Select(value=>EscapeField(value,options))));count++;}}
        await WriteRows(initialRows);if(progress is not null)await progress(count);
        if(fetchNext is not null){bool more;do{token.ThrowIfCancellationRequested();var page=await fetchNext(token);await WriteRows(page.Rows);await writer.FlushAsync(token);more=page.HasMore;if(progress is not null)await progress(count);}while(more);}
        return count;
    }
}

using FbsDb.Services;
var profileId = args.FirstOrDefault() ?? "FBSDB_LOCAL";
var profile = (await new TnsProfileService().GetProfilesAsync()).Single(p => p.Id == profileId);
using var session = new OracleSessionService();
await session.ConnectAsync(profile, "", "", null);
void Check(bool pass, string description) { if (!pass) throw new Exception(description); Console.WriteLine("PASS " + description); }
var first = await session.ExecuteAsync("SELECT LEVEL AS N FROM DUAL CONNECT BY LEVEL <= :count", [new SqlBindParameter("count", "NUMBER", "1205")], 500);
Check(first.Rows.Count == 500 && first.HasMore && first.Offset == 0 && !first.Truncated, "500 is first page size, not a result cap");
var second = await session.FetchNextPageAsync(first.ResultId!, 500);
var third = await session.FetchNextPageAsync(first.ResultId!, 500);
Check(second.Rows.Count == 500 && second.Offset == 500 && second.HasMore, "second page returns next 500");
Check(third.Rows.Count == 205 && third.Offset == 1000 && !third.HasMore, "last page returns remaining 205");
var all = first.Rows.Concat(second.Rows).Concat(third.Rows).Select(r => Convert.ToInt32(r[0])).ToArray();
Check(all.SequenceEqual(Enumerable.Range(1,1205)), "no skipped or duplicated rows at page boundaries");
var exact = await session.ExecuteAsync("SELECT LEVEL AS N FROM DUAL CONNECT BY LEVEL <= 1000", rowLimit:500);
var end = await session.FetchNextPageAsync(exact.ResultId!,500);
Check(end.Rows.Count == 500 && !end.HasMore, "exact multiple does not create an empty extra page");
var old = await session.ExecuteAsync("SELECT LEVEL AS N FROM DUAL CONNECT BY LEVEL <= 900", rowLimit:100);
await session.ExecuteAsync("SELECT 1 FROM DUAL", rowLimit:500);
var resumed = await session.FetchNextPageAsync(old.ResultId!,100);
Check(resumed.Offset == 100 && Convert.ToInt32(resumed.Rows[0][0]) == 101, "another tab query preserves the original cursor");
await session.CloseResultAsync(old.ResultId!);
try { await session.FetchNextPageAsync(old.ResultId!,100); throw new Exception("closed cursor accepted"); } catch(InvalidOperationException) { Console.WriteLine("PASS closed tab releases its cursor"); }
var changing = await session.ExecuteAsync("SELECT LEVEL AS N FROM DUAL CONNECT BY LEVEL <= 1005", rowLimit:100);
var larger = await session.FetchNextPageAsync(changing.ResultId!,500);
Check(larger.Rows.Count==500 && larger.Offset==100 && Convert.ToInt32(larger.Rows[0][0])==101, "changing page size preserves next unread row");
var empty = await session.ExecuteAsync("SELECT 1 FROM DUAL WHERE 1=0",rowLimit:500);
Check(empty.Rows.Count==0 && !empty.HasMore,"empty results have no next page");
var metadata = await session.ExecuteAsync("SELECT CAST(1.25 AS NUMBER(10,2)) AS AMOUNT, CAST('A' AS VARCHAR2(40)) AS LABEL FROM DUAL",rowLimit:100);
Check(metadata.Columns[0].Precision==10 && metadata.Columns[0].Scale==2 && metadata.Columns[1].Size>=40,"result metadata includes precision, scale and string length");
if(profileId=="FBSDB_LOCAL") {
 var source = await session.ExecuteAsync("SELECT EMPLOYEE_ID, DEPARTMENT_ID FROM FBSDB_TEST.EMPLOYEES WHERE ROWNUM <= 1",rowLimit:100);
 Console.WriteLine("INFO Oracle base-column metadata available: " + source.Columns.Any(c=>!string.IsNullOrEmpty(c.SourceTable)));
 var related = await session.RelatedRecordsSqlAsync("FBSDB_TEST","EMPLOYEES","DEPARTMENT_ID",10);
 Check(related is not null && related.Contains("WHERE") && related.Contains("10"),"foreign-key navigation generates related SELECT without executing it");
}

var streaming = await session.ExecuteAsync("SELECT LEVEL AS N FROM DUAL CONNECT BY LEVEL <= 2205", rowLimit:100);
using var csv = new StringWriter(); var progressCounts = new List<int>();
var written = await ResultCsvExporter.WriteAsync(csv, streaming.Columns.Select(c=>c.Name), streaming.Rows,
 token => session.FetchNextPageAsync(streaming.ResultId!,500,token), count => {progressCounts.Add(count);return Task.CompletedTask;});
Check(written==2205 && progressCounts.First()==100 && progressCounts.Last()==2205 && csv.ToString().Split('\n',StringSplitOptions.RemoveEmptyEntries).Length==2206,"CSV streaming writes all pages and reports progress without accumulating rows");
Check(ResultCsvExporter.Escape("a,\"b\"\n")=="\"a,\"\"b\"\"\n\"","CSV streaming quotes embedded delimiters and newlines");
using var cancelledExport = new CancellationTokenSource(); cancelledExport.Cancel();
try { await ResultCsvExporter.WriteAsync(new StringWriter(),["N"],[new object?[]{1}],token:cancelledExport.Token);throw new Exception("cancel ignored"); }
catch(OperationCanceledException) {Console.WriteLine("PASS CSV export honours cancellation");}
var pk = await session.GetPrimaryKeyAsync("fbsdb_test","employees");
Check(pk.Columns.Any(c=>c.Name=="EMPLOYEE_ID"),"primary key metadata supports normalized schema/table identifiers");
var lookup = OracleSessionService.BuildPrimaryKeySql(pk.Schema,pk.Table,pk.Columns,pk.Columns.ToDictionary(c=>c.Name,c=>"1"));
Check(lookup.Contains("\"EMPLOYEE_ID\" = 1"),"primary-key lookup generates a typed SELECT without execution");
var children = await session.ChildRecordsSqlAsync("FBSDB_TEST","DEPARTMENTS",new Dictionary<string,object?>{{"DEPARTMENT_ID",10}});
Check(children.Any(link=>link.Sql.Contains("EMPLOYEES")&&link.Sql.Contains("10")),"reverse foreign-key navigation builds child queries");
var binary = await session.ExecuteAsync("SELECT HEXTORAW('414200FF') AS BYTES FROM DUAL",rowLimit:100);
var binaryJson=System.Text.Json.JsonSerializer.Serialize(binary.Rows[0][0]);
Check(binaryJson.Contains("binary")&&binaryJson.Contains("QUIA/w=="),"RAW/BLOB bytes retain a binary type and full base64 payload");
using var workbook=new MemoryStream();
ResultXlsxExporter.Write(workbook,[new SqlColumn("ID","NUMBER"),new SqlColumn("WHEN","DATE"),new SqlColumn("TEXT","VARCHAR2")],[new object?[]{12,"2026-01-02T03:04:05","a<&\""}]);
workbook.Position=0;
using(var zip=new System.IO.Compression.ZipArchive(workbook,System.IO.Compression.ZipArchiveMode.Read,true)) {
 Check(zip.GetEntry("[Content_Types].xml") is not null&&zip.GetEntry("xl/styles.xml") is not null,"XLSX is a valid OPC workbook package");
 using var sheet=zip.GetEntry("xl/worksheets/sheet1.xml")!.Open();var xml=System.Xml.Linq.XDocument.Load(sheet);System.Xml.Linq.XNamespace ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main";
 var cells=xml.Descendants(ns+"c").ToArray();
 Check(cells.Any(c=>(string?)c.Attribute("r")=="A2"&&c.Element(ns+"v")?.Value=="12")&&cells.Any(c=>(string?)c.Attribute("r")=="B2"&&(string?)c.Attribute("s")=="1"),"XLSX preserves numeric cells and date styles");
 Check(cells.Any(c=>c.Value=="a<&\""),"XLSX text escapes XML characters without altering values");
}
using var compressed=new MemoryStream();
using(var gzip=new System.IO.Compression.GZipStream(compressed,System.IO.Compression.CompressionLevel.Optimal,true))
using(var writer=new StreamWriter(gzip))await ResultCsvExporter.WriteAsync(writer,["N"],[new object?[]{1},new object?[]{2}]);
compressed.Position=0;using(var unzip=new System.IO.Compression.GZipStream(compressed,System.IO.Compression.CompressionMode.Decompress))using(var reader=new StreamReader(unzip))Check((await reader.ReadToEndAsync()).Contains("\"2\""),"gzip CSV stream contains the complete quoted data");
var filterFixturePath=Path.Combine(Directory.GetCurrentDirectory(),"artifacts","server-filter-smoke.json");
if(File.Exists(filterFixturePath)) {
 using var filterFixture=System.Text.Json.JsonDocument.Parse(await File.ReadAllTextAsync(filterFixturePath));
 var root=filterFixture.RootElement;
 var parameters=root.GetProperty("parameters").EnumerateArray().Select(p=>new SqlBindParameter(p.GetProperty("name").GetString()!,p.GetProperty("type").GetString()!,p.GetProperty("value").GetString())).ToArray();
 var filtered=await session.ExecuteAsync(root.GetProperty("sql").GetString()!,parameters,100);
 Check(filtered.Rows.Count==9,"JavaScript-generated nested server filter executes with bound parameters in Oracle");
}
Check(ResultCsvExporter.Escape(new {kind="binary",base64="QUIA/w==",byteLength=4})=="\"QUIA/w==\"","streaming CSV writes binary values as base64");
Check(OracleSessionService.BuildPrimaryKeySql("QA","T",[new LookupColumn("ID","RAW")],new Dictionary<string,string>{{"ID","ABCD"}}).Contains("HEXTORAW('ABCD')"),"RAW primary-key lookup validates and emits hexadecimal values");
try{OracleSessionService.BuildPrimaryKeySql("QA","T",[new LookupColumn("ID","NUMBER")],new Dictionary<string,string>{{"ID","1 OR 1=1"}});throw new Exception("invalid key accepted");}catch(InvalidOperationException){Console.WriteLine("PASS numeric lookup rejects SQL fragments");}
var exactSample = await session.ExecuteAsync("SELECT TO_NUMBER('12345678901234567890123456789012345678') AS BIG_NUMBER, CAST(0.1 AS NUMBER) AS SMALL_NUMBER FROM DUAL",rowLimit:100);
Check(exactSample.Rows[0][0] is string exactText&&exactText=="12345678901234567890123456789012345678","38-digit Oracle NUMBER travels as exact invariant text");
var definition = await session.GetColumnDefinitionAsync("FBSDB_TEST","EMPLOYEES","SALARY");
Check(definition is not null&&definition.Precision==10&&definition.Scale==2,"source-column definition includes precision, scale and constraint metadata");
var updateSource = await session.ExecuteAsync("SELECT EMPLOYEE_ID,FIRST_NAME,SALARY FROM FBSDB_TEST.EMPLOYEES WHERE ROWNUM<=1",rowLimit:100);
var updateDraft = await session.UpdateDraftAsync("FBSDB_TEST","EMPLOYEES",updateSource.Columns,updateSource.Rows);
Check(updateDraft.Contains("UPDATE \"FBSDB_TEST\".\"EMPLOYEES\"")&&updateDraft.Contains("WHERE \"EMPLOYEE_ID\" ="),"UPDATE draft is generated with a primary-key predicate without executing DML");
using var preferenceCsv = new StringWriter();await ResultCsvExporter.WriteAsync(preferenceCsv,["ID","LABEL"],[new object?[]{null,"a;b"}],options:new CsvExportOptions(";","lf","needed","NULL"));
Check(preferenceCsv.ToString()=="ID;LABEL\nNULL;\"a;b\"\n","native CSV export applies delimiter, line endings, quoting and NULL marker");
using var metadataWorkbook = new MemoryStream();ResultXlsxExporter.Write(metadataWorkbook,[new SqlColumn("N","NUMBER"){Precision=38,Scale=0,SourceTable="T"}],[new object?[]{"12345678901234567890123456789012345678"}],includeMetadata:true);metadataWorkbook.Position=0;
using(var metadataZip=new System.IO.Compression.ZipArchive(metadataWorkbook,System.IO.Compression.ZipArchiveMode.Read,true)){
 Check(metadataZip.GetEntry("xl/worksheets/sheet2.xml") is not null,"XLSX metadata is written as a second worksheet");
 using var metadataStream=metadataZip.GetEntry("xl/worksheets/sheet2.xml")!.Open();var metadataXml=System.Xml.Linq.XDocument.Load(metadataStream);Check(metadataXml.ToString().Contains("Precision")&&metadataXml.ToString().Contains("38"),"metadata worksheet contains source-column precision");
 using var dataStream=metadataZip.GetEntry("xl/worksheets/sheet1.xml")!.Open();var dataXml=System.Xml.Linq.XDocument.Load(dataStream);Check(dataXml.ToString().Contains("12345678901234567890123456789012345678"),"XLSX keeps exact 38-digit values without float conversion");
}
var exactBind=await session.ExecuteAsync("SELECT :big AS BIG, :small AS SMALL FROM DUAL",[new SqlBindParameter("big","NUMBER","12345678901234567890123456789012345678"),new SqlBindParameter("small","NUMBER","0.1")],100);
Check(Convert.ToString(exactBind.Rows[0][0])=="12345678901234567890123456789012345678"&&Convert.ToString(exactBind.Rows[0][1])=="0.1","NUMBER bind parameters preserve full Oracle precision and decimal points");

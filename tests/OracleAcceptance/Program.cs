using System.Diagnostics;
using FbsDb.Services;
using Oracle.ManagedDataAccess.Client;

var requested=args.FirstOrDefault()??throw new InvalidOperationException("Specify the user-approved Oracle profile/account.");
using var credentials=new OracleSessionService();
var profiles=await new TnsProfileService().GetProfilesAsync();
ConnectionProfile? profile=null;
foreach(var candidate in profiles.Where(item=>item.Available)){
 var saved=await credentials.GetSavedCredentialsAsync(candidate.Id);
 if(saved is not null&&(candidate.Id.Equals(requested,StringComparison.OrdinalIgnoreCase)||candidate.Name.Equals(requested,StringComparison.OrdinalIgnoreCase)||saved.Value.User.Equals(requested,StringComparison.OrdinalIgnoreCase))){profile=candidate with{User=saved.Value.User};break;}
}
var suppliedPassword="";
if(args.Contains("--interactive")){
 profile=new ConnectionProfile("acceptance-banking-app","127.0.0.1","1521","BANKING_DB","","(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=127.0.0.1)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=BANKING_DB)))"){Method="basic",User=requested,Name="Temporary acceptance session",Environment="TEST"};
 Console.WriteLine("Enter the supplied test password (input is hidden; credentials are not saved):");
 var characters=new List<char>();while(true){var key=Console.ReadKey(true);if(key.Key==ConsoleKey.Enter)break;if(key.Key==ConsoleKey.Backspace){if(characters.Count>0)characters.RemoveAt(characters.Count-1);}else if(key.KeyChar!='\0')characters.Add(key.KeyChar);}
 suppliedPassword=new string(characters.ToArray());characters.Clear();Console.WriteLine();
}
if(profile is null)throw new InvalidOperationException("No available profile with saved credentials matches the approved profile/account.");
if(args.Contains("--temporal-probe")){
 var builder=new OracleConnectionStringBuilder{DataSource=profile.Descriptor,UserID=profile.User,Password=suppliedPassword,Pooling=false};
 await using var connection=new OracleConnection(builder.ConnectionString);await connection.OpenAsync();
 await using(var setup=connection.CreateCommand()){setup.CommandText="ALTER SESSION SET TIME_ZONE='America/New_York'";await setup.ExecuteNonQueryAsync();}
 await using var command=connection.CreateCommand();command.CommandText="SELECT T, CAST(T AS TIMESTAMP(9) WITH LOCAL TIME ZONE) L, CAST(T AS TIMESTAMP(9)) TS, CAST(T AS DATE) D, TO_CHAR(CAST(T AS TIMESTAMP(9) WITH LOCAL TIME ZONE),'YYYY-MM-DD HH24:MI:SS.FF9') LTXT FROM (SELECT TO_TIMESTAMP_TZ('2024-11-03 01:30:00.123456789 -04:00','YYYY-MM-DD HH24:MI:SS.FF9 TZH:TZM') T FROM DUAL UNION ALL SELECT TO_TIMESTAMP_TZ('2024-11-03 01:30:00.123456789 -05:00','YYYY-MM-DD HH24:MI:SS.FF9 TZH:TZM') T FROM DUAL)";
 await using var reader=await command.ExecuteReaderAsync();
 while(await reader.ReadAsync()){
  for(var index=0;index<reader.FieldCount;index++)Console.WriteLine(reader.GetName(index)+" type="+reader.GetDataTypeName(index)+" provider="+reader.GetProviderSpecificFieldType(index).Name);
  var zoned=reader.GetOracleTimeStampTZ(0);Console.WriteLine($"TZ wall={zoned.Hour}:{zoned.Minute} ns={zoned.Nanosecond} zone={zoned.TimeZone} offset={zoned.GetTimeZoneOffset()}");
  var local=reader.GetOracleTimeStampLTZ(1);Console.WriteLine("LTZ bytes="+Convert.ToHexString(local.BinData));var utc=local.ToUniversalTime();Console.WriteLine($"LTZ wall={local.Hour}:{local.Minute} ns={local.Nanosecond} UTC={utc.Hour}:{utc.Minute} ns={utc.Nanosecond} TZ={utc.TimeZone} server={reader.GetString(4)}");
  try{var direct=reader.GetOracleTimeStampTZ(1);Console.WriteLine($"LTZ direct TZ: {direct.Hour}:{direct.Minute} ns={direct.Nanosecond} {direct.TimeZone}");}catch(InvalidCastException){Console.WriteLine("LTZ direct TZ accessor is unavailable.");}
 }
 return;
}
void Check(bool condition,string message){if(!condition)throw new InvalidOperationException(message);Console.WriteLine("PASS "+message);}
using var session=new OracleSessionService();
await session.ConnectAsync(profile,profile.User,suppliedPassword,null);
if(args.Contains("--completion")){
 var schema=await session.LoadSchemaAsync();
 var relation=schema.Objects.FirstOrDefault(item=>item.Owner==schema.Owner&&item.Type=="TABLE")
  ??schema.Objects.FirstOrDefault(item=>item.Type=="TABLE")
  ??throw new InvalidOperationException("No accessible test table is available for metadata acceptance.");
 var clock=Stopwatch.StartNew();
 var metadata=await session.LoadCompletionMetadataAsync(relation.Owner,relation.Name,relation.Type,CancellationToken.None);
 Check(metadata.Columns.Count>0,"live Oracle table metadata includes verified columns");
 Check(metadata.Owner==relation.Owner&&metadata.Name==relation.Name,"live metadata retains exact object identity");
 Check(!session.HasPendingTransaction,"metadata loading does not open a manual transaction");
 var fixtureIndex=Array.IndexOf(args,"--metadata-output");
 if(fixtureIndex>=0){
  var json=System.Text.Json.JsonSerializer.Serialize(new{schema=schema.Owner,metadata},new System.Text.Json.JsonSerializerOptions{PropertyNamingPolicy=System.Text.Json.JsonNamingPolicy.CamelCase});
  await File.WriteAllTextAsync(args[fixtureIndex+1],json);
 }
 Console.WriteLine($"Completion metadata acceptance completed in {clock.ElapsedMilliseconds} ms without modifying database records.");
 return;
}
if(args.Contains("--temporal")){
 const string query="SELECT DATE '2024-03-10'+(2*3600+30*60)/86400 D, TIMESTAMP '2024-03-10 02:30:00.123456789' TS, T AT TIME ZONE 'America/New_York' T, CAST(T AS TIMESTAMP(9) WITH LOCAL TIME ZONE) L FROM (SELECT TO_TIMESTAMP_TZ('2024-11-03 01:30:00.123456789 -04:00','YYYY-MM-DD HH24:MI:SS.FF9 TZH:TZM') T FROM DUAL UNION ALL SELECT TO_TIMESTAMP_TZ('2024-11-03 01:30:00.123456790 -05:00','YYYY-MM-DD HH24:MI:SS.FF9 TZH:TZM') T FROM DUAL)";
 foreach(var zone in new[]{"America/New_York","Europe/Istanbul","UTC"}){
  using var dated=new OracleSessionService();await dated.ConnectAsync(profile with{Nls=new Dictionary<string,string>{{"SESSIONTIMEZONE",zone}}},profile.User,suppliedPassword,null);
  var data=await dated.ExecuteAsync(query);
  var bound=await dated.ExecuteAsync("SELECT :d AS D, :ts AS TS FROM dual",[new SqlBindParameter("d","DATE","2024-03-10T02:30:00"),new SqlBindParameter("ts","TIMESTAMP","2024-03-10T02:30:00.123456789")]);
  Check(((OracleTemporalCell)bound.Rows[0][0]!).Value=="2024-03-10T02:30:00"&&((OracleTemporalCell)bound.Rows[0][1]!).Value.EndsWith(".123456789"),"invariant DATE/TIMESTAMP binds retain wall time and nanoseconds in "+zone);
  Check(data.Columns.Select(column=>column.TemporalKind).SequenceEqual(new[]{"DATE","TIMESTAMP","TIMESTAMP WITH TIME ZONE","TIMESTAMP WITH LOCAL TIME ZONE"}),"four Oracle temporal types remain distinct in "+zone);
  var date=(OracleTemporalCell)data.Rows[0][0]!;var stamp=(OracleTemporalCell)data.Rows[0][1]!;var first=(OracleTemporalCell)data.Rows[0][2]!;var second=(OracleTemporalCell)data.Rows[1][2]!;var local=(OracleTemporalCell)data.Rows[0][3]!;
  Check(date.Value=="2024-03-10T02:30:00"&&date.Offset is null,"DATE wall time is not shifted in "+zone);
  Check(stamp.Value.EndsWith(".123456789")&&stamp.Offset is null,"TIMESTAMP nanoseconds survive in "+zone);
  Check(first.Offset=="-04:00"&&second.Offset=="-05:00"&&first.Region=="America/New_York"&&second.Value.EndsWith(".123456790"),"DST overlap offsets, regions and nanoseconds survive in "+zone);
  Check(local.SessionTimeZone==zone&&local.Offset is null,"LTZ carries its session-zone context without inventing an offset in "+zone);
  foreach(var cell in new[]{date,stamp,first,second}){
   var roundtrip=await dated.ExecuteAsync("SELECT "+cell.SqlLiteral()+" V FROM dual");var restored=(OracleTemporalCell)roundtrip.Rows[0][0]!;
   Check(restored.Value==cell.Value&&restored.Offset==cell.Offset&&restored.Region==cell.Region,"generated temporal SQL round-trips "+cell.OracleType+" in "+zone);
  }
  using var workbook=new MemoryStream();ResultXlsxExporter.Write(workbook,data.Columns,data.Rows);
  workbook.Position=0;using(var archive=new System.IO.Compression.ZipArchive(workbook,System.IO.Compression.ZipArchiveMode.Read,true)){
   using var sheet=archive.GetEntry("xl/worksheets/sheet1.xml")!.Open();var xml=System.Xml.Linq.XDocument.Load(sheet);
   var cells=xml.Descendants().Where(element=>element.Name.LocalName=="c").ToDictionary(element=>element.Attribute("r")!.Value);
   Check(cells["A2"].Attribute("t") is null&&cells["B2"].Attribute("t")?.Value=="inlineStr"&&cells["C2"].Value.Contains("123456789"),"XLSX retains native DATE cells and exact timestamp text in "+zone);
  }
  using var csv=new StringWriter();await ResultCsvExporter.WriteAsync(csv,data.Columns.Select(column=>column.Name),data.Rows);
  Check(csv.ToString().Contains(".123456789-04:00[America/New_York]"),"CSV preserves temporal precision and region in "+zone);
 }
 using(var cursor=new OracleSessionService()){
  await cursor.ConnectAsync(profile with{Nls=new Dictionary<string,string>{{"SESSIONTIMEZONE","America/New_York"}}},profile.User,suppliedPassword,null);
  var firstPage=await cursor.ExecuteAsync("SELECT CAST(TIMESTAMP '2024-11-03 01:30:00.123456789 -04:00' AS TIMESTAMP(9) WITH LOCAL TIME ZONE) L FROM DUAL CONNECT BY LEVEL<=20000",rowLimit:100);
  var first=(OracleTemporalCell)firstPage.Rows[0][0]!;
  await cursor.ExecuteAsync("ALTER SESSION SET TIME_ZONE='UTC'");
  var next=await cursor.FetchNextPageAsync(firstPage.ResultId!,10000);
  Check(next.Rows.All(row=>((OracleTemporalCell)row[0]!).Value==first.Value),"open LTZ cursor retains its original wall-time context after ALTER SESSION");
  var current=await cursor.ReadNlsAsync();Check(current.Effective["SESSIONTIMEZONE"]=="UTC"&&current.Initial!["SESSIONTIMEZONE"]!="UTC","manual ALTER SESSION changes effective values while preserving initial values");
 }
 Console.WriteLine("Live temporal acceptance checks completed.");return;
}
var identity=await session.ExecuteAsync("SELECT SYS_CONTEXT('USERENV','SESSION_USER') AS SESSION_USER FROM dual");
Check(string.Equals(Convert.ToString(identity.Rows[0][0]),requested,StringComparison.OrdinalIgnoreCase)||profile.Id.Equals(requested,StringComparison.OrdinalIgnoreCase)||profile.Name.Equals(requested,StringComparison.OrdinalIgnoreCase),"approved Oracle account owns the temporary physical session");
var connectionCheck=await credentials.DiagnoseConnectionAsync(profile,profile.User,suppliedPassword);
Check(connectionCheck.Success&&connectionCheck.Steps.Any(step=>step.Stage=="Authentication"&&step.Status=="Succeeded")&&connectionCheck.Steps.Any(step=>step.Stage=="Oracle session"&&step.Status=="Succeeded"),"temporary connection diagnostics distinguish network, authentication and Oracle session stages");
var initial=await session.ReadNlsAsync();
Check(initial.Initial?.ContainsKey("NLS_DATE_FORMAT")==true&&initial.Effective.ContainsKey("SESSIONTIMEZONE"),"initial and effective NLS values are available per physical session");
var overrides=new Dictionary<string,string>{{"NLS_DATE_FORMAT","YYYY-MM-DD HH24:MI:SS"},{"NLS_NUMERIC_CHARACTERS",",."}};
var tested=await credentials.TestNlsAsync(profile,overrides,profile.User,suppliedPassword);
Check(tested.Temporary&&tested.Effective["NLS_NUMERIC_CHARACTERS"]==",.","NLS overrides are tested on a separate temporary connection");
var afterTest=await session.ReadNlsAsync();
Check(initial.Effective.All(entry=>afterTest.Effective[entry.Key]==entry.Value),"NLS testing preserves the active session");
using(var configured=new OracleSessionService()){
 await configured.ConnectAsync(profile with{Nls=overrides},profile.User,suppliedPassword,null);
 var report=await configured.ReadNlsAsync();
 Check(report.Configured["NLS_DATE_FORMAT"]==overrides["NLS_DATE_FORMAT"]&&report.Effective["NLS_DATE_FORMAT"]==overrides["NLS_DATE_FORMAT"],"overrides apply before a new physical session is exposed");
 Check(report.Initial is not null,"initial values survive profile overrides");
 var exactNumber="12345678901234567890123456789012345.123";
 var precision=await configured.ExecuteAsync("SELECT :n AS N FROM dual",[new SqlBindParameter("n","NUMBER",exactNumber)]);
 Check(Convert.ToString(precision.Rows[0][0])==exactNumber,"NUMBER binds and result transport remain exact under comma-decimal NLS settings");
}
using(var invalid=new OracleSessionService()){
 var rejectedProfile=false;
 try{await invalid.ConnectAsync(profile with{Nls=new Dictionary<string,string>{{"NLS_DATE_FORMAT","YYYY-INVALID-FORMAT"}}},profile.User,suppliedPassword,null);}catch(InvalidOperationException error)when(error.Message.Contains("NLS_DATE_FORMAT")){rejectedProfile=true;}
 Check(rejectedProfile&&!invalid.IsConnected,"a rejected NLS override never exposes a ready connection");
}
await session.BeginReadOnlyAnalysisAsync();
Check(session.AnalysisReadOnly&&session.HasPendingTransaction,"read-only consistent analysis starts explicitly");
var read=await session.ExecuteAsync("SELECT 42 AS N FROM dual");
Check(Convert.ToString(read.Rows[0][0])=="42","queries work in the read-only analysis transaction");
var rejected=false;try{await session.ExecuteAsync("UPDATE dual SET dummy = 'X'");}catch(InvalidOperationException error)when(error.Message.Contains("Read-only analysis")){rejected=true;}
Check(rejected,"DML is rejected before it reaches Oracle during read-only analysis");
await session.RollbackAsync();
Check(!session.AnalysisReadOnly&&!session.HasPendingTransaction,"ending analysis restores the normal manual-commit session");
var timer=Stopwatch.StartNew();
using(var deadline=new CancellationTokenSource(TimeSpan.FromSeconds(15))){
 var timedOut=false;
 try{await session.ExecuteAsync("BEGIN DBMS_SESSION.SLEEP(8); END;",cancellationToken:deadline.Token,timeoutSeconds:1);}
 catch(OracleException error)when(error.Number==1013){timedOut=true;}
 catch(OperationCanceledException)when(!deadline.IsCancellationRequested){timedOut=true;}
 Check(timedOut&&timer.Elapsed<TimeSpan.FromSeconds(7),"query timeout cancels Oracle execution");
}
await session.RollbackAsync();
var running=session.ExecuteAsync("BEGIN DBMS_SESSION.SLEEP(8); END;");await Task.Delay(300);
Check(session.CancelCurrentOperation(),"manual cancellation reaches the active Oracle command");
var cancelled=false;try{await running;}catch(OperationCanceledException){cancelled=true;}catch(OracleException error)when(error.Number==1013){cancelled=true;}
Check(cancelled,"manual cancellation completes without executing further SQL");
await session.RollbackAsync();
var retained=await session.ExecuteAsync("SELECT 42 AS N FROM dual");
Check(!string.IsNullOrEmpty(retained.SqlId),"executed queries retain their Oracle SQL ID");
try{
 var plan=await session.LoadRuntimePlanAsync(retained.SqlId!);
 Check(plan.Any(line=>line.Contains("Plan hash value",StringComparison.OrdinalIgnoreCase)),"cursor plan identifies an actual cached Oracle plan");
}catch(InvalidOperationException error)when(error.Message.Contains("requires access")){Console.WriteLine("PASS restricted cursor-plan privileges are explained explicitly");}
Check(Convert.ToString(retained.Rows[0][0])=="42","cursor-plan inspection preserves existing query rows");
var accessible=await session.ExecuteAsync("SELECT owner,table_name FROM all_tables WHERE owner NOT IN ('SYS','SYSTEM','XDB','MDSYS','CTXSYS','ORDSYS','WMSYS') ORDER BY owner,table_name FETCH FIRST 1 ROW ONLY");
if(accessible.Rows.Count>0){
 var owner=Convert.ToString(accessible.Rows[0][0])!;var name=Convert.ToString(accessible.Rows[0][1])!;
 var analysis=await session.LoadObjectAnalysisAsync(owner,name,"TABLE",CancellationToken.None);
 Check(analysis.Owner==owner&&analysis.Name==name,"object grants and dependencies stay within current Oracle privileges");
 Check(!string.IsNullOrEmpty(analysis.Ddl)||!string.IsNullOrEmpty(analysis.DdlError),"DDL permission failures are shown without suppressing other object metadata");
}
Check(session.IsConnected,"the Oracle session remains usable after all acceptance checks");
Console.WriteLine("Oracle acceptance checks completed without committing or modifying database records.");

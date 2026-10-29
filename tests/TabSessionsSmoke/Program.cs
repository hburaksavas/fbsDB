using FbsDb.Services;
var profile = (await new TnsProfileService().GetProfilesAsync()).Single(p=>p.Id==(args.FirstOrDefault()??"FBSDB_LOCAL"));
void Check(bool condition,string text){if(!condition)throw new Exception(text);Console.WriteLine("PASS "+text);}
using var registry=new TabSessionRegistry();
var a=registry.Get("test-a"); var b=registry.Get("test-b");
Check(!ReferenceEquals(a.Oracle,b.Oracle),"tabs own different Oracle services");
a.FilePath="a.sql";b.FilePath="b.sql";
Check(registry.Get("test-a").FilePath=="a.sql" && registry.Get("test-b").FilePath=="b.sql","tab paths are independent");
await a.Oracle.ConnectAsync(profile,"","",null);
using var credentials=new OracleSessionService();
var saved=await credentials.GetSavedCredentialsAsync(profile.Id)??throw new Exception("Saved credentials required");
await b.Oracle.ConnectAsync(profile with {Id="temporary-test-profile-b"},saved.User,saved.Password,null);
Check(a.Oracle.ProfileId==profile.Id && b.Oracle.ProfileId=="temporary-test-profile-b","tabs can use different profiles without switching each other");
var sidA=await a.Oracle.ExecuteAsync("SELECT SYS_CONTEXT('USERENV','SID') FROM DUAL");
var sidB=await b.Oracle.ExecuteAsync("SELECT SYS_CONTEXT('USERENV','SID') FROM DUAL");
Check(!Equals(sidA.Rows[0][0],sidB.Rows[0][0]),"physical Oracle sessions are distinct");
await a.Oracle.ExecuteAsync("UPDATE EMPLOYEES SET SALARY=SALARY WHERE 1=0");
Check(a.Oracle.HasPendingTransaction&&!b.Oracle.HasPendingTransaction,"DML transaction is local to originating tab (zero rows changed)");
await b.Oracle.ExecuteAsync("UPDATE EMPLOYEES SET SALARY=SALARY WHERE 1=0");
await a.Oracle.CommitAsync();
Check(!a.Oracle.HasPendingTransaction&&b.Oracle.HasPendingTransaction,"commit in A leaves B pending");
try{await registry.CloseAsync("test-b");throw new Exception("pending tab closed");}catch(InvalidOperationException){Console.WriteLine("PASS closing a pending tab is refused");}
await b.Oracle.RollbackAsync();
Check(!b.Oracle.HasPendingTransaction&&a.Oracle.IsConnected,"rollback in B leaves A connected");
var pa=await a.Oracle.ExecuteAsync("SELECT LEVEL FROM DUAL CONNECT BY LEVEL<=205",rowLimit:100);
var pb=await b.Oracle.ExecuteAsync("SELECT LEVEL FROM DUAL CONNECT BY LEVEL<=305",rowLimit:100);
var nextA=await a.Oracle.FetchNextPageAsync(pa.ResultId!,100);
var nextB=await b.Oracle.FetchNextPageAsync(pb.ResultId!,100);
Check(nextA.Offset==100&&nextB.Offset==100,"result paging is isolated by session");
var running=a.Oracle.ExecuteAsync("SELECT SUM(LEVEL) FROM DUAL CONNECT BY LEVEL<=30000000");
await Task.Delay(200);
Check(!b.Oracle.CancelCurrentOperation(),"cancel on idle B does not cancel running A");
var quick=await b.Oracle.ExecuteAsync("SELECT 42 FROM DUAL");
Check(Convert.ToInt32(quick.Rows[0][0])==42,"B runs while A is busy");
a.Oracle.CancelCurrentOperation();
try{await running;}catch(OperationCanceledException){Console.WriteLine("PASS A cancellation completes independently");}
await registry.CloseAsync("test-b");
Check(a.Oracle.IsConnected&&registry.Sessions.Count()==1,"closing B releases only B session");
try{registry.Get("test-b");throw new Exception("closed tab resurrected");}catch(InvalidOperationException){Console.WriteLine("PASS late commands cannot reopen a closed tab");}

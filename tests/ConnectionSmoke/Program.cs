using FbsDb.Services;
using System.Text.Json.Nodes;
var root = Path.Combine(Path.GetTempPath(), "fbsdb-connections-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
void Check(bool value, string message) { if (!value) throw new Exception(message); Console.WriteLine("PASS " + message); }
async Task Reject(Func<Task> operation, string message) { try { await operation(); } catch (InvalidOperationException) { Console.WriteLine("PASS " + message); return; } throw new Exception(message); }
try {
 var tns = Path.Combine(root, "tnsnames.ora");
 await File.WriteAllTextAsync(tns, "FINANCE = (DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=localhost)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=FREEPDB1)))");
 var settings = Path.Combine(root, "settings.json");
 await File.WriteAllTextAsync(settings, "{\"tnsPaths\":[\"existing\"],\"connectionGroups\":{\"FINANCE\":\"Legacy\"}}");
 var files = new List<string> { tns };
 var service = new TnsProfileService(settings, () => files);
 var migrated = await service.GetProfilesAsync();
 Check(migrated.Single().Id == "FINANCE" && migrated.Single().Environment == "UNKNOWN", "legacy identity preserved; unknown environment");
 Check((await service.GetConnectionGroupsAsync())["FINANCE"] == "Legacy", "legacy groups preserved");
 var reader = await service.SaveProfileAsync(null, "Finance reader", "FINANCE", tns, "APP_READ", "TEST");
 var admin = await service.SaveProfileAsync(null, "Finance admin", "FINANCE", tns, "APP_ADMIN", "PROD");
 Check(reader != admin && (await service.GetProfilesAsync()).Count == 3, "one alias supports independent user profiles");
 await service.SaveProfileAsync(reader, "Reader renamed", "FINANCE", tns, "APP_READ", "DEV");
 Check((await service.GetProfilesAsync()).Single(p => p.Id == reader).Name == "Reader renamed", "editing preserves profile identity");
 await Reject(async () => { await service.SaveProfileAsync(null, "Finance admin", "FINANCE", tns, "X", "PROD"); }, "duplicate names rejected");
 await Reject(async () => { await service.SaveProfileAsync(null, "Bad", "FINANCE", tns, "X", "FAKE"); }, "invalid environments rejected");
 var duplicateFile = Path.Combine(root, "duplicate.ora"); File.Copy(tns, duplicateFile); files.Add(duplicateFile);
 Check((await service.GetAliasesAsync()).Count == 2 && (await service.GetAliasesAsync()).All(p => p.Duplicate), "duplicate aliases retain selectable source paths");
 files.Clear();
 Check((await service.GetProfilesAsync()).All(p => !p.Available), "missing alias does not delete saved profiles");
 files.Add(tns);
 await service.DeleteProfileAsync(admin);
 Check(!(await service.GetProfilesAsync()).Any(p => p.Id == admin), "profile delete leaves other profiles intact");
 using var oracle = new OracleSessionService(Path.Combine(root, "credentials"));
 await oracle.ApplyCredentialPreferenceAsync(reader, "APP_READ", "test-only-password", true);
 await oracle.ApplyCredentialPreferenceAsync(reader, "", "", null);
 Check((await oracle.GetSavedCredentialsAsync(reader))?.User == "APP_READ", "automatic reconnect preserves saved credentials");
 Check(!await oracle.HasSavedCredentialsAsync("another-profile"), "credentials isolated by profile ID");
 await oracle.ApplyCredentialPreferenceAsync(reader, "", "", false);
 Check(!await oracle.HasSavedCredentialsAsync(reader), "explicit forget removes credentials");
 Check(!File.ReadAllText(settings).Contains("test-only-password"), "settings contain no password");

 var basic = await service.SaveProfileAsync(null, "Direct service", "", "", "APP", "DEV", "basic", "localhost", "1521", "FREEPDB1", "service");
 var sid = await service.SaveProfileAsync(null, "Direct SID", "", "", "APP", "TEST", "basic", "db.example.com", "1522", "ORCL", "sid");
 var raw = "(DESCRIPTION_LIST=(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=one)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=FIN)))(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=two)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=FIN))))";
 var custom = await service.SaveProfileAsync(null, "RAC descriptor", "", "", "APP", "UNKNOWN", "descriptor", descriptor: raw);
 files.Clear();
 var direct = await service.GetProfilesAsync();
 Check(direct.Single(p => p.Id == basic) is { Method: "basic", Available: true, Source: "" } && direct.Single(p => p.Id == basic).Descriptor.Contains("(SERVICE_NAME=FREEPDB1)"), "Basic service profile works without TNS files");
 Check(direct.Single(p => p.Id == sid).Descriptor.Contains("(SID=ORCL)"), "SID is emitted separately from service name");
 Check(direct.Single(p => p.Id == custom).Descriptor == raw, "custom multi-host descriptor persists unchanged");
 await service.SetNlsAsync(basic,new Dictionary<string,string>{{"NLS_DATE_FORMAT","YYYY-MM-DD"},{"NLS_NUMERIC_CHARACTERS",",."}});
 Check((await service.GetProfilesAsync()).Single(p=>p.Id==basic).Nls["NLS_DATE_FORMAT"]=="YYYY-MM-DD","NLS preferences belong to one profile");
 Check((await service.GetProfilesAsync()).Single(p=>p.Id==sid).Nls.Count==0,"other profiles inherit Oracle NLS defaults");
 await service.SaveProfileAsync(basic, "Converted to descriptor", "", "", "APP", "DEV", "descriptor", descriptor: raw);
 Check((await service.GetProfilesAsync()).Single(p => p.Id == basic).Method == "descriptor", "switching method retains profile identity");
 Check((await service.GetProfilesAsync()).Single(p=>p.Id==basic).Nls["NLS_NUMERIC_CHARACTERS"]==",.","editing connection targets preserves NLS preferences");
 await Reject(async () => { await service.SaveProfileAsync(null, "Bad port", "", "", "APP", "DEV", "basic", "host", "0", "ORCL"); }, "invalid Basic port rejected");
 await Reject(async () => { await service.SaveProfileAsync(null, "Bad host", "", "", "APP", "DEV", "basic", "host)(PORT=7", "1521", "ORCL"); }, "descriptor injection in Basic host rejected");
 await Reject(async () => { await service.SaveProfileAsync(null, "Bad identifier", "", "", "APP", "DEV", "basic", "host", "1521", ""); }, "empty service name rejected");
 await Reject(async () => { await service.SaveProfileAsync(null, "Bad descriptor", "", "", "APP", "DEV", "descriptor", descriptor: "(DESCRIPTION=(HOST=x)"); }, "unbalanced descriptor rejected");
 await Reject(async () => { await service.SaveProfileAsync(null, "Bad credentials", "", "", "APP", "DEV", "descriptor", descriptor: "(DESCRIPTION=(PASSWORD=secret))"); }, "descriptor credentials rejected");
 await Reject(async () => { await service.SaveProfileAsync(null, "Bad string", "", "", "APP", "DEV", "descriptor", descriptor: "Data Source=x;Password=secret"); }, "full connection string rejected");
 files.Add(tns);
 await File.WriteAllTextAsync(settings, "corrupt");
 try { await service.AddTnsFileAsync(tns); throw new Exception("must reject corrupt settings"); } catch (System.Text.Json.JsonException) { Console.WriteLine("PASS corrupt settings are not overwritten"); }
} finally { Directory.Delete(root, true); }

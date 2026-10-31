using FbsDb.Services;
using System.Text.Json;
using System.Text.Json.Nodes;

var root=Path.Combine(Path.GetTempPath(),"fbsdb-organization-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
void Check(bool value,string message){if(!value)throw new Exception(message);Console.WriteLine("PASS "+message);}
async Task Reject(Func<Task> action,string message){try{await action();}catch(InvalidOperationException){Console.WriteLine("PASS "+message);return;}throw new Exception(message);}
try{
 var path=Path.Combine(root,"settings.json");
 await File.WriteAllTextAsync(path,"""{"unknown":{"keep":true},"connectionGroups":{"legacy":"Analytics"},"connectionProfiles":[{"id":"legacy","name":"Existing","method":"basic","host":"db.test","port":"1521","service":"ORCL","targetType":"service","user":"APP","environment":"DEV","nls":{"NLS_DATE_FORMAT":"YYYY-MM-DD"}}]}""");
 var service=new TnsProfileService(path,()=>[]);
 async Task<JsonObject> Change(object payload)=>await service.ChangeOrganizationAsync(JsonSerializer.SerializeToElement(payload));
 var org=await service.GetOrganizationAsync();var group=org["groups"]![0]!["id"]!.GetValue<string>();
 Check(org["groups"]![0]!["name"]!.GetValue<string>()=="Analytics"&&org["assignments"]!["legacy"]!["groupIds"]![0]!.GetValue<string>()==group,"legacy groups migrate once with stable profile IDs");
 org=await Change(new{operation="folder.create",name="Oracle"});var parent=org["folders"]![0]!["id"]!.GetValue<string>();
 org=await Change(new{operation="folder.create",name="Finance",parentId=parent});var child=org["folders"]![1]!["id"]!.GetValue<string>();
 org=await Change(new{operation="group.create",name="Read only"});var second=org["groups"]![1]!["id"]!.GetValue<string>();
 org=await Change(new{operation="profile.assign",profileId="legacy",folderId=child,groupIds=new[]{group,second}});
 Check(org["assignments"]!["legacy"]!["groupIds"]!.AsArray().Count==2,"one folder and multiple independent labels");
 var before=await File.ReadAllTextAsync(path);
 await Reject(()=>Change(new{operation="folder.move",id=parent,parentId=child}),"folder cycles rejected");
 await Reject(()=>Change(new{operation="folder.delete",id=child}),"nonempty folder deletion rejected");
 await Reject(()=>Change(new{operation="group.rename",id=second,name="analytics"}),"case-insensitive duplicate labels rejected");
 await Reject(()=>Change(new{operation="profile.assign",profileId="missing",folderId=child,groupIds=new[]{group}}),"stale profile assignment rejected");
 Check(before==await File.ReadAllTextAsync(path),"failed organization mutations are atomic");
 await Reject(()=>service.SaveProfileAsync("legacy","Changed","","","APP","DEV","basic","db.test","1521","ORCL","service","",child,new[]{"missing"}),"invalid labels reject an entire profile edit");
 Check((await service.GetProfilesAsync()).Single().Name=="Existing","failed profile save leaves original definition intact");
 await service.SaveProfileAsync("legacy","Renamed","","","APP","DEV","basic","db.test","1521","ORCL","service","",child,new[]{group,second});
 Check((await service.GetProfilesAsync()).Single().Nls["NLS_DATE_FORMAT"]=="YYYY-MM-DD","editing preserves stable ID and NLS preferences");
 org=await Change(new{operation="group.delete",id=second});Check(org["assignments"]!["legacy"]!["groupIds"]!.AsArray().Count==1,"deleting a label preserves connections and other labels");
 await service.DeleteProfileAsync("legacy");org=await service.GetOrganizationAsync();Check(!org["assignments"]!.AsObject().ContainsKey("legacy"),"profile deletion cleans organization references");
 await Change(new{operation="folder.delete",id=child});await Change(new{operation="folder.delete",id=parent});
 var settings=JsonNode.Parse(await File.ReadAllTextAsync(path))!.AsObject();Check(settings["unknown"]!["keep"]!.GetValue<bool>(),"unrelated settings preserved");
 settings[NativeSettingsStore.VersionKey]=999;await File.WriteAllTextAsync(path,settings.ToJsonString());before=await File.ReadAllTextAsync(path);
 await Reject(()=>Change(new{operation="group.create",name="Future"}),"future settings versions cannot be overwritten");Check(before==await File.ReadAllTextAsync(path),"future settings file remains unchanged");
}finally{Directory.Delete(root,true);}

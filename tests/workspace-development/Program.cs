using System.Diagnostics;
using System.Text;
using FbsDb.Services;

var temporaryRoot=Path.GetFullPath(Path.Combine(Path.GetTempPath(),"fbsdb-workspace-development-"+Guid.NewGuid().ToString("N")));
var root=Path.Combine(temporaryRoot,"workspace");Directory.CreateDirectory(root);
void Check(bool condition,string message){if(!condition)throw new Exception(message);}
async Task Git(params string[] args){var start=new ProcessStartInfo("git"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};foreach(var arg in new[]{"-C",temporaryRoot}.Concat(args))start.ArgumentList.Add(arg);using var process=Process.Start(start)!;var output=process.StandardOutput.ReadToEndAsync();var error=process.StandardError.ReadToEndAsync();await process.WaitForExitAsync();await output;if(process.ExitCode!=0)throw new Exception(await error);}
try {
 var workspace=new WorkspaceService(Path.Combine(temporaryRoot,"settings.json"));await workspace.SetRootAsync(root);
 var service=new WorkspaceDevelopmentService(workspace);
 var a=Path.Combine(root,"a file.sql");var b=Path.Combine(root,"b.sql");var outside=Path.Combine(temporaryRoot,"outside.sql");
 await File.WriteAllTextAsync(a,"select old from dual;\r\n",new UTF8Encoding(true));
 await File.WriteAllTextAsync(b,"select old from dual;\r\n",Encoding.Unicode);
 await File.WriteAllTextAsync(outside,"select old from dual;");
 await Git("init");await Git("add",".");
 var initialDiff=await service.GitDiffAsync(a);Check(initialDiff.Diff.Contains("select old"),"unborn HEAD staged diff");
 await Git("-c","user.name=fbsDB Test","-c","user.email=fbsdb-test@localhost","commit","-m","SQL baseline");
 var preview=await service.PreviewReplaceAsync("old","new",false,[b]);
 Check(preview.Files.Count==1&&preview.Skipped.Any(item=>item.Contains("unsaved")),"exclude unsaved files");
 Check((await File.ReadAllTextAsync(a)).Contains("old"),"preview must never write");
 await File.WriteAllTextAsync(a,"select changed from dual;\r\n",new UTF8Encoding(true));
 var conflict=await service.ApplyReplaceAsync(preview.Id,[a],[]);
 Check(conflict.Applied.Count==0&&conflict.Skipped.Any(item=>item.Contains("changed")),"changed disk file must not be overwritten");
 preview=await service.PreviewReplaceAsync("changed","new\nvalue",true,[]);
 var applied=await service.ApplyReplaceAsync(preview.Id,[a],[]);
 Check(applied.Applied.Count==1&&(await File.ReadAllTextAsync(a)).Contains("new\nvalue"),"apply reviewed selected file");
 Check((await File.ReadAllBytesAsync(a)).AsSpan().StartsWith(new byte[]{0xef,0xbb,0xbf}),"UTF-8 BOM retained");
 preview=await service.PreviewReplaceAsync("old","new",false,[]);
 var blocked=await service.ApplyReplaceAsync(preview.Id,[b],[b]);Check(blocked.Applied.Count==0,"new unsaved changes must block apply");
 preview=await service.PreviewReplaceAsync("old","new",false,[]);
 applied=await service.ApplyReplaceAsync(preview.Id,[b],[]);
 Check(applied.Applied.Count==1&&(await File.ReadAllBytesAsync(b)).AsSpan().StartsWith(new byte[]{0xff,0xfe}),"UTF-16 encoding and BOM retained");
 var state=await service.GitStateAsync();Check(state.Repository&&state.Files.Any(file=>file.Path==a)&&state.Files.All(file=>file.Path!=outside),"Git paths remain inside nested workspace");
 var diff=await service.GitDiffAsync(a);Check(diff.Diff.Contains("new")&&diff.Commit.Contains("SQL baseline"),"working diff and commit info");
 try{await service.GitDiffAsync(outside);throw new Exception("outside Git access accepted");}catch(InvalidOperationException){}
 var renamed=Path.Combine(root,"renamed.sql");await Git("mv","workspace/a file.sql","workspace/renamed.sql");
 state=await service.GitStateAsync();Check(state.Files.Any(file=>file.Path==renamed)&&state.Files.All(file=>!file.RelativePath.StartsWith("workspace/")),"rename NUL parsing and root-relative conversion");
 foreach(var extension in new[]{".pks",".pkb",".prc",".fnc",".trg"}) {
  var source=await workspace.CreateEntryAsync(root,"oracle_source"+extension,false);
  state=await service.GitStateAsync();Check(state.Files.Any(file=>file.Path==source.Path),"Oracle source missing from Git status");
  diff=await service.GitDiffAsync(source.Path);Check(diff.Diff.Contains("CREATE OR REPLACE"),"Oracle source missing from Git diff");
  preview=await service.PreviewReplaceAsync("oracle_source","updated_source",true,[],root);
  Check(preview.Files.Any(file=>file.Path==source.Path),"Oracle source missing from replace preview");
  applied=await service.ApplyReplaceAsync(preview.Id,[source.Path],[]);
  Check(applied.Applied.Count==1&&(await File.ReadAllTextAsync(source.Path)).Contains("updated_source"),"Oracle source replace failed");
 }
 Console.WriteLine("Workspace Git / replace checks passed, including Oracle source extensions.");
} finally {
 var checkedRoot=Path.GetFullPath(temporaryRoot);
 if(checkedRoot.StartsWith(Path.GetFullPath(Path.GetTempPath()),StringComparison.OrdinalIgnoreCase)&&Path.GetFileName(checkedRoot).StartsWith("fbsdb-workspace-development-",StringComparison.Ordinal)){foreach(var file in Directory.EnumerateFiles(checkedRoot,"*",SearchOption.AllDirectories))File.SetAttributes(file,FileAttributes.Normal);Directory.Delete(checkedRoot,true);}
}

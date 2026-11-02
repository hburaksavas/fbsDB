import {parsePlsql} from './plsqlStructure.js';
import {describeOracleSource} from './oracleSourceIdentity.js';
import {lexOracle} from './oracleLexer.js';
function precedingDocumentation(source,start){
 const tokens=lexOracle(source.slice(0,start)),comments=[];let boundary=start;
 for(let i=tokens.length-1;i>=0&&tokens[i].kind==='comment'&&!source.slice(tokens[i].end,boundary).trim();i--){comments.unshift(tokens[i].value);boundary=tokens[i].start}
 return comments.join('\n').replace(/^\s*-- ?/gm,'').replace(/^\/\*+|\*+\/$/g,'').replace(/^\s*\* ?/gm,'').trim();
}
export function packageApi(document,rules){
 const source=document?.content||'',identity=describeOracleSource(document||{},rules);
 const origin=document?.definitionObject?'Database definition (retrieved snapshot)':document?.path?'Local file'+(document.dirty?' · unsaved changes':''):'Editor draft';
 const empty={entries:[],origin,name:identity.declaration?.name||'',error:''};
 if(identity.warning||identity.declaration?.type!=='PACKAGE')return {...empty,error:'Open a package specification to view its public API. Package bodies are excluded.'};
 const parsed=parsePlsql(source);
 if(!parsed.complete)return {...empty,error:'The specification is incomplete or uses syntax unsupported by the local parser. No partial API is presented.'};
 const scope=parsed.scopes.find(s=>s.parent&&!s.parent.parent),node=parsed.children.find(n=>n.kind==='routine'&&n.routineKind==='PACKAGE');
 if(!scope||!node)return {...empty,error:'Could not identify the package specification scope.'};
 const entries=[];
 for(const routine of scope.routines){
  const declaration=node.declarations.find(n=>n.kind==='routine'&&n.start===routine.subprogramId);
  if(!declaration)continue;
  entries.push({id:`routine-${declaration.start}`,name:routine.name,kind:routine.routineKind,start:declaration.start,signature:source.slice(declaration.start,declaration.end),documentation:precedingDocumentation(source,declaration.start),parameters:routine.parameters.map(p=>({...p,mode:p.mode==='IN/OUT'?'IN OUT':p.mode})),returnType:routine.returnType});
 }
 for(const type of scope.types){
  const declaration=node.declarations.find(n=>n.start<=type.start&&type.start<n.end);
  if(!declaration)continue;
  entries.push({id:`type-${declaration.start}`,name:type.name,kind:/^SUBTYPE\b/i.test(source.slice(declaration.start,declaration.end))?'SUBTYPE':'TYPE',start:declaration.start,signature:source.slice(declaration.start,declaration.end),documentation:precedingDocumentation(source,declaration.start),parameters:[]});
 }
 return {...empty,name:[identity.declaration.owner,identity.declaration.name].filter(Boolean).join('.'),entries:entries.sort((a,b)=>a.start-b.start)};
}

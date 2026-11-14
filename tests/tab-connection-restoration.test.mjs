import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathKey} from '../src/workspaceTree.js';
import {createDocumentSessions} from '../src/documentSessions.js';

const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
function appFunction(name,next,scope){
  const start=source.indexOf(`  function ${name}(`),end=source.indexOf(`  ${next}`,start+1);
  assert.ok(start>=0&&end>start);
  return Function('scope',`with(scope){return (${source.slice(start,end).trim()})}`)(scope);
}
function fixture(){
  const connections=[],commands=[],scope={
    pathKey,crypto,workspace:{root:'D:/queries'},isNativeHost:true,
    documents:createDocumentSessions([]),editorPositionsRef:{current:new Map()},
    dbConnectionsRef:{current:[{id:'DEV',hasSavedCredentials:true},{id:'PROD'}]},
    sessionsRef:{current:{}},schemaLookupRef:{current:null},schemaReadyRef:{current:false},
    schemaLoadedRef:{current:new Set()},schemaRequestedRef:{current:new Set()},
    editorRef:{current:null},
    beginConnection:profile=>connections.push(profile),
    sendNativeCommand:(command,payload)=>commands.push({command,payload}),
    requestAnimationFrame:()=>{},makeOracleRelationLookup:()=>new Map(),
    setTabs:update=>scope.documents.setTabs(update),
  };
  for(const name of ['rememberEditorPosition','rememberLocation','setNativeTabId','setActiveTabId','setSql','setFileName','setFilePath','setFileDirty','setFileConnectionProfileId','queueSchemaForSql','setObjectTabActive'])scope[name]=()=>{};
  scope.activateTab=appFunction('activateTab','function cycleSqlTab',scope);
  return {scope,connections,commands};
}

test('generated object SQL connects its new session to the originating profile without executing SQL',()=>{
  const {scope,connections,commands}=fixture();
  scope.newSqlFileNow=()=>scope.documents.open({id:'draft',path:null,content:'',dirty:false});
  const open=appFunction('openObjectSqlDraft','function objectContextAction',scope);
  open('SELECT * FROM "APP"."T";', {name:'T'}, 'dev');
  assert.deepEqual(connections,[{id:'DEV',hasSavedCredentials:true,tabId:'draft'}]);
  assert.equal(scope.documents.tabs[0].connectionProfileId,'dev');
  assert.equal(scope.documents.tabs[0].dirty,true);
  assert.deepEqual(commands,[]);
});

test('worksets restore profiles lazily and preserve existing tabs and sessions',()=>{
  const {scope,connections,commands}=fixture();
  const existing={id:'existing',path:'D:/queries/keep.sql',content:'unsaved',dirty:true,connectionProfileId:'OTHER'};
  scope.documents.replace([existing],existing.id);
  const open=appFunction('openWorkset','function resolveExternalFile',scope);
  open({root:'D:/queries',workset:{activePath:'dev.sql'},files:[
    {path:'D:/queries/dev.sql',fileName:'dev.sql',content:'SELECT 1',profileId:'DEV',line:1,column:1},
    {path:'D:/queries/prod.sql',fileName:'prod.sql',content:'SELECT 2',profileId:'PROD',line:2,column:3},
    {path:'D:/queries/keep.sql',fileName:'keep.sql',content:'disk',profileId:'DEV',line:1,column:1},
  ]});
  const prod=scope.documents.tabs.find(tab=>tab.path.endsWith('prod.sql'));
  assert.deepEqual(connections.map(p=>p.id),['DEV']);
  assert.equal(prod.connectionProfileId,'PROD');
  scope.activateTab(prod.id);
  scope.activateTab(prod.id);
  scope.activateTab(existing.id);
  assert.deepEqual(connections.map(p=>p.id),['DEV','PROD']);
  assert.equal(scope.documents.tabs.find(tab=>tab.id===existing.id),existing);
  assert.ok(commands.every(({command})=>command==='file.activate'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {oracleObjectMenu,oracleInspectorTabs,objectSqlDraft,editableObjectDefinition,qualifiedObject} from '../src/oracleObjectActions.js';
import {OracleMetadataBroker} from '../src/oracleMetadataBroker.js';

test('all Oracle types have common actions and only supported type-specific actions',()=>{
 for(const type of Object.keys(oracleInspectorTabs)){
  const menu=oracleObjectMenu({owner:'APP',name:'OBJ',type}),ids=menu.flatMap(a=>[a.id,...(a.children||[]).map(c=>c.id)]);
  for(const id of ['details:Overview','favorite','refresh','copy:name','copy:qualified'])assert.ok(ids.includes(id),type+' '+id);
  assert.ok(!ids.some(id=>id?.includes('drop')||id?.includes('execute')));
  assert.equal(ids.includes('sql:select'),['TABLE','VIEW','MATERIALIZED VIEW','SYNONYM'].includes(type));
  assert.equal(ids.includes('sql:merge'),type==='TABLE');
  assert.equal(ids.includes('ddl:open'),!['CONSTRAINT','DATABASE LINK'].includes(type));
 }
 assert.equal(oracleObjectMenu({type:'TABLE'},true).find(a=>a.id==='favorite').label,'Remove from favorites');
});

const table={owner:'Mixed owner',name:'Invoice"lines',type:'TABLE'};
const metadata={columns:[{name:'ID',primaryKey:true,writable:false},{name:'ORG',primaryKey:true,writable:true},{name:'VALUE',writable:true},{name:'GENERATED',writable:false}]};
test('table drafts quote exact identifiers, use verified composite keys and omit generated columns',()=>{
 assert.equal(qualifiedObject(table),'"Mixed owner"."Invoice""lines"');
 const insert=objectSqlDraft(table,'insert',metadata);assert.ok(!insert.includes('"ID"'));assert.ok(!insert.includes('GENERATED'));assert.ok(insert.includes(':p3'));
 const update=objectSqlDraft(table,'update',metadata);assert.match(update,/SET "VALUE" = :p3/);assert.match(update,/WHERE "ID" = :p1\n  AND "ORG" = :p2/);
 assert.ok(!update.includes('GENERATED'));
 const merge=objectSqlDraft(table,'merge',metadata);assert.match(merge,/ON \(t\."ID" = s\."ID" AND t\."ORG" = s\."ORG"\)/);assert.match(merge,/INSERT \("ORG", "VALUE"\)/);
 assert.throws(()=>objectSqlDraft(table,'update',{columns:[{name:'VALUE'}]}),/primary key/);
 assert.throws(()=>objectSqlDraft(table,'merge',{columns:[{name:'ID',primaryKey:true}]}),/non-key/);
 assert.throws(()=>objectSqlDraft({...table,type:'VIEW'},'update',metadata),/unavailable|not available/);
});

test('maintenance templates stay typed, quoted and never include an automatic commit',()=>{
 assert.equal(objectSqlDraft({owner:'APP',name:'PKG',type:'PACKAGE'},'compile-body'),'ALTER PACKAGE "APP"."PKG" COMPILE BODY REUSE SETTINGS;\n');
 assert.throws(()=>objectSqlDraft({owner:'APP',name:'P',type:'PROCEDURE'},'compile-body'),/unavailable|not available/);
 const refresh=objectSqlDraft({owner:'A',name:"MV'X",type:'MATERIALIZED VIEW'},'refresh');assert.ok(refresh.includes(`'"A"."MV''X"'`));assert.ok(refresh.includes(':refresh_method'));
 const remote=objectSqlDraft({name:'LINK.WORLD',type:'DATABASE LINK'},'remote');assert.ok(remote.includes('<schema>.<table>@"LINK.WORLD"'));
 assert.ok(!refresh.includes('COMMIT'));
});

test('call templates select a verified package overload and declare OUT variables locally',()=>{
 const object={owner:'APP',name:'PKG',type:'PACKAGE'},members=[{name:'RUN',subprogramId:1,parameters:[]},{name:'RUN',subprogramId:2,parameters:[{name:'INPUT',type:'NUMBER',mode:'IN'},{name:'OUTPUT',type:'VARCHAR2(100)',mode:'OUT'}]}];
 assert.throws(()=>objectSqlDraft(object,'call',{members}),/overloads/);
 const text=objectSqlDraft(object,'call:2',{members});assert.match(text,/v_arg1 NUMBER := :p1/);assert.match(text,/v_arg2 VARCHAR2\(100\);/);assert.ok(!text.includes(':p2'));assert.ok(text.includes('"APP"."PKG"."RUN"'));
});

test('editable stored source is qualified to its original owner, preserving comments and literals',()=>{
 const source='-- keep\nPACKAGE BODY pkg AS PROCEDURE run IS BEGIN NULL; END; END;';
 const text=editableObjectDefinition({owner:'APP',name:'PKG',type:'PACKAGE'},source);
 assert.ok(text.startsWith('CREATE OR REPLACE -- keep\nPACKAGE BODY "APP"."PKG" AS'));
 assert.ok(text.endsWith('\n/\n'));
 assert.equal(editableObjectDefinition({type:'TABLE'},'CREATE TABLE t(id NUMBER);'),'CREATE TABLE t(id NUMBER);');
 assert.throws(()=>editableObjectDefinition({type:'PROCEDURE'},''),/unavailable|not available/);
});

test('refresh invalidates only the selected object in its originating session',async()=>{
 let id=0;const broker=new OracleMetadataBroker(()=>String(++id)),a={owner:'APP',name:'A',type:'TABLE'},b={owner:'APP',name:'B',type:'TABLE'};
 const load=async(tab,target)=>{const pending=broker.load(tab,target,null,'definition');broker.handle({type:'completion.reply',requestId:String(id),epoch:0,result:{text:'DDL'}});await pending};
 await load('tab-a',a);await load('tab-a',b);await load('tab-b',a);
 const pending=broker.load('tab-a',a,null,'metadata');broker.invalidate('tab-a',a);assert.equal(await pending,null);
 assert.equal(broker.session('tab-a').cache.size,1);assert.equal(broker.session('tab-b').cache.size,1);assert.equal(broker.session('tab-a').epoch,0);broker.dispose();
});

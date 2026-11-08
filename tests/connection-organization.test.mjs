import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionOrganization,changeConnectionOrganization,filterOrganizedConnections,folderOptions,folderDescendants} from '../src/connectionOrganization.js';

const profiles=[{id:'a',name:'Finance read',user:'REPORT',env:'DEV',host:'db.test'},{id:'b',name:'Finance admin',env:'PROD',group:''}];
test('legacy group labels migrate without changing profile identities or explicit no-group preferences',()=>{
 const org=connectionOrganization(profiles);assert.deepEqual(Object.keys(org.assignments),['a','b']);assert.equal(org.groups[0].name,'Development');assert.deepEqual(org.assignments.b.groupIds,[]);
 assert.equal(connectionOrganization(profiles,org),org);
});
test('folders form a hierarchy while group labels remain independent and multi-valued',()=>{
 let org=connectionOrganization(profiles);org=changeConnectionOrganization(org,{operation:'folder.create',name:'Oracle'});const parent=org.folders[0].id;
 org=changeConnectionOrganization(org,{operation:'folder.create',name:'Finance',parentId:parent});const child=org.folders[1].id;
 org=changeConnectionOrganization(org,{operation:'group.create',name:'Read only'});const groups=org.groups.map(g=>g.id);
 org=changeConnectionOrganization(org,{operation:'profile.assign',profileId:'a',folderId:child,groupIds:groups},profiles);
 assert.deepEqual(folderOptions(org.folders).map(f=>f.path),['Oracle','Oracle / Finance']);assert.equal(folderDescendants(org.folders,parent).has(child),true);
 assert.deepEqual(filterOrganizedConnections(profiles,org,{folderId:parent,groupId:groups[1],search:'report'}).map(p=>p.id),['a']);
 assert.deepEqual(filterOrganizedConnections(profiles,org,{folderId:'__root__'}).map(p=>p.id),['b']);
 assert.throws(()=>changeConnectionOrganization(org,{operation:'folder.move',id:parent,parentId:child}),/descendant/);
 assert.throws(()=>changeConnectionOrganization(org,{operation:'folder.delete',id:child}),/Move/);
 assert.throws(()=>changeConnectionOrganization(org,{operation:'folder.create',name:'finance',parentId:parent}),/already exists/);
 const renamed=changeConnectionOrganization(org,{operation:'group.rename',id:groups[1],name:'Reporting'});
 assert.deepEqual(renamed.assignments.a.groupIds,groups);assert.equal(filterOrganizedConnections(profiles,renamed,{search:'Reporting'}).length,1);
 const removed=changeConnectionOrganization(renamed,{operation:'group.delete',id:groups[1]});assert.deepEqual(removed.assignments.a.groupIds,[groups[0]]);assert.equal(removed.assignments.a.folderId,child);
 assert.equal(org.groups[1].name,'Read only','mutations do not alter the existing state on validation failure');
});

import {validateConnectionName} from '../src/connectionOrganization.js';
test('a connection name is required, bounded and unique apart from the connection itself',()=>{
  assert.deepEqual(validateConnectionName(profiles,'  Reporting  ','a'),{name:'Reporting'});
  assert.deepEqual(validateConnectionName(profiles,'finance READ','a'),{name:'finance READ'},'Its own name in another case');
  assert.match(validateConnectionName(profiles,'  ','a').error,/Enter a connection name/);
  assert.match(validateConnectionName(profiles,'x'.repeat(101),'a').error,/at most 100/);
  assert.match(validateConnectionName(profiles,'FINANCE ADMIN','a').error,/already exists/);
});

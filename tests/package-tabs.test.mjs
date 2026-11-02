import test from 'node:test';
import assert from 'node:assert/strict';
import {packageDocumentGroups,relatedSourceCandidates} from '../src/oracleSourceIdentity.js';
import {packageTabViews,packageViewIds} from '../src/packageTabViews.js';

const document=(id,type,extra={})=>({id,name:`${id}.sql`,path:`C:/work/${id}.sql`,content:`CREATE PACKAGE ${type==='body'?'BODY ':''}billing AS END;\n/`,...extra});
const spec=document('spec','spec'),body=document('body','body');
const context={root:'C:/work'};

test('only reciprocal unambiguous package sources form a logical tab',()=>{
  assert.deepEqual(packageDocumentGroups([spec,body],context),[['spec','body']]);
  assert.deepEqual(packageDocumentGroups([spec,body,document('copy','body')],context),[]);
  assert.deepEqual(packageDocumentGroups([spec,{...body,connectionProfileId:'prod'}],context),[]);
  assert.deepEqual(packageDocumentGroups([spec,{...body,path:'C:/another/body.sql'}],context),[]);
});

test('group views track active source and aggregate unsaved/failed state without mutating documents',()=>{
  const files=[{...spec,dirty:true},{id:'query',name:'query.sql'},body];
  const original=structuredClone(files),groups=[['spec','body']];
  const views=packageTabViews(files,'body',groups);
  assert.equal(views.length,2);
  assert.equal(views[0].id,'body');
  assert.equal(views[0].dirty,true);
  assert.equal(views[0].packageMembers[1].dirty,undefined);
  assert.deepEqual(packageViewIds(views[0]),['spec','body']);
  assert.deepEqual(packageViewIds(views[1]),['query']);
  assert.equal(packageTabViews(files,'spec',groups)[0].viewId,views[0].viewId);
  assert.deepEqual(files,original);
  assert.equal(packageTabViews([body],'body',groups)[0].packageMembers,undefined);
});

test('discovery matches source declarations and honors open unsaved text over disk snapshots',()=>{
  const misleadingName={...body,path:'C:/work/not-billing.sql'};
  assert.equal(relatedSourceCandidates(spec,[],[misleadingName]).length,1);
  assert.equal(relatedSourceCandidates(spec,[{...misleadingName,content:misleadingName.content.replace('billing','other'),dirty:true}],[misleadingName]).length,0);
  assert.equal(relatedSourceCandidates(spec,[],[{...body,content:body.content.replace('billing','other')}]).length,0);
  assert.equal(relatedSourceCandidates(spec,[],[{...body,path:'C:/work/body.pks'}]).length,0);
  const open=relatedSourceCandidates(spec,[{...body,dirty:true}],[body])[0];
  assert.equal(open.alreadyOpen,true);
  assert.equal(open.dirty,true);
});

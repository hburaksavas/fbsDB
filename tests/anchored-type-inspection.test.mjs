import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAnchoredType,metadataFreshness,anchoredColumnType} from '../src/anchoredTypeInspection.js';
import {oracleSymbolInfo} from '../src/oracleLanguageService.js';
const object={owner:'APP',name:'INVOICES',type:'TABLE',columns:[{name:'ID',type:'NUMBER(20,0)'},{name:'Note',type:'VARCHAR2(30)'}]};
test('anchored type inspection resolves columns, row fields and local anchors without guessing other schemas',()=>{
 assert.equal(anchoredColumnType({type:'NUMBER',precision:20,scale:0}),'NUMBER(20,0)');
 assert.equal(anchoredColumnType({type:'VARCHAR2',length:120,characterLength:30,lengthUnit:'CHAR'}),'VARCHAR2(30 CHAR)');
 assert.equal(inspectAnchoredType('app.invoices.id%TYPE','',0,[object],'APP').resolvedType,'NUMBER(20,0)');
 assert.equal(inspectAnchoredType('invoices%ROWTYPE','',0,[object],'APP').fields.length,2);
 assert.match(inspectAnchoredType('invoices%ROWTYPE','',0,[object],'OTHER').error,/unavailable/);
 assert.match(inspectAnchoredType('app.invoices.unknown%TYPE','',0,[object],'APP').error,/column metadata/);
 const source='DECLARE a NUMBER(10); b a%TYPE; BEGIN b := a; END;';
 assert.equal(inspectAnchoredType('a%TYPE',source,source.indexOf('BEGIN'),[],'').resolvedType,'NUMBER(10)');
 assert.match(metadataFreshness({...object,metadataExpiresAt:1}),/Stale/);assert.match(metadataFreshness(object),/age unknown/);
});
test('local variable hover shows resolved anchored types, row fields and explicit freshness limitations',()=>{
 const source='DECLARE v_id app.invoices.id%TYPE; v_row app.invoices%ROWTYPE; BEGIN v_id := v_row.id; END;';
 const id=oracleSymbolInfo(source,source.lastIndexOf('v_id')+2,{objects:[object],currentSchema:'APP'});assert.match(id.contents.map(c=>c.value).join(' '),/Resolved type: NUMBER/);assert.match(id.contents.map(c=>c.value).join(' '),/freshness is unverified/);
 const row=oracleSymbolInfo(source,source.lastIndexOf('v_row')+2,{objects:[object],currentSchema:'APP'});assert.match(row.contents.map(c=>c.value).join(' '),/Record fields/);assert.match(row.contents.map(c=>c.value).join(' '),/VARCHAR2/);
});

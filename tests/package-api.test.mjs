import test from 'node:test';
import assert from 'node:assert/strict';
import {packageApi} from '../src/packageApi.js';
const content=`CREATE OR REPLACE PACKAGE app.demo AS
-- Public record documentation.
TYPE item_rec IS RECORD (id NUMBER, name VARCHAR2(30));
SUBTYPE short_name IS VARCHAR2(20);
-- Executes the public action.
PROCEDURE act(p IN OUT NOCOPY item_rec, count IN NUMBER DEFAULT 3);
PROCEDURE act(p IN VARCHAR2);
FUNCTION lookup(id NUMBER := 42) RETURN item_rec;
END demo;`;
test('package API retains overloads, public types, exact defaults, modes, documentation and source links',()=>{
 const api=packageApi({content,path:'D:/demo.pks',dirty:true});
 assert.equal(api.error,'');assert.equal(api.entries.length,5);assert.equal(api.entries.find(e=>e.name==='short_name').kind,'SUBTYPE');assert.equal(api.entries.filter(e=>e.name==='act').length,2);
 const act=api.entries.find(e=>e.name==='act');assert.match(act.signature,/DEFAULT 3/);assert.match(act.signature,/NOCOPY/);assert.equal(act.parameters[0].mode,'IN OUT');assert.equal(act.parameters[1].optional,true);assert.match(act.documentation,/public action/);assert.equal(content.slice(act.start,act.start+9),'PROCEDURE');
 assert.match(api.entries[0].documentation,/record documentation/);assert.equal(api.entries.find(e=>e.name==='lookup').returnType,'item_rec');assert.match(api.origin,/Local file · unsaved/);
 assert.match(packageApi({content,definitionObject:{owner:'APP'}}).origin,/Database definition/);
});
test('package API refuses bodies, incomplete specifications and never exposes private implementation',()=>{
 const body=packageApi({content:'CREATE PACKAGE BODY demo AS PROCEDURE private_impl IS BEGIN NULL; END; END;'});
 assert.equal(body.entries.length,0);assert.match(body.error,/bodies are excluded/);
 const incomplete=packageApi({content:'CREATE PACKAGE demo AS PROCEDURE act(p NUMBER);'});assert.equal(incomplete.entries.length,0);assert.match(incomplete.error,/incomplete/);
});

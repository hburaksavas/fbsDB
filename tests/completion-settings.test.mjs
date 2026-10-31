import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultCompletionSettings,normalizeCompletionSettings} from '../src/editorCompletionSettings.js';
import {automaticCompletionAllowed} from '../src/oracleCompletion.js';
import {oracleLanguageCompletions} from '../src/oracleLanguageService.js';
import {loadSettings,changeSetting,saveSettings,resolveSetting,settingDefinitions} from '../src/settingsModel.js';

test('completion settings retain old preferences and normalize new controls',()=>{
 const result=normalizeCompletionSettings({acceptEnter:false,inline:false,minCharacters:99,maxSuggestions:500,showFunctions:false});
 assert.equal(result.acceptEnter,false);assert.equal(result.inline,false);
 assert.equal(result.minCharacters,4);assert.equal(result.maxSuggestions,300);
 assert.equal(result.showFunctions,false);assert.equal(result.showKeywords,true);
 assert.equal(normalizeCompletionSettings({minCharacters:1.5}).minCharacters,0);
});

test('minimum characters gates automatic suggestions while explicit qualified/manual requests still work',()=>{
 for(const [source,expected] of [['SELECT T',false],['SELECT TO_C',true],['SELECT x.',true],["SELECT 'TO_C",false],['SELECT :TO_C',false]])assert.equal(automaticCompletionAllowed(source,source.length,{minCharacters:3}),expected,source);
 const source='SELECT T',settings={minCharacters:3};
 assert.equal(oracleLanguageCompletions(source,source.length,{settings,automatic:true}).candidates.length,0);
 assert.ok(oracleLanguageCompletions(source,source.length,{settings,manual:true}).candidates.length>0);
});

test('source filters apply to continuations, functions, SQL fields and PL/SQL record fields',()=>{
 const complete=(source,settings,extra={})=>oracleLanguageCompletions(source,source.indexOf('|'),{settings,...extra}).candidates;
 const functions=complete('SELECT TO_|',{showFunctions:false});assert.ok(!functions.some(c=>c.kind==='function'));
 const keywords=complete('sel|',{showKeywords:false});assert.ok(!keywords.some(c=>c.kind==='keyword'));
 const source='SELECT t.| FROM items t';
 const extra={objects:[{owner:'APP',type:'TABLE',name:'ITEMS',columns:[{name:'ID',type:'NUMBER'}]}],currentSchema:'APP'};
 assert.ok(complete(source,{},extra).some(c=>c.label==='ID'));
 assert.ok(!complete(source,{showColumns:false},extra).some(c=>c.kind==='field'));
 const record='DECLARE TYPE r IS RECORD (id NUMBER); item r; BEGIN item.|; END;';
 assert.ok(complete(record,{}).some(c=>c.kind==='field'));
 assert.ok(!complete(record,{showColumns:false}).some(c=>c.kind==='field'));
});

test('suggestion limit is applied after enriching and filtering candidates',()=>{
 const objects=Array.from({length:120},(_,i)=>({owner:'APP',name:'TABLE_'+i,type:'TABLE',columns:[]}));
 const source='SELECT * FROM ';
 const result=oracleLanguageCompletions(source,source.length,{objects,currentSchema:'APP',settings:{maxSuggestions:50}});
 assert.equal(result.candidates.length,50);
 assert.ok(result.candidates.every(c=>c.kind==='class'));
});

test('Completion reset and persistence are independent of Style and Formatter',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 let settings=loadSettings(storage);
 settings=changeSetting(settings,'editor.cursorStyle','block');
 settings=changeSetting(settings,'editor.sqlFormatter',{keywordCase:'lower'});
 settings=changeSetting(settings,'editor.completion',{...defaultCompletionSettings,minCharacters:2,maxSuggestions:50,acceptEnter:false});
 saveSettings(storage,settings);settings=loadSettings(storage);
 assert.equal(resolveSetting(settings,'editor.completion').value.acceptEnter,false);
 assert.equal(resolveSetting(settings,'editor.completion').value.maxSuggestions,50);
 assert.equal(settingDefinitions['editor.completion'].category,'completion');
 settings=changeSetting(settings,'editor.completion',undefined);
 assert.equal(resolveSetting(settings,'editor.completion').value.minCharacters,0);
 assert.equal(resolveSetting(settings,'editor.cursorStyle').value,'block');
 assert.equal(resolveSetting(settings,'editor.sqlFormatter').value.keywordCase,'lower');
});

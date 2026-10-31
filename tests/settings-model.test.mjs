import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSettings,saveSettings,SETTINGS_KEY,resolveSetting,changeSetting,changeRegionalFormats,newResultDefaults,saveResultDefaults,resultPageSizes,importSettingsDocument,settingDefinitions} from '../src/settingsModel.js';
import {formatResultValue,copyResultData,matchesCondition} from '../src/resultFeatures.js';
import {getVisibleResultRows} from '../src/resultRows.js';
import {projectDisplayExport} from '../src/resultPresentationData.js';
import {languageLabel,regionLabel} from '../src/localeProfile.js';

const storage=(entries={})=>{const data=new Map(Object.entries(entries));return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key),data};};
test('settings migrate legacy page size and preserve user/workspace precedence with scoped reset',()=>{
 const target=storage({'fbsdb.maxRows':'5000'});let settings=loadSettings(target);
 assert.equal(resolveSetting(settings,'results.pageSize').value,5000);
 settings=changeSetting(settings,'results.density','comfortable');
 assert.throws(()=>changeSetting(settings,'results.density','compact','workspace','D:/SQL'),/Unsupported setting scope/);
 settings.workspaces['d:/sql']={'results.density':'compact'};
 assert.equal(resolveSetting(settings,'results.density','d:/sql').value,'comfortable');
 delete settings.workspaces['d:/sql'];
 assert.equal(resolveSetting(settings,'export.encoding').source,'product');
 saveSettings(target,settings);assert.deepEqual(loadSettings(target),settings);
});
test('default snapshots exclude transforms, selections, SQL, column-name formats and raw data',()=>{
 let settings=loadSettings(storage());
 settings=saveResultDefaults(settings,{density:'comfortable',decimals:2,pivot:true,split:true,transpose:true,filters:[{value:'secret'}],columnFormats:{0:{locale:'tr-TR'}},exportSettings:{delimiter:';',password:'secret'},rows:[['secret']]});
 const first=newResultDefaults(settings),second=newResultDefaults(settings);
 for(const key of ['pivot','split','transpose','filters','columnFormats','rows'])assert.ok(!(key in first));
 assert.equal(first.density,'comfortable');assert.equal(first.exportSettings.delimiter,';');
 first.exportSettings.delimiter='|';assert.equal(second.exportSettings.delimiter,';');
 assert.ok(!JSON.stringify(settings).includes('secret'));
 const precise='12345678901234567890123456789012345678';
 assert.equal(copyResultData([[precise]],[{name:'N',type:'NUMBER'}],'tsv'),precise);
 assert.equal(formatResultValue(null,'VARCHAR2',{nullLabel:'(null)'}),'(null)');
 assert.equal(formatResultValue('','VARCHAR2',{emptyLabel:'(empty)'}),'(empty)');
});
test('invalid persisted settings and unsupported future versions cannot corrupt saved preferences',()=>{
 const target=storage({[SETTINGS_KEY]:JSON.stringify({version:1,user:{'results.density':'huge','results.pageSize':123,'export.delimiter':'DROP TABLE'},workspaces:{}})});
 assert.equal(resolveSetting(loadSettings(target),'results.density').value,'compact');
 const future=storage({[SETTINGS_KEY]:'{"version":99,"user":{"unknown":"preserved"}}'}),settings=loadSettings(future);
 assert.equal(settings.readOnly,true);saveSettings(future,settings);assert.ok(future.getItem(SETTINGS_KEY).includes('preserved'));
 assert.throws(()=>changeSetting(settings,'results.wrap',true),/newer app/);
 assert.throws(()=>changeSetting(loadSettings(storage()),'results.columnWidth',-10),/Invalid/);
});

test('legacy editor preferences migrate once and cannot reappear after a scoped reset',()=>{
 const target=storage({'fbsdb.theme':'dark','fbsdb.autoCompletion':'false','fbsdb.codeStyle':'{"fontSize":17,"tabSize":2,"insertSpaces":false}','fbsdb.queryTimeout':'30'});
 let settings=loadSettings(target);
 assert.equal(resolveSetting(settings,'ui.theme').value,'dark');
 assert.equal(resolveSetting(settings,'editor.fontSize').value,17);
 assert.equal(resolveSetting(settings,'editor.insertSpaces').value,false);
 assert.equal(resolveSetting(settings,'editor.completion').value.popup,false);
 settings=changeSetting(settings,'ui.theme',undefined);saveSettings(target,settings);
 assert.equal(resolveSetting(loadSettings(target),'ui.theme').source,'product');
 assert.equal(target.getItem('fbsdb.theme'),'dark');
 assert.throws(()=>changeSetting(settings,'ui.theme','light','workspace','d:/sql'),/scope/);
});

test('display-text export is explicit, projected by original column index and leaves raw data intact',()=>{
 const display={columns:[{name:'A',type:'NUMBER'},{name:'B',type:'VARCHAR2'}],rows:[['12345678901234567890123456789012345678',null]],visibleColumns:[1,0]};
 const raw=projectDisplayExport(display);assert.equal(raw.rows[0][1],display.rows[0][0]);assert.equal(raw.rows[0][0],null);
 const formatted=projectDisplayExport(display,null,{nullLabel:'(NULL)',exportSettings:{formatted:true},columnFormats:{0:{decimals:2}}});
 assert.equal(formatted.rows[0][0],'(NULL)');assert.match(formatted.rows[0][1],/12345678901234567890123456789012345678/);
 assert.ok(formatted.columns.every(column=>column.type==='VARCHAR2'));
 assert.equal(display.rows[0][1],null);assert.equal(display.columns[0].type,'NUMBER');
});
test('changing a page-size default affects future executions while preserving an existing result page size',()=>{
 const settings=changeSetting(loadSettings(storage()),'results.pageSize',5000);
 assert.deepEqual(resultPageSizes(settings,null,{}, {executionPageSize:500}),{current:500,next:5000});
 assert.deepEqual(resultPageSizes(settings,null,{pageSizePreference:1000},{executionPageSize:500}),{current:1000,next:1000});
 assert.deepEqual(resultPageSizes(settings,null,{}),{current:5000,next:5000});
});
test('local Turkish comparison preferences preserve dotted/dotless I while keeping raw values intact',()=>{
 const rows=[['I'],['ı'],['İ'],['i']],columns=[{name:'VALUE',type:'VARCHAR2'}];
 assert.deepEqual(getVisibleResultRows(rows,columns,'ı',-1,'asc',[],{sortLocale:'tr-TR'}).map(item=>item.row[0]),['I','ı']);
 assert.deepEqual(getVisibleResultRows(rows,columns,'İ',-1,'asc',[],{sortLocale:'tr-TR'}).map(item=>item.row[0]),['İ','i']);
 assert.equal(matchesCondition('I',{op:'equals',value:'ı',locale:'tr-TR'}),true);
 assert.equal(matchesCondition('I',{op:'equals',value:'ı',locale:'tr-TR',caseSensitive:true}),false);
 assert.deepEqual(rows,[['I'],['ı'],['İ'],['i']]);
});
test('Turkish language and region labels render as valid Unicode',()=>{
 assert.equal(languageLabel('tr'),'Türkçe');
 assert.equal(regionLabel('tr-TR'),'Türkçe (Türkiye)');
 assert.doesNotMatch(`${languageLabel('tr')} ${regionLabel('tr-TR')}`,/[ÃÄÅ]/);
});

test('changing regional formats refreshes table selections without resetting unrelated preferences',()=>{
 let settings=loadSettings(storage());
 for(const [id,value] of Object.entries({'results.locale':'en-US','results.sortLocale':'en-US','results.grouping':false,'results.dateFormat':'raw','results.wrap':true,'results.decimals':3,'export.delimiter':'|'}))settings=changeSetting(settings,id,value);
 settings.workspaces['d:/sql']={'results.locale':'de-DE'};
 settings.workspaces['d:/sql']['results.dateFormat']='iso';
 settings.workspaces['d:/other']={'results.locale':'en-GB'};
 settings=changeRegionalFormats(settings,'tr-TR','D:/SQL');
 const options=newResultDefaults(settings,'D:/SQL');
 assert.equal(options.locale,'tr-TR');assert.equal(options.sortLocale,'tr-TR');
 assert.equal(options.grouping,true);assert.equal(options.dateFormat,'local');
 assert.equal(options.wrap,true);assert.equal(options.decimals,3);
 assert.equal(options.exportSettings.delimiter,'|');
 assert.equal(resolveSetting(settings,'results.locale','D:/Other').value,'tr-TR');
 settings=changeRegionalFormats(settings,'system','D:/SQL');
 assert.equal(newResultDefaults(settings,'D:/SQL',{region:'de-DE'}).locale,'de-DE');
 assert.equal(settingDefinitions['ui.region'].category,'results');
});

test('export settings are global across workspaces, including legacy imports and result defaults saves',()=>{
 const parsed={version:2,user:{'export.delimiter':';'},workspaces:{'D:/SQL':{'export.delimiter':'|','export.encoding':'utf-16','results.wrap':true}}};
 for(const settings of [loadSettings(storage({[SETTINGS_KEY]:JSON.stringify(parsed)})),importSettingsDocument(JSON.stringify(parsed))]){
  assert.equal(newResultDefaults(settings,'D:/SQL').exportSettings.delimiter,';');
  assert.equal(newResultDefaults(settings,'D:/Other').exportSettings.delimiter,';');
  assert.equal(newResultDefaults(settings,'D:/SQL').exportSettings.encoding,'utf-8');
  assert.equal(newResultDefaults(settings,'D:/SQL').wrap,false);
  assert.throws(()=>changeSetting(settings,'export.format','json','workspace','D:/SQL'),/Unsupported setting scope/);
  const next=saveResultDefaults(settings,{wrap:false,exportSettings:{format:'json'}},'workspace','D:/SQL');
  assert.equal(newResultDefaults(next,'D:/Other').exportSettings.format,'json');
  assert.equal(newResultDefaults(next,'D:/SQL').wrap,false);assert.equal(newResultDefaults(next,'D:/Other').wrap,false);
 }
 // A stale in-memory workspace layer cannot override global export preferences either.
 assert.equal(resolveSetting(parsed,'export.delimiter','D:/SQL').value,';');
});

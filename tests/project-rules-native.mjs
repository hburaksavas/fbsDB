import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {connectNativePage} from './nativeCdp.mjs';
import {desktopRegressionFixture} from './desktopRegressionFixture.mjs';

const [endpoint,directory]=process.argv.slice(2);
assert.ok(endpoint&&directory,'Run scripts/test-desktop.ps1 -ProjectRulesTest.');
const root=path.resolve(directory),files=path.join(root,'files'),quote=JSON.stringify;
assert.equal(JSON.parse(await readFile(path.join(root,'settings.json'),'utf8')).lastWorkspace,files,'Only an isolated workspace may be tested.');
for(const folder of ['spec','impl','tests'])await mkdir(path.join(files,folder),{recursive:true});
const specFile=path.join(files,'spec','billing.spec'),bodyFile=path.join(files,'impl','billing.impl'),testFile=path.join(files,'tests','test_billing.sql');
const spec='CREATE PACKAGE billing AS\n  PROCEDURE run;\nEND;\n/',body='CREATE PACKAGE BODY billing AS\n  PROCEDURE run IS BEGIN NULL; END;\nEND;\n/';
await writeFile(specFile,spec);await writeFile(bodyFile,body);await writeFile(testFile,'BEGIN billing.run; END;\n/');
for(const dir of ['first/reports','second/reports']){await mkdir(path.join(files,dir),{recursive:true});await writeFile(path.join(files,dir,'q.sql'),'SELECT 1 FROM dual;')}

const cdp=await connectNativePage(endpoint),checks=[];
const editor=`window.monaco?.editor.getEditors().find(editor=>document.contains(editor.getDomNode()))`;
let installed,failure;
async function check(name,operation){await operation();assert.deepEqual(await cdp.evaluate('window.__desktopRegression.errors'),[]);assert.deepEqual(await cdp.evaluate('window.__desktopRegression.blocked'),[]);checks.push(name);console.log('PASS '+name)}
async function fill(selector,value){await cdp.evaluate(`(()=>{const input=document.querySelector(${quote(selector)});if(!input)throw Error('Missing input');const prototype=input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,${quote(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);await cdp.frame()}
async function openRules(){await cdp.key('p',10);await cdp.until(`document.querySelector('[aria-label="Search workbench"]')`);await fill('[aria-label="Search workbench"]','Configure project rules');await cdp.key('Enter');await cdp.until(`document.querySelector('[aria-label="Extension 1"]')`)}
async function expectSql(value){await cdp.until(`${editor}?.getValue().split(String.fromCharCode(13)).join('')===${quote(value)}`,'Source text')}
try{
  await cdp.until(`location.hostname==='fbsdb.local'&&document.readyState!=='loading'`);
  installed=await cdp.call('Page.addScriptToEvaluateOnNewDocument',{source:desktopRegressionFixture(files,true)+`;localStorage.setItem('fbsdb.onboardingSeen','true');localStorage.removeItem('fbsdb.sqlDrafts');`});
  await cdp.call('Page.reload');await cdp.until(`window.__desktopRegression?.ready&&${editor}&&window.__desktopRegression.replies.some(reply=>reply.type==='workspace.state')`,'Workspace startup',60000);
  await check('project rules: real UI saves custom associations and path conventions',async()=>{
    await openRules();
    await cdp.textClick('.project-rules-dialog button','Add association');await fill('[aria-label="Extension 7"]','.spec');await fill('[aria-label="Source type 7"]','PACKAGE');
    await cdp.textClick('.project-rules-dialog button','Add association');await fill('[aria-label="Extension 8"]','.impl');await fill('[aria-label="Source type 8"]','PACKAGE BODY');
    await cdp.textClick('.project-rules-dialog button','Add path pair');await fill('[aria-label="Specification path 1"]','spec/{name}.spec');await fill('[aria-label="Body path 1"]','impl/{name}.impl');
    await fill('[aria-label="Project packages folder"]','spec');await fill('[aria-label="Project query timeout"]','17');await fill('[aria-label="Project page size"]','500');
    await cdp.textClick('.project-rules-dialog button','Add project variable');await fill('[aria-label="Project variable name 1"]','customer_id');await fill('[aria-label="Project variable type 1"]','NUMBER');await fill('[aria-label="Project variable description 1"]','Customer identifier');
    await fill('[aria-label="Project naming style"]','upper');await cdp.textClick('.project-rules-dialog button','Add dictionary term');await fill('[aria-label="Dictionary term 1"]','customer');await fill('[aria-label="Dictionary abbreviation 1"]','cust');await fill('[aria-label="Dictionary aliases 1"]','custmer,client');
    await cdp.textClick('.project-rules-dialog button','Save project rules');await cdp.until(`!document.querySelector('.project-rules-dialog')`,'Saved rules');
    const settings=JSON.parse(await readFile(path.join(files,'.fbsdb','workspace.json'),'utf8'));
    assert.equal(settings.projectRules.associations.at(-1).type,'PACKAGE BODY');
    assert.equal(settings.projectRules.project.variables[0].name,'CUSTOMER_ID');assert.equal(settings.projectRules.project.run.timeoutSeconds,17);assert.equal(settings.projectRules.project.areas.packages,'spec');
    assert.deepEqual(settings.projectRules.project.dictionary,{style:'upper',terms:[{name:'customer',abbreviation:'cust',aliases:'custmer,client'}]});
    await openRules();assert.equal(await cdp.evaluate(`document.querySelector('[aria-label="Extension 7"]').value`),'.spec');await cdp.textClick('.project-rules-dialog button','Cancel');
  });
  await check('discovery: unopened custom package body is selected explicitly and grouped',async()=>{
    await cdp.evaluate(`window.__desktopRegression.post({type:'command',id:'qa-open-spec',tabId:'tab-1',command:'file.openPath',payload:{path:${quote(specFile)}}})`);await expectSql(spec);
    await cdp.textClick('.oracle-source-header button','Find related sources…');await cdp.until(`document.querySelector('.related-source-list button')`,'Discovery results');
    await cdp.evaluate(`(()=>{const button=[...document.querySelectorAll('.related-source-list button')].find(button=>button.textContent.includes(${quote(bodyFile)}));if(!button)throw Error('Body not discovered');button.click()})()`);await expectSql(body);
    await cdp.until(`document.querySelectorAll('[role="tab"][aria-label*="package specification and body"]').length===1`,'One logical package tab');
  });
  await check('package views: independent unsaved text and caret positions survive switching',async()=>{
    await cdp.click('[aria-label="Switch to specification"]');await expectSql(spec);
    await cdp.evaluate(`(()=>{const editor=${editor};editor.setValue(${quote(spec+'\n-- spec edit')});editor.setPosition({lineNumber:2,column:3});editor.focus()})()`);
    await cdp.key('o',1);await expectSql(body);
    await cdp.evaluate(`(()=>{const editor=${editor};editor.setValue(${quote(body+'\n-- body edit')});editor.setPosition({lineNumber:3,column:2});editor.focus()})()`);
    await cdp.key('o',1);await expectSql(spec+'\n-- spec edit');
    assert.deepEqual(await cdp.evaluate(`${editor}.getPosition()`),{lineNumber:2,column:3});
    assert.equal(await cdp.evaluate(`document.querySelectorAll('.package-source-views button').length`),2);
  });
  await check('group lifecycle: cancel close and save only the active package document',async()=>{
    await cdp.click('[aria-label="Close both package sources"]');
    await cdp.until(`[...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].some(dialog=>dialog.textContent.includes('Close 2 unsaved editors'))`,'Grouped close review');
    await cdp.textClick('[role="dialog"] button,[role="alertdialog"] button','Cancel');
    assert.equal(await cdp.evaluate(`document.querySelectorAll('[role="tab"][aria-label*="package specification and body"]').length`),1);
    await cdp.click('[aria-label="Switch to body"]');await expectSql(body+'\n-- body edit');
    await cdp.evaluate(`${editor}.focus()`);await cdp.key('s',2);
    await cdp.until(`document.querySelector('.editor-save-button')?.textContent.trim()==='Saved'`,'Body saved');
    assert.equal((await readFile(bodyFile,'utf8')).replace(/\r\n/g,'\n'),body+'\n-- body edit');
    assert.equal(await readFile(specFile,'utf8'),spec,'Saving the body must not save the specification.');
    await cdp.click('[aria-label="Switch to specification"]');await expectSql(spec+'\n-- spec edit');
    assert.match(await cdp.evaluate(`document.querySelector('.editor-save-button').textContent`),/Unsaved/);
  });
  await check('related tests: configured test opens without running SQL',async()=>{
    await cdp.evaluate(`${editor}.focus()`);await cdp.key('O',9);await cdp.until(`document.querySelector('.related-source-list button')`);
    await cdp.evaluate(`(()=>{const button=[...document.querySelectorAll('.related-source-list button')].find(button=>button.textContent.includes(${quote(testFile)}));if(!button)throw Error('Test not discovered');button.click()})()`);
    await expectSql('BEGIN billing.run; END;\n/');
  });
  await check('reverse related tests: test returns explicitly to unsaved source without SQL execution',async()=>{
    await cdp.evaluate(`${editor}.focus()`);await cdp.key('O',9);await cdp.until(`document.querySelector('.related-source-list button')`);
    await cdp.evaluate(`(()=>{const button=[...document.querySelectorAll('.related-source-list button')].find(button=>button.textContent.includes(${quote(specFile)}));if(!button)throw Error('Specification not discovered from test');button.click()})()`);
    await expectSql(spec+'\n-- spec edit');
  });

  await check('file structure: filter nested routine/type/cursor symbols and navigate without SQL',async()=>{
    const source='CREATE PACKAGE BODY billing AS\n TYPE row_t IS RECORD(id NUMBER);\n CURSOR invoices IS SELECT 1 FROM dual;\n PROCEDURE run IS BEGIN NULL; END;\nEND;\n/';
    await cdp.evaluate(`${editor}.setValue(${quote(source)})`);
    await cdp.key('p',10);await cdp.until(`document.querySelector('[aria-label="Search workbench"]')`);await fill('[aria-label="Search workbench"]','Show file structure panel');await cdp.key('Enter');
    await cdp.until(`document.querySelector('[aria-label="File structure"]')`,'Structure panel');
    await cdp.until(`document.querySelector('.file-structure-symbols').textContent.includes('invoices')`,'Worker structure');
    await fill('[aria-label="File structure symbol kind"]','CURSOR');
    assert.equal(await cdp.evaluate(`document.querySelectorAll('.file-structure-symbols button').length`),1);
    await fill('[aria-label="Filter file structure"]','absent');await cdp.until(`document.querySelector('.file-structure-symbols [role="status"]')`);
    await fill('[aria-label="Filter file structure"]','invoices');await cdp.click('.file-structure-symbols button');
    await cdp.until(`${editor}.getPosition().lineNumber===3`,'Cursor declaration location');
    assert.equal(await cdp.evaluate(`${editor}.hasTextFocus()`),true);
  });

  await check('quick documentation: actual Monaco signature widget shows comments, example call and active argument',async()=>{
    const source='DECLARE\n -- Resolves a customer account.\n FUNCTION lookup_customer(p_name VARCHAR2,p_region NUMBER) RETURN NUMBER IS BEGIN RETURN 1; END;\nBEGIN\n lookup_customer(NULL, );\nEND;';
    await cdp.evaluate(`(()=>{const editor=${editor};editor.setValue(${quote(source)});editor.setPosition(editor.getModel().getPositionAt(${source.indexOf(', )')+2}));editor.focus();editor.trigger('qa','editor.action.triggerParameterHints',{})})()`);
    await cdp.until(`document.querySelector('.parameter-hints-widget')?.textContent.includes('p_region')`,'Monaco parameter hints');
    const text=await cdp.evaluate(`document.querySelector('.parameter-hints-widget').textContent`);
    assert.match(text,/Resolves a customer account/);assert.match(text,/Example call/);assert.match(text,/:return_value := LOOKUP_CUSTOMER/);
    assert.match(await cdp.evaluate(`document.querySelector('.parameter-hints-widget .parameter.active')?.textContent`),/p_region/);
    await cdp.key('Escape');
  });

  await check('local navigation: F12, back/forward and Shift+F12 use scoped symbol locations',async()=>{
    const source='DECLARE\n value NUMBER;\nBEGIN\n value := value+1;\nEND;';
    await cdp.evaluate(`(()=>{const editor=${editor};editor.setValue(${quote(source)});editor.setPosition({lineNumber:4,column:3});editor.focus()})()`);
    await cdp.key('F12');await cdp.until(`${editor}.getPosition().lineNumber===2`,'F12 local definition');
    await cdp.key('ArrowLeft',1);await cdp.until(`${editor}.getPosition().lineNumber===4`,'Navigate back');
    await cdp.key('ArrowRight',1);await cdp.until(`${editor}.getPosition().lineNumber===2`,'Navigate forward');
    await cdp.evaluate(`${editor}.setPosition({lineNumber:4,column:3});${editor}.focus()`);await cdp.key('F12',8);
    await cdp.until(`document.querySelector('.reference-zone-widget')?.textContent.includes('value')`,'Shift F12 reference results');
    assert.match(await cdp.evaluate(`document.querySelector('.reference-zone-widget').textContent`),/3/);
    await cdp.key('Escape');
  });

  await check('project context: explicit run defaults and new project file apply settings without execution or connection',async()=>{
    await cdp.key('p',10);await cdp.until(`document.querySelector('[aria-label="Search workbench"]')`);await fill('[aria-label="Search workbench"]','Use project run defaults');await cdp.key('Enter');
    assert.equal(await cdp.evaluate(`document.querySelector('[aria-label="Rows per result page"]').value`),'500');
    await cdp.textClick('[aria-label="Explorer view"] button','Files');await fill('[aria-label="Project area"]','packages');assert.match(await cdp.evaluate(`document.querySelector('[aria-label="Project area"]').selectedOptions[0].textContent`),/spec/);
    await cdp.key('p',10);await cdp.until(`document.querySelector('[aria-label="Search workbench"]')`);await fill('[aria-label="Search workbench"]','New project SQL file');await cdp.key('Enter');
    await expectSql('');assert.equal(await cdp.evaluate(`document.querySelector('[aria-label="Rows per result page"]').value`),'500');
    assert.equal(await cdp.evaluate(`window.__desktopRegression.commands.some(command=>command.command==='sql.execute'||command.command==='connection.connect')`),false);
  });

  await check('same-basename tabs: shortest distinguishing paths and full-path tooltips preserve independent documents',async()=>{
    for(const folder of ['first','second']){
      const file=path.join(files,folder,'reports','q.sql');
      await cdp.evaluate(`window.__desktopRegression.post({type:'command',id:'qa-open-${folder}',tabId:document.querySelector('.file-tab.active').dataset.editorTab,command:'file.openPath',payload:{path:${quote(file)}}})`);
      await cdp.until(`document.querySelector('.file-tab.active .file-tab-name')?.textContent==='q.sql'`);
    }
    await cdp.until(`[...document.querySelectorAll('.file-tab')].filter(tab=>tab.querySelector('.file-tab-name')?.textContent==='q.sql'&&tab.querySelector('.file-tab-path')).length===2`,'Disambiguated paths');
    assert.deepEqual(await cdp.evaluate(`[...document.querySelectorAll('.file-tab')].filter(tab=>tab.querySelector('.file-tab-name')?.textContent==='q.sql').map(tab=>tab.querySelector('.file-tab-path').textContent).sort()`),['first/reports','second/reports']);
    assert.ok(await cdp.evaluate(`[...document.querySelectorAll('.file-tab')].filter(tab=>tab.querySelector('.file-tab-name')?.textContent==='q.sql').every(tab=>(tab.querySelector('.file-tab-path').dataset.appTooltip||tab.querySelector('.file-tab-path').title).includes('q.sql'))`));
  });

  await check('batch close: independent save/keep/discard decisions use native acknowledgements and preserve kept buffers',async()=>{
    const fixtureDir=path.join(files,'batch');await mkdir(fixtureDir,{recursive:true});
    const identities={};
    for(const name of ['save','keep','discard']){
      const file=path.join(fixtureDir,name+'.sql');await writeFile(file,'SELECT 1 FROM dual;');
      await cdp.evaluate(`window.__desktopRegression.post({type:'command',id:'qa-batch-${name}',tabId:document.querySelector('.file-tab.active').dataset.editorTab,command:'file.openPath',payload:{path:${quote(file)}}})`);
      await cdp.until(`document.querySelector('.file-tab.active .file-tab-name')?.textContent===${quote(name+'.sql')}`);
      identities[name]=await cdp.evaluate(`document.querySelector('.file-tab.active').dataset.editorTab`);
      await cdp.evaluate(`${editor}.setValue(${quote('SELECT '+({save:2,keep:3,discard:4}[name])+' FROM dual;')})`);
    }
    await cdp.evaluate(`(()=>{const tab=document.querySelector('.file-tab.active'),r=tab.getBoundingClientRect();tab.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:r.left+8,clientY:r.top+8}))})()`);
    await cdp.until(`document.querySelector('[aria-label="Tab actions"]')`);await cdp.textClick('[aria-label="Tab actions"] button','Close All');
    await cdp.until(`document.querySelector('.batch-close-dialog')`,'Per-document close review');
    const ids=await cdp.evaluate(`[...document.querySelectorAll('.batch-close-row')].map(row=>row.dataset.closeTab)`);
    for(const id of ids)await fill('[data-close-tab='+quote(id)+'] select','keep');
    await fill('[data-close-tab='+quote(identities.save)+'] select','save');await fill('[data-close-tab='+quote(identities.discard)+'] select','discard');
    await cdp.textClick('.batch-close-dialog footer button','Apply close choices');
    await cdp.until(`!document.querySelector('[data-editor-tab='+CSS.escape(${quote(identities.save)})+']')&&!document.querySelector('[data-editor-tab='+CSS.escape(${quote(identities.discard)})+']')`,'Chosen close completion');
    assert.equal(await readFile(path.join(fixtureDir,'save.sql'),'utf8'),'SELECT 2 FROM dual;');
    assert.equal(await readFile(path.join(fixtureDir,'discard.sql'),'utf8'),'SELECT 1 FROM dual;');
    assert.equal(await readFile(path.join(fixtureDir,'keep.sql'),'utf8'),'SELECT 1 FROM dual;');
    await cdp.click('[data-editor-tab='+quote(identities.keep)+'] [role="tab"]');await expectSql('SELECT 3 FROM dual;');
    assert.match(await cdp.evaluate(`document.querySelector('.editor-save-button').textContent`),/Unsaved/);
  });

  await check('edit locations: dedicated previous/next/last shortcuts navigate actual edit anchors',async()=>{
    const source='BEGIN\n'+Array(60).fill('  NULL;').join('\n')+'\nEND;';
    await cdp.evaluate(`${editor}.setValue(${quote(source)})`);
    for(const line of [2,45])await cdp.evaluate(`(()=>{const editor=${editor};editor.setPosition({lineNumber:${line},column:3});editor.executeEdits('qa',[{range:new window.monaco.Range(${line},3,${line},3),text:'-- edited '}]);editor.focus()})()`);
    await cdp.evaluate(`${editor}.setPosition({lineNumber:1,column:1})`);
    await cdp.key('PageUp',3);await cdp.until(`${editor}.getPosition().lineNumber===45`,'Latest edit');
    await cdp.key('PageUp',3);await cdp.until(`${editor}.getPosition().lineNumber===2`,'Previous edit');
    await cdp.key('PageDown',3);await cdp.until(`${editor}.getPosition().lineNumber===45`,'Next edit');
    await cdp.evaluate(`${editor}.setPosition({lineNumber:1,column:1})`);await cdp.key('Home',3);await cdp.until(`${editor}.getPosition().lineNumber===45`,'Return to last edit');
  });

  await check('long package navigation: breadcrumb siblings, sticky headers, named regions and routine focus use real Monaco structure',async()=>{
    const source='CREATE PACKAGE BODY demo AS\n PROCEDURE first IS\n BEGIN\n -- #region Work\n'+Array(65).fill('  NULL;').join('\n')+'\n -- #endregion\n END;\n PROCEDURE second IS\n BEGIN\n'+Array(45).fill('  NULL;').join('\n')+'\n END;\nEND;';
    const secondLine=source.slice(0,source.indexOf(' PROCEDURE second')).split('\n').length,lastLine=source.split('\n').length;
    await cdp.evaluate(`${editor}.setValue(${quote(source)});${editor}.setPosition({lineNumber:20,column:3});${editor}.revealLineInCenter(35)`);
    await cdp.until(`document.querySelector('[aria-label="Navigate neighboring symbols"]')`,'Breadcrumb siblings');
    assert.match(await cdp.evaluate(`document.querySelector('[aria-label="Source symbol path"]').textContent`),/PACKAGE.*PROCEDURE/s);
    await fill('[aria-label="Navigate neighboring symbols"]',String(source.indexOf('PROCEDURE second')));
    await cdp.until(`${editor}.getPosition().lineNumber===${secondLine}`,'Sibling source navigation');
    await cdp.evaluate(`${editor}.setPosition({lineNumber:25,column:3});${editor}.revealLineInCenter(35)`);
    await cdp.until(`document.querySelector('.sticky-widget-lines')?.textContent.toLowerCase().includes('procedure')`,'Sticky routine header',45000);
    const before=await cdp.evaluate(`${editor}.getTopForLineNumber(${lastLine})`);
    await cdp.key('p',10);await cdp.until(`document.querySelector('[aria-label="Search workbench"]')`);await fill('[aria-label="Search workbench"]','Focus current PL/SQL routine');await cdp.key('Enter');
    await cdp.until(`${editor}.getTopForLineNumber(${lastLine})<${before-150}`,'Other routine folded');
    await cdp.key('p',10);await cdp.until(`document.querySelector('[aria-label="Search workbench"]')`);await fill('[aria-label="Search workbench"]','Show all source regions');await cdp.key('Enter');
    await cdp.until(`${editor}.getTopForLineNumber(${lastLine})>=${before-2}`,'All source restored');
    await cdp.key('p',10);await cdp.until(`document.querySelector('[aria-label="Search workbench"]')`);await fill('[aria-label="Search workbench"]','Fold named code regions');await cdp.key('Enter');
    await cdp.until(`${editor}.getTopForLineNumber(${lastLine})<${before-150}`,'Named region folded');
    await expectSql(source);
  });

  await check('named bookmarks: track edits, persist positions and reopen closed files with dedicated shortcuts',async()=>{
    await cdp.evaluate(`${editor}.focus()`);await cdp.key('s',2);await cdp.until(`document.querySelector('.editor-save-button')?.textContent.trim()==='Saved'`);
    for(const [line,name] of [[10,'Invoice check'],[90,'Payment check']]){
      await cdp.evaluate(`${editor}.setPosition({lineNumber:${line},column:3});${editor}.focus()`);await cdp.key('b',3);await cdp.until(`document.querySelector('[aria-label="Source bookmarks"]')`);
      await fill('[aria-label="Bookmark name"]',name);await cdp.evaluate(`document.querySelector('[aria-label="Bookmark name"]').focus()`);await cdp.key('Enter');await cdp.until(`!document.querySelector('[aria-label="Source bookmarks"]')`);
    }
    await cdp.evaluate(`${editor}.executeEdits('qa',[{range:new window.monaco.Range(1,1,1,1),text:'-- inserted\\n'}])`);await cdp.frame();
    const stored=await cdp.evaluate(`JSON.parse(localStorage.getItem('fbsdb.sourceBookmarks.v1'))`);
    assert.deepEqual(stored.items.map(mark=>mark.lineNumber),[11,91]);assert.ok(stored.items.every(mark=>!('content' in mark)&&!('parameters' in mark)));
    await cdp.evaluate(`${editor}.focus()`);await cdp.key('s',2);await cdp.until(`document.querySelector('.editor-save-button')?.textContent.trim()==='Saved'`);
    await cdp.call('Page.reload');await cdp.until(`window.__desktopRegression?.ready&&${editor}&&window.__desktopRegression.replies.some(reply=>reply.type==='workspace.state')`,'Bookmark reload',60000);
    await cdp.evaluate(`${editor}.focus()`);await cdp.key('b',3);await cdp.until(`document.querySelector('.source-bookmark-list')?.textContent.includes('Payment check')`,'Persisted names');await cdp.key('Escape');
    await cdp.evaluate(`${editor}.focus()`);await cdp.key('j',3);await cdp.until(`document.querySelector('.file-tab.active .file-tab-name')?.textContent==='keep.sql'&&${editor}.getPosition().lineNumber===11`,'Reopened bookmark file');
    await cdp.key('j',3);await cdp.until(`${editor}.getPosition().lineNumber===91`,'Next bookmark');
    await cdp.key('j',11);await cdp.until(`${editor}.getPosition().lineNumber===11`,'Previous bookmark');
    assert.equal(await cdp.evaluate(`window.__desktopRegression.commands.some(command=>command.command==='sql.execute')`),false);
  });

  await check('Search Everywhere: Ctrl P finds current symbols, commands and settings; optional double Shift opens it',async()=>{
    await cdp.key('p',2);await cdp.until(`document.querySelector('[aria-label="Search workbench"]')`);await fill('[aria-label="Search workbench"]','PROCEDURE second');
    await cdp.until(`document.querySelector('#ide-command-results')?.textContent.includes('current source')`,'Current symbols in Ctrl P');await cdp.key('Enter');
    await cdp.until(`${editor}.getModel().getLineContent(${editor}.getPosition().lineNumber).includes('PROCEDURE second')`,'Symbol navigation');
    await cdp.key('p',2);await cdp.until(`document.querySelector('[aria-label="Search workbench"]')`);await fill('[aria-label="Search workbench"]','Use project run defaults');await cdp.key('Enter');
    assert.equal(await cdp.evaluate(`document.querySelector('[aria-label="Rows per result page"]').value`),'500');
    await cdp.key('p',2);await cdp.until(`document.querySelector('[aria-label="Search workbench"]')`);await fill('[aria-label="Search workbench"]','Editor line height');await cdp.key('Enter');
    await cdp.until(`document.querySelector('[aria-label="Editor line height"]')`,'Setting search destination');
    assert.equal(await cdp.evaluate(`document.querySelector('.settings-frame-search [aria-label="Search settings"]').value`),'Editor line height');await cdp.textClick('.settings-workspace footer button','Done');
    await cdp.key('p',2);await cdp.until(`document.querySelector('[aria-label="Search workbench"]')`);await fill('[aria-label="Search workbench"]','double Shift');await cdp.key('Enter');
    await cdp.until(`document.querySelector('[aria-label="Search Everywhere with double Shift"]')`);await cdp.click('[aria-label="Search Everywhere with double Shift"]');await cdp.textClick('.settings-workspace footer button','Done');
    await cdp.key('Shift',8);await cdp.key('Shift',8);await cdp.until(`document.querySelector('[aria-label="Search Everywhere"]')`,'Optional double Shift');await cdp.key('Escape');
  });

  await check('overview ruler: saved baseline changes, diagnostics and find matches coexist; ruler click navigates and save clears changes',async()=>{
    const file=path.join(files,'overview.sql'),content=Array.from({length:200},(_,i)=>`SELECT ${i} FROM dual;`).join('\n');await writeFile(file,content);
    await cdp.evaluate(`window.__desktopRegression.post({type:'command',id:'qa-overview-open',tabId:document.querySelector('.file-tab.active').dataset.editorTab,command:'file.openPath',payload:{path:${quote(file)}}})`);
    await cdp.until(`document.querySelector('.file-tab.active .file-tab-name')?.textContent==='overview.sql'`);
    await cdp.evaluate(`${editor}.executeEdits('qa-overview',[{range:new monaco.Range(110,1,110,7),text:'select'},{range:new monaco.Range(160,1,160,7),text:'select'}])`);
    await cdp.until(`${editor}.getModel().getAllDecorations().filter(d=>d.options.description==='fbsdb-local-change').length===2`,'Two local changes');
    assert.match(await cdp.evaluate(`document.querySelector('.status-overview').textContent`),/2 local changes/);
    await cdp.click('[aria-label="Next local change"]');assert.equal(await cdp.evaluate(`${editor}.getPosition().lineNumber`),110);
    await cdp.evaluate(`monaco.editor.setModelMarkers(${editor}.getModel(),'qa-overview',[{startLineNumber:120,startColumn:1,endLineNumber:120,endColumn:7,message:'Fixture diagnostic',severity:monaco.MarkerSeverity.Warning}]);${editor}.focus()`);
    await cdp.key('f',2);await cdp.call('Input.insertText',{text:'SELECT'});await cdp.until(`document.querySelector('.find-widget.visible')`);
    await cdp.until(`${editor}.getModel().getAllDecorations().some(d=>(d.options.className||'').includes('findMatch'))`,'Find decorations');
    assert.ok(await cdp.evaluate(`monaco.editor.getModelMarkers({owner:'qa-overview'}).length===1&&${editor}.getOption(monaco.editor.EditorOption.overviewRulerLanes)===3`));
    await cdp.key('Escape');await cdp.evaluate(`${editor}.setScrollTop(0)`);
    const point=await cdp.evaluate(`(()=>{const r=document.querySelector('.monaco-editor .decorationsOverviewRuler').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height*.8}})()`);
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});await cdp.until(`${editor}.getScrollTop()>100`,'Overview click scroll');
    await cdp.evaluate(`${editor}.focus()`);await cdp.key('s',2);await cdp.until(`document.querySelector('.editor-save-button').textContent.trim()==='Saved'`);
    await cdp.until(`${editor}.getModel().getAllDecorations().filter(d=>d.options.description==='fbsdb-local-change').length===0`,'Save clears change decorations');
    assert.match(await readFile(file,'utf8'),/select 109 FROM dual/);
    await cdp.evaluate(`monaco.editor.setModelMarkers(${editor}.getModel(),'qa-overview',[])`);
  });

  await check('project dictionary: identifier preview suggests canonical names and applies explicitly',async()=>{
    const source='SELECT custmer_id FROM customer';
    await cdp.evaluate(`${editor}.setValue(${quote(source)});${editor}.setSelection(${editor}.getModel().getFullModelRange());${editor}.focus()`);
    await cdp.key('F10',8);await cdp.until(`document.querySelector('[aria-label="SQL editor actions"]')`,'Editor actions');
    await cdp.textClick('[aria-label="SQL editor actions"] button','Convert identifier case…');await cdp.until(`document.querySelector('.identifier-case-dialog')`,'Identifier preview');
    await cdp.evaluate(`(()=>{const input=[...document.querySelectorAll('.identifier-case-styles label')].find(label=>label.textContent.includes('Project full terms'))?.querySelector('input');if(!input)throw Error('Missing project style');input.click()})()`);
    await cdp.until(`document.querySelector('.identifier-case-dialog')?.textContent.includes('known alternative spelling')`,'Dictionary inspection');
    assert.match(await cdp.evaluate(`document.querySelector('[aria-label="Identifier changes"]')?.textContent||''`),/CUSTOMER_ID/);
    await cdp.textClick('.identifier-case-dialog button','Apply renames');await cdp.until(`${editor}.getValue()==='SELECT CUSTOMER_ID FROM CUSTOMER'`,'Converted project names');
  });
  await check('delete impact: local parameter references and bounded project text search are shown without deleting',async()=>{
    const source='CREATE OR REPLACE PROCEDURE p_run(p_id IN NUMBER) IS\nBEGIN\n  DBMS_OUTPUT.PUT_LINE(p_id);\nEND;';
    await cdp.evaluate(`${editor}.setValue(${quote(source)});${editor}.setPosition({lineNumber:1,column:37});${editor}.focus()`);
    await cdp.key('F10',8);await cdp.until(`document.querySelector('[aria-label="SQL editor actions"]')`,'Editor actions');
    await cdp.textClick('[aria-label="SQL editor actions"] button','Review references before delete…');
    await cdp.until(`document.querySelector('.workspace-delete-review')`,'Delete review');
    assert.match(await cdp.evaluate(`document.querySelector('.workspace-delete-review').textContent`),/1 resolved current-document reference/);
    assert.match(await cdp.evaluate(`document.querySelector('.workspace-delete-review').textContent`),/does not delete code or prove deletion is safe/);
    await cdp.until(`window.__desktopRegression.commands.some(command=>command.command==='workspace.search')`,'Bounded workspace search');
    await cdp.textClick('.workspace-search-modal button','Close');
    assert.equal(await cdp.evaluate(`${editor}.getValue()`),source);
  });
  await check('call hierarchy: callers and calls come from workspace files, dynamic SQL is listed and a call site opens its file',async()=>{
    const dir=path.join(files,'calls'),bodyPath=path.join(dir,'billing_calls.pkb'),callerPath=path.join(dir,'caller.sql');await mkdir(dir,{recursive:true});
    const source='CREATE OR REPLACE PACKAGE BODY billing_calls AS\n  PROCEDURE note IS BEGIN NULL; END note;\n  PROCEDURE post IS\n  BEGIN\n    note;\n    EXECUTE IMMEDIATE \'BEGIN NULL; END;\';\n  END post;\n  PROCEDURE run IS BEGIN post; END run;\nEND billing_calls;\n/';
    await writeFile(bodyPath,source);await writeFile(callerPath,'BEGIN\n  billing_calls.post;\nEND;\n/');
    await cdp.evaluate(`window.__desktopRegression.post({type:'command',id:'qa-calls-open',tabId:document.querySelector('.file-tab.active').dataset.editorTab,command:'file.openPath',payload:{path:${quote(bodyPath)}}})`);
    await cdp.until(`document.querySelector('.file-tab.active .file-tab-name')?.textContent==='billing_calls.pkb'`,'Package body opened');
    await cdp.evaluate(`${editor}.setPosition({lineNumber:4,column:3});${editor}.focus()`);await cdp.key('H',9);
    const dialog=`document.querySelector('[aria-label="Call hierarchy"]')`;
    await cdp.until(`${dialog}?.querySelector('[role="tree"]')`,'Call hierarchy from workspace sources',20000);
    assert.equal(await cdp.evaluate(`${dialog}.querySelector('.call-hierarchy-head strong').textContent`),'BILLING_CALLS.POST');
    assert.deepEqual(await cdp.evaluate(`[...${dialog}.querySelectorAll('.call-hierarchy-name')].map(b=>b.textContent)`),['Anonymous block, line 1','BILLING_CALLS.RUN']);
    assert.match(await cdp.evaluate(`${dialog}.querySelector('.call-hierarchy-dynamic summary').textContent`),/1 dynamic SQL site in this routine not analysed/);
    assert.match(await cdp.evaluate(`${dialog}.querySelector('.call-hierarchy-scope').textContent`),/the database is not queried/);
    await cdp.textClick('[aria-label="Call hierarchy"] .call-hierarchy-direction button','Calls');
    await cdp.until(`[...${dialog}.querySelectorAll('.call-hierarchy-name')].map(b=>b.textContent).join()==='BILLING_CALLS.NOTE'`,'Outgoing calls');
    await cdp.textClick('[aria-label="Call hierarchy"] .call-hierarchy-direction button','Callers');
    await cdp.evaluate(`[...${dialog}.querySelectorAll('.call-hierarchy-row')].find(row=>row.textContent.includes('Anonymous block')).querySelector('.call-hierarchy-sites button').click()`);
    await cdp.until(`!${dialog}&&document.querySelector('.file-tab.active .file-tab-name')?.textContent==='caller.sql'&&${editor}.getPosition().lineNumber===2&&${editor}.getPosition().column===3`,'Call site opened');
    assert.equal(await cdp.evaluate(`window.__desktopRegression.commands.some(command=>command.command==='sql.execute'||command.command==='connection.connect')`),false);
  });
  await check('structural search: table writes, column uses and swallowed OTHERS handlers come from workspace files and open their lines',async()=>{
    const opsPath=path.join(files,'calls','order_ops.pkb');
    const source='CREATE OR REPLACE PACKAGE BODY order_ops AS\n  PROCEDURE close_order(p_id NUMBER) IS\n  BEGIN\n    UPDATE orders_t o SET o.status = \'CLOSED\' WHERE o.id = p_id;\n  EXCEPTION\n    WHEN OTHERS THEN\n      NULL;\n  END close_order;\n  PROCEDURE add_order(p_id NUMBER) IS\n  BEGIN\n    INSERT INTO orders_t (id, status) VALUES (p_id, \'OPEN\');\n  EXCEPTION\n    WHEN OTHERS THEN\n      RAISE;\n  END add_order;\nEND order_ops;\n/';
    await writeFile(opsPath,source);
    await cdp.evaluate(`window.__desktopRegression.post({type:'command',id:'qa-ops-open',tabId:document.querySelector('.file-tab.active').dataset.editorTab,command:'file.openPath',payload:{path:${quote(opsPath)}}})`);
    await cdp.until(`document.querySelector('.file-tab.active .file-tab-name')?.textContent==='order_ops.pkb'`,'Package body opened');
    await cdp.evaluate(`${editor}.setPosition({lineNumber:4,column:13});${editor}.focus()`);
    await cdp.key('p',10);await cdp.until(`document.querySelector('[aria-label="Search workbench"]')`);await fill('[aria-label="Search workbench"]','Structural search');await cdp.key('Enter');
    const dialog=`document.querySelector('[aria-label="Structural search"]')`,routines=`[...${dialog}.querySelectorAll('.structural-search-results .call-hierarchy-name')].map(b=>b.textContent)`;
    await cdp.until(`${dialog}&&!${dialog}.querySelector('.structural-search-form button[type="submit"]').disabled`,'Structural search ready',20000);
    assert.equal(await cdp.evaluate(`${dialog}.querySelector('[aria-label="Name to search"]').value`),'orders_t','The word at the caret is the initial name.');
    await cdp.textClick('[aria-label="Structural search"] button','Search');
    await cdp.until(`${routines}.join()==='ORDER_OPS.ADD_ORDER,ORDER_OPS.CLOSE_ORDER'`,'Routines that write to the table');
    await fill('[aria-label="Search for"]','column');await fill('[aria-label="Name to search"]','orders_t.status');await cdp.textClick('[aria-label="Structural search"] button','Search');
    await cdp.until(`${dialog}.querySelector('.structural-search-summary')?.textContent.startsWith('2 matches in 2 routines')`,'Column uses');
    await fill('[aria-label="Search for"]','handles');await fill('[aria-label="Name to search"]','others');
    await cdp.evaluate(`${dialog}.querySelector('.structural-search-form input[type="checkbox"]').click()`);await cdp.textClick('[aria-label="Structural search"] button','Search');
    await cdp.until(`${routines}.join()==='ORDER_OPS.CLOSE_ORDER'`,'Only the handler that swallows the error');
    await cdp.evaluate(`${dialog}.querySelector('.structural-search-site').click()`);
    await cdp.until(`!${dialog}&&${editor}.getPosition().lineNumber===6&&${editor}.getPosition().column===5`,'Handler line opened');
    assert.equal(await cdp.evaluate(`window.__desktopRegression.commands.some(command=>command.command==='sql.execute'||command.command==='connection.connect')`),false);
  });
  await check('dependency graph: a table shows its users from workspace files, focus moves to a neighbour and a definition opens',async()=>{
    const ddlPath=path.join(files,'calls','orders_ddl.sql');
    const ddl='CREATE TABLE orders_t (id NUMBER PRIMARY KEY, status VARCHAR2(10));\nCREATE OR REPLACE VIEW open_orders AS SELECT id FROM orders_t WHERE status = \'OPEN\';\n';
    await writeFile(ddlPath,ddl);
    await cdp.evaluate(`window.__desktopRegression.post({type:'command',id:'qa-ddl-open',tabId:document.querySelector('.file-tab.active').dataset.editorTab,command:'file.openPath',payload:{path:${quote(ddlPath)}}})`);
    await cdp.until(`document.querySelector('.file-tab.active .file-tab-name')?.textContent==='orders_ddl.sql'`,'DDL file opened');
    await cdp.evaluate(`${editor}.setPosition({lineNumber:2,column:60});${editor}.focus()`);
    await cdp.key('p',10);await cdp.until(`document.querySelector('[aria-label="Search workbench"]')`);await fill('[aria-label="Search workbench"]','Show dependency graph');await cdp.key('Enter');
    const dialog=`document.querySelector('[aria-label="Dependency graph"]')`,side=name=>`[...${dialog}.querySelectorAll('.dependency-${name} .dependency-node-name strong')].map(b=>b.textContent).join()`;
    await cdp.until(`${dialog}?.querySelector('.dependency-focus')`,'Graph drawn',20000);
    assert.equal(await cdp.evaluate(`${dialog}.querySelector('.dependency-focus strong').textContent`),'ORDERS_T','The table under the caret is the focus.');
    assert.equal(await cdp.evaluate(side('left')),'ORDER_OPS,OPEN_ORDERS');
    assert.equal(await cdp.evaluate(`${dialog}.querySelectorAll('.dependency-lines path').length`),2);    await cdp.evaluate(`[...${dialog}.querySelectorAll('.dependency-node-name')].find(b=>b.textContent.startsWith('ORDER_OPS')).click()`);
    await cdp.until(`${dialog}.querySelector('.dependency-focus strong').textContent==='ORDER_OPS'&&${side('right')}==='ORDERS_T'`,'Focus moved to the package');
    await cdp.textClick('[aria-label="Dependency graph"] button','Back');
    await cdp.until(`${dialog}.querySelector('.dependency-focus strong').textContent==='ORDERS_T'`,'Back to the table');
    await cdp.textClick('[aria-label="Dependency graph"] button','Open definition');
    await cdp.until(`!${dialog}&&${editor}.getPosition().lineNumber===1&&${editor}.getPosition().column===14`,'Table definition opened');
    assert.equal(await cdp.evaluate(`window.__desktopRegression.commands.some(command=>command.command==='sql.execute'||command.command==='connection.connect')`),false);
  });
  await check('parameter names: Monaco shows names before positional arguments of local routines without changing the text',async()=>{
    const source='DECLARE\n  PROCEDURE post(p_id NUMBER, p_amount NUMBER, p_note VARCHAR2 DEFAULT NULL) IS BEGIN NULL; END;\nBEGIN\n  post(42, 10, p_note => \'n\');\n  post(7, 8);\nEND;';
    await cdp.evaluate(`(()=>{const editor=${editor};editor.setValue(${quote(source)});editor.setPosition({lineNumber:1,column:1});editor.focus()})()`);
    const hints=`${editor}.getModel().getAllDecorations().map(d=>[d.range.startLineNumber,d.range.startColumn,(d.options.before||d.options.after)?.content]).filter(d=>/=>/.test(d[2]||'')).map(d=>d.join(':').replace(/\\u00a0/g,' ')).sort().join(' | ')`;
    const expected='4:12:p_amount => | 4:8:p_id => | 5:11:p_amount => | 5:8:p_id =>';
    // Monaco renders the label's spaces as non-breaking spaces.
    try{await cdp.until(`${hints}===${quote(expected)}`,'Inlay parameter names',20000)}catch(error){error.message+=` Shown: ${await cdp.evaluate(hints)}`;throw error}
    assert.equal(await cdp.evaluate(`${editor}.getValue()`),source,'Hints must not change the text.');
  });
  await check('expected type: the suggestion list puts DATE values first after an assignment to a DATE variable',async()=>{
    const source='DECLARE\n  v_count NUMBER;\n  v_name VARCHAR2(30);\n  v_start DATE;\n  v_due DATE;\nBEGIN\n  v_due := \nEND;';
    await cdp.evaluate(`(()=>{const editor=${editor};editor.setValue(${quote(source)});editor.setPosition({lineNumber:7,column:12});editor.focus();editor.trigger('qa','editor.action.triggerSuggest',{})})()`);
    const rows=`[...document.querySelectorAll('.suggest-widget.visible .monaco-list-row')].sort((a,b)=>Number(a.dataset.index)-Number(b.dataset.index)).map(row=>row.querySelector('.label-name')?.textContent)`;
    await cdp.until(`${rows}.length>=4`,'Suggestion list',20000);
    const shown=await cdp.evaluate(rows);
    assert.deepEqual(shown.slice(0,2).sort(),['v_due','v_start'],shown.join(', '));
    assert.ok(shown.indexOf('v_count')>1&&shown.indexOf('v_name')>1,shown.join(', '));
    await cdp.key('Escape');
  });
  await check('large SQL file opens through the native reader with exact content and lightweight analysis defaults',async()=>{
    const largePath=path.join(files,'large-dump.sql'),content='SELECT 1 FROM dual;\n-- '+'x'.repeat(525000);
    await writeFile(largePath,content);
    await cdp.evaluate(`window.__desktopRegression.post({type:'command',id:'qa-large-file',tabId:document.querySelector('.file-tab.active').dataset.editorTab,command:'file.openPath',payload:{path:${quote(largePath)}}})`);
    await cdp.until(`document.querySelector('.file-tab.active .file-tab-name')?.textContent==='large-dump.sql'&&document.querySelector('.large-file-notice')`,'Native large file');
    assert.equal(await cdp.evaluate(`${editor}.getValue().length`),content.length);
    assert.equal(await cdp.evaluate(`${editor}.getValue().endsWith('x'.repeat(100))`),true);
    assert.ok(await cdp.evaluate(`[...document.querySelectorAll('.large-file-notice input')].every(input=>!input.checked)`));
    assert.equal(await cdp.evaluate(`document.querySelector('.editor-save-button').textContent.trim()`),'Saved');
    assert.equal(await cdp.evaluate(`window.__desktopRegression.commands.some(command=>command.command==='sql.execute')`),false);
  });

}catch(error){failure=error;console.error(error.stack);console.error(JSON.stringify(await cdp.evaluate('({text:document.body.innerText.slice(0,5000),commands:window.__desktopRegression?.commands,replies:window.__desktopRegression?.replies,errors:window.__desktopRegression?.errors,blocked:window.__desktopRegression?.blocked})')))}finally{
  await writeFile(path.join(root,'project-rules-report.json'),JSON.stringify({status:failure?'failed':'passed',checks,error:failure?.message},null,2));
  if(installed)await cdp.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:installed.identifier}).catch(()=>{});
  cdp.close();
}
if(failure)process.exitCode=1;
